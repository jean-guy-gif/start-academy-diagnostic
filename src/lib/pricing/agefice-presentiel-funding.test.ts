import { describe, expect, it } from "vitest";

import {
  AGEFICE_HOURLY_CAP_PRESENTIEL_2026,
  FOLLOWUP_HOURS_MULTIPLIER,
  PRICE_PER_HOUR_PER_PARTICIPANT,
  computeAgeficePresentielFunding,
} from "./agefice-presentiel-funding";

describe("computeAgeficePresentielFunding", () => {
  // (a) 4h formation, enveloppe pleine → facturé 336, pris en charge 336,
  // reste à charge 0, badge affiché (isFullyCovered=true).
  it("(a) 4h + enveloppe 3000 → facture=336, prise=336, reste=0, isFullyCovered=true", () => {
    const r = computeAgeficePresentielFunding({
      trainingHours: 4,
      envelopeRemaining: 3_000,
    });
    expect(r.facture).toBe(336);
    expect(r.priseEnCharge).toBe(336);
    expect(r.resteACharge).toBe(0);
    expect(r.isFullyCovered).toBe(true);
    expect(r.alert).toBeNull();
  });

  // (b) enveloppe restante 264 → pris en charge 264, reste à charge 72,
  // pas de badge.
  it("(b) 4h + enveloppe 264 → prise=264, reste=72, isFullyCovered=false", () => {
    const r = computeAgeficePresentielFunding({
      trainingHours: 4,
      envelopeRemaining: 264,
    });
    expect(r.facture).toBe(336);
    expect(r.priseEnCharge).toBe(264);
    expect(r.resteACharge).toBe(72);
    expect(r.isFullyCovered).toBe(false);
    expect(r.alert).toBeNull();
  });

  // (c) enveloppe inconnue → alerte, pas de badge.
  it("(c) enveloppe null → alerte « droits à vérifier », isFullyCovered=false", () => {
    const r = computeAgeficePresentielFunding({
      trainingHours: 4,
      envelopeRemaining: null,
    });
    expect(r.alert).toBe("droits à vérifier");
    expect(r.isFullyCovered).toBe(false);
    expect(r.priseEnCharge).toBe(0);
    expect(r.resteACharge).toBe(336);
    expect(r.envelopeRemaining).toBeNull();
  });

  // (d) test qui échoue si le badge peut s'afficher avec
  // enveloppe_restante < facture. Balayage large.
  it("(d) isFullyCovered=false pour toute enveloppe strictement < facture", () => {
    const trainingHours = 4;
    const facture = trainingHours * PRICE_PER_HOUR_PER_PARTICIPANT;
    for (const envelope of [
      0,
      1,
      50,
      facture - 1,
      Math.floor(facture / 2),
    ]) {
      const r = computeAgeficePresentielFunding({
        trainingHours,
        envelopeRemaining: envelope,
      });
      expect(r.isFullyCovered).toBe(false);
      expect(r.resteACharge).toBeGreaterThan(0);
    }
  });

  // (e) garde-fou silencieux de cohérence des deux constantes :
  // PRICE_PER_HOUR_PER_PARTICIPANT * heures_formation
  //   === AGEFICE_HOURLY_CAP_PRESENTIEL_2026 * heures_dossier
  // Toute divergence future entre les deux constantes fait sauter ce
  // test (balayage 1h..40h).
  it("(e) invariant PRICE × heures_formation === CAP × heures_dossier", () => {
    for (let heuresFormation = 1; heuresFormation <= 40; heuresFormation += 1) {
      const heuresDossier =
        heuresFormation * (1 + FOLLOWUP_HOURS_MULTIPLIER);
      expect(PRICE_PER_HOUR_PER_PARTICIPANT * heuresFormation).toBe(
        AGEFICE_HOURLY_CAP_PRESENTIEL_2026 * heuresDossier
      );
    }
  });
});
