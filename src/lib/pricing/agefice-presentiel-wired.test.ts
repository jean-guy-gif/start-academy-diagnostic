import { describe, expect, it } from "vitest";

import { applyStartAcademyPricing } from "./apply-start-academy-pricing";
import {
  estimateParticipantFunding,
  estimateTrainingFunding,
} from "./training-funding";
import { decideAgeficePresentielRender } from "@/components/funding/agefice-presentiel-coverage-badge";
import { computeAgeficePresentielFunding } from "./agefice-presentiel-funding";
import { PRICE_PER_HOUR_PER_PARTICIPANT } from "./agefice-presentiel-funding";

/**
 * Tests bout-à-bout du branchement AGEFICE présentiel horaire :
 *   (i)   contrat de propagation `totalDurationHours` → coverage!==null
 *   (ii)  invariance OPCO EP salariés avant/après ajout de `trainingHours`
 *   (iii) applyStartAcademyPricing + decideAgeficePresentielRender :
 *         indé au CA N-1 manquant → alerte, jamais badge
 *   (iv)  cas mixte (1 indé couvert + 1 en alerte) → alerte agrégée
 */

const HOURS = 4;
const PRICE = PRICE_PER_HOUR_PER_PARTICIPANT;

describe("Chantier AGEFICE présentiel — branchement bout-à-bout", () => {
  // (i) Contrat propagation : le chemin de production doit produire
  // `ageficePresentielCoverage !== null` dès qu'il y a au moins un
  // indé. Si le refactor futur oublie `trainingHours`, ce test échoue.
  it("(i) applyStartAcademyPricing propage totalDurationHours → ageficePresentielCoverage !== null", () => {
    const pricing = applyStartAcademyPricing(
      HOURS,
      1,
      PRICE,
      [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
          ageficeAmountConsumedCurrentYear: 0,
        },
      ]
    );
    expect(pricing.ageficePresentielCoverage).not.toBeNull();
  });

  it("(i-bis) fallback : sans totalDurationHours propagé, coverage reste null", () => {
    // Preuve directe via estimateTrainingFunding : on n'appelle PAS
    // applyStartAcademyPricing pour isoler le contrat.
    const summary = estimateTrainingFunding({
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
          ageficeAmountConsumedCurrentYear: 0,
        },
      ],
      costPerParticipant: HOURS * PRICE,
      totalBudget: HOURS * PRICE,
      // pas de trainingHours → chemin fallback
    });
    expect(summary.ageficePresentielCoverage).toBeNull();
  });

  // (ii) Invariance OPCO EP salariés : identique avant/après ajout de
  // `trainingHours`. On compare le résultat participant sur toutes les
  // branches salarié (éligible OPCO, non éligible, inconnu, aucun
  // coût). Aucune propriété funding ne doit changer.
  const salarieCases: Array<{
    label: string;
    eligibleOpco: boolean | null;
    costPerParticipant: number | null;
  }> = [
    { label: "OPCO éligible", eligibleOpco: true, costPerParticipant: HOURS * PRICE },
    { label: "OPCO non éligible", eligibleOpco: false, costPerParticipant: HOURS * PRICE },
    { label: "OPCO inconnu", eligibleOpco: null, costPerParticipant: HOURS * PRICE },
    { label: "sans coût", eligibleOpco: true, costPerParticipant: null },
  ];
  for (const c of salarieCases) {
    it(`(ii) salarié ${c.label} — invariance avant/après trainingHours`, () => {
      const before = estimateParticipantFunding({
        professionalStatus: "salarie",
        previousYearProduction: null,
        eligibleOpco: c.eligibleOpco,
        costPerParticipant: c.costPerParticipant,
      });
      const after = estimateParticipantFunding({
        professionalStatus: "salarie",
        previousYearProduction: null,
        eligibleOpco: c.eligibleOpco,
        costPerParticipant: c.costPerParticipant,
        trainingHours: HOURS,
      });
      expect(after.estimatedFundingAmount).toBe(before.estimatedFundingAmount);
      expect(after.estimatedRemainingCost).toBe(
        before.estimatedRemainingCost
      );
      expect(after.eligibility).toBe(before.eligibility);
      expect(after.note).toBe(before.note);
      expect(after.ageficePresentielResult).toBeUndefined();
    });
  }

  // (iii) Bout-à-bout logique sans DOM : applyStartAcademyPricing
  // produit un Pricing → on récupère la coverage → on la compare à ce
  // que rendrait decideAgeficePresentielRender sur le résultat calculé
  // en interne. CA N-1 manquant → alerte, jamais badge.
  it("(iii) indé CA N-1 manquant → coverage='alert', decide='alert', jamais badge", () => {
    const pricing = applyStartAcademyPricing(
      HOURS,
      1,
      PRICE,
      [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: null,
          ageficeAmountConsumedCurrentYear: 0,
        },
      ]
    );
    expect(pricing.ageficePresentielCoverage).toBe("alert");
    expect(pricing.ageficePresentielCoverage).not.toBe("badge");

    // decideAgeficePresentielRender appelée sur ce que le calcul aurait
    // produit pour un indé au CA N-1 manquant : envelope null →
    // 'alert'.
    const forgedResult = computeAgeficePresentielFunding({
      trainingHours: HOURS,
      envelopeRemaining: null,
    });
    expect(
      decideAgeficePresentielRender({
        result: forgedResult,
        previousYearProduction: null,
      })
    ).toBe("alert");
  });

  // (iv) Cas mixte : 1 indé couvert 100 % + 1 indé en alerte → alerte
  // agrégée (alerte prioritaire sur badge).
  it("(iv) 2 indés (1 couvert + 1 en alerte) → coverage='alert'", () => {
    const pricing = applyStartAcademyPricing(
      HOURS,
      2,
      PRICE,
      [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
          ageficeAmountConsumedCurrentYear: 0,
        },
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: null,
          ageficeAmountConsumedCurrentYear: 0,
        },
      ]
    );
    expect(pricing.ageficePresentielCoverage).toBe("alert");
  });

  // Cas de contrôle : 2 indés tous couverts → 'badge'.
  it("2 indés tous couverts → coverage='badge'", () => {
    const pricing = applyStartAcademyPricing(
      HOURS,
      2,
      PRICE,
      [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
          ageficeAmountConsumedCurrentYear: 0,
        },
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 20_000,
          ageficeAmountConsumedCurrentYear: 100,
        },
      ]
    );
    expect(pricing.ageficePresentielCoverage).toBe("badge");
  });

  // Cas de contrôle : aucun indé (que des salariés) → 'none'.
  it("aucun indé (que des salariés) → coverage='none'", () => {
    const pricing = applyStartAcademyPricing(
      HOURS,
      1,
      PRICE,
      [
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
      ]
    );
    expect(pricing.ageficePresentielCoverage).toBe("none");
  });
});
