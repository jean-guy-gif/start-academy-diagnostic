import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string; optionId: string }>;
}

/**
 * DELETE — annule un créneau (status → cancelled). On NE supprime PAS
 * physiquement la ligne — l'audit trail reste lisible.
 *
 * Sécurité :
 *   - `requireApiRole(INTERNAL_APP_ROLES)`.
 *   - Garde ownership `assertCanAccessSession(profile, sessionId)`
 *     — empêche l'annulation cross-session (audit I-4).
 *   - Le filtre `eq("session_id", sessionId)` reste en place comme
 *     ceinture de sécurité.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: sessionId, optionId } = await context.params;
  if (!sessionId || !optionId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "Paramètres manquants." },
      { status: 400 }
    );
  }

  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json(
      { ok: false, code: "service_unavailable", error: "Persistance indisponible." },
      { status: 503 }
    );
  }

  const { data, error } = await client
    .from("session_date_options")
    .update({ status: "cancelled" })
    .eq("id", optionId)
    .eq("session_id", sessionId)
    .select(
      "id, session_id, title, start_at, end_at, location, format, status, selected_by_email, selected_at, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    return NextResponse.json(
      { ok: false, code: "update_failed", error: error?.message ?? "Annulation refusée." },
      { status: 500 }
    );
  }

  return NextResponse.json({ dateOption: data });
}
