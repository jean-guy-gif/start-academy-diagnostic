import type {
  ProposalModule,
  TrainingProgram,
} from "@/lib/ai/proposal-schema";

/**
 * Fonctions pures d'édition du `TrainingProgram` — lot B2 édition
 * proposition (PR-1 moteur pur). Aucune UI, aucun state React,
 * testables isolément. L'éditeur (PR-2) les branche.
 *
 * Toutes les fonctions renvoient un NOUVEAU `TrainingProgram` (jamais
 * de mutation en place) avec `totalDurationHours` recalculé à partir
 * des modules — cohérence garantie même si la valeur d'origine avait
 * dérivé (proposal_json legacy).
 *
 * Contrat de bornes : les index hors bornes sont ignorés (le programme
 * renvoyé est identique à l'entrée). Aucune exception levée — la
 * couche UI n'a pas à protéger ses appels.
 */

function recomputeTotal(modules: readonly ProposalModule[]): number {
  return modules.reduce((sum, m) => sum + (Number.isFinite(m.durationHours) ? m.durationHours : 0), 0);
}

/** Ajoute un module en fin de liste. Recalcule totalDurationHours. */
export function addModuleToProgram(
  program: TrainingProgram,
  module: ProposalModule
): TrainingProgram {
  const modules = [...program.modules, module];
  return {
    ...program,
    modules,
    totalDurationHours: recomputeTotal(modules),
  };
}

/** Retire le module à l'index donné. Index hors bornes → no-op. */
export function removeModuleFromProgram(
  program: TrainingProgram,
  index: number
): TrainingProgram {
  if (index < 0 || index >= program.modules.length) return program;
  const modules = program.modules.filter((_, i) => i !== index);
  return {
    ...program,
    modules,
    totalDurationHours: recomputeTotal(modules),
  };
}

/**
 * Déplace le module `fromIndex` vers `toIndex` (positions dans la
 * liste). Convention array-splice : `toIndex` = destination finale
 * après retrait. Index invalide (hors bornes, égalité) → no-op.
 * Le total ne bouge pas — c'est un pur réordonnancement.
 */
export function reorderModuleInProgram(
  program: TrainingProgram,
  fromIndex: number,
  toIndex: number
): TrainingProgram {
  const len = program.modules.length;
  if (
    fromIndex < 0 ||
    fromIndex >= len ||
    toIndex < 0 ||
    toIndex >= len ||
    fromIndex === toIndex
  ) {
    return program;
  }
  const modules = [...program.modules];
  const [moved] = modules.splice(fromIndex, 1);
  modules.splice(toIndex, 0, moved);
  return {
    ...program,
    modules,
    totalDurationHours: recomputeTotal(modules),
  };
}

/**
 * Met à jour la durée d'un module. Valeurs négatives ou non-finies
 * clampées à 0. `totalDurationHours` recalculé.
 */
export function updateModuleDurationInProgram(
  program: TrainingProgram,
  index: number,
  durationHours: number
): TrainingProgram {
  if (index < 0 || index >= program.modules.length) return program;
  const safe =
    Number.isFinite(durationHours) && durationHours >= 0 ? durationHours : 0;
  const modules = program.modules.map((m, i) =>
    i === index ? { ...m, durationHours: safe } : m
  );
  return {
    ...program,
    modules,
    totalDurationHours: recomputeTotal(modules),
  };
}

/**
 * Met à jour un champ texte libre d'un module (title / whyThisModule).
 * Chaîne vide autorisée à ce niveau — c'est la couche Zod à la
 * persistance qui refuse `min(1)`. Cela permet à l'éditeur d'avoir
 * un état transitoire vide avant validation utilisateur.
 */
export function updateModuleTextInProgram(
  program: TrainingProgram,
  index: number,
  field: "title" | "whyThisModule",
  value: string
): TrainingProgram {
  if (index < 0 || index >= program.modules.length) return program;
  const modules = program.modules.map((m, i) =>
    i === index ? { ...m, [field]: value } : m
  );
  return { ...program, modules };
}
