import { describe, expect, it } from "vitest";

import type { Pricing } from "@/lib/ai/proposal-schema";

import {
  DISCOUNT_WARNING_THRESHOLD_PERCENT,
  applyCommercialDiscount,
  decideDiscountWarning,
  removeCommercialDiscount,
} from "./apply-commercial-discount";

/**
 * Fixture pricing typique produit par `applyStartAcademyPricing` :
 *   • 2 participants × 336 € = 672 € coût pédagogique
 *   • funding = 500 € (indé AGEFICE partiel), reste = 172 €
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

describe("applyCommercialDiscount — recalcul finalCost + funding plafonné", () => {
  it("remise 50 € en euros → finalCost 622, funding inchangé (< finalCost), reste = 122", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: 50,
      reason: "Geste commercial dirigeant fidélisé",
    });
    expect(r.error).toBeNull();
    expect(r.pricing.finalCost).toBe(622);
    expect(r.pricing.commercialDiscount).toEqual({
      unit: "euros",
      valueEuros: 50,
      percentDisplay: expect.closeTo(7.44, 1),
      reason: "Geste commercial dirigeant fidélisé",
    });
    expect(r.pricing.estimatedFundingTotal).toBe(500); // < finalCost, non plafonné
    expect(r.pricing.estimatedRemainingCost).toBe(122);
  });

  it("remise 10 % → valeur convertie en €, finalCost cohérent", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "percent",
      value: 10,
      reason: "Négociation dirigeant",
    });
    expect(r.error).toBeNull();
    expect(r.percent).toBeCloseTo(10, 1);
    expect(r.pricing.commercialDiscount?.valueEuros).toBeCloseTo(67.2, 1);
    expect(r.pricing.finalCost).toBeCloseTo(604.8, 1);
    expect(r.warning).toBeNull(); // 10 % ≤ 15 % → pas d'avertissement
  });

  it("prise en charge PLAFONNÉE au coût réel après remise agressive", () => {
    // finalCost = 672 − 600 = 72 ; funding original = 500 ; funding
    // final plafonné à 72 → reste = 0.
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: 600,
      reason: "Prospect stratégique",
    });
    expect(r.pricing.finalCost).toBe(72);
    expect(r.pricing.estimatedFundingTotal).toBe(72); // plafonné
    expect(r.pricing.estimatedRemainingCost).toBe(0);
  });

  it("remise > coût pédagogique → finalCost plafonné à 0, funding = 0", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: 9999,
      reason: "Prospect stratégique",
    });
    expect(r.error).toBeNull();
    expect(r.pricing.finalCost).toBe(0);
    expect(r.pricing.estimatedFundingTotal).toBe(0);
    expect(r.pricing.estimatedRemainingCost).toBe(0);
  });

  it("remise > 15 % → avertissement non bloquant", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "percent",
      value: 20,
      reason: "Négociation exceptionnelle",
    });
    expect(r.error).toBeNull();
    expect(r.pricing.finalCost).toBeCloseTo(537.6, 1);
    expect(r.warning).not.toBeNull();
    expect(r.warning).toMatch(/20 % appliqu/i);
  });

  it("remise = 15 % → PAS d'avertissement (seuil strict)", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "percent",
      value: 15,
      reason: "Négociation",
    });
    expect(r.warning).toBeNull();
  });

  it("motif vide → error bloquant, pricing inchangé", () => {
    const before = makePricing();
    const r = applyCommercialDiscount(before, {
      unit: "euros",
      value: 100,
      reason: "   ",
    });
    expect(r.error).toMatch(/motif/i);
    expect(r.pricing).toBe(before); // référence, non modifié
  });

  it("valeur négative → error bloquant", () => {
    const r = applyCommercialDiscount(makePricing(), {
      unit: "euros",
      value: -50,
      reason: "OK",
    });
    expect(r.error).toMatch(/invalide/i);
  });

  it("remise IMPOSSIBLE sur coût pédagogique null → error bloquant", () => {
    const r = applyCommercialDiscount(
      makePricing({ totalEstimatedCost: null }),
      { unit: "euros", value: 50, reason: "OK" }
    );
    expect(r.error).toMatch(/nul ou ind[eé]termin/i);
  });

  it("remise IMPOSSIBLE sur coût pédagogique 0 → error bloquant", () => {
    const r = applyCommercialDiscount(
      makePricing({ totalEstimatedCost: 0 }),
      { unit: "euros", value: 50, reason: "OK" }
    );
    expect(r.error).toMatch(/nul ou ind[eé]termin/i);
  });
});

describe("decideDiscountWarning — seuil strict 15 %", () => {
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

describe("removeCommercialDiscount — revert état pré-remise", () => {
  it("efface commercialDiscount + finalCost, conserve le reste", () => {
    const withDiscount = makePricing({
      commercialDiscount: {
        unit: "euros",
        valueEuros: 100,
        percentDisplay: 14.88,
        reason: "OK",
      },
      finalCost: 572,
    });
    const reverted = removeCommercialDiscount(withDiscount);
    expect(reverted.commercialDiscount).toBeNull();
    expect(reverted.finalCost).toBeNull();
    // Le reste est inchangé — le vrai revert du funding nécessite un
    // re-calcul via `applyStartAcademyPricing` (documenté dans le JSDoc).
    expect(reverted.totalEstimatedCost).toBe(672); // fixture initiale
  });
});
