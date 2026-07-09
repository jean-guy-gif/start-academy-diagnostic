import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Test de contrat T-10c-BIS (fix 2026-07-09) — `listRecentActivity`
 * ne doit JAMAIS remonter `event_description` (texte libre note_added
 * = notes internes commerciales, incompatibles avec le flux
 * inter-commercial du cockpit).
 *
 * Deux invariants verrouillés :
 *   1. Le SELECT envoyé à Supabase NE contient PAS "event_description".
 *   2. Les enregistrements retournés ont `eventDescription: null`
 *      quels que soient les mocks (garde-fou runtime — si le SELECT
 *      change et récupère la colonne, le mapping doit encore la nuller).
 *
 * Ces tests échouent si :
 *   • Un futur refactor rajoute "event_description" au SELECT.
 *   • Le mapping cesse de forcer `eventDescription: null`.
 *   • Quelqu'un contourne `listRecentActivity` pour ré-exposer la
 *     colonne (à couvrir par audit de tout appel à
 *     `/api/activity/recent`).
 */

const mockCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => mockCreate(),
}));

async function loadService() {
  return await import("./activity-log-service");
}

// Capture le SELECT passé au client et laisse le test injecter les
// données retournées (avec ou sans event_description).
function makeClient(
  rows: Array<Record<string, unknown>>,
  capturedSelect: { value: string | null }
) {
  const chain = {
    select: (cols: string) => {
      capturedSelect.value = cols;
      return chain;
    },
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => chain };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("listRecentActivity — invariant T-10c-BIS", () => {
  it("le SELECT ne contient PAS `event_description`", async () => {
    const captured = { value: null as string | null };
    mockCreate.mockReturnValue(makeClient([], captured));
    const { listRecentActivity } = await loadService();
    await listRecentActivity(10);
    expect(captured.value).not.toBeNull();
    expect(captured.value!).not.toContain("event_description");
    // Sanity : les autres colonnes attendues sont bien présentes.
    expect(captured.value!).toContain("event_type");
    expect(captured.value!).toContain("event_label");
    expect(captured.value!).toContain("metadata");
  });

  it("garde-fou runtime : même si Supabase renvoyait event_description, le mapping force eventDescription = null", async () => {
    const captured = { value: null as string | null };
    // On simule un contournement : la DB renvoie une valeur pour
    // event_description (comme si le SELECT était modifié ailleurs).
    // Le mapping doit encore la nuller.
    mockCreate.mockReturnValue(
      makeClient(
        [
          {
            id: "log-1",
            session_id: null,
            diagnostic_id: null,
            client_id: null,
            actor_id: null,
            actor_name: "Commercial B",
            actor_role: "commercial",
            event_type: "note_added",
            event_label: "Note interne ajoutée",
            event_description:
              "Note ultra-sensible qui ne doit pas fuiter, ex : « le dirigeant Dupont hésite sur le prix ».",
            entity_type: null,
            entity_id: null,
            severity: "info",
            metadata: {},
            created_at: "2026-07-09T00:00:00Z",
          },
        ],
        captured
      )
    );
    const { listRecentActivity } = await loadService();
    const result = await listRecentActivity(10);
    expect(result).toHaveLength(1);
    expect(result[0].eventDescription).toBeNull();
    // Sanity : les autres champs sûrs passent bien.
    expect(result[0].eventLabel).toBe("Note interne ajoutée");
    expect(result[0].actorName).toBe("Commercial B");
    expect(result[0].eventType).toBe("note_added");
  });

  it("client indisponible → tableau vide (best-effort silencieux)", async () => {
    mockCreate.mockReturnValue(null);
    const { listRecentActivity } = await loadService();
    const result = await listRecentActivity(10);
    expect(result).toEqual([]);
  });
});
