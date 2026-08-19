/**
 * Décision d'état d'un module dans le sélecteur catalogue — fonction
 * pure, testable sans DOM. Lot édition proposition (revue #49).
 *
 * Trois états métier :
 *   • `present`  — déjà dans le programme courant. Non sélectionnable,
 *                  affiché en vert avec la mention « déjà dans le
 *                  programme ».
 *   • `removed`  — présent dans le programme initial (au montage de
 *                  l'éditeur), retiré depuis. Affiché en rouge/barré,
 *                  sélectionnable pour réintégration (avec
 *                  confirmation visuelle côté rendu).
 *   • `available` — jamais présent ou re-retiré après réintégration.
 *                   Sélectionnable normalement.
 *
 * La logique de « doublon impossible » est enforcée par le `present`
 * → non-sélectionnable côté rendu. L'appelant garantit que
 * `presentIds` reflète l'état courant du programme.
 */

export type ModuleAvailabilityKind = "present" | "removed" | "available";

export interface ModuleAvailabilityDecision {
  kind: ModuleAvailabilityKind;
  /** `true` si l'utilisateur peut cliquer pour ajouter — `false` sur `present`. */
  selectable: boolean;
}

export function decideModuleAvailability(params: {
  moduleId: string;
  /** IDs actuellement présents dans le programme (state courant de l'éditeur). */
  presentIds: readonly string[];
  /** IDs présents au montage initial de l'éditeur — sert à distinguer
   *  « retiré pendant cette session » de « jamais présent ». */
  initialIds: readonly string[];
}): ModuleAvailabilityDecision {
  const isPresent = params.presentIds.includes(params.moduleId);
  if (isPresent) return { kind: "present", selectable: false };
  const wasInitiallyPresent = params.initialIds.includes(params.moduleId);
  if (wasInitiallyPresent) return { kind: "removed", selectable: true };
  return { kind: "available", selectable: true };
}
