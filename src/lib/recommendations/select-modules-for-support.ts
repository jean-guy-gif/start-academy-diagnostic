import type { RecommendedModule } from "@/lib/ai/recommendation-schema";

/**
 * Sélection des modules à intégrer dans le SUPPORT principal
 * (brut + designé). Les modules `optional` et `later` restent visibles
 * dans la recommandation et la proposition mais ne descendent pas
 * automatiquement dans le support pédagogique.
 *
 * Règles métier :
 *   1. Garder : `essential` + `recommended`.
 *   2. Exclure : `optional` + `later`.
 *   3. Fallback rétrocompatible : si AUCUN module n'a de `priorityTier`
 *      renseigné (ancien diagnostic OU LLM qui n'a pas suivi la règle),
 *      on garde tous les modules — sinon on bloque le flow par erreur
 *      de filtrage à blanc.
 *   4. Plafond défensif à 12 modules retenus pour rester pédagogiquement
 *      tenable :
 *        - tous les `essential` sont conservés (jamais coupés) ;
 *        - les `recommended` sont triés par `priority` (ordre numérique
 *          ascendant = plus prioritaire en premier) et tronqués pour
 *          tenir dans le plafond ;
 *        - les `recommended` retirés du support apparaissent dans la
 *          note de sélection mais restent dans la recommandation /
 *          proposition originale.
 *   5. Pure / synchrone — réutilisable côté client et serveur. La
 *      recommandation d'entrée n'est PAS mutée.
 */

export const SUPPORT_MODULE_HARD_CAP = 12;

export interface SupportModuleSelection {
  /** Modules retenus pour la génération du support principal. */
  selectedModules: RecommendedModule[];
  /** Modules exclus du support (optional / later / over-cap recommended). */
  excludedModules: RecommendedModule[];
  /** Mode de sélection — utile pour les logs / debug. */
  mode: "tiered" | "fallback_no_tier";
  /** Cap atteint sur les recommended ? */
  cappedRecommended: boolean;
  /** Compte total entrée. */
  totalInput: number;
}

function isPriorityTierRenseigne(m: RecommendedModule): boolean {
  return m.priorityTier !== null && m.priorityTier !== undefined;
}

/**
 * Sélectionne les modules destinés au support principal.
 *
 * `recommended` est l'ensemble de modules retenus par la recommandation.
 * La fonction ne mute pas l'entrée — elle renvoie des slices/copies.
 */
export function selectModulesForSupport(
  recommendedModules: RecommendedModule[]
): SupportModuleSelection {
  const totalInput = recommendedModules.length;

  // Fallback rétrocompat : aucun module n'a de tier → on n'a aucun
  // critère pour filtrer, on conserve tous les modules.
  const anyTier = recommendedModules.some(isPriorityTierRenseigne);
  if (!anyTier) {
    return {
      selectedModules: recommendedModules.slice(),
      excludedModules: [],
      mode: "fallback_no_tier",
      cappedRecommended: false,
      totalInput,
    };
  }

  const essential = recommendedModules.filter(
    (m) => m.priorityTier === "essential"
  );
  const recommendedTier = recommendedModules.filter(
    (m) => m.priorityTier === "recommended"
  );
  const others = recommendedModules.filter(
    (m) => m.priorityTier === "optional" || m.priorityTier === "later"
  );
  // Sécurité : si un module a un tier nullable absent du switch
  // (ex : objet legacy partiellement migré), on le traite comme
  // `recommended` plutôt que de le perdre.
  const untieredButPresent = recommendedModules.filter(
    (m) =>
      m.priorityTier !== "essential" &&
      m.priorityTier !== "recommended" &&
      m.priorityTier !== "optional" &&
      m.priorityTier !== "later"
  );

  const sortedRecommended = [...recommendedTier, ...untieredButPresent].sort(
    (a, b) => a.priority - b.priority
  );

  let cappedRecommended = false;
  let selected: RecommendedModule[] = [...essential];
  const remainingBudget = Math.max(SUPPORT_MODULE_HARD_CAP - selected.length, 0);
  if (sortedRecommended.length > remainingBudget) {
    selected = selected.concat(sortedRecommended.slice(0, remainingBudget));
    cappedRecommended = true;
  } else {
    selected = selected.concat(sortedRecommended);
  }

  const cappedOutRecommended = cappedRecommended
    ? sortedRecommended.slice(remainingBudget)
    : [];

  return {
    selectedModules: selected,
    excludedModules: [...others, ...cappedOutRecommended],
    mode: "tiered",
    cappedRecommended,
    totalInput,
  };
}

/**
 * Construit la (ou les) notes informatives à ajouter au
 * `missingInformation` du support quand des modules ont été exclus.
 * Empty si rien à signaler (support full ou aucune exclusion).
 */
export function summarizeSupportModuleSelection(
  selection: SupportModuleSelection
): string[] {
  const notes: string[] = [];

  if (selection.mode === "fallback_no_tier") {
    return notes;
  }

  if (selection.excludedModules.length > 0) {
    const optionalCount = selection.excludedModules.filter(
      (m) => m.priorityTier === "optional" || m.priorityTier === "later"
    ).length;
    const cappedCount = selection.excludedModules.length - optionalCount;

    if (optionalCount > 0) {
      notes.push(
        `Certains modules complémentaires (${optionalCount} optional/later) sont conservés dans la proposition mais non intégrés au support principal.`
      );
    }
    if (cappedCount > 0) {
      notes.push(
        `Plafond support atteint : ${cappedCount} module(s) recommended au-delà de ${SUPPORT_MODULE_HARD_CAP} ont été reportés en phase 2.`
      );
    }
  }

  return notes;
}
