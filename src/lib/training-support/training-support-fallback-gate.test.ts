import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate fail-closed pour `training-support-service.ts` +
 * `designed-support-service.ts` — vérifie que hors mode local,
 * `getXXXBySessionId` ne retourne jamais de support fantôme depuis
 * localStorage.
 */

const mockCreate = vi.fn();
const getItemSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => mockCreate(),
}));

vi.mock("@/lib/diagnostics/diagnostic-service", () => ({
  getDiagnosticSummary: vi.fn(async () => ({ data: null, mode: "supabase", error: null })),
}));

vi.mock("@/lib/recommendations/recommendation-service", () => ({
  getRecommendationByDiagnosticId: vi.fn(async () => ({ data: null, mode: "supabase", error: null })),
}));

vi.mock("@/lib/proposals/proposal-service", () => ({
  getProposalByDiagnosticId: vi.fn(async () => ({ data: null, mode: "supabase", error: null })),
}));

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  mockCreate.mockReset();
  getItemSpy.mockReset();
  vi.resetModules();
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
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return { from: () => chain };
}

describe("training-support-service fail-closed (preprod)", () => {
  it("preprod + getTrainingSupportBySessionId data null → JAMAIS de lecture localStorage", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "preprod";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    getItemSpy.mockReturnValue(
      JSON.stringify({ items: [{ id: "GHOST", sessionId: "s1" }] })
    );
    mockCreate.mockReturnValue(makeSupabaseNullClient());

    const { getTrainingSupportBySessionId } = await import(
      "@/lib/training-support/training-support-service"
    );
    await getTrainingSupportBySessionId("s1");
    expect(getItemSpy).not.toHaveBeenCalled();
  });
});

describe("designed-support-service fail-closed (preprod)", () => {
  it("preprod + getDesignedSupportBySessionId data null → JAMAIS de lecture localStorage", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "preprod";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    getItemSpy.mockReturnValue(
      JSON.stringify({ items: [{ id: "GHOST", sessionId: "s1" }] })
    );
    mockCreate.mockReturnValue(makeSupabaseNullClient());

    const { getDesignedSupportBySessionId } = await import(
      "@/lib/training-support/designed-support-service"
    );
    await getDesignedSupportBySessionId("s1");
    expect(getItemSpy).not.toHaveBeenCalled();
  });
});
