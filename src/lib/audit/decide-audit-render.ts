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

import type { AuditContent, AuditRatio } from "./build-audit-content";

/**
 * Seuil minimum de complétude sous lequel un audit est considéré
 * incomplet — l'impression est désactivée et un avertissement bloque
 * la restitution (correction issue d'un audit imprimé réel : un audit
 * à 40 % de complétude a été présenté à un dirigeant sans que
 * l'incomplétude ne soit visible côté commercial).
 *
 * Constante configurable — modifier ici suffit à changer le seuil
 * partout. 70 % correspond à ~48 / 69 réponses.
 */
export const AUDIT_COMPLETENESS_THRESHOLD_PERCENT = 70;

export type AuditPrintReadinessKind = "ready" | "incomplete" | "empty";

export interface AuditPrintReadinessDecision {
  kind: AuditPrintReadinessKind;
  /** Pourcentage de complétude (0-100), toujours renvoyé pour affichage. */
  percent: number;
  answeredCount: number;
  totalCount: number;
  /** Message utilisateur — présent quand kind ≠ 'ready'. */
  message: string | null;
}

/**
 * Décision de prêt-à-imprimer — fonction pure, testable sans DOM.
 *
 * Renvoie :
 *   • `ready` — au moins {AUDIT_COMPLETENESS_THRESHOLD_PERCENT} % de
 *     réponses. Le bouton Imprimer est actif, aucun bandeau.
 *   • `incomplete` — sous le seuil MAIS au moins 1 réponse. Bandeau
 *     amber bloquant, bouton Imprimer désactivé.
 *   • `empty` — 0 réponse. Autre écran (delegué à `decideAuditRender`).
 */
export function decideAuditPrintReadiness(
  audit: AuditContent
): AuditPrintReadinessDecision {
  const { answeredCount, totalCount } = audit.completeness;
  // On compare le pourcentage RÉEL (non-arrondi) au seuil, sinon
  // 48/69 = 69,57 % pourrait passer « ready » après arrondi à 70.
  // L'arrondi reste utilisé uniquement pour l'AFFICHAGE.
  const realPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;
  const percent = Math.round(realPercent);
  if (answeredCount === 0) {
    return {
      kind: "empty",
      percent: 0,
      answeredCount,
      totalCount,
      message: null,
    };
  }
  if (realPercent < AUDIT_COMPLETENESS_THRESHOLD_PERCENT) {
    return {
      kind: "incomplete",
      percent,
      answeredCount,
      totalCount,
      message: `Audit incomplet : ${answeredCount} réponses sur ${totalCount} (${percent} %). Complétez le diagnostic avant la restitution.`,
    };
  }
  return {
    kind: "ready",
    percent,
    answeredCount,
    totalCount,
    message: null,
  };
}

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

/**
 * Décision de rendu d'un ratio — trois cas distincts, jamais mélangés :
 *   • `with_benchmark` — valeur ET repère présents → afficher la valeur
 *     et un badge de statut vs benchmark (au-dessus / sous / dans le
 *     repère selon `higherIsWorse`).
 *   • `value_only` — valeur présente MAIS aucun repère → afficher la
 *     valeur seule, **aucune** mention de statut (pas de « Non mesuré »
 *     sous un chiffre qui existe).
 *   • `no_data` — pas de réponse → afficher « Non renseigné », aucun
 *     chiffre, aucun statut.
 */
export type RatioDisplayKind = "with_benchmark" | "value_only" | "no_data";

export interface RatioDisplayDecision {
  kind: RatioDisplayKind;
  /**
   * `true` si le badge de statut doit être affiché. Toujours `false`
   * pour `value_only` et `no_data`. Le libellé exact du badge (« Au-
   * dessus du repère », « Dans le repère », « À surveiller », …) reste
   * la responsabilité du composant view — cette fonction dit seulement
   * s'il doit apparaître.
   */
  showStatusBadge: boolean;
  /** `true` si un chiffre doit être affiché (les 2 premiers cas). */
  showValue: boolean;
  /**
   * Texte à afficher quand `showValue === false` (seulement pour
   * `no_data`). `null` sinon.
   */
  emptyValueText: string | null;
}

export function decideRatioDisplay(ratio: AuditRatio): RatioDisplayDecision {
  if (ratio.status === "no_data") {
    return {
      kind: "no_data",
      showStatusBadge: false,
      showValue: false,
      emptyValueText: "Non renseigné",
    };
  }
  if (ratio.status === "no_benchmark") {
    return {
      kind: "value_only",
      showStatusBadge: false,
      showValue: true,
      emptyValueText: null,
    };
  }
  return {
    kind: "with_benchmark",
    showStatusBadge: true,
    showValue: true,
    emptyValueText: null,
  };
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
