import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Test unitaire du refinement Zod du chantier C1 : un salarié ne peut
 * pas avoir de `previousYearProduction` (CA N-1 = champ indé seul).
 *
 * On ré-instancie ici le schema du participant en copiant *exactement*
 * la portion pertinente de `src/app/api/diagnostics/[id]/participants/
 * route.ts` — on ne peut pas importer directement le schéma parce que
 * la route n'expose que ses handlers HTTP. Toute divergence entre les
 * deux schémas serait bloquée par un test contract séparé.
 *
 * Chantier C1 — filet 3-couches contre le N-1 salarié :
 *   1. UI : purge state au changement de statut vers salarié
 *   2. API Zod : refinement (test ici)
 *   3. SQL : CHECK constraint `diagnostic_participants_no_n1_for_
 *      salarie` (migration 20260719120000)
 */

const ParticipantSchema = z
  .object({
    firstName: z.string().max(80).nullable().optional(),
    professionalStatus: z
      .enum(["salarie", "agent_commercial_independant", "autre"])
      .nullable()
      .optional(),
    previousYearProduction: z.number().nonnegative().nullable().optional(),
  })
  .refine(
    (p) =>
      p.professionalStatus !== "salarie" ||
      p.previousYearProduction === null ||
      p.previousYearProduction === undefined,
    {
      message:
        "Un salarié ne peut pas avoir de production N-1 (champ réservé aux agents commerciaux indépendants).",
      path: ["previousYearProduction"],
    }
  );

describe("Chantier C1 — Zod refinement : N-1 interdit pour un salarié", () => {
  it("salarié + previousYearProduction=15000 → parse échoue avec le message dédié", () => {
    const result = ParticipantSchema.safeParse({
      firstName: "Alice",
      professionalStatus: "salarie",
      previousYearProduction: 15_000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const [issue] = result.error.issues;
      expect(issue.path).toEqual(["previousYearProduction"]);
      expect(issue.message).toMatch(/salarié/i);
      expect(issue.message).toMatch(/production N-1/i);
    }
  });

  it("salarié + previousYearProduction=null → parse OK (purge côté UI produit ce cas)", () => {
    const result = ParticipantSchema.safeParse({
      professionalStatus: "salarie",
      previousYearProduction: null,
    });
    expect(result.success).toBe(true);
  });

  it("salarié SANS champ previousYearProduction → parse OK", () => {
    const result = ParticipantSchema.safeParse({
      professionalStatus: "salarie",
    });
    expect(result.success).toBe(true);
  });

  it("indé + previousYearProduction=15000 → parse OK", () => {
    const result = ParticipantSchema.safeParse({
      professionalStatus: "agent_commercial_independant",
      previousYearProduction: 15_000,
    });
    expect(result.success).toBe(true);
  });

  it("statut null + previousYearProduction=15000 → parse OK (chemin bascule statut)", () => {
    const result = ParticipantSchema.safeParse({
      professionalStatus: null,
      previousYearProduction: 15_000,
    });
    expect(result.success).toBe(true);
  });
});
