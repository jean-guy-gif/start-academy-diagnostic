import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileWithRole } from "@/lib/auth/roles";

/**
 * Tests T-11 (2026-07-09) — cockpit cloisonné par ownership.
 *
 * Contrat vérifié :
 *   • Rôle `admin`     → pas de filtre `.eq("created_by", ...)` sur
 *                        `training_sessions` ni `diagnostics`.
 *   • Autres internes  → filtre `.eq("created_by", profile.id)`
 *                        appliqué à chaque appel.
 *   • Sans dossier propre, on ne requête PAS les tables filles
 *     (clients, diagnostic_participants, etc.) — pas de leak PII.
 */

const mockCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => mockCreate(),
}));

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

interface CapturedCall {
  table: string;
  columns: string | null;
  eqCreatedBy: string | null;
  inFilter: { column: string; values: string[] } | null;
}

function makeClient(
  responses: Record<string, Array<Record<string, unknown>>>,
  captured: CapturedCall[]
) {
  return {
    from: (name: string) => {
      const call: CapturedCall = {
        table: name,
        columns: null,
        eqCreatedBy: null,
        inFilter: null,
      };
      captured.push(call);
      const chain = {
        select: (cols: string) => {
          call.columns = cols;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        eq: (col: string, val: string) => {
          if (col === "created_by") call.eqCreatedBy = val;
          return chain;
        },
        in: (col: string, values: string[]) => {
          call.inFilter = { column: col, values };
          return chain;
        },
        then: (resolve: (v: {
          data: Array<Record<string, unknown>> | null;
          error: null;
          count?: number;
        }) => void) =>
          Promise.resolve({
            data: responses[name] ?? [],
            error: null,
            count: 0,
          }).then(resolve),
      };
      return chain;
    },
  };
}

async function loadService() {
  return await import("./cockpit-service");
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("getCockpitData — cloisonnement T-11", () => {
  it("non-admin : `.eq(created_by, profile.id)` sur training_sessions ET diagnostics", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(
      makeClient(
        { training_sessions: [], diagnostics: [] },
        captured
      )
    );
    const { getCockpitData } = await loadService();
    await getCockpitData(COMMERCIAL_B);
    const sessCall = captured.find((c) => c.table === "training_sessions");
    const diagCall = captured.find((c) => c.table === "diagnostics");
    expect(sessCall?.eqCreatedBy).toBe(COMMERCIAL_B.id);
    expect(diagCall?.eqCreatedBy).toBe(COMMERCIAL_B.id);
  });

  it("non-admin sans dossier : les tables filles ne sont PAS requêtées (clients, diagnostic_participants, etc.)", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(
      makeClient(
        { training_sessions: [], diagnostics: [] },
        captured
      )
    );
    const { getCockpitData } = await loadService();
    await getCockpitData(COMMERCIAL_B);
    // Aucun appel n'a été fait sur les tables porteuses de PII / BI.
    const sensitiveTables = [
      "clients",
      "diagnostic_participants",
      "recommendations",
      "session_participants",
      "session_date_options",
      "public_access_tokens",
      "training_supports",
      "designed_training_supports",
      "support_quality_reviews",
      "post_training_reviews",
    ];
    for (const t of sensitiveTables) {
      expect(captured.find((c) => c.table === t)).toBeUndefined();
    }
    // Seul `training_modules` (catalogue global) est toujours interrogé.
    expect(captured.find((c) => c.table === "training_modules")).toBeDefined();
  });

  it("non-admin avec dossiers : `.in()` sur les tables filles avec les IDs retenus (pas de fuite globale)", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(
      makeClient(
        {
          training_sessions: [
            {
              id: "sess-B-1",
              client_id: "cli-B-1",
              status: "draft",
              expected_participants: null,
              created_at: "2026-07-01T00:00:00Z",
              updated_at: "2026-07-05T00:00:00Z",
              diagnostic_id: "diag-B-1",
              recommendation_id: null,
            },
          ],
          diagnostics: [
            {
              id: "diag-B-1",
              client_id: "cli-B-1",
              status: "to_review",
              expected_participants: null,
              updated_at: "2026-07-04T00:00:00Z",
              alerts_snapshot: null,
            },
          ],
        },
        captured
      )
    );
    const { getCockpitData } = await loadService();
    await getCockpitData(COMMERCIAL_B);
    const clientsCall = captured.find((c) => c.table === "clients");
    expect(clientsCall?.inFilter?.column).toBe("id");
    expect(clientsCall?.inFilter?.values).toEqual(["cli-B-1"]);
    const diagPartCall = captured.find(
      (c) => c.table === "diagnostic_participants"
    );
    expect(diagPartCall?.inFilter?.column).toBe("diagnostic_id");
    expect(diagPartCall?.inFilter?.values).toEqual(["diag-B-1"]);
  });

  it("admin : AUCUN `.eq(created_by, ...)` sur training_sessions ni diagnostics", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(
      makeClient(
        { training_sessions: [], diagnostics: [] },
        captured
      )
    );
    const { getCockpitData } = await loadService();
    await getCockpitData(ADMIN);
    const sessCall = captured.find((c) => c.table === "training_sessions");
    const diagCall = captured.find((c) => c.table === "diagnostics");
    expect(sessCall?.eqCreatedBy).toBeNull();
    expect(diagCall?.eqCreatedBy).toBeNull();
  });
});
