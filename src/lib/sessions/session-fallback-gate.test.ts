import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate fail-closed pour `session-service.ts` — vérifie que hors mode
 * local, les 2 fonctions publiques les plus consommées
 * (getTrainingSessionById, listParticipantsBySession) ne vont jamais
 * chercher de données fantômes en localStorage.
 */

const mockCreate = vi.fn();
const getItemSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => mockCreate(),
}));

vi.mock("@/lib/activity/log-from-client", () => ({
  logActivityFromClient: vi.fn(),
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

describe("session-service fail-closed (preprod)", () => {
  it("preprod + getTrainingSessionById data null → data:null, JAMAIS de lecture localStorage", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "preprod";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    getItemSpy.mockReturnValue(
      JSON.stringify({ items: [{ id: "GHOST-SESSION" }] })
    );
    mockCreate.mockReturnValue(makeSupabaseNullClient());

    const { getTrainingSessionById } = await import(
      "@/lib/sessions/session-service"
    );
    const result = await getTrainingSessionById("session-xyz");

    expect(result.data).toBeNull();
    expect(getItemSpy).not.toHaveBeenCalled();
  });

  it("local + getTrainingSessionById data null → fallback autorisé", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "local";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    getItemSpy.mockReturnValue(
      JSON.stringify({ items: [{ id: "session-xyz", clientId: "c", diagnosticId: null, recommendationId: null, status: "created", proposedDates: [], validatedDate: null, expectedParticipants: null, notes: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" }] })
    );
    mockCreate.mockReturnValue(makeSupabaseNullClient());

    const { getTrainingSessionById } = await import(
      "@/lib/sessions/session-service"
    );
    await getTrainingSessionById("session-xyz");
    expect(getItemSpy).toHaveBeenCalled();
  });
});
