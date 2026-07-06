import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { listRecentActivity } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

/**
 * GET /api/activity/recent — top N événements toutes sessions
 * confondues. Utilisé par le cockpit.
 */
export async function GET(request: Request) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = (() => {
    const parsed = rawLimit ? Number(rawLimit) : 10;
    if (!Number.isFinite(parsed) || parsed <= 0) return 10;
    return Math.min(parsed, 100);
  })();

  const logs = await listRecentActivity(limit);
  return NextResponse.json({ logs });
}
