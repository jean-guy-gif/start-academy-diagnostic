import { describe, expect, it } from "vitest";

import type { Pricing } from "@/lib/ai/proposal-schema";

import {
  DISCOUNT_WARNING_THRESHOLD_PERCENT,
  applyCommercialDiscount,
  decideDiscountWarning,
  describeCoverageState,
  removeCommercialDiscount,
} from "./apply-commercial-discount";

/**
 * Fixture pricing typique produit par `applyStartAcademyPricing` :
 *   • 2 participants × 336 € = 672 € coût pédagogique
 *   • funding = 500 € (indé AGEFICE partiel)
 *   • reste théorique AVANT remise = 672 − 500 = 172 €
 *
 * Règle métier verrouillée : la remise commerciale s'applique
 * EXCLUSIVEMENT sur ce reste à charge (172 €). Le coût pédagogique
 * et la prise en charge sont INCHANGÉS par toute remise (les droits
 * sociaux ne peuvent pas être diminués par un geste commercial).
 */
function makePricing(overrides: Partial<Pricing> = {}): Pricing {
  return {
    costPerParticipant: 336,
    participantCount: 2,
    totalEstimatedCost: 672,
    pricingNote: null,
    estimatedFundingTotal: 500,
    estimatedRemainingCost: 172,
    eligibleParticipantCount: 1,
    fundingDisclaimer: null,
    ageficePresentielCoverage: "none",
    fundingNotes: [],
    commercialDiscount: null,
    finalCost: null,
    ...overrides,
  };
}

describe("applyCommercialDiscount — remise appliquée exclusivement sur le RESTE À CHARGE", () => {
  it("remise 50 € (< reste) → reste final 122 ; coût et funding INCHANGÉS", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: 50,
      reason: "Geste commercial dirigeant fidélisé",
    });
    expect(r.error).toBeNull();
    // Invariant NON-TRANSFERT DE DETTE :
    expect(r.pricing.totalEstimatedCost).toBe(672); // inchangé
    expect(r.pricing.estimatedFundingTotal).toBe(500); // inchangé
    // Reste à charge post-remise :
    expect(r.pricing.estimatedRemainingCost).toBe(122); // 172 − 50
    expect(r.pricing.finalCost).toBe(122); // miroir
    // % calculé sur le RESTE (50 / 172 = 29,07 %) — pas sur le total.
    expect(r.percent).toBeCloseTo(29.07, 1);
  });

  it("remise 20 % (sur RESTE, pas sur total) → 20 % de 172 = 34,4 €, reste final 137,6", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "percent",
      value: 20,
      reason: "Négociation dirigeant",
    });
    expect(r.error).toBeNull();
    expect(r.percent).toBeCloseTo(20, 1);
    expect(r.pricing.commercialDiscount?.valueEuros).toBeCloseTo(34.4, 1);
    expect(r.pricing.estimatedRemainingCost).toBeCloseTo(137.6, 1);
    // Coût pédagogique et funding INCHANGÉS :
    expect(r.pricing.totalEstimatedCost).toBe(672);
    expect(r.pricing.estimatedFundingTotal).toBe(500);
    // 20 % > 15 % → warning
    expect(r.warning).not.toBeNull();
    expect(r.warning).toMatch(/reste à charge/i);
  });

  it("remise > reste à charge → plafonnée au reste, finalRemaining = 0", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: 9999,
      reason: "Prospect stratégique",
    });
    expect(r.error).toBeNull();
    expect(r.pricing.commercialDiscount?.valueEuros).toBe(172); // plafonné
    expect(r.pricing.estimatedRemainingCost).toBe(0);
    // Coût pédagogique et funding TOUJOURS inchangés — plafonnement
    // uniquement sur la valeur de remise, pas sur les droits.
    expect(r.pricing.totalEstimatedCost).toBe(672);
    expect(r.pricing.estimatedFundingTotal).toBe(500);
  });

  it("remise > 15 % du reste → warning ; libellé mentionne « du reste à charge »", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "percent",
      value: 20,
      reason: "Négociation exceptionnelle",
    });
    expect(r.warning).not.toBeNull();
    expect(r.warning).toMatch(/20 % du reste à charge/i);
  });

  it("remise = 15 % du reste → PAS d'avertissement (seuil strict)", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "percent",
      value: 15,
      reason: "Négociation",
    });
    expect(r.warning).toBeNull();
  });

  it("remise 50 % du reste (= 86 €) → warning (bien au-dessus de 15 %)", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "percent",
      value: 50,
      reason: "Négociation dirigeant fidélisé",
    });
    expect(r.error).toBeNull();
    expect(r.percent).toBeCloseTo(50, 1);
    expect(r.pricing.commercialDiscount?.valueEuros).toBe(86); // 50% de 172
    expect(r.pricing.estimatedRemainingCost).toBe(86);
    expect(r.warning).not.toBeNull();
  });

  it("motif vide → error bloquant, pricing inchangé (référence)", () => {
    const before = makePricing();
    const r = applyCommercialDiscount(before, {
      unit: "euros",
      value: 100,
      reason: "   ",
    });
    expect(r.error).toMatch(/motif/i);
    expect(r.pricing).toBe(before);
  });

  it("valeur négative → error bloquant", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: -50,
      reason: "OK",
    });
    expect(r.error).toMatch(/invalide/i);
  });

  it("remise IMPOSSIBLE sur coût pédagogique null → error", () => {
    const r = applyCommercialDiscount(
      makePricing({ totalEstimatedCost: null }),
      { unit: "euros", value: 50, reason: "OK" }
    );
    expect(r.error).toMatch(/nul ou ind[eé]termin/i);
  });

  it("remise IMPOSSIBLE sur coût pédagogique 0 → error", () => {
    const r = applyCommercialDiscount(
      makePricing({ totalEstimatedCost: 0 }),
      { unit: "euros", value: 50, reason: "OK" }
    );
    expect(r.error).toMatch(/nul ou ind[eé]termin/i);
  });

  it("remise IMPOSSIBLE quand reste à charge déjà nul (100 % pris en charge)", () => {
    // Cas : funding couvre déjà tout → aucun reste à remiser.
    const r = applyCommercialDiscount(
      makePricing({
        totalEstimatedCost: 672,
        estimatedFundingTotal: 672,
        estimatedRemainingCost: 0,
      }),
      { unit: "euros", value: 50, reason: "OK" }
    );
    expect(r.error).toMatch(/reste à charge est déjà nul/i);
  });

  it("funding null → traité comme 0, reste théorique = totalEstimatedCost", () => {
    const r = applyCommercialDiscount(
      makePricing({
        estimatedFundingTotal: null,
        estimatedRemainingCost: null,
      }),
      { unit: "euros", value: 200, reason: "OK" }
    );
    expect(r.error).toBeNull();
    expect(r.pricing.estimatedRemainingCost).toBe(472); // 672 − 200
    expect(r.pricing.commercialDiscount?.valueEuros).toBe(200);
  });

  it("remise exactement égale au reste → finalRemaining = 0, PAS d'erreur (bord)", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: 172, // exactement le reste
      reason: "Formation offerte, décision commerciale",
    });
    expect(r.error).toBeNull();
    expect(r.pricing.estimatedRemainingCost).toBe(0);
    expect(r.pricing.commercialDiscount?.valueEuros).toBe(172);
    // Le pricing garde un funding partiel (500) → le rendu affichera
    // « Offert (geste commercial) » et non « 100 % pris en charge ».
    expect(describeCoverageState(r.pricing)).toBe("offered_via_discount");
  });

  it("ageficePresentielCoverage INCHANGÉ par la remise (règle non-transfert)", () => {
    const r = applyCommercialDiscount(
      makePricing({ ageficePresentielCoverage: "alert" }),
      { unit: "euros", value: 50, reason: "OK" }
    );
    expect(r.pricing.ageficePresentielCoverage).toBe("alert");
  });
});

describe("decideDiscountWarning — seuil strict 15 % (appliqué au % du RESTE)", () => {
  it.each([0, 5, 15])(
    "%d %% → pas d'avertissement",
    (percent) => {
      expect(decideDiscountWarning(percent)).toBe(false);
    }
  );

  it.each([15.01, 16, 30, 100])(
    "%d %% → avertissement",
    (percent) => {
      expect(decideDiscountWarning(percent)).toBe(true);
    }
  );

  it("valeur non finie → pas d'avertissement (garde-fou)", () => {
    expect(decideDiscountWarning(Number.NaN)).toBe(false);
    expect(decideDiscountWarning(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("seuil externalisé (DISCOUNT_WARNING_THRESHOLD_PERCENT = 15)", () => {
    expect(DISCOUNT_WARNING_THRESHOLD_PERCENT).toBe(15);
  });
});

describe("removeCommercialDiscount — revert état pré-remise + restauration reste théorique", () => {
  it("efface commercialDiscount + finalCost + RESTAURE estimatedRemainingCost = coût − funding", () => {
    const withDiscount = makePricing({
      commercialDiscount: {
        unit: "euros",
        valueEuros: 100,
        percentDisplay: 58.14, // 100/172
        reason: "OK",
      },
      finalCost: 72,
      estimatedRemainingCost: 72,
    });
    const reverted = removeCommercialDiscount(withDiscount);
    expect(reverted.commercialDiscount).toBeNull();
    expect(reverted.finalCost).toBeNull();
    // Restauration du reste théorique (672 − 500 = 172).
    expect(reverted.estimatedRemainingCost).toBe(172);
    // Coût pédagogique et funding inchangés.
    expect(reverted.totalEstimatedCost).toBe(672);
    expect(reverted.estimatedFundingTotal).toBe(500);
  });

  it("funding ou coût null → estimatedRemainingCost conservé tel quel (fallback safe)", () => {
    const before = makePricing({
      totalEstimatedCost: null,
      estimatedFundingTotal: null,
      estimatedRemainingCost: null,
      commercialDiscount: {
        unit: "euros",
        valueEuros: 50,
        percentDisplay: 100,
        reason: "OK",
      },
      finalCost: 0,
    });
    const reverted = removeCommercialDiscount(before);
    expect(reverted.commercialDiscount).toBeNull();
    expect(reverted.estimatedRemainingCost).toBeNull(); // fallback
  });
});

describe("describeCoverageState — distinction « pris en charge » vs « offert »", () => {
  it("reste > 0 → 'not_zero'", () => {
    expect(describeCoverageState(makePricing())).toBe("not_zero");
  });

  it("reste = 0 grâce au funding (funding = coût) → 'fully_covered_by_funding'", () => {
    const p = makePricing({
      totalEstimatedCost: 672,
      estimatedFundingTotal: 672,
      estimatedRemainingCost: 0,
    });
    expect(describeCoverageState(p)).toBe("fully_covered_by_funding");
  });

  it("reste = 0 grâce à une REMISE (funding partiel) → 'offered_via_discount'", () => {
    const p = makePricing({
      estimatedRemainingCost: 0,
      commercialDiscount: {
        unit: "euros",
        valueEuros: 172,
        percentDisplay: 100,
        reason: "Formation offerte",
      },
      finalCost: 0,
    });
    expect(describeCoverageState(p)).toBe("offered_via_discount");
  });

  it("reste null → 'not_zero' (chemin fallback, aucun libellé « couverture »)", () => {
    const p = makePricing({ estimatedRemainingCost: null });
    expect(describeCoverageState(p)).toBe("not_zero");
  });
});
