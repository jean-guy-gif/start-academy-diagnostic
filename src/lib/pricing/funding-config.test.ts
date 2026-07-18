import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests de `getActiveFundingConfig` — résolution de la config active
 * (partiel unique WHERE valid_to IS NULL) et fallback rétro-compat sur
 * les défauts MVP quand :
 *   • Supabase n'est pas configuré (client null)
 *   • La table est vide
 *   • Une clé partielle est absente en base
 *
 * On mock `@/lib/supabase/server` — pas d'appel réseau ni de DB.
 */

// Constantes attendues par défaut (source : DEFAULT_FUNDING_CONFIG et
// training-funding.ts). Répliquées ici pour figer le contrat.
const EXPECTED_DEFAULTS = {
  ageficeThreshold: 7000,
  ageficeAnnualCap: 3000,
  opcoEpAnnualCap: 2500,
  consumptionLeverPercent: 30,
  // Refonte tarif 2026-07-17 (seed PRICE_PER_HOUR_PER_PARTICIPANT).
  pricePerHourPerParticipant: 84,
};

const mockCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => mockCreate(),
}));

// Le module cible importe `server-only` — aliasé vers un stub vide via
// vitest.config.ts (cf. tests/stubs/server-only.ts). L'import ci-dessous
// doit donc réussir en env node.
async function loadService() {
  return await import("./funding-config-service");
}

function makeClient(rows: Array<{ key: string; value_numeric: unknown }>) {
  // Simule le chainage `.from("funding_config").select(...).is("valid_to", null)`
  // en retournant un objet `then`-able à la fin.
  const chain = {
    select: () => chain,
    is: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => chain };
}

function makeErroringClient() {
  const chain = {
    select: () => chain,
    is: () =>
      Promise.resolve({
        data: null,
        error: { message: "simulé — supabase indispo" },
      }),
  };
  return { from: () => chain };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("getActiveFundingConfig — fallback rétro-compat", () => {
  it("client null (env manquantes) → retourne DEFAULT_FUNDING_CONFIG", async () => {
    mockCreate.mockReturnValue(null);
    const { getActiveFundingConfig, DEFAULT_FUNDING_CONFIG } = await loadService();
    const cfg = await getActiveFundingConfig();
    expect(cfg).toEqual(EXPECTED_DEFAULTS);
    expect(cfg).toEqual(DEFAULT_FUNDING_CONFIG);
  });

  it("table vide → retourne DEFAULT_FUNDING_CONFIG (pas de NaN)", async () => {
    mockCreate.mockReturnValue(makeClient([]));
    const { getActiveFundingConfig } = await loadService();
    const cfg = await getActiveFundingConfig();
    expect(cfg).toEqual(EXPECTED_DEFAULTS);
  });

  it("erreur Supabase (data null + error) → fallback silencieux sur les défauts", async () => {
    mockCreate.mockReturnValue(makeErroringClient());
    const { getActiveFundingConfig } = await loadService();
    const cfg = await getActiveFundingConfig();
    expect(cfg).toEqual(EXPECTED_DEFAULTS);
  });
});

describe("getActiveFundingConfig — résolution des overrides actifs", () => {
  it("4 clés seed v1.0 correctement mappées", async () => {
    mockCreate.mockReturnValue(
      makeClient([
        { key: "AGEFICE_THRESHOLD", value_numeric: 7000 },
        { key: "AGEFICE_ANNUAL_CAP", value_numeric: 3000 },
        { key: "CONSUMPTION_LEVER_PERCENT", value_numeric: 30 },
        { key: "OPCO_EP_ANNUAL_CAP", value_numeric: 2500 },
      ])
    );
    const { getActiveFundingConfig } = await loadService();
    const cfg = await getActiveFundingConfig();
    expect(cfg).toEqual(EXPECTED_DEFAULTS);
  });

  it("clé partielle en base → seul le champ concerné est overridé", async () => {
    mockCreate.mockReturnValue(
      makeClient([
        // Nouveau seuil AGEFICE 8 000 €, les 3 autres clés absentes.
        { key: "AGEFICE_THRESHOLD", value_numeric: 8000 },
      ])
    );
    const { getActiveFundingConfig } = await loadService();
    const cfg = await getActiveFundingConfig();
    expect(cfg.ageficeThreshold).toBe(8000);
    expect(cfg.ageficeAnnualCap).toBe(EXPECTED_DEFAULTS.ageficeAnnualCap);
    expect(cfg.opcoEpAnnualCap).toBe(EXPECTED_DEFAULTS.opcoEpAnnualCap);
    expect(cfg.consumptionLeverPercent).toBe(
      EXPECTED_DEFAULTS.consumptionLeverPercent
    );
  });

  it("value_numeric renvoyé en string (postgres numeric → js string) est bien coercé en number", async () => {
    mockCreate.mockReturnValue(
      makeClient([{ key: "OPCO_EP_ANNUAL_CAP", value_numeric: "3200" }])
    );
    const { getActiveFundingConfig } = await loadService();
    const cfg = await getActiveFundingConfig();
    expect(cfg.opcoEpAnnualCap).toBe(3200);
  });

  it("value_numeric invalide (non-finite) → tombe sur le défaut", async () => {
    mockCreate.mockReturnValue(
      makeClient([{ key: "AGEFICE_THRESHOLD", value_numeric: "pas-un-nombre" }])
    );
    const { getActiveFundingConfig } = await loadService();
    const cfg = await getActiveFundingConfig();
    expect(cfg.ageficeThreshold).toBe(EXPECTED_DEFAULTS.ageficeThreshold);
  });
});
