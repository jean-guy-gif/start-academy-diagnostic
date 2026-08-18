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

  it("salarié éligible OPCO → funding neutralisé (correctif 3 : jamais « 0 € reste » sur la base du cap par-salarié)", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "salarie",
      previousYearProduction: null,
      costPerParticipant: 4_200,
      eligibleOpco: true,
    });
    expect(est.eligibility).toBe("potentially_eligible");
    expect(est.estimatedFundingAmount).toBe(0);
    expect(est.estimatedRemainingCost).toBe(4_200);
    expect(est.note).toMatch(/à confirmer avec l'OPCO/i);
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
  it("cumule les estimations : indé éligible compte, salarié OPCO neutralisé (correctif 3)", () => {
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
    // 1 indé éligible (3 000) + 1 salarié OPCO (0, neutralisé) = 3 000 €
    expect(summary.eligibleParticipantCount).toBe(2);
    expect(summary.estimatedFundingTotal).toBe(
      MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT
    );
    expect(summary.estimatedRemainingCost).toBe(
      20_000 - MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT
    );
    expect(summary.totalParticipantCount).toBe(3);
    expect(summary.disclaimer).toBe(FUNDING_DISCLAIMER);
  });

  // T-6 (2026-07-08) : le mapping `eligibleOpco` était perdu côté route,
  // la branche salarié OPCO ne se déclenchait jamais. Le lot fiabilité
  // (correctif 3) neutralise en plus le CHIFFRAGE de cette branche tant
  // que l'enveloppe entreprise (chantier B) n'a pas remplacé le cap
  // par-personne. Ce test verrouille désormais : (a) la propagation de
  // `eligibleOpco` marque bien les salariés comme éligibles (compte
  // participant), (b) le total ne compte QUE les indés — les salariés
  // OPCO contribuent 0 tant que le chantier B n'a pas livré le vrai
  // calcul.
  it("mix 2 indés éligibles + 2 salariés eligibleOpco:true → funding = indés uniquement (salariés OPCO neutralisés — correctif 3)", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
        },
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 12_000,
        },
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
      ],
    });
    // 2 × 3 000 € (indés AGEFICE) + 2 × 0 € (salariés OPCO neutralisés) = 6 000 €
    expect(summary.eligibleParticipantCount).toBe(4);
    expect(summary.estimatedFundingTotal).toBe(
      2 * MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT
    );
  });
});

// -------------------------------------------------------------------------
// perParticipantNotes — collecte + dedup (micro-PR OPCO note visible)
// -------------------------------------------------------------------------

describe("perParticipantNotes — collecte + dedup", () => {
  it("aucun salarié éligible OPCO → aucune note remontée", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
        },
      ],
    });
    expect(summary.perParticipantNotes).toEqual([]);
  });

  it("1 salarié éligible OPCO → note « à confirmer avec l'OPCO » remontée", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: [
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
      ],
    });
    expect(summary.perParticipantNotes).toHaveLength(1);
    expect(summary.perParticipantNotes[0]).toMatch(/à confirmer avec l'OPCO/i);
  });

  // Dedup ASSUMÉE : une note = un cas métier, pas une par personne.
  // 3 salariés dans le même cas → une seule ligne.
  it("3 salariés éligibles OPCO → 1 seule note (dedup assumée : un cas = une ligne)", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: Array.from({ length: 3 }, () => ({
        professionalStatus: "salarie" as const,
        previousYearProduction: null,
        eligibleOpco: true,
      })),
    });
    expect(summary.perParticipantNotes).toHaveLength(1);
    expect(summary.perParticipantNotes[0]).toMatch(/à confirmer avec l'OPCO/i);
  });

  it("mix indé + salarié OPCO → 1 note (indé n'en produit aucune spécifique)", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
        },
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
      ],
    });
    expect(summary.perParticipantNotes).toHaveLength(1);
    expect(summary.perParticipantNotes[0]).toMatch(/à confirmer avec l'OPCO/i);
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

// ---------------------------------------------------------------------------
// Chantier A funding-opco-ep — consommation déjà entamée cette année civile
// ---------------------------------------------------------------------------

describe("Chantier A — retranchement AGEFICE avant plafonnement", () => {
  it("indé éligible : plafond 3 000 € − 1 500 € consommé → funding = 1 500 €", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 15_000,
      costPerParticipant: 4_200,
      ageficeAmountConsumedCurrentYear: 1_500,
    });
    expect(est.eligibility).toBe("potentially_eligible");
    // min(costPerParticipant, cap − consommé) = min(4200, 3000 − 1500) = 1500
    expect(est.estimatedFundingAmount).toBe(1_500);
    expect(est.estimatedRemainingCost).toBe(4_200 - 1_500);
  });

  it("indé éligible : consommé ≥ plafond → funding = 0 (jamais négatif)", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 15_000,
      costPerParticipant: 4_200,
      ageficeAmountConsumedCurrentYear:
        MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT + 500,
    });
    expect(est.estimatedFundingAmount).toBe(0);
    expect(est.estimatedRemainingCost).toBe(4_200);
  });
});

describe("Chantier C1 — CA N-1 salarié ignoré côté AGEFICE", () => {
  // Verrouille le contrat unifié : le CA N-1 est un champ INDÉ. La
  // migration 20260719120000 pose un CHECK constraint qui bloque le
  // N-1 salarié en base ; côté Zod, un refinement rejette le payload.
  // Ici on vérifie le module pur `training-funding` — même si un
  // caller MALICIEUX passe un N-1 pour un salarié, la branche salarié
  // ne LIT PAS ce champ (elle vit sur `eligibleOpco`). L'AGEFICE reste
  // à 0 €, aucun contournement possible.
  it("salarié avec previousYearProduction=40000 → 0 € AGEFICE, jamais éligible via ce champ", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "salarie",
      previousYearProduction: 40_000, // valeur ABERRANTE pour un salarié
      eligibleOpco: null, // pas éligible OPCO EP
      costPerParticipant: 4_200,
    });
    // Aucun financement : ni AGEFICE (branche salarié), ni OPCO EP
    // (non éligible). Reste à charge = coût entier.
    expect(est.estimatedFundingAmount).toBe(0);
    expect(est.eligibility).toBe("unknown");
    expect(est.estimatedRemainingCost).toBe(4_200);
  });

  it("salarié avec previousYearProduction=40000 ET eligibleOpco=true → funding neutralisé (correctif 3), reste = coût plein", () => {
    const est = estimateParticipantFunding({
      professionalStatus: "salarie",
      previousYearProduction: 40_000,
      eligibleOpco: true,
      costPerParticipant: 4_200,
    });
    // La branche salarié OPCO EP est marquée POTENTIALLY_ELIGIBLE
    // mais le CHIFFRAGE est neutralisé (correctif 3) : jamais de
    // « 0 € reste » posé sur la base du cap par-personne. Reste =
    // coût plein, note "à confirmer avec l'OPCO".
    expect(est.eligibility).toBe("potentially_eligible");
    expect(est.estimatedFundingAmount).toBe(0);
    expect(est.estimatedRemainingCost).toBe(4_200);
    expect(est.note).toMatch(/à confirmer avec l'OPCO/i);
  });
});

// Chantier A — PAS de retranchement OPCO EP par-participant.
// Le champ opcoEpAmountConsumedCurrentYear est collecté mais PAS
// utilisé dans le calcul en A (retranchement N fois par N salariés
// aurait produit un chiffre différent et faux). Refonte enveloppe
// entreprise partagée au chantier B (cf. commentaire training-funding.ts
// branche salarié). Le test `estimateOpcoBudget: 2 × 2500 = 5000` plus
// bas verrouille le comportement HEAD conservé.

describe("Chantier A — warnings quand consommation NULL", () => {
  it("indé sans ageficeAmountConsumedCurrentYear → warning consolidé", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: 20_000,
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
          // ageficeAmountConsumedCurrentYear non renseigné → NULL
        },
      ],
    });
    expect(summary.fundingWarnings).toEqual([
      expect.stringMatching(/Consommation AGEFICE non renseignée/),
    ]);
    // Alert-when-NULL : jamais de calcul silencieux sur 0. L'estimation
    // reste au maximum théorique (plafond entier), warning en tête.
    expect(summary.estimatedFundingTotal).toBe(
      MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT
    );
  });

  it("salarié OPCO touché + opcoEpAmountConsumedCurrentYear NULL → warning", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: [
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
      ],
      // opcoEpAmountConsumedCurrentYear volontairement non passé
    });
    expect(summary.fundingWarnings).toEqual([
      expect.stringMatching(/Consommation OPCO EP de l'entreprise non renseignée/),
    ]);
  });

  it("indé avec ageficeAmountConsumedCurrentYear renseigné → PAS de warning AGEFICE", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
          ageficeAmountConsumedCurrentYear: 0,
        },
      ],
    });
    expect(
      summary.fundingWarnings.filter((w) => w.includes("AGEFICE"))
    ).toHaveLength(0);
  });

  it("salarié OPCO touché + opcoEpAmountConsumedCurrentYear renseigné → PAS de warning OPCO EP", () => {
    const summary = estimateTrainingFunding({
      costPerParticipant: 4_200,
      totalBudget: null,
      participants: [
        {
          professionalStatus: "salarie",
          previousYearProduction: null,
          eligibleOpco: true,
        },
      ],
      opcoEpAmountConsumedCurrentYear: 500,
    });
    expect(
      summary.fundingWarnings.filter((w) => w.includes("OPCO EP"))
    ).toHaveLength(0);
  });
});
