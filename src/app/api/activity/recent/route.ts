import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { listRecentActivity } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

/**
 * GET /api/activity/recent — top N événements toutes sessions
 * confondues. Utilisé par le cockpit.
 *
 * **Règle définitive (T-10c-BIS clos 2026-07-09)** :
 *   cockpit partagé sur les **métadonnées d'événement**, jamais sur
 *   le contenu libre.
 *
 * Concrètement :
 *   • `event_type`, `event_label` (whitelist par `buildActivityLabel`),
 *     `actor_name`, `actor_role`, timestamps, `session_id` /
 *     `diagnostic_id` / `client_id`, `metadata` (chiffres et enums) →
 *     **exposés à tout rôle interne**. L'entraide et la reprise de
 *     dossier passent par cette visibilité.
 *   • `event_description` (texte libre 500 chars, alimenté par
 *     `note_added` — notes internes commerciales) → **JAMAIS remonté**.
 *     Le SELECT dans `listRecentActivity` (activity-log-service.ts) le
 *     supprime explicitement et le mapping force `eventDescription:
 *     null`. Un test unitaire dédié verrouille l'invariant.
 *
 * Le journal détaillé d'une session (`/api/sessions/[id]/activity`)
 * expose `event_description` comme avant — il est protégé par
 * `assertCanAccessSession` donc seul qui a accès à la session voit
 * les notes.
 *
 * NB : le composant cockpit `RecentActivityRow` n'affichait jamais
 * `eventDescription` — le champ transitait silencieusement dans le
 * payload avant ce fix, exploitable via DevTools Network ou curl.
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
