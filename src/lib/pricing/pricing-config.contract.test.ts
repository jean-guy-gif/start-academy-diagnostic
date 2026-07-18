import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_FUNDING_CONFIG } from "./funding-config-service";

/**
 * Test de contrat — refonte tarif Start Academy 2026-07-17.
 *
 * Verrouille l'alignement STRICT entre :
 *   • le seed `PRICE_PER_HOUR_PER_PARTICIPANT` de la migration
 *     `20260717120000_add_price_per_hour_seed.sql` (source de vérité DB),
 *   • `DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant` de
 *     `funding-config-service.ts` (fallback code si Supabase indispo).
 *
 * Toute divergence entre les deux ferait dériver la tarification en
 * fonction de la disponibilité Supabase — inacceptable côté produit.
 * Test échoue au build si l'un des deux bords change sans l'autre
 * (leçon T-3 / T-4 / F-1).
 *
 * Verrouille aussi la valeur métier 84 € (le vrai tarif Start Academy —
 * horaire × 2 par rapport à l'ancien 42 €). Toute modification exige un
 * changement documenté ET l'accord Laurent (registre décisionnel).
 */

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260717120000_add_price_per_hour_seed.sql"
);

function readMigration(): string {
  // Strip commentaires SQL pour éviter d'attraper un chiffre dans un
  // commentaire par mégarde.
  return readFileSync(MIGRATION_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

function extractSeedValue(sql: string): number {
  // Match `values ('PRICE_PER_HOUR_PER_PARTICIPANT', <n>, …)`
  const match = sql.match(
    /'PRICE_PER_HOUR_PER_PARTICIPANT'\s*,\s*(\d+(?:\.\d+)?)/i
  );
  if (!match) {
    throw new Error(
      "Seed PRICE_PER_HOUR_PER_PARTICIPANT introuvable dans la migration"
    );
  }
  return Number.parseFloat(match[1]);
}

describe("Contract PRICE_PER_HOUR_PER_PARTICIPANT — migration ↔ code", () => {
  it("le seed migration = DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant", () => {
    const sql = readMigration();
    const seed = extractSeedValue(sql);
    expect(seed).toBe(
      DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant
    );
  });

  it("la valeur métier vaut 84 € (tarif Start Academy tout compris, non 42)", () => {
    // Sécurité supplémentaire : si Laurent change la valeur, ce test
    // saute et force la mise à jour docs / registre décisionnel.
    expect(DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant).toBe(84);
    // Sanity : jamais 42 (ancienne valeur en dur, source du bug de
    // sous-évaluation 50 %).
    expect(
      DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant
    ).not.toBe(42);
  });

  it("la note du seed migration précise le contenu « tout compris »", () => {
    const sql = readMigration();
    // Doit mentionner ingénierie / administratif / formateurs /
    // déplacement / outils / avance trésorerie — les 6 postes que
    // couvre le tarif.
    expect(sql).toMatch(/ingénierie/i);
    expect(sql).toMatch(/administratif/i);
    expect(sql).toMatch(/formateurs?/i);
    expect(sql).toMatch(/déplacement/i);
    expect(sql).toMatch(/outils/i);
    expect(sql).toMatch(/tr[ée]sorerie/i);
  });
});

describe("Contract training-pricing — plus aucune constante 42 dans le code métier", () => {
  it("`training-pricing.ts` n'exporte plus PRICE_PER_HOUR_PER_PARTICIPANT", async () => {
    // Import dynamique pour éviter l'échec de compilation si un
    // export résiduel existait. On teste que le symbole est absent.
    const mod = (await import("./training-pricing")) as Record<
      string,
      unknown
    >;
    expect(mod.PRICE_PER_HOUR_PER_PARTICIPANT).toBeUndefined();
  });
});
