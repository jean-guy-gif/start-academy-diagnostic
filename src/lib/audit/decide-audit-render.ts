/**
 * Décision de rendu pour la page audit imprimable — fonction pure,
 * testable sans DOM. Le composant `audit-view.tsx` lit uniquement le
 * résultat renvoyé ici.
 *
 * Deux modes :
 *   • `empty` — aucune réponse guidée persistée → l'audit ne peut PAS
 *     être généré, la page rend un état vide propre (« Complétez le
 *     diagnostic pour générer l'audit »). Aucun audit fantôme.
 *   • `audit` — au moins une réponse persistée → tous les blocs sont
 *     construits (page de garde, synthèse dirigeant, chaîne, pratiques,
 *     priorités). Les blocs eux-mêmes gèrent leurs propres vides
 *     internes (ratio unknown, verbatim absent…).
 *
 * Les 5 blocs sont TOUJOURS présents en mode `audit` — mais chacun
 * peut être vide (0 ratio measurable, 0 alerte). C'est la présence de
 * l'audit dans son ensemble qui est conditionnelle, pas les blocs.
 */

import type { AuditContent } from "./build-audit-content";

/**
 * Prédicat pur — un audit peut-il être généré pour ce diagnostic ?
 * Source unique de vérité pour tous les CTA « Voir l'audit » du
 * parcours (liste, wizard, page recommandation) — garantit l'alignement
 * avec l'état empty/audit décidé ci-dessous par `decideAuditRender`.
 *
 * Règle : au moins une réponse guidée persistée. Toute la logique de
 * seuil vit ici — ne PAS dupliquer un `answerCount > 0` inline.
 */
export function isAuditAvailable(answeredCount: number): boolean {
  return answeredCount > 0;
}

export type AuditRenderKind = "empty" | "audit";

export interface AuditRenderDecision {
  kind: AuditRenderKind;
  /** Mention discrète du pied de page de garde. `null` en mode empty. */
  completenessLabel: string | null;
  /**
   * Vrai si le verbatim `top3_priorities` existe et peut être cité en
   * exergue de la synthèse dirigeant. Faux si absent — pas d'exergue
   * plutôt qu'un placeholder.
   */
  showPrioritiesQuote: boolean;
}

export function decideAuditRender(
  audit: AuditContent
): AuditRenderDecision {
  if (!isAuditAvailable(audit.completeness.answeredCount)) {
    return {
      kind: "empty",
      completenessLabel: null,
      showPrioritiesQuote: false,
    };
  }
  const { answeredCount, totalCount } = audit.completeness;
  const completenessLabel = `Audit établi sur la base de ${answeredCount} réponse${
    answeredCount > 1 ? "s" : ""
  } sur ${totalCount}`;
  const showPrioritiesQuote = audit.practices.verbatims.some(
    (v) => v.key === "top3_priorities" && v.content.trim().length > 0
  );
  return { kind: "audit", completenessLabel, showPrioritiesQuote };
}
