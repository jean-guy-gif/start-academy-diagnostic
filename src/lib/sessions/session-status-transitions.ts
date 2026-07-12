/**
 * Machine à états — transitions autorisées de `training_sessions.status`.
 *
 * SOURCE UNIQUE côté code de la matrice validée manuellement le
 * 2026-07-12 (ticket §11.2 T-8). La route `PATCH /api/sessions/[id]/status`,
 * l'UI de la fiche session et les tests de contrat importent tous depuis
 * ce module — aucune duplication.
 *
 * ⚠️ Toute modification de la matrice DOIT :
 *   • rester alignée sur `SessionStatus` (`src/types/index.ts`),
 *   • être justifiée par un cas métier réel (les retours arrière ne sont
 *     pas cosmétiques, cf. commentaires JSDoc ligne par ligne),
 *   • déclencher la mise à jour de `session-status-transitions.contract.test.ts`,
 *     qui verrouille la matrice par contrat (fail-si-supprimée / fail-si-ajoutée).
 *
 * Politique :
 *   • Rail principal linéaire strict : 10 transitions AVANT.
 *   • Retour arrière limité à l'étape immédiatement précédente : 7 RETOUR
 *     (les états 2..8 peuvent redescendre d'un cran).
 *   • `delivered` et `report_sent` sont irréversibles côté produit
 *     (la formation a eu lieu / le bilan est parti au client) : aucun
 *     retour arrière possible. Toute correction ultérieure passe par
 *     SQL manuel documenté dans le registre incident — délibérément
 *     inconfortable pour éviter les usages routiniers.
 *   • L'admin n'a AUCUN override : la même machine à états s'applique.
 *     Le canal hotfix reste `UPDATE public.training_sessions SET status
 *     = '…' WHERE id = '…'` en SQL, à documenter en registre.
 */

import type { SessionStatus } from "@/types";

export const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  // 1. `created` → seul le rail principal ; aucun retour (état initial).
  created: ["awaiting_client_validation"],

  // 2. `awaiting_client_validation` → dates_to_position (rail principal).
  //    RETOUR → `created` : le contact client n'a finalement pas eu lieu
  //    (envoi annulé, mauvaise fiche client), on remet la session à l'état
  //    initial avant de repartir sur une autre trajectoire.
  awaiting_client_validation: ["dates_to_position", "created"],

  // 3. `dates_to_position` → dates_validated (rail principal).
  //    RETOUR → `awaiting_client_validation` : le client remet en cause
  //    l'accord de principe avant même le calage des dates
  //    (« finalement on ne veut plus former »), on repasse à la case
  //    validation.
  dates_to_position: ["dates_validated", "awaiting_client_validation"],

  // 4. `dates_validated` → collection_open (rail principal).
  //    RETOUR → `dates_to_position` : **cas fréquent** — le client
  //    rechange ses dates après validation initiale (agenda dirigeant,
  //    imprévu commercial). Retour explicite au calage.
  dates_validated: ["collection_open", "dates_to_position"],

  // 5. `collection_open` → data_collected (rail principal).
  //    RETOUR → `dates_validated` : les dates viennent d'être décalées
  //    après ouverture de la collecte, on referme la collecte (on la
  //    rouvrira quand les nouvelles dates seront calées).
  collection_open: ["data_collected", "dates_validated"],

  // 6. `data_collected` → support_generating (rail principal).
  //    RETOUR → `collection_open` : il manque une pièce administrative,
  //    un participant supplémentaire ou un document oublié — on rouvre
  //    la collecte au lieu de lancer la génération sur des données
  //    incomplètes.
  data_collected: ["support_generating", "collection_open"],

  // 7. `support_generating` → support_ready (rail principal).
  //    RETOUR → `data_collected` : la génération a fait apparaître que
  //    les données étaient incomplètes ou incohérentes ; on repose la
  //    main sur les données avant de relancer une seconde génération.
  support_generating: ["support_ready", "data_collected"],

  // 8. `support_ready` → delivered (rail principal — sous garde
  //    supplémentaire : le `support_quality_reviews.status = 'validated'`
  //    doit exister pour cette session, cf. service côté serveur).
  //    RETOUR → `support_generating` : le support est jugé insuffisant à
  //    la relecture pédagogique (typiquement après un `needs_revision`
  //    du support-quality-validation) et on relance une génération
  //    complète.
  support_ready: ["delivered", "support_generating"],

  // 9. `delivered` → report_sent (rail principal). **Aucun retour
  //    arrière possible** : la formation a physiquement eu lieu.
  //    Toute correction post-formation passe par le bilan
  //    (`post_training_reviews`), modifiable jusqu'à envoi.
  delivered: ["report_sent"],

  // 10. `report_sent` — **état terminal**. Aucune transition. Le bilan
  //     est parti au client. Toute correction ultérieure = SQL manuel
  //     documenté (registre incident).
  report_sent: [],
};

/**
 * Retourne `true` si la transition depuis `from` vers `to` est
 * autorisée par la machine à états. Réutilisable côté serveur
 * (route API) et côté client (UI, pour désactiver les options
 * interdites AVANT même de tenter le PATCH).
 */
export function isTransitionAllowed(
  from: SessionStatus,
  to: SessionStatus
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Retourne la transition « AVANT » (rail principal) suivante depuis
 * `from`, ou `null` si l'état est terminal (`report_sent`).
 * Le rail principal est le PREMIER élément de chaque liste — convention
 * respectée en écrivant la matrice (jamais réordonner sans mettre à jour
 * cette fonction).
 */
export function getNextForwardStatus(from: SessionStatus): SessionStatus | null {
  const options = ALLOWED_TRANSITIONS[from];
  if (!options || options.length === 0) return null;
  return options[0];
}

/**
 * Retourne l'ensemble des retours arrière autorisés depuis `from`
 * (i.e. les transitions autres que la première). Peut être vide.
 * Utilisée par l'UI pour construire le dropdown « Changer
 * manuellement » — n'inclut PAS la transition AVANT (déjà proposée
 * par le bouton principal).
 */
export function getBackwardOptions(from: SessionStatus): SessionStatus[] {
  const options = ALLOWED_TRANSITIONS[from];
  if (!options || options.length <= 1) return [];
  return options.slice(1);
}

/**
 * Ensemble des statuts irréversibles côté produit : une fois entrés,
 * aucune transition arrière n'est possible via l'UI. La transition
 * VERS ces statuts déclenche une confirmation modale renforcée.
 */
export const IRREVERSIBLE_STATUSES: readonly SessionStatus[] = [
  "delivered",
  "report_sent",
] as const;

export function isIrreversibleTarget(status: SessionStatus): boolean {
  return (IRREVERSIBLE_STATUSES as readonly SessionStatus[]).includes(status);
}
