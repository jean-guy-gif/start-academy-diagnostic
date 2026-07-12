import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { listRecentActivity } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

/**
 * GET /api/activity/recent — top N événements filtrés par ownership.
 * Utilisé par le cockpit.
 *
 * **Règle (T-11, 2026-07-09 — invalide et remplace T-10c)** :
 *   activité cloisonnée par acteur/propriétaire ; admin voit tout.
 *
 *   • Rôle `admin`     → toute l'activité Start Academy.
 *   • Autres internes  → uniquement l'activité de ses propres
 *     dossiers (`session_id ∈ mes sessions` OR `diagnostic_id ∈
 *     mes diagnostics`) OR ses actions personnelles (`actor_id =
 *     profile.id`). Le filtre est appliqué dans
 *     `listRecentActivity(profile)` (activity-log-service.ts).
 *
 * Historique posture :
 *   • T-10c « cockpit partagé sur les métadonnées » → **invalidé**
 *     par T-11 (2026-07-09). Le cockpit exposait indirectement les
 *     noms clients, PII dirigeant, budgets et CA N-1 des collègues.
 *     La posture partagée ne tenait pas face au contenu réellement
 *     accessible via les liens et les IDs remontés.
 *   • T-10c-BIS « `event_description` retiré du SELECT » reste
 *     valable — la colonne `event_description` (texte libre) est
 *     exclue en amont, quel que soit le rôle. Une note ne remonte
 *     jamais via ce flux ; le journal détaillé d'une session
 *     (`/api/sessions/[id]/activity`, protégé par
 *     `assertCanAccessSession`) la conserve pour les seuls
 *     propriétaires.
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

  const logs = await listRecentActivity(auth.profile, limit);
  return NextResponse.json({ logs });
}
