import { NextResponse } from "next/server";
import { z } from "zod";

import { createActivityLog } from "@/lib/activity/activity-log-service";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { transitionSessionStatus } from "@/lib/sessions/session-status-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Route T-8 — transition de statut d'une `training_sessions`.
 *
 * Sécurité (aligné sur `/api/sessions/[id]/support-quality`) :
 *   • `requireApiRole(INTERNAL_APP_ROLES)` → 401 si non authentifié
 *     ou rôle non interne.
 *   • `assertCanAccessSession(auth.profile, sessionId)` → 403 si
 *     l'utilisateur n'est ni admin ni propriétaire.
 *   • Zod schema strict : la validation de la valeur `status` est
 *     exhaustive (10 valeurs), ce qui protège contre l'ajout futur
 *     silencieux d'une nouvelle valeur SQL sans mise à jour de l'enum.
 *   • Machine à états : `transitionSessionStatus` lit le statut courant
 *     en base et refuse les transitions non autorisées (409).
 *   • Nuance T-8 : la transition `support_ready → delivered` exige
 *     un `support_quality_reviews.status = 'validated'` pour cette
 *     session, sinon 409.
 *
 * Journal : `activity_logs` — event_type `session_status_changed`,
 * metadata `{ from, to }` (best-effort, jamais bloquant).
 */

const StatusSchema = z.enum([
  "created",
  "awaiting_client_validation",
  "dates_to_position",
  "dates_validated",
  "collection_open",
  "data_collected",
  "support_generating",
  "support_ready",
  "delivered",
  "report_sent",
]);

const PatchBodySchema = z.object({
  status: StatusSchema,
});

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "sessionId manquant." },
      { status: 400 }
    );
  }

  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "Corps JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = PatchBodySchema.safeParse(body);
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

  const result = await transitionSessionStatus(sessionId, parsed.data.status);

  if (!result.ok) {
    switch (result.reason) {
      case "session_not_found":
        return NextResponse.json(
          {
            ok: false,
            code: "session_not_found",
            error: "Session introuvable.",
          },
          { status: 404 }
        );
      case "transition_forbidden":
        return NextResponse.json(
          {
            ok: false,
            code: "transition_forbidden",
            error: `Transition ${result.from} → ${result.to} non autorisée par la machine à états.`,
            from: result.from,
            to: result.to,
          },
          { status: 409 }
        );
      case "support_not_validated":
        return NextResponse.json(
          {
            ok: false,
            code: "support_not_validated",
            error:
              "Le support doit être validé pédagogiquement avant de marquer la formation réalisée.",
            from: result.from,
            to: result.to,
          },
          { status: 409 }
        );
      case "persistence_failed":
        return NextResponse.json(
          {
            ok: false,
            code: "persistence_failed",
            error: "Enregistrement impossible.",
          },
          { status: 500 }
        );
    }
  }

  // Journal — best-effort, jamais bloquant.
  createActivityLog({
    eventType: "session_status_changed",
    sessionId,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    entityType: "training_session",
    entityId: sessionId,
    metadata: {
      from: result.from,
      to: result.to,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({
    ok: true,
    from: result.from,
    to: result.to,
  });
}
