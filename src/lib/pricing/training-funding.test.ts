import { describe, expect, it } from "vitest";

import {
  CONSUMPTION_LEVER_PERCENT_DEFAULT,
  FUNDING_DISCLAIMER,
  FUNDING_REVENUE_THRESHOLD,
  MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT,
  OPCO_EP_ANNUAL_CAP_DEFAULT,
  computeConsumptionRate,
  estimateOpcoBudget,
  estimateParticipantFunding,
  estimateTrainingFunding,
} from "./training-funding";

/**
 * Contrat testé — cf. brief v1.0b Décision 1 :
 *
 * 1. Rétro-compat totale des 6 appelants historiques : ne pas passer
 *    `config` doit donner exactement le comportement MVP (seuils
 *    constants FUNDING_REVENUE_THRESHOLD / MAX_ESTIMATED_FUNDING_...).
 * 2. Seuil AGEFICE 7 000 € et plafond 3 000 € — les bornes de la règle
 *    métier qui touchent la proposition commerciale.
 * 3. estimateOpcoBudget — un salarié éligible = 2 500 € annuels.
 * 4. computeConsumptionRate — préfixe « environ » (correction 6) et
 *    absence de crash quand budget mobilisable = 0.
 * 5. Participant sans CA N-1 renseigné → NON éligible + pas de crash.
 */

describe("estimateParticipantFunding — rétro-compat MVP (pas de config)", () => {
  it("indé avec CA N-1 > 7 000 € et cost = 4 200 € → cap à 3 000 €", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 12_000,
      costPerParticipant: 4_200,
    });
    expect(est.eligibility).toBe("potentially_eligible");
    // Cap MVP = MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT (3 000 €)
    expect(est.estimatedFundingAmount).toBe(
      MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT
    );
    expect(est.estimatedRemainingCost).toBe(1_200);
    expect(est.note).toBe(FUNDING_DISCLAIMER);
  });

  it("indé avec CA N-1 > 7 000 € et cost = 2 000 € → cap au coût réel", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 15_000,
      costPerParticipant: 2_000,
    });
    expect(est.eligibility).toBe("potentially_eligible");
    expect(est.estimatedFundingAmount).toBe(2_000);
    expect(est.estimatedRemainingCost).toBe(0);
  });

  it("indé avec CA N-1 = 7 000 € (seuil strict) → NON éligible", () => {
    // Le code fait `previousYearProduction > ageficeThreshold`
    // Donc l'égalité stricte au seuil ne passe pas.
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: FUNDING_REVENUE_THRESHOLD,
      costPerParticipant: 4_200,
    });
    expect(est.eligibility).toBe("unknown");
    expect(est.estimatedFundingAmount).toBe(0);
    expect(est.estimatedRemainingCost).toBe(4_200);
  });

  it("indé sans CA N-1 renseigné → NON éligible, sans crash, note explicative", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: null,
      costPerParticipant: 4_200,
    });
    expect(est.eligibility).toBe("unknown");
    expect(est.estimatedFundingAmount).toBe(0);
    expect(est.estimatedRemainingCost).toBe(4_200);
    expect(est.note).toMatch(/à compléter/i);
  });

  it("salarié éligible OPCO → cap à 2 500 € annuels (défaut MVP)", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "salarie",
      previousYearProduction: null,
      costPerParticipant: 4_200,
      eligibleOpco: true,
    });
    expect(est.eligibility).toBe("potentially_eligible");
    expect(est.estimatedFundingAmount).toBe(OPCO_EP_ANNUAL_CAP_DEFAULT);
    expect(est.estimatedRemainingCost).toBe(4_200 - OPCO_EP_ANNUAL_CAP_DEFAULT);
  });

  it("salarié non éligible OPCO → non éligible, coût total à charge", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "salarie",
      previousYearProduction: null,
      costPerParticipant: 4_200,
      eligibleOpco: false,
    });
    expect(est.eligibility).toBe("unknown");
    expect(est.estimatedFundingAmount).toBe(0);
    expect(est.estimatedRemainingCost).toBe(4_200);
  });

  it("statut null ou coût null → réponse safe (aucun crash)", () => {
    const nullStatus = estimateParticipantFunding({
      professionalStatus: null,
      previousYearProduction: 12_000,
      costPerParticipant: 4_200,
    });
    expect(nullStatus.eligibility).toBe("unknown");
    expect(nullStatus.estimatedFundingAmount).toBe(0);

    const nullCost = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 12_000,
      costPerParticipant: null,
    });
    expect(nullCost.eligibility).toBe("unknown");
    expect(nullCost.estimatedFundingAmount).toBe(0);
    expect(nullCost.estimatedRemainingCost).toBe(0);
  });
});

describe("estimateParticipantFunding — override via config runtime", () => {
  it("un seuil AGEFICE porté à 10 000 € rejette un indé à 8 000 €", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 8_000,
      costPerParticipant: 4_200,
      config: { ageficeThreshold: 10_000 },
    });
    expect(est.eligibility).toBe("unknown");
  });

  it("un plafond AGEFICE porté à 5 000 € rehausse le montant estimé", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 20_000,
      costPerParticipant: 4_200,
      config: { ageficeAnnualCap: 5_000 },
    });
    expect(est.estimatedFundingAmount).toBe(4_200); // capé au coût réel
    expect(est.estimatedRemainingCost).toBe(0);
  });
});

describe("estimateTrainingFunding — agrégation multi-participants", () => {
  it("cumule les estimations et compte les éligibles sans passer config", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: 20_000,
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
        },
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 5_000, // sous le seuil
        },
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
      ],
    });
    // 1 indé éligible (3 000) + 1 salarié OPCO (2 500) = 5 500 €
    expect(summary.eligibleParticipantCount).toBe(2);
    expect(summary.estimatedFundingTotal).toBe(
      MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT + OPCO_EP_ANNUAL_CAP_DEFAULT
    );
    expect(summary.estimatedRemainingCost).toBe(20_000 - 5_500);
    expect(summary.totalParticipantCount).toBe(3);
    expect(summary.disclaimer).toBe(FUNDING_DISCLAIMER);
  });
});

describe("estimateOpcoBudget", () => {
  it("2 salariés éligibles × 2 500 € = 5 000 € (défaut MVP)", () => {
    const b = estimateOpcoBudget(2);
    expect(b.eligibleSalariesCount).toBe(2);
    expect(b.annualCapPerSalarie).toBe(OPCO_EP_ANNUAL_CAP_DEFAULT);
    expect(b.estimatedAnnualBudget).toBe(5_000);
    expect(b.disclaimer).toBe(FUNDING_DISCLAIMER);
  });

  it("compte négatif → clampé à 0, pas de crash", () => {
    const b = estimateOpcoBudget(-3);
    expect(b.eligibleSalariesCount).toBe(0);
    expect(b.estimatedAnnualBudget).toBe(0);
  });

  it("override plafond via config runtime", () => {
    const b = estimateOpcoBudget(3, { opcoEpAnnualCap: 3_000 });
    expect(b.annualCapPerSalarie).toBe(3_000);
    expect(b.estimatedAnnualBudget).toBe(9_000);
  });
});

describe("computeConsumptionRate — correction (6) « environ »", () => {
  it("libellé préfixé « Environ » quand un pourcentage est calculable", () => {
    const est = computeConsumptionRate({
      consumed24m: [1_000, 2_000], // 3 000 € consommés
      ageficeEligibleCount: 1, // 3 000 × 2 = 6 000 mobilisables
      opcoEligibleCount: 0,
    });
    // 3 000 / 6 000 = 50 % — sous 0.1 % près
    expect(est.percent).not.toBeNull();
    expect(est.percent).toBeGreaterThan(49.9);
    expect(est.percent).toBeLessThan(50.1);
    expect(est.label).toMatch(/^Environ /);
    expect(est.label).toContain("estimation");
    expect(est.belowLeverThreshold).toBe(false);
  });

  it("budget mobilisable = 0 → percent null, label neutre (pas de NaN)", () => {
    const est = computeConsumptionRate({
      consumed24m: [500],
      ageficeEligibleCount: 0,
      opcoEligibleCount: 0,
    });
    expect(est.mobilizableAmount).toBe(0);
    expect(est.percent).toBeNull();
    expect(est.belowLeverThreshold).toBe(false);
    expect(est.label).not.toMatch(/NaN/);
    expect(est.label).toMatch(/non estimable/);
  });

  it("sous le seuil de levier commercial → belowLeverThreshold=true", () => {
    // 3 000 € mobilisables (1 AGEFICE), 300 € consommés → 10 %
    const est = computeConsumptionRate({
      consumed24m: [300],
      ageficeEligibleCount: 1,
      opcoEligibleCount: 0,
    });
    expect(est.percent).not.toBeNull();
    expect(est.percent).toBeLessThan(CONSUMPTION_LEVER_PERCENT_DEFAULT);
    expect(est.belowLeverThreshold).toBe(true);
  });

  it("consumed24m contient des null → ignorés du numérateur, jamais NaN", () => {
    const est = computeConsumptionRate({
      consumed24m: [null, 500, null, 500],
      ageficeEligibleCount: 1,
      opcoEligibleCount: 0,
    });
    expect(est.observedAmount).toBe(1_000);
    expect(Number.isFinite(est.percent as number)).toBe(true);
  });
});
