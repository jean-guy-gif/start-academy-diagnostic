import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Chantier B5 (audit externe — lot reprise-diagnostic).
 *
 * Contrat d'échec des services `createTrainingSession` et
 * `saveParticipant` : hors mode local autorisé (i.e. en preprod /
 * prod), une erreur de persistance retourne `data: null` + `error`
 * explicite — plus jamais un faux succès avec un UUID fantôme
 * fabriqué localement, qui trompait le garde `if (!result.data)` de
 * l'UI et provoquait des redirections vers des sessions introuvables.
 */

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(() => null),
}));
vi.mock("@/lib/storage/local-fallback", () => ({
  isLocalFallbackAllowed: vi.fn(() => false),
}));
vi.mock("@/lib/activity/log-activity", () => ({
  logActivityFromClient: vi.fn(),
}));

async function reload() {
  vi.resetModules();
  return await import("./session-service");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTrainingSession — contrat d'échec (fallback local INTERDIT)", () => {
  it("Supabase indisponible + fallback local interdit → data: null + error explicite", async () => {
    const { createTrainingSession } = await reload();
    const result = await createTrainingSession({
      diagnosticId: "DIAG_A",
      clientId: "CLIENT_A",
      recommendationId: null,
      expectedParticipants: 2,
      notes: null,
    });
    expect(result.data).toBeNull();
    expect(result.mode).toBe("local");
    expect(result.error).toBeTruthy();
    // Le garde-fou UI `if (!result.data)` redevient fonctionnel.
  });
});

describe("saveParticipant — contrat d'échec (fallback local INTERDIT)", () => {
  it("Supabase indisponible + fallback local interdit → data: null + error explicite", async () => {
    const { saveParticipant } = await reload();
    const result = await saveParticipant({
      sessionId: "SESS_A",
      firstName: "Alice",
      lastName: "Dupont",
      email: "alice@example.com",
      role: "",
      estimatedLevel: "",
      personalGoal: "",
      mainProblem: "",
      toolsUsed: [],
      concreteCase: "",
      lastDiploma: "",
      professionalStatus: null,
    });
    expect(result.data).toBeNull();
    expect(result.mode).toBe("local");
    expect(result.error).toBeTruthy();
  });
});
