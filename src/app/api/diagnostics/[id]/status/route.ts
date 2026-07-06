import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { refreshDiagnosticSnapshots } from "@/lib/diagnostics/refresh-snapshots";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const StatusSchema = z.enum([
  "draft",
  "in_progress",
  "transcript_uploaded",
  "ai_analyzed",
  "to_review",
  "validated",
]);

const BodySchema = z.object({ status: StatusSchema });

/**
 * PATCH /api/diagnostics/[id]/status
 *
 * Met à jour le statut d'un diagnostic. Journalise un événement
 * `diagnostic_completed` si on bascule en `validated` ou
 * `ai_analyzed` (best-effort).
 */
export async function PATCH(request: Request, context: RouteContext) {
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
  const parsed = BodySchema.safeParse(body);
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

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        code: "service_unavailable",
        error: "Persistance Supabase indisponible.",
      },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("diagnostics")
    .update({ status: parsed.data.status })
    .eq("id", diagnosticId)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        ok: false,
        code: "update_failed",
        error: error?.message ?? "Diagnostic introuvable.",
      },
      { status: error ? 500 : 404 }
    );
  }

  // v1.0b (lot 1) — refresh best-effort des snapshots ratios/alerts
  // après changement de statut. Passe par le client cookie (RLS
  // owner OR admin), jamais via service_role. Aucun log de contenu.
  await refreshDiagnosticSnapshots(diagnosticId);

  if (parsed.data.status === "validated" || parsed.data.status === "ai_analyzed") {
    createActivityLog({
      eventType: "diagnostic_completed",
      diagnosticId: data.id,
      clientId: data.client_id,
      actorId: auth.profile.id,
      actorName: auth.profile.full_name ?? auth.profile.email ?? null,
      actorRole: auth.profile.role,
      metadata: { status: data.status, mode: data.mode },
    }).catch(() => {
      /* log déjà silencieux côté service */
    });
  }

  return NextResponse.json({
    ok: true,
    diagnostic: {
      id: data.id,
      clientId: data.client_id,
      mode: data.mode,
      status: data.status,
      declaredGoal: data.declared_goal,
      profilesInScope: data.profiles_in_scope,
      expectedParticipants: data.expected_participants,
      notes: data.notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}
