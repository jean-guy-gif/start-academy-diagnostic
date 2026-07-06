import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import { listActivityLogsBySession } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sessions/[id]/activity — journal d'activité d'une session.
 *
 * Auth requise (rôle interne) + garde ownership : empêche un
 * commercial de lire l'historique d'activité d'une session qui ne
 * lui appartient pas (audit I-5). Admin bypass via le helper.
 * Retourne les 30 derniers événements par défaut (override via
 * `?limit=`, plafonné à 200).
 */
export async function GET(request: Request, context: RouteContext) {
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

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = (() => {
    const parsed = rawLimit ? Number(rawLimit) : 30;
    if (!Number.isFinite(parsed) || parsed <= 0) return 30;
    return Math.min(parsed, 200);
  })();

  const logs = await listActivityLogsBySession(sessionId, limit);
  return NextResponse.json({ logs });
}
