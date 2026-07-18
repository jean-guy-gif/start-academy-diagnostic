import { describe, expect, it } from "vitest";

import {
  buildPricingNote,
  calculateCostPerParticipant,
  calculateTotalTrainingBudget,
  formatPriceEuros,
} from "./training-pricing";

/**
 * Tests unit `training-pricing`.
 *
 * Verrouille la règle métier Start Academy post-refonte 2026-07-17 :
 * tarif horaire par participant INJECTÉ (paramètre), plus de constante
 * 42 en dur. La valeur canonique 84 € vit dans `funding_config` (seed
 * PRICE_PER_HOUR_PER_PARTICIPANT) — c'est le test de contrat
 * `pricing-config.contract.test.ts` qui verrouille l'invariant
 * migration ↔ DEFAULT_FUNDING_CONFIG.
 *
 * Ici on teste UNIQUEMENT le module pur (aucune dépendance Supabase).
 */

const RATE = 84;

describe("calculateCostPerParticipant", () => {
  it("4h × 84 € = 336 € (règle fondamentale forfait demi-journée)", () => {
    expect(calculateCostPerParticipant(4, RATE)).toBe(336);
  });

  it("6h × 84 € = 504 €", () => {
    expect(calculateCostPerParticipant(6, RATE)).toBe(504);
  });

  it("10h × 84 € = 840 €", () => {
    expect(calculateCostPerParticipant(10, RATE)).toBe(840);
  });

  it("18h × 84 € = 1512 € (exemple prompt IA)", () => {
    expect(calculateCostPerParticipant(18, RATE)).toBe(1512);
  });

  it("durée nulle → null (jamais un total faux)", () => {
    expect(calculateCostPerParticipant(0, RATE)).toBeNull();
  });

  it("durée null → null", () => {
    expect(calculateCostPerParticipant(null, RATE)).toBeNull();
  });

  it("durée undefined → null", () => {
    expect(calculateCostPerParticipant(undefined, RATE)).toBeNull();
  });

  it("durée NaN → null", () => {
    expect(calculateCostPerParticipant(NaN, RATE)).toBeNull();
  });

  it("tarif horaire null/undefined/0 → null", () => {
    expect(calculateCostPerParticipant(4, 0)).toBeNull();
    expect(calculateCostPerParticipant(4, -84)).toBeNull();
    expect(calculateCostPerParticipant(4, NaN)).toBeNull();
  });
});

describe("calculateTotalTrainingBudget", () => {
  it("4h × 1 participant × 84 € = 336 € (demi-journée solo)", () => {
    expect(calculateTotalTrainingBudget(4, 1, RATE)).toBe(336);
  });

  it("4h × 3 participants × 84 € = 1 008 € (équipe demi-journée)", () => {
    expect(calculateTotalTrainingBudget(4, 3, RATE)).toBe(1008);
  });

  it("18h × 5 participants × 84 € = 7 560 €", () => {
    expect(calculateTotalTrainingBudget(18, 5, RATE)).toBe(7560);
  });

  it("participantCount 0/null/negative → null", () => {
    expect(calculateTotalTrainingBudget(4, 0, RATE)).toBeNull();
    expect(calculateTotalTrainingBudget(4, null, RATE)).toBeNull();
    expect(calculateTotalTrainingBudget(4, -1, RATE)).toBeNull();
  });

  it("durée invalide → null", () => {
    expect(calculateTotalTrainingBudget(null, 3, RATE)).toBeNull();
    expect(calculateTotalTrainingBudget(0, 3, RATE)).toBeNull();
  });
});

describe("formatPriceEuros", () => {
  it("formate en euros français, arrondi entier", () => {
    expect(formatPriceEuros(84)).toContain("84");
    expect(formatPriceEuros(84)).toContain("€");
    expect(formatPriceEuros(336)).toContain("336");
    expect(formatPriceEuros(1512)).toMatch(/1[\s ]?512.*€/);
  });

  it("null / undefined / NaN → tiret", () => {
    expect(formatPriceEuros(null)).toBe("—");
    expect(formatPriceEuros(undefined)).toBe("—");
    expect(formatPriceEuros(NaN)).toBe("—");
  });
});

describe("buildPricingNote — inclut « tout compris » et le tarif dynamique", () => {
  it("note complète avec durée + participants + rate 84", () => {
    const note = buildPricingNote({
      totalDurationHours: 4,
      participantCount: 3,
      pricePerHourPerParticipant: RATE,
    });
    expect(note).toContain("84 €");
    expect(note).toContain("4 h");
    expect(note).toContain("3 participants");
    expect(note.toLowerCase()).toContain("tout compris");
  });

  it("note dégradée sans participants — mentionne rate + prix par participant", () => {
    const note = buildPricingNote({
      totalDurationHours: 6,
      participantCount: null,
      pricePerHourPerParticipant: RATE,
    });
    // Note : Intl.NumberFormat("fr-FR") utilise un espace insécable
    // étroit ` ` entre le nombre et le symbole €.
    expect(note).toMatch(/504[\s ]?€/); // 6 × 84
  });

  it("note dégradée sans durée — mentionne rate + « tout compris »", () => {
    const note = buildPricingNote({
      totalDurationHours: null,
      participantCount: 3,
      pricePerHourPerParticipant: RATE,
    });
    expect(note).toContain("84 €");
    expect(note.toLowerCase()).toContain("tout compris");
  });
});
