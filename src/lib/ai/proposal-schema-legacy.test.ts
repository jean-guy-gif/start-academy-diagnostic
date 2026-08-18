import { describe, expect, it } from "vitest";

import { PricingSchema } from "./proposal-schema";

/**
 * Micro-PR OPCO note visible — rétro-compat Zod.
 *
 * Les `proposal_json` déjà persistés en base AVANT ce lot n'ont pas
 * le nouveau champ `fundingNotes`. Le schéma le déclare optionnel
 * avec `.default([])` — ce test prouve qu'un JSON legacy (sans le
 * champ) parse proprement et voit `fundingNotes = []`. Aucune
 * migration DB requise sur `proposals.proposal_json`.
 */
describe("PricingSchema — rétro-compat fundingNotes (legacy sans le champ)", () => {
  it("parse d'un pricing legacy (sans fundingNotes) → fundingNotes = []", () => {
    const legacy = {
      costPerParticipant: 336,
      participantCount: 2,
      totalEstimatedCost: 672,
      pricingNote: null,
      estimatedFundingTotal: 3000,
      estimatedRemainingCost: 0,
      eligibleParticipantCount: 1,
      fundingDisclaimer:
        "Estimation de prise en charge potentielle, à confirmer selon l'organisme financeur et le dossier administratif.",
      ageficePresentielCoverage: "badge" as const,
      // ← pas de champ `fundingNotes` ici, comme dans les JSON existants
    };
    const parsed = PricingSchema.parse(legacy);
    expect(parsed.fundingNotes).toEqual([]);
    // Sanity : les autres champs conservent leur valeur d'origine.
    expect(parsed.costPerParticipant).toBe(336);
    expect(parsed.ageficePresentielCoverage).toBe("badge");
  });

  it("parse d'un pricing complet (avec fundingNotes) → tableau conservé tel quel", () => {
    const complete = {
      costPerParticipant: 4_200,
      participantCount: 3,
      totalEstimatedCost: 12_600,
      pricingNote: null,
      estimatedFundingTotal: 3_000,
      estimatedRemainingCost: 9_600,
      eligibleParticipantCount: 3,
      fundingDisclaimer: "...",
      ageficePresentielCoverage: "none" as const,
      fundingNotes: ["Salarié éligible OPCO EP — à confirmer avec l'OPCO."],
    };
    const parsed = PricingSchema.parse(complete);
    expect(parsed.fundingNotes).toEqual([
      "Salarié éligible OPCO EP — à confirmer avec l'OPCO.",
    ]);
  });
});
