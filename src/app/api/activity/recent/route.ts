import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { listRecentActivity } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

/**
 * GET /api/activity/recent — top N événements toutes sessions
 * confondues. Utilisé par le cockpit.
 *
 * **Posture cockpit partagée (décision 2026-07-09)** : l'activité
 * inter-commerciale est volontairement visible à tout rôle interne.
 * Le cockpit est l'outil de pilotage de Start Academy, l'entraide et
 * la reprise de dossier passent par cette visibilité. On NE filtre
 * PAS par `actor_id`. Contrairement à `/api/diagnostics` (T-9), il ne
 * s'agit pas d'un oubli — c'est le contrat produit.
 *
 * Réserve tracée — T-10c-BIS (2026-07-09) : la table `activity_logs`
 * contient un champ `event_description` (texte libre 500 chars)
 * alimenté par `POST /api/activity/log` sur les événements
 * `note_added` (cf. `session-activity-journal.tsx:165`). Ce champ
 * PEUT contenir des notes internes sensibles — la posture « cockpit
 * partagé » et son passage inchangé dans `activity/recent` remontent
 * donc ces notes cross-commercial. Décision à trancher : filtrer
 * `event_description` côté route, restreindre le type `note_added` à
 * sa propre session, ou accepter la fuite. Voir §11.2 registre.
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
