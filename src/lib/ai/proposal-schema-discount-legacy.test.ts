import { describe, expect, it } from "vitest";

import { PricingSchema } from "./proposal-schema";

/**
 * Lot B2 édition proposition (PR-1) — rétro-compat Zod.
 *
 * L'ajout de `commercialDiscount` et `finalCost` sur `PricingSchema`
 * DOIT laisser passer les `proposal_json` déjà persistés en base
 * (aucune migration DB sur ce lot). Les 2 champs sont `.optional()
 * .default(null)`. Ce test prouve qu'un JSON legacy sans ces champs
 * parse en `commercialDiscount = null` et `finalCost = null`.
 */
describe("PricingSchema — rétro-compat commercialDiscount / finalCost", () => {
  it("legacy sans commercialDiscount ni finalCost → parse OK, valeurs = null", () => {
    const legacy = {
      costPerParticipant: 336,
      participantCount: 2,
      totalEstimatedCost: 672,
      pricingNote: null,
      estimatedFundingTotal: 500,
      estimatedRemainingCost: 172,
      eligibleParticipantCount: 1,
      fundingDisclaimer:
        "Estimation de prise en charge potentielle, à confirmer selon l'organisme financeur et le dossier administratif.",
      ageficePresentielCoverage: "none" as const,
      fundingNotes: [],
      // Pas de champ commercialDiscount, pas de champ finalCost.
    };
    const parsed = PricingSchema.parse(legacy);
    expect(parsed.commercialDiscount).toBeNull();
    expect(parsed.finalCost).toBeNull();
    // Sanity : le reste est inchangé.
    expect(parsed.totalEstimatedCost).toBe(672);
    expect(parsed.estimatedFundingTotal).toBe(500);
  });

  it("pricing complet avec commercialDiscount + finalCost → tout conservé", () => {
    const complete = {
      costPerParticipant: 336,
      participantCount: 2,
      totalEstimatedCost: 672,
      pricingNote: null,
      estimatedFundingTotal: 500,
      estimatedRemainingCost: 22, // 522 − 500
      eligibleParticipantCount: 1,
      fundingDisclaimer: null,
      ageficePresentielCoverage: "none" as const,
      fundingNotes: [],
      commercialDiscount: {
        unit: "euros" as const,
        valueEuros: 150,
        percentDisplay: 22.32,
        reason: "Négociation dirigeant fidélisé, remise validée par la direction",
      },
      finalCost: 522,
    };
    const parsed = PricingSchema.parse(complete);
    expect(parsed.commercialDiscount).toEqual(complete.commercialDiscount);
    expect(parsed.finalCost).toBe(522);
  });

  it("commercialDiscount avec motif vide → rejet Zod (min(1))", () => {
    const invalid = {
      costPerParticipant: 336,
      participantCount: 2,
      totalEstimatedCost: 672,
      pricingNote: null,
      estimatedFundingTotal: 500,
      estimatedRemainingCost: 172,
      eligibleParticipantCount: 1,
      fundingDisclaimer: null,
      ageficePresentielCoverage: "none" as const,
      fundingNotes: [],
      commercialDiscount: {
        unit: "euros" as const,
        valueEuros: 50,
        percentDisplay: 7.44,
        reason: "", // motif vide
      },
      finalCost: 622,
    };
    const result = PricingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("commercialDiscount avec valueEuros négatif → rejet Zod", () => {
    const invalid = {
      costPerParticipant: 336,
      participantCount: 2,
      totalEstimatedCost: 672,
      pricingNote: null,
      estimatedFundingTotal: 500,
      estimatedRemainingCost: 172,
      eligibleParticipantCount: 1,
      fundingDisclaimer: null,
      ageficePresentielCoverage: "none" as const,
      fundingNotes: [],
      commercialDiscount: {
        unit: "euros" as const,
        valueEuros: -50,
        percentDisplay: 0,
        reason: "OK",
      },
      finalCost: 722,
    };
    const result = PricingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
