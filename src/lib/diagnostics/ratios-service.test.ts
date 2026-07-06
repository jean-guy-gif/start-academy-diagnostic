import { describe, expect, it } from "vitest";

import {
  computeRatiosAndAlerts,
  DEFAULT_BENCHMARKS,
  type RatiosComputeInput,
} from "./ratios-service";

/**
 * Tests de `computeRatiosAndAlerts` — moteur pur ratios + alertes v1.0.
 *
 * Objectifs (Décision 1) :
 *   • Les ratios sont calculés correctement sur un dataset canonique.
 *   • Aucune division par zéro ne fuit en NaN — le contrat est
 *     TOUJOURS un `number | null`, jamais un `NaN`.
 *   • L'alerte `missing_required_data` remonte quand une question
 *     `required: true` est skippée (correction 4).
 *   • Les alertes benchmark-under se déclenchent bien sur les ratios
 *     sous le seuil de référence.
 *   • Le taux de consommation garde le préfixe « environ » (correction 6).
 */

function makeInput(
  overrides: Partial<RatiosComputeInput> = {}
): RatiosComputeInput {
  return {
    client: { collaboratorsCount: 5 },
    diagnostic: {
      ventesNMoins1: 40,
      caGlobalNMoins1: 400_000,
      nbSalaries: 3,
      nbAgentsIndep: 2,
      activiteRepartition: { transaction_ancien: 70 },
    },
    answers: [],
    participants: [],
    computedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeRatiosAndAlerts — ratios sur dataset canonique", () => {
  it("caMoyenParVente, caParCollaborateur et ventesParAgent sortent des valeurs cohérentes", () => {
    const { ratios } = computeRatiosAndAlerts(makeInput());
    // 400 000 / 40 = 10 000
    expect(ratios.ratios.caMoyenParVente).toBe(10_000);
    // 400 000 / 5 = 80 000
    expect(ratios.ratios.caParCollaborateur).toBe(80_000);
    // 40 / 2 = 20
    expect(ratios.ratios.ventesParAgent).toBe(20);
  });

  it("labels ratios sont bien exposés et non vides", () => {
    const { ratios } = computeRatiosAndAlerts(makeInput());
    expect(ratios.labels.caMoyenParVente).toContain("CA moyen");
    expect(ratios.labels.contactsToRdvPercent).toContain("Contacts");
    expect(ratios.labels.consumptionRatePercent).toBeTruthy();
  });

  it("computedAt injecté (déterminisme) → même valeur en sortie", () => {
    const { ratios, alerts } = computeRatiosAndAlerts(makeInput());
    expect(ratios.computedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(alerts.computedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("computeRatiosAndAlerts — divisions par zéro → null jamais NaN", () => {
  it("ventes N-1 = 0 → caMoyenParVente null", () => {
    const { ratios } = computeRatiosAndAlerts(
      makeInput({
        diagnostic: {
          ventesNMoins1: 0,
          caGlobalNMoins1: 400_000,
          nbSalaries: null,
          nbAgentsIndep: 2,
          activiteRepartition: null,
        },
      })
    );
    expect(ratios.ratios.caMoyenParVente).toBeNull();
    expect(Number.isNaN(ratios.ratios.caMoyenParVente as number)).toBe(false);
  });

  it("collaborateurs = 0 → caParCollaborateur null", () => {
    const { ratios } = computeRatiosAndAlerts(
      makeInput({
        client: { collaboratorsCount: 0 },
      })
    );
    expect(ratios.ratios.caParCollaborateur).toBeNull();
  });

  it("aucune donnée → tous les ratios null, moteur ne crash pas", () => {
    const { ratios, alerts } = computeRatiosAndAlerts(
      makeInput({
        client: { collaboratorsCount: null },
        diagnostic: {
          ventesNMoins1: null,
          caGlobalNMoins1: null,
          nbSalaries: null,
          nbAgentsIndep: null,
          activiteRepartition: null,
        },
      })
    );
    for (const key of Object.keys(ratios.ratios)) {
      expect(ratios.ratios[key]).toBeNull();
    }
    // Aucun crash — la sortie doit exister avec des tableaux vides ou
    // avec les seules alertes required-data (dépend du contenu answers).
    expect(Array.isArray(alerts.alerts)).toBe(true);
  });
});

describe("computeRatiosAndAlerts — ratios chaîne commerciale", () => {
  it("contactsToRdvPercent, rdvToMandat, offresToCompromis, compromisToActe corrects", () => {
    const { ratios } = computeRatiosAndAlerts(
      makeInput({
        answers: [
          { questionId: "prospecting-contacts-per-month", answer: "100", isSkipped: false },
          { questionId: "seller-meetings-per-month", answer: "25", isSkipped: false },
          { questionId: "mandates-per-month", answer: "10", isSkipped: false },
          { questionId: "mandates-exclusivity-percent", answer: "40", isSkipped: false },
          { questionId: "visits-per-month", answer: "45", isSkipped: false },
          { questionId: "offers-per-month", answer: "10", isSkipped: false },
          { questionId: "compromis-per-month", answer: "8", isSkipped: false },
          { questionId: "actes-per-month", answer: "5", isSkipped: false },
        ],
      })
    );
    // 25 / 100 = 25 %
    expect(ratios.ratios.contactsToRdvPercent).toBe(25);
    // 10 / 25 = 40 %
    expect(ratios.ratios.rdvToMandatPercent).toBe(40);
    // exclu direct
    expect(ratios.ratios.exclusivityPercent).toBe(40);
    // 45 / 5 = 9
    expect(ratios.ratios.visitesParVente).toBe(9);
    // 8 / 10 = 80 %
    expect(ratios.ratios.offresToCompromisPercent).toBe(80);
    // 5 / 8 = 62.5 %
    expect(ratios.ratios.compromisToActePercent).toBe(62.5);
  });
});

describe("computeRatiosAndAlerts — alertes benchmark", () => {
  it("contacts→RDV sous benchmark déclenche l'alerte code contacts_to_rdv_below_benchmark", () => {
    const { alerts } = computeRatiosAndAlerts(
      makeInput({
        answers: [
          { questionId: "prospecting-contacts-per-month", answer: "100", isSkipped: false },
          { questionId: "seller-meetings-per-month", answer: "5", isSkipped: false },
        ],
      })
    );
    const codes = alerts.alerts.map((a) => a.code);
    expect(codes).toContain("contacts_to_rdv_below_benchmark");
    const alert = alerts.alerts.find(
      (a) => a.code === "contacts_to_rdv_below_benchmark"
    );
    expect(alert?.severity).toBe("warning");
    expect(alert?.chapter).toBe(3);
    expect(alert?.threshold).toBe(DEFAULT_BENCHMARKS.contactsToRdvPercent);
  });

  it("exclusivité < 30 % → alerte exclusivity_below_benchmark", () => {
    const { alerts } = computeRatiosAndAlerts(
      makeInput({
        answers: [
          { questionId: "mandates-exclusivity-percent", answer: "15", isSkipped: false },
        ],
      })
    );
    expect(alerts.alerts.map((a) => a.code)).toContain(
      "exclusivity_below_benchmark"
    );
  });

  it("personne ne prospecte → alerte error no_one_prospects", () => {
    const { alerts } = computeRatiosAndAlerts(
      makeInput({
        answers: [
          { questionId: "prospecting-who", answer: "personne", isSkipped: false },
        ],
      })
    );
    const alert = alerts.alerts.find((a) => a.code === "no_one_prospects");
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("error");
  });

  it("transaction_ancien < 50 % → alerte transaction_ancien_lt_50", () => {
    const { alerts } = computeRatiosAndAlerts(
      makeInput({
        diagnostic: {
          ventesNMoins1: 40,
          caGlobalNMoins1: 400_000,
          nbSalaries: 3,
          nbAgentsIndep: 2,
          activiteRepartition: { transaction_ancien: 30 },
        },
      })
    );
    expect(alerts.alerts.map((a) => a.code)).toContain("transaction_ancien_lt_50");
  });
});

describe("computeRatiosAndAlerts — correction (4) missing_required_data", () => {
  it("question required skippée → alerte missing_required_data:<id> warning", () => {
    // `prospecting-methods` est required: true (chapitre 3).
    const { alerts } = computeRatiosAndAlerts(
      makeInput({
        answers: [
          {
            questionId: "prospecting-methods",
            answer: null,
            isSkipped: true,
          },
        ],
      })
    );
    const alert = alerts.alerts.find(
      (a) => a.code === "missing_required_data:prospecting-methods"
    );
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("warning");
    expect(alert?.chapter).toBe(3);
    expect(alert?.context).toMatchObject({
      questionId: "prospecting-methods",
      isSkipped: true,
    });
  });

  it("question required avec réponse vide → alerte remonte aussi", () => {
    const { alerts } = computeRatiosAndAlerts(
      makeInput({
        answers: [
          {
            questionId: "prospecting-methods",
            answer: "   ",
            isSkipped: false,
          },
        ],
      })
    );
    expect(
      alerts.alerts.some(
        (a) => a.code === "missing_required_data:prospecting-methods"
      )
    ).toBe(true);
  });

  it("question required jamais présentée (pas dans answers) → PAS d'alerte", () => {
    // Règle explicite du moteur : on n'alerte que si trace présente.
    const { alerts } = computeRatiosAndAlerts(makeInput({ answers: [] }));
    expect(
      alerts.alerts.some((a) =>
        a.code.startsWith("missing_required_data:prospecting-methods")
      )
    ).toBe(false);
  });
});

describe("computeRatiosAndAlerts — taux consommation « environ »", () => {
  it("label conserve le préfixe « Environ » quand percent > 0", () => {
    const { ratios } = computeRatiosAndAlerts(
      makeInput({
        participants: [
          {
            professionalStatus: "agent_commercial_independant",
            previousYearProduction: 15_000,
            formations24mAmount: 500,
          },
        ],
      })
    );
    expect(ratios.labels.consumptionRatePercent).toMatch(/^Environ /);
  });
});
