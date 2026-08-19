import { describe, expect, it } from "vitest";

import {
  computeRatiosAndAlerts,
  humanizeChoiceValue,
} from "./ratios-service";

/**
 * Contract test structural — audit imprimé (correction 2).
 *
 * Aucune alerte générée par `computeRatiosAndAlerts` ne doit contenir
 * un token technique brut (underscore) dans son `label`. Les valeurs
 * de `choice` / `multichoice` doivent passer par `optionLabels` (via
 * `humanizeChoiceValue`) avant interpolation.
 *
 * Ce test itère sur un jeu de scénarios qui déclenchent chaque
 * alerte, et vérifie l'invariant sur chaque label produit. Toute
 * ré-introduction d'un `answer.replace("_", " ")` ou d'une
 * interpolation directe casse la CI.
 */

const SCENARIOS: Array<{
  name: string;
  answers: Array<{
    questionId: string;
    answer: string | null;
    isSkipped: boolean;
  }>;
}> = [
  {
    name: "commercial-followup-frequency = a_la_demande (piège underscore historique)",
    answers: [
      { questionId: "commercial-followup-frequency", answer: "a_la_demande", isSkipped: false },
    ],
  },
  {
    name: "commercial-followup-frequency = jamais",
    answers: [
      { questionId: "commercial-followup-frequency", answer: "jamais", isSkipped: false },
    ],
  },
  {
    name: "prospecting-who = personne (déclenche no_one_prospects)",
    answers: [
      { questionId: "prospecting-who", answer: "personne", isSkipped: false },
    ],
  },
  {
    name: "mgmt-indicators-followed = aucun",
    answers: [
      { questionId: "mgmt-indicators-followed", answer: "aucun", isSkipped: false },
    ],
  },
];

describe("ratios-service — aucune alerte ne contient un underscore dans son label", () => {
  it.each(SCENARIOS)("scénario : $name", ({ answers }) => {
    const result = computeRatiosAndAlerts({
      client: { collaboratorsCount: 5 },
      diagnostic: {
        ventesNMoins1: 50,
        caGlobalNMoins1: 500_000,
        nbSalaries: 3,
        nbAgentsIndep: 2,
        activiteRepartition: { transaction_ancien: 80 },
      },
      answers,
      participants: [],
    });
    const violations = result.alerts.alerts.filter((a) =>
      a.label.includes("_")
    );
    expect(
      violations.map((v) => ({ code: v.code, label: v.label })),
      "Une alerte contient encore un underscore — utilisez humanizeChoiceValue()."
    ).toEqual([]);
  });
});

describe("humanizeChoiceValue — fallback safe même si optionLabels manque", () => {
  it("valeur mappée via optionLabels → libellé humain", () => {
    // commercial-followup-frequency a des optionLabels dans le
    // questionnaire (PR labels validés). Ex : a_la_demande → « À la demande ».
    expect(humanizeChoiceValue("commercial-followup-frequency", "a_la_demande")).toBe(
      "À la demande"
    );
  });

  it("questionId inconnu → fallback replace/capitalize (jamais d'underscore)", () => {
    const out = humanizeChoiceValue("question-inexistante", "valeur_technique");
    expect(out).not.toMatch(/_/);
    expect(out.charAt(0)).toBe(out.charAt(0).toUpperCase());
  });

  it("valeur mappée absente d'optionLabels → fallback humanisation (pas d'underscore)", () => {
    const out = humanizeChoiceValue(
      "commercial-followup-frequency",
      "valeur_pas_mappee"
    );
    expect(out).not.toMatch(/_/);
  });
});
