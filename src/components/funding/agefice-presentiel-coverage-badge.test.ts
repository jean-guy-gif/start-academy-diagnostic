import { describe, expect, it } from "vitest";

import { computeAgeficePresentielFunding } from "@/lib/pricing/agefice-presentiel-funding";
import { decideAgeficePresentielRender } from "./agefice-presentiel-coverage-badge";

describe("decideAgeficePresentielRender — badge / alerte / rien", () => {
  it("(a) 4h + enveloppe pleine + N-1 renseigné → badge", () => {
    const result = computeAgeficePresentielFunding({
      trainingHours: 4,
      envelopeRemaining: 3_000,
    });
    expect(
      decideAgeficePresentielRender({
        result,
        previousYearProduction: 15_000,
      })
    ).toBe("badge");
  });

  it("(b) enveloppe 264 → rien (pas de badge, pas d'alerte : cas rest > 0 avec enveloppe connue)", () => {
    const result = computeAgeficePresentielFunding({
      trainingHours: 4,
      envelopeRemaining: 264,
    });
    expect(
      decideAgeficePresentielRender({
        result,
        previousYearProduction: 15_000,
      })
    ).toBe("none");
  });

  it("(c) enveloppe inconnue → alerte", () => {
    const result = computeAgeficePresentielFunding({
      trainingHours: 4,
      envelopeRemaining: null,
    });
    expect(
      decideAgeficePresentielRender({
        result,
        previousYearProduction: 15_000,
      })
    ).toBe("alert");
  });

  it("CA N-1 manquant → alerte même quand enveloppe est renseignée", () => {
    const result = computeAgeficePresentielFunding({
      trainingHours: 4,
      envelopeRemaining: 3_000,
    });
    expect(
      decideAgeficePresentielRender({
        result,
        previousYearProduction: null,
      })
    ).toBe("alert");
  });

  it("(d) garde-fou : jamais de badge quand envelope < facture (balayage)", () => {
    const trainingHours = 4;
    for (const envelope of [0, 1, 50, 264, 335]) {
      const result = computeAgeficePresentielFunding({
        trainingHours,
        envelopeRemaining: envelope,
      });
      expect(
        decideAgeficePresentielRender({
          result,
          previousYearProduction: 15_000,
        })
      ).not.toBe("badge");
    }
  });
});
