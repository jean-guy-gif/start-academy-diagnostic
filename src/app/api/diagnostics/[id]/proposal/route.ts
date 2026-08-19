import { NextResponse } from "next/server";
import { z } from "zod";

import { createActivityLog } from "@/lib/activity/activity-log-service";
import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { ProposalSchema } from "@/lib/ai/proposal-schema";
import {
  getProposalByDiagnosticId,
  upsertProposal,
} from "@/lib/proposals/proposal-server-service";

export const runtime = "nodejs";
/**
 * `force-dynamic` NON-NÉGOCIABLE (classe de bug la plus insidieuse du
 * projet : une donnée correctement écrite en base mais jamais relue à
 * cause d'un cache stale). Sans ce flag, une réponse GET peut être
 * cachée par le Vercel edge / le browser après un PUT, et l'utilisateur
 * voit son édition « disparaître » au reload alors qu'elle est bien
 * persistée. Le contract test `proposal-route-no-cache.contract.test.ts`
 * échoue si ce flag disparaît.
 */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Route GET/PUT /api/diagnostics/[id]/proposal — persistance serveur.
 *
 * Sécurité (aligné pattern support-quality) :
 *   • `requireApiRole(INTERNAL_APP_ROLES)` → 401 sinon.
 *   • `assertCanAccessDiagnostic(auth.profile, diagnosticId)` → 403 si
 *     l'utilisateur n'est ni admin ni propriétaire du diagnostic.
 *   • PUT : Zod strict sur le body (ProposalGenerationResult complet).
 *   • Persistance via `proposal-server-service`, upsert par
 *     `diagnostic_id` — la 2ᵉ génération écrase la 1ère (garantie par
 *     l'index unique `proposals_diagnostic_id_uidx`).
 *   • Log activity_logs event `proposal_generated` (best-effort).
 */

const PutBodySchema = z.object({
  recommendationId: z.string().uuid().nullable(),
  generation: z.object({
    proposal: ProposalSchema,
    source: z.enum(["llm", "heuristic"]),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    generatedAt: z.string().min(1),
    notes: z.array(z.string()).default([]),
  }),
});

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: diagnosticId } = await context.params;
  if (!diagnosticId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "diagnosticId manquant." },
      { status: 400 }
    );
  }

  const result = await getProposalByDiagnosticId(diagnosticId, auth.profile);
  if (!result.ok) {
    if (result.reason === "forbidden") {
      return NextResponse.json(
        { ok: false, code: "forbidden", error: "Accès refusé." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "persistence_failed",
        error: result.message ?? "Lecture impossible.",
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, proposal: result.proposal });
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: diagnosticId } = await context.params;
  if (!diagnosticId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "diagnosticId manquant." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "Corps JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        error: "Payload invalide.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const result = await upsertProposal(
    diagnosticId,
    {
      recommendationId: parsed.data.recommendationId,
      generation: parsed.data.generation,
    },
    auth.profile
  );
  if (!result.ok) {
    if (result.reason === "forbidden") {
      return NextResponse.json(
        { ok: false, code: "forbidden", error: "Accès refusé." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "persistence_failed",
        error: result.message ?? "Persistance impossible.",
      },
      { status: 500 }
    );
  }

  // Journal — best-effort, jamais bloquant. On ne persiste JAMAIS le
  // contenu du proposal (texte libre) dans les metadata activity_logs
  // (politique data cf. activity-log-service.ts).
  createActivityLog({
    eventType: "proposal_generated",
    diagnosticId,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    entityType: "proposal",
    entityId: result.proposal.id,
    metadata: {
      source: result.proposal.source,
      provider: result.proposal.provider,
      model: result.proposal.model,
      confidenceScore: result.proposal.proposal.confidenceScore,
      moduleCount: result.proposal.proposal.trainingProgram.modules.length,
    },
  }).catch(() => {
    /* log silencieux côté service */
  });

  return NextResponse.json({ ok: true, proposal: result.proposal });
}
