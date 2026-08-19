import type { Pricing } from "@/lib/ai/proposal-schema";

/**
 * Application d'une remise commerciale sur un `Pricing` déjà calculé
 * (lot B2 — édition proposition).
 *
 * ⚠️ RÈGLE MÉTIER CORRIGÉE (PR-2 post-review produit) :
 *   La remise commerciale s'applique EXCLUSIVEMENT sur le reste à
 *   charge — jamais sur le coût pédagogique ni sur la prise en charge
 *   AGEFICE/OPCO. Les droits sont calculés sur le coût pédagogique
 *   RÉEL et ne peuvent en aucun cas être diminués par un geste
 *   commercial (règle de non-transfert de dette : un cadeau
 *   commercial ne réduit pas les droits sociaux).
 *
 * Calcul :
 *   • `totalEstimatedCost` — INCHANGÉ (coût pédagogique).
 *   • `estimatedFundingTotal` — INCHANGÉ (prise en charge sur coût réel).
 *   • `restBeforeDiscount = max(totalEstimatedCost − estimatedFundingTotal, 0)`
 *     (reste à charge « théorique » avant geste commercial).
 *   • `valueEuros` de la remise plafonnée à `restBeforeDiscount`
 *     (impossible d'offrir plus que ce qui restait à payer).
 *   • `finalRemainingCost = max(restBeforeDiscount − valueEuros, 0)`.
 *   • `percent = valueEuros / restBeforeDiscount × 100` (pourcentage
 *     sur le RESTE, pas sur le coût total — c'est la vraie mesure de
 *     l'effort commercial).
 *   • Warning (non bloquant) si `percent > 15 %`.
 *
 * Champ `pricing.finalCost` — sémantique clarifiée : représente le
 * **reste à charge final** après remise (miroir de
 * `estimatedRemainingCost` post-application). `null` = pas de remise.
 *
 * Le badge `ageficePresentielCoverage` n'est PAS touché — il reflète
 * la couverture AGEFICE agrégée sur le coût réel. La distinction
 * « pris en charge » (funding = 100 %) vs « offert » (remise ramène
 * le reste à 0) se fait au rendu via `describeCoverageState`.
 *
 * Fonction pure, testable sans DOM, isomorphe.
 */

export type DiscountUnit = "euros" | "percent";

export interface CommercialDiscountInput {
  unit: DiscountUnit;
  /** Valeur saisie dans l'unité `unit`. Interprétée sur le RESTE À CHARGE
   *  quand `unit === "percent"` — pas sur le coût total. */
  value: number;
  /** Motif obligatoire — chaîne non vide. */
  reason: string;
}

export interface ApplyCommercialDiscountResult {
  /** Nouveau `Pricing` avec `commercialDiscount` posé et
   *  `estimatedRemainingCost` / `finalCost` reflétant le reste à charge
   *  post-remise. `totalEstimatedCost` et `estimatedFundingTotal`
   *  restent INCHANGÉS (règle non-transfert de dette). */
  pricing: Pricing;
  /** Pourcentage de la remise sur le RESTE À CHARGE (pas sur le total). */
  percent: number;
  /** Avertissement non bloquant si `percent > 15`. */
  warning: string | null;
  /** Erreur bloquante (coût nul, motif vide, valeur négative, reste nul…). */
  error: string | null;
}

/** Seuil au-delà duquel un avertissement (non bloquant) est émis —
 *  appliqué au pourcentage sur le RESTE À CHARGE. */
export const DISCOUNT_WARNING_THRESHOLD_PERCENT = 15;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampNonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

/**
 * Décision d'avertissement — fonction pure séparée pour test.
 * `percent` en pourcentage (ex. 20 pour 20 %). Retourne `true` si
 * strictement au-dessus du seuil, `false` sinon (l'égalité n'émet
 * pas d'avertissement).
 */
export function decideDiscountWarning(percent: number): boolean {
  if (!Number.isFinite(percent)) return false;
  return percent > DISCOUNT_WARNING_THRESHOLD_PERCENT;
}

export function applyCommercialDiscount(
  pricing: Pricing,
  discount: CommercialDiscountInput
): ApplyCommercialDiscountResult {
  const reasonTrimmed = discount.reason.trim();
  if (reasonTrimmed.length === 0) {
    return {
      pricing,
      percent: 0,
      warning: null,
      error: "Motif de remise obligatoire.",
    };
  }
  if (!Number.isFinite(discount.value) || discount.value < 0) {
    return {
      pricing,
      percent: 0,
      warning: null,
      error: "Valeur de remise invalide.",
    };
  }
  if (
    pricing.totalEstimatedCost === null ||
    pricing.totalEstimatedCost <= 0
  ) {
    return {
      pricing,
      percent: 0,
      warning: null,
      error: "Remise impossible : coût pédagogique nul ou indéterminé.",
    };
  }

  const totalCost = pricing.totalEstimatedCost;
  const funding = pricing.estimatedFundingTotal ?? 0;
  const restBeforeDiscount = round2(clampNonNegative(totalCost - funding));

  if (restBeforeDiscount === 0) {
    return {
      pricing,
      percent: 0,
      warning: null,
      error:
        "Remise impossible : le reste à charge est déjà nul (formation intégralement prise en charge).",
    };
  }

  const valueEuros =
    discount.unit === "euros"
      ? round2(Math.min(discount.value, restBeforeDiscount))
      : round2(
          Math.min(
            (discount.value / 100) * restBeforeDiscount,
            restBeforeDiscount
          )
        );
  const percent = round2((valueEuros / restBeforeDiscount) * 100);
  const finalRemainingCost = round2(
    clampNonNegative(restBeforeDiscount - valueEuros)
  );

  const warning = decideDiscountWarning(percent)
    ? `Remise de ${percent} % du reste à charge appliquée — au-delà du seuil de vigilance (${DISCOUNT_WARNING_THRESHOLD_PERCENT} %). À valider dirigeant.`
    : null;

  return {
    pricing: {
      ...pricing,
      // Coût pédagogique INCHANGÉ — jamais impacté par une remise
      // (règle : les droits sociaux se calculent dessus).
      totalEstimatedCost: pricing.totalEstimatedCost,
      // Prise en charge INCHANGÉE — jamais diminuée par un geste
      // commercial (règle non-transfert de dette).
      estimatedFundingTotal: pricing.estimatedFundingTotal,
      // Reste à charge post-remise. Miroir de `finalCost`.
      estimatedRemainingCost: finalRemainingCost,
      commercialDiscount: {
        unit: discount.unit,
        valueEuros,
        percentDisplay: percent,
        reason: reasonTrimmed,
      },
      // `finalCost` : sémantique clarifiée dans le JSDoc du module —
      // représente le reste à charge FINAL après remise.
      finalCost: finalRemainingCost,
    },
    percent,
    warning,
    error: null,
  };
}

/**
 * Retire une remise commerciale : le pricing revient à son état
 * pré-remise. Le reste à charge « avant remise » n'étant pas stocké
 * séparément, l'appelant DOIT le recalculer à la volée depuis
 * `totalEstimatedCost − estimatedFundingTotal` s'il souhaite le
 * restaurer visuellement. Cette fonction efface uniquement les
 * champs de remise + remet `finalCost` à null.
 */
export function removeCommercialDiscount(pricing: Pricing): Pricing {
  const totalCost = pricing.totalEstimatedCost;
  const funding = pricing.estimatedFundingTotal;
  const restRestored =
    totalCost !== null && funding !== null
      ? round2(clampNonNegative(totalCost - funding))
      : pricing.estimatedRemainingCost;
  return {
    ...pricing,
    commercialDiscount: null,
    finalCost: null,
    estimatedRemainingCost: restRestored,
  };
}

/**
 * Décision de libellé de couverture — distinction produit demandée
 * en revue #49 : « pris en charge » (funding couvre tout) vs
 * « offert » (remise ramène le reste à 0 alors que funding ne
 * couvrait pas tout).
 *
 * Fonction pure, sans DOM. Utilisée par le rendu proposition pour
 * éviter de laisser croire au dirigeant qu'un geste commercial est
 * une couverture AGEFICE/OPCO.
 */
export type CoverageStateKind =
  | "not_zero"
  | "fully_covered_by_funding"
  | "offered_via_discount";

export function describeCoverageState(pricing: Pricing): CoverageStateKind {
  const remaining = pricing.estimatedRemainingCost;
  if (remaining === null || remaining > 0) return "not_zero";
  // remaining === 0 : quelle est la raison ?
  const totalCost = pricing.totalEstimatedCost ?? 0;
  const funding = pricing.estimatedFundingTotal ?? 0;
  const fundingCoversAlone = funding >= totalCost && totalCost > 0;
  if (fundingCoversAlone) return "fully_covered_by_funding";
  // Reste = 0 sans que le funding suffise → la remise a compensé.
  if (pricing.commercialDiscount) return "offered_via_discount";
  // Cas résiduel : reste = 0 sans funding ni remise — ne devrait pas
  // arriver en pratique (coût nul), on retombe sur « not_zero ».
  return "not_zero";
}
