import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileWithRole } from "@/lib/auth/roles";

/**
 * Tests T-11 (2026-07-09) — les 2 KPI count du cockpit sont
 * cloisonnés par ownership :
 *   • `countSupportsAwaitingQualityReview`
 *   • `countSessionsAwaitingPostTrainingReview`
 *
 * Non-admin → le count restreint aux sessions `created_by = profile.id`
 * (pré-filtre puis `.in(session_id, mesSessionsIds)` sur les tables filles).
 * Admin → count global, aucun filtre `created_by`.
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
  eqStatus: string | null;
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
        eqStatus: null,
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
          if (col === "status") call.eqStatus = val;
          return chain;
        },
        in: (col: string, values: string[]) => {
          call.inFilter = { column: col, values };
          return chain;
        },
        then: (resolve: (v: {
          data: Array<Record<string, unknown>> | null;
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

describe("countSupportsAwaitingQualityReview — cloisonnement T-11", () => {
  it("non-admin : pré-filtre training_sessions par created_by, retourne 0 si aucune session propre", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(makeClient({ training_sessions: [] }, captured));
    const { countSupportsAwaitingQualityReview } = await import(
      "@/lib/training-support/support-quality-service"
    );
    const count = await countSupportsAwaitingQualityReview(COMMERCIAL_B);
    expect(count).toBe(0);
    const sessCall = captured.find((c) => c.table === "training_sessions");
    expect(sessCall?.eqCreatedBy).toBe(COMMERCIAL_B.id);
    // Court-circuit : les tables filles ne sont pas requêtées.
    expect(
      captured.find((c) => c.table === "designed_training_supports")
    ).toBeUndefined();
  });

  it("non-admin avec sessions : `.in(session_id, mesSessions)` sur designed_training_supports", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(
      makeClient(
        {
          training_sessions: [{ id: "sess-B-1" }, { id: "sess-B-2" }],
          designed_training_supports: [
            { session_id: "sess-B-1" },
            { session_id: "sess-B-2" },
          ],
          support_quality_reviews: [{ session_id: "sess-B-1" }],
        },
        captured
      )
    );
    const { countSupportsAwaitingQualityReview } = await import(
      "@/lib/training-support/support-quality-service"
    );
    const count = await countSupportsAwaitingQualityReview(COMMERCIAL_B);
    // 2 sessions ont un designed support, 1 est déjà validated →
    // 1 en attente.
    expect(count).toBe(1);
    const designedCall = captured.find(
      (c) => c.table === "designed_training_supports"
    );
    expect(designedCall?.inFilter?.column).toBe("session_id");
    expect(designedCall?.inFilter?.values).toEqual(["sess-B-1", "sess-B-2"]);
  });

  it("admin : AUCUN pré-filtre par created_by", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(makeClient({}, captured));
    const { countSupportsAwaitingQualityReview } = await import(
      "@/lib/training-support/support-quality-service"
    );
    await countSupportsAwaitingQualityReview(ADMIN);
    // Admin ne fait pas d'appel à training_sessions du tout (skippé).
    expect(
      captured.find(
        (c) =>
          c.table === "training_sessions" && c.eqCreatedBy === ADMIN.id
      )
    ).toBeUndefined();
  });
});

describe("countSessionsAwaitingPostTrainingReview — cloisonnement T-11", () => {
  it("non-admin : `.eq(created_by, profile.id).eq(status, delivered)` sur training_sessions", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(makeClient({ training_sessions: [] }, captured));
    const { countSessionsAwaitingPostTrainingReview } = await import(
      "@/lib/post-training/post-training-service"
    );
    await countSessionsAwaitingPostTrainingReview(COMMERCIAL_B);
    const sessCall = captured.find((c) => c.table === "training_sessions");
    expect(sessCall?.eqCreatedBy).toBe(COMMERCIAL_B.id);
    expect(sessCall?.eqStatus).toBe("delivered");
  });

  it("admin : `.eq(status, delivered)` seul, pas de created_by", async () => {
    const captured: CapturedCall[] = [];
    mockCreate.mockReturnValue(makeClient({ training_sessions: [] }, captured));
    const { countSessionsAwaitingPostTrainingReview } = await import(
      "@/lib/post-training/post-training-service"
    );
    await countSessionsAwaitingPostTrainingReview(ADMIN);
    const sessCall = captured.find((c) => c.table === "training_sessions");
    expect(sessCall?.eqCreatedBy).toBeNull();
    expect(sessCall?.eqStatus).toBe("delivered");
  });
});
