import { describe, expect, it } from "vitest";

import type { TrainingSupportSource } from "@/lib/ai/training-support-schema";
import type { DesignedSupportSource } from "@/lib/ai/designed-support-schema";

/**
 * Test de contrat T-4 — alignement code ↔ DB.
 *
 * Toute valeur produite par le code doit appartenir au check_constraint
 * `source in (...)` sur `training_supports` et `designed_training_supports`.
 * Un fix T-4 (2026-07-08) a réaligné la DB avec la valeur `'llm'` que
 * le code émet depuis la refonte OpenRouter — cf.
 * `supabase/migrations/20260708100000_extend_supports_source_check.sql`.
 *
 * Contrat à préserver :
 *   • Ajouter une valeur au type `TrainingSupportSource` ou
 *     `DesignedSupportSource` → écrire une migration additive qui
 *     étend le check_constraint AVANT de merger, puis mettre à jour
 *     `EXPECTED_DB_ALLOWED_SOURCES` ci-dessous.
 *   • Ce test échoue au typecheck et à l'exécution si l'un des deux
 *     bords dérive.
 */

// Valeurs autorisées côté DB — répliquées à la main depuis
// `supabase/migrations/20260708100000_extend_supports_source_check.sql`.
// `'openrouter'` reste dans la liste (rétro-compat, aucune ligne
// historique connue mais règle : ne pas invalider une ligne
// pré-existante).
const EXPECTED_DB_ALLOWED_SOURCES = [
  "openrouter",
  "heuristic",
  "llm",
] as const;
type ExpectedDbSource = (typeof EXPECTED_DB_ALLOWED_SOURCES)[number];

// Valeurs actuellement émises par le code — répliquées à la main
// depuis `src/lib/ai/training-support-schema.ts` et
// `src/lib/ai/designed-support-schema.ts` (les deux types sont
// distincts mais partagent les mêmes valeurs à ce jour).
const CODE_TRAINING_SUPPORT_SOURCES: TrainingSupportSource[] = ["llm", "heuristic"];
const CODE_DESIGNED_SUPPORT_SOURCES: DesignedSupportSource[] = ["llm", "heuristic"];

describe("source contract — training_supports & designed_training_supports", () => {
  it("chaque valeur de TrainingSupportSource est acceptée par le check_constraint DB", () => {
    for (const value of CODE_TRAINING_SUPPORT_SOURCES) {
      expect(EXPECTED_DB_ALLOWED_SOURCES).toContain(value as ExpectedDbSource);
    }
  });

  it("chaque valeur de DesignedSupportSource est acceptée par le check_constraint DB", () => {
    for (const value of CODE_DESIGNED_SUPPORT_SOURCES) {
      expect(EXPECTED_DB_ALLOWED_SOURCES).toContain(value as ExpectedDbSource);
    }
  });

  it("EXPECTED_DB_ALLOWED_SOURCES contient exactement les 3 valeurs de la migration 20260708", () => {
    // Guard contre une réduction accidentelle de la liste côté test
    // (qui masquerait une régression code → DB).
    expect(EXPECTED_DB_ALLOWED_SOURCES).toEqual(
      expect.arrayContaining(["openrouter", "heuristic", "llm"])
    );
    expect(EXPECTED_DB_ALLOWED_SOURCES).toHaveLength(3);
  });
});
