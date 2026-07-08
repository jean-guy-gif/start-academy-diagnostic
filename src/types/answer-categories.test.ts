import { describe, expect, it } from "vitest";

import { ANSWER_CATEGORIES } from "./index";

/**
 * Test de contrat T-3 — alignement code ↔ DB.
 *
 * Toute valeur de `ANSWER_CATEGORIES` (source unique alimentant les
 * types + tous les Zod enums côté API) doit appartenir au
 * check_constraint `diagnostic_answers_category_check` défini dans
 * `supabase/migrations/20260704100000_extend_diagnostic_answers_categories.sql`.
 *
 * Contrat à préserver :
 *   • Ajouter une valeur à ANSWER_CATEGORIES → écrire une migration
 *     additive étendant le check_constraint AVANT merge, puis mettre à
 *     jour `EXPECTED_DB_ALLOWED_CATEGORIES` ci-dessous.
 *   • Ce test échoue à l'exécution si l'un des deux bords dérive.
 */

// Valeurs autorisées côté DB — répliquées à la main depuis
// `supabase/migrations/20260704100000_extend_diagnostic_answers_categories.sql`.
const EXPECTED_DB_ALLOWED_CATEGORIES = [
  // MVP1 (conservées, ne pas retirer)
  "tool_maturity",
  "commercial_performance",
  "business_skill",
  "execution",
  // v1.0 (une par chapitre)
  "identity",
  "team",
  "funding",
  "prospecting",
  "seller_meeting",
  "mandates",
  "commercial_followup",
  "buyers",
  "visits_offers",
  "db_reputation",
  "tools_ai",
  "management",
] as const;

describe("ANSWER_CATEGORIES ⊆ diagnostic_answers_category_check (migration 20260704)", () => {
  it("chaque catégorie du code est acceptée par le check_constraint DB", () => {
    for (const category of ANSWER_CATEGORIES) {
      expect(EXPECTED_DB_ALLOWED_CATEGORIES).toContain(category);
    }
  });

  it("les 16 valeurs exactes du référentiel v1.0 sont présentes (4 MVP1 + 12 v1.0 dont Ch.2 dédoublé team + funding)", () => {
    // Ch.2 est dédoublé (Ch.2 team = 2.1/2.2/2.3 effectifs ; Ch.2 funding = 2.4)
    // → 12 valeurs v1.0 pour 11 chapitres logiques.
    expect(ANSWER_CATEGORIES).toHaveLength(16);
    // Sanity : la liste contient bien la charnière MVP1/v1.0.
    expect(ANSWER_CATEGORIES).toContain("tool_maturity");
    expect(ANSWER_CATEGORIES).toContain("identity");
    expect(ANSWER_CATEGORIES).toContain("management");
    // Ch.2 dédoublé — les deux clés cohabitent.
    expect(ANSWER_CATEGORIES).toContain("team");
    expect(ANSWER_CATEGORIES).toContain("funding");
  });

  it("EXPECTED_DB_ALLOWED_CATEGORIES est la source répliquée (garde contre réduction accidentelle)", () => {
    expect(EXPECTED_DB_ALLOWED_CATEGORIES).toHaveLength(16);
  });
});
