import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate fail-closed pour `recommendation-service.ts`.
 *
 * Contrat testé : quand `NEXT_PUBLIC_APP_ENV !== 'local'` (preprod /
 * production / undefined + NODE_ENV=production), une lecture Supabase
 * qui retourne `data: null` sans erreur ne DOIT PAS aller chercher
 * une reco dans localStorage. La sortie est
 * `{ data: null, error: null }` — signal legit « aucune reco en base »
 * couplé au refactor preflight #35 côté proposal.
 */

const mockCreate = vi.fn();
const getItemSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => mockCreate(),
}));

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  mockCreate.mockReset();
  getItemSpy.mockReset();
  vi.resetModules();
  // Simule un environnement navigateur avec localStorage rempli d'une
  // vieille reco fantôme d'une session dev.
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: {
        getItem: getItemSpy,
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_ENV = ORIGINAL_APP_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV;
  Reflect.deleteProperty(globalThis, "window");
});

function makeSupabaseNullClient() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () =>
      Promise.resolve({ data: null, error: null }),
  };
  return { from: () => chain };
}

describe("recommendation-service fail-closed (preprod)", () => {
  it("NEXT_PUBLIC_APP_ENV=preprod + Supabase data null → data:null, error:null, JAMAIS de lecture localStorage", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "preprod";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    // Reco fantôme en localStorage — ne doit JAMAIS être lue.
    getItemSpy.mockReturnValue(
      JSON.stringify({
        items: [
          {
            id: "GHOST-RECO",
            diagnosticId: "diag-xyz",
            recommendation: { totalDurationHours: 999 },
          },
        ],
      })
    );
    mockCreate.mockReturnValue(makeSupabaseNullClient());

    const { getRecommendationByDiagnosticId } = await import(
      "@/lib/recommendations/recommendation-service"
    );
    const result = await getRecommendationByDiagnosticId("diag-xyz");

    expect(result.data).toBeNull();
    expect(getItemSpy).not.toHaveBeenCalled();
  });

  it("NEXT_PUBLIC_APP_ENV=local + Supabase data null → fallback localStorage AUTORISÉ", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "local";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    getItemSpy.mockReturnValue(
      JSON.stringify({
        items: [
          {
            id: "LOCAL-RECO",
            diagnosticId: "diag-xyz",
            recommendation: { totalDurationHours: 42 },
          },
        ],
      })
    );
    mockCreate.mockReturnValue(makeSupabaseNullClient());

    const { getRecommendationByDiagnosticId } = await import(
      "@/lib/recommendations/recommendation-service"
    );
    await getRecommendationByDiagnosticId("diag-xyz");

    // Le fallback est passé → getItem a été appelé.
    expect(getItemSpy).toHaveBeenCalled();
  });
});
