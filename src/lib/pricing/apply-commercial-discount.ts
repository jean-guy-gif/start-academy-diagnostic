import type { Pricing } from "@/lib/ai/proposal-schema";

/**
 * Application d'une remise commerciale sur un `Pricing` déjà calculé
 * (lot B2 — édition proposition, PR-1 moteur pur).
 *
 * Règles produit validées :
 *   • Le coût pédagogique (`totalEstimatedCost`) N'EST PAS éditable —
 *     il reste tel qu'il a été calculé par `applyStartAcademyPricing`.
 *   • La remise est saisie en € OU en %, avec motif obligatoire ; on
 *     normalise en euros dans `commercialDiscount.valueEuros` (source
 *     de vérité aval).
 *   • `finalCost = max(totalEstimatedCost − valueEuros, 0)` — jamais
 *     négatif ; si l'utilisateur saisit une remise > coût, on plafonne.
 *   • Le financement se recalcule sur le montant FINAL :
 *       `estimatedFundingTotal_final = min(originalFundingTotal, finalCost)`
 *     ↑ la prise en charge est plafonnée au coût réel — c'est
 *       l'affichage explicite demandé (« la prise en charge baisse
 *       aussi »).
 *   • `estimatedRemainingCost_final = max(finalCost − funding_final, 0)`.
 *   • Avertissement (non bloquant) au-delà de 15 % de remise.
 *
 * Le badge `ageficePresentielCoverage` est calculé PAR PARTICIPANT
 * dans le moteur (`training-funding.ts`) sur une décision qui n'a pas
 * de sens au niveau global d'une remise commerciale — on le laisse
 * tel quel. Le rendu affiche déjà « au-dessus / sous le repère » sur
 * les ratios par indé ; la remise commerciale n'y touche pas.
 *
 * Fonction pure, testable sans DOM, isomorphe (utilisable côté client
 * pour recalcul direct dans l'éditeur).
 */

export type DiscountUnit = "euros" | "percent";

export interface CommercialDiscountInput {
  unit: DiscountUnit;
  /** Valeur saisie dans l'unité `unit`. */
  value: number;
  /** Motif obligatoire — chaîne non vide. */
  reason: string;
}

export interface ApplyCommercialDiscountResult {
  /** Nouveau `Pricing` avec `finalCost`, `commercialDiscount` et
   *  `estimatedFundingTotal` / `estimatedRemainingCost` recalculés. */
  pricing: Pricing;
  /** Pourcentage réel de la remise sur `totalEstimatedCost` (0-100+). */
  percent: number;
  /** Avertissement non bloquant si `percent > 15`. */
  warning: string | null;
  /** Erreur bloquante (coût nul, motif vide, valeur négative…). */
  error: string | null;
}

/**
 * Seuil au-delà duquel un avertissement (non bloquant) est émis.
 * Choisi côté produit — externalisé pour test.
 */
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
  const valueEuros =
    discount.unit === "euros"
      ? round2(Math.min(discount.value, totalCost))
      : round2(Math.min((discount.value / 100) * totalCost, totalCost));
  const percent = round2((valueEuros / totalCost) * 100);
  const finalCost = round2(clampNonNegative(totalCost - valueEuros));

  // Prise en charge plafonnée au coût réel — affichage explicite
  // demandé (la prise en charge baisse aussi).
  const originalFunding = pricing.estimatedFundingTotal ?? 0;
  const fundingFinal = pricing.estimatedFundingTotal === null
    ? null
    : round2(Math.min(originalFunding, finalCost));
  const remainingFinal = fundingFinal === null
    ? pricing.estimatedRemainingCost
    : round2(clampNonNegative(finalCost - fundingFinal));

  const warning = decideDiscountWarning(percent)
    ? `Remise de ${percent} % appliquée — au-delà du seuil de vigilance (${DISCOUNT_WARNING_THRESHOLD_PERCENT} %). À valider dirigeant.`
    : null;

  return {
    pricing: {
      ...pricing,
      commercialDiscount: {
        unit: discount.unit,
        valueEuros,
        percentDisplay: percent,
        reason: reasonTrimmed,
      },
      finalCost,
      estimatedFundingTotal: fundingFinal,
      estimatedRemainingCost: remainingFinal,
    },
    percent,
    warning,
    error: null,
  };
}

/**
 * Retire une remise commerciale : le pricing revient à son état
 * pré-remise (funding non plafonné, finalCost null). Utilisé par le
 * bouton « Annuler la remise » de l'éditeur.
 *
 * ATTENTION : cette fonction NE recalcule PAS `estimatedFundingTotal`
 * — elle assume que l'appelant passe un `pricing` dont le funding
 * total est encore la valeur pré-plafonnage. Si le funding a été
 * plafonné puis persisté sans conservation du total original, le
 * revert nécessite un re-calcul via `applyStartAcademyPricing`.
 */
export function removeCommercialDiscount(pricing: Pricing): Pricing {
  return {
    ...pricing,
    commercialDiscount: null,
    finalCost: null,
  };
}
