import { describe, expect, it } from "vitest";

import { buildRecommendationPrompt } from "./build-recommendation-prompt";
import type {
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import { computeRatiosAndAlerts } from "@/lib/diagnostics/ratios-service";

/**
 * Chantier C1 — test builder de prompt avec le ratio de consommation
 * mis en sommeil (cf. `ratios-service.ts` : `consumed24m: null`
 * systématique). Le prompt IA doit :
 *   1. rendre le label « non estimable » tel quel (jamais « environ
 *      null % » ni valeur numérique fantôme),
 *   2. exposer la valeur numérique comme « non calculable » côté
 *      formatRatios (contract avec l'IA : quand un ratio est null,
 *      elle doit le classer en donnée manquante).
 *
 * C'est l'exigence explicite du feu vert C1 : ratio indisponible →
 * « données manquantes » de la reco, JAMAIS produire « environ null %ni ».
 */

function makeClient(): ClientRecord {
  return {
    id: "client-1",
    companyName: "Agence Test",
    director: "Jean Test",
    email: "test@test.fr",
    phone: null,
    collaboratorsCount: 5,
    teamTypology: ["conseiller"],
    createdAt: "2026-07-18T00:00:00.000Z",
  };
}

function makeDiagnostic(): DiagnosticRecord {
  return {
    id: "diag-1",
    clientId: "client-1",
    mode: "guided",
    status: "in_progress",
    declaredGoal: "Structurer la prospection.",
    profilesInScope: ["conseiller"],
    expectedParticipants: 3,
    notes: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
}

describe("Chantier C1 — buildRecommendationPrompt gère le ratio de consommation mis en sommeil", () => {
  it("consumptionRatePercent=null → prompt contient le label « non estimable » et « non calculable », JAMAIS « environ null »", () => {
    // Utilise le vrai `computeRatiosAndAlerts` (C1 le force à null via
    // le service — cf. ratios-service.ts). On teste bout-à-bout la
    // pipeline ratios → prompt, pas juste un mock synthetique.
    const { ratios, alerts } = computeRatiosAndAlerts({
      client: { collaboratorsCount: 5 },
      diagnostic: {
        ventesNMoins1: null,
        caGlobalNMoins1: null,
        nbSalaries: null,
        nbAgentsIndep: null,
        activiteRepartition: null,
      },
      answers: [],
      participants: [
        {
          professionalStatus: "agent_commercial_independant",
          previousYearProduction: 15_000,
          // Même en passant une valeur, le service la stripe.
          formations24mAmount: 999_000,
        },
      ],
      computedAt: "2026-07-18T00:00:00.000Z",
    });

    // Sanity : le ratio ressort bien à null (verrouillé par le test
    // ratios-service.test.ts, on double-check ici).
    expect(ratios.ratios.consumptionRatePercent).toBeNull();

    const built = buildRecommendationPrompt({
      client: makeClient(),
      diagnostic: makeDiagnostic(),
      answers: [],
      catalog: [],
      ratios,
      alerts,
    });

    // Bloc « Ratios calculés » : contient le label « non estimable »
    // (mise en sommeil chantier C1 — cf. ratios-service.ts).
    expect(built.user).toMatch(
      /Taux de consommation non estimable \(mise en sommeil chantier C1/
    );
    // Contient le placeholder « non calculable » (produit par
    // formatRatios quand value === null).
    expect(built.user).toMatch(/non calculable/);

    // Négatif : le prompt NE DOIT JAMAIS produire « environ null % »
    // ni « null% » ni un pourcentage numérique fantôme (protection
    // contre une régression future du formatter).
    expect(built.user).not.toMatch(/environ\s+null/i);
    expect(built.user).not.toMatch(/null\s*%/i);
    expect(built.user).not.toMatch(/undefined\s*%/i);
  });
});
