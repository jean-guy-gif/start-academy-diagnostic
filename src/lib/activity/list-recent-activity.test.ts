import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileWithRole } from "@/lib/auth/roles";

/**
 * Tests de contrat T-10c-BIS + T-11 sur `listRecentActivity`.
 *
 * T-10c-BIS (fix 2026-07-09) : `event_description` (texte libre
 * note_added, notes internes commerciales) ne doit JAMAIS remonter.
 * Invariants :
 *   1. Le SELECT envoyé à Supabase NE contient PAS "event_description".
 *   2. Les enregistrements retournés ont `eventDescription: null`
 *      quel que soit ce que renvoie Supabase (garde-fou runtime).
 *
 * T-11 (fix 2026-07-09) : cloisonnement par ownership.
 *   • admin       → aucun filtre (voit tout Start Academy).
 *   • non-admin   → filtre `.or(session_id.in(mes sessions),
 *                              diagnostic_id.in(mes diagnostics),
 *                              actor_id.eq.profile.id)`.
 *
 * Ces tests échouent si un refactor casse l'un des invariants.
 */

const mockCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => mockCreate(),
}));

async function loadService() {
  return await import("./activity-log-service");
}

const ADMIN: ProfileWithRole = {
  id: "user-admin",
  role: "admin",
  email: "admin@t.test",
  full_name: "Admin",
  organization: null,
};

const COMMERCIAL_B: ProfileWithRole = {
  id: "user-B",
  role: "commercial",
  email: "b@t.test",
  full_name: "Commercial B",
  organization: null,
};

/**
 * Mock supabase-js client compatible avec les patterns :
 *   • admin path      : client.from("activity_logs").select(...).order(...).limit(N)
 *   • non-admin path  : + client.from("training_sessions|diagnostics").select("id").eq("created_by", ...)
 *                       + client.from("activity_logs").select(...).order(...).limit(N).or(...)
 *
 * Le chain est thenable : quelle que soit la méthode terminale
 * (`.limit()`, `.eq()`, `.or()`), l'`await` déclenche le résolveur.
 * Le SELECT sur activity_logs est capturé pour l'assertion T-10c-BIS.
 */
function makeClient(
  responses: Record<string, Array<Record<string, unknown>>>,
  capturedSelect: { value: string | null },
  capturedOrClause: { value: string | null }
) {
  return {
    from: (name: string) => {
      const chain = {
        select: (cols: string) => {
          if (name === "activity_logs") capturedSelect.value = cols;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        eq: () => chain,
        or: (clause: string) => {
          capturedOrClause.value = clause;
          return chain;
        },
        then: (resolve: (v: {
          data: Array<Record<string, unknown>>;
          error: null;
        }) => void) =>
          Promise.resolve({ data: responses[name] ?? [], error: null }).then(
            resolve
          ),
      };
      return chain;
    },
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("listRecentActivity — invariant T-10c-BIS (event_description masqué)", () => {
  it("admin : le SELECT ne contient PAS `event_description`", async () => {
    const capturedSelect = { value: null as string | null };
    const capturedOr = { value: null as string | null };
    mockCreate.mockReturnValue(
      makeClient({ activity_logs: [] }, capturedSelect, capturedOr)
    );
    const { listRecentActivity } = await loadService();
    await listRecentActivity(ADMIN, 10);
    expect(capturedSelect.value).not.toBeNull();
    expect(capturedSelect.value!).not.toContain("event_description");
    // Sanity : les autres colonnes attendues sont bien présentes.
    expect(capturedSelect.value!).toContain("event_type");
    expect(capturedSelect.value!).toContain("event_label");
    expect(capturedSelect.value!).toContain("metadata");
    // Admin : aucun filtre `.or(...)` appliqué.
    expect(capturedOr.value).toBeNull();
  });

  it("garde-fou runtime : même si Supabase renvoyait event_description, le mapping force eventDescription = null", async () => {
    const capturedSelect = { value: null as string | null };
    const capturedOr = { value: null as string | null };
    // On simule un contournement : la DB renvoie une valeur pour
    // event_description (comme si le SELECT était modifié ailleurs).
    // Le mapping doit encore la nuller.
    mockCreate.mockReturnValue(
      makeClient(
        {
          activity_logs: [
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
        },
        capturedSelect,
        capturedOr
      )
    );
    const { listRecentActivity } = await loadService();
    const result = await listRecentActivity(ADMIN, 10);
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
    const result = await listRecentActivity(ADMIN, 10);
    expect(result).toEqual([]);
  });
});

describe("listRecentActivity — cloisonnement T-11 (ownership)", () => {
  it("non-admin : applique un filtre `.or(...)` avec ses sessions, diagnostics et son actor_id", async () => {
    const capturedSelect = { value: null as string | null };
    const capturedOr = { value: null as string | null };
    mockCreate.mockReturnValue(
      makeClient(
        {
          training_sessions: [{ id: "sess-B-1" }, { id: "sess-B-2" }],
          diagnostics: [{ id: "diag-B-1" }],
          activity_logs: [],
        },
        capturedSelect,
        capturedOr
      )
    );
    const { listRecentActivity } = await loadService();
    await listRecentActivity(COMMERCIAL_B, 10);
    expect(capturedOr.value).not.toBeNull();
    // Clauses attendues (ordre garanti par l'implémentation) :
    //   actor_id.eq.<userId>, session_id.in.(...), diagnostic_id.in.(...)
    expect(capturedOr.value!).toContain(`actor_id.eq.${COMMERCIAL_B.id}`);
    expect(capturedOr.value!).toContain("session_id.in.(sess-B-1,sess-B-2)");
    expect(capturedOr.value!).toContain("diagnostic_id.in.(diag-B-1)");
  });

  it("non-admin sans dossier propre : filtre `.or(actor_id.eq.…)` uniquement (pas de leak si un event a un session_id d'autrui)", async () => {
    const capturedSelect = { value: null as string | null };
    const capturedOr = { value: null as string | null };
    mockCreate.mockReturnValue(
      makeClient(
        {
          training_sessions: [],
          diagnostics: [],
          activity_logs: [],
        },
        capturedSelect,
        capturedOr
      )
    );
    const { listRecentActivity } = await loadService();
    await listRecentActivity(COMMERCIAL_B, 10);
    expect(capturedOr.value).not.toBeNull();
    // Seule la clause actor_id est présente — aucune `in.()` ouverte
    // qui aurait pu être exploitée si Postgres accepte `in.()` vide.
    expect(capturedOr.value!).toBe(`actor_id.eq.${COMMERCIAL_B.id}`);
  });

  it("admin : aucun filtre `.or(...)` appliqué (visibilité globale)", async () => {
    const capturedSelect = { value: null as string | null };
    const capturedOr = { value: null as string | null };
    mockCreate.mockReturnValue(
      makeClient({ activity_logs: [] }, capturedSelect, capturedOr)
    );
    const { listRecentActivity } = await loadService();
    await listRecentActivity(ADMIN, 10);
    expect(capturedOr.value).toBeNull();
  });
});
