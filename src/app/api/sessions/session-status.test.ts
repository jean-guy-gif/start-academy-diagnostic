import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests T-8 — route PATCH /api/sessions/[id]/status.
 *
 * Contrats vérifiés :
 *   • Owner-mismatch → 403 + service `transitionSessionStatus` JAMAIS appelé.
 *     Le retrait de `assertCanAccessSession` casserait ce test — garde-fou.
 *   • Payload invalide (status hors enum) → 400.
 *   • Transition interdite (mock service renvoie transition_forbidden) → 409.
 *   • Support non validé (mock service renvoie support_not_validated) → 409.
 *   • Session introuvable (mock service renvoie session_not_found) → 404.
 *   • Happy path (mock service renvoie {ok:true, from, to}) → 200
 *     + createActivityLog appelé avec event_type='session_status_changed'
 *       et metadata={from, to}.
 *
 * Politique de mock : on isole la route de la couche DB en mockant
 * `transitionSessionStatus`. La couche service est verrouillée par
 * `session-status-transitions.contract.test.ts` (matrice).
 */

vi.mock("@/lib/auth/require-api-role", () => ({
  requireApiRole: vi.fn(),
}));
vi.mock("@/lib/auth/assert-session-access", () => ({
  assertCanAccessSession: vi.fn(),
}));
vi.mock("@/lib/sessions/session-status-service", () => ({
  transitionSessionStatus: vi.fn(),
}));
vi.mock("@/lib/activity/activity-log-service", () => ({
  createActivityLog: vi.fn().mockResolvedValue(null),
}));

async function importMocks() {
  const auth = await import("@/lib/auth/require-api-role");
  const access = await import("@/lib/auth/assert-session-access");
  const svc = await import("@/lib/sessions/session-status-service");
  const log = await import("@/lib/activity/activity-log-service");
  return {
    requireApiRole: vi.mocked(auth.requireApiRole),
    assertCanAccessSession: vi.mocked(access.assertCanAccessSession),
    transitionSessionStatus: vi.mocked(svc.transitionSessionStatus),
    createActivityLog: vi.mocked(log.createActivityLog),
  };
}

const COMMERCIAL_B = {
  id: "userB",
  role: "commercial" as const,
  email: "b@t.test",
  full_name: "Commercial B",
  organization: null,
};

const forbid = () =>
  ({
    ok: false as const,
    response: NextResponse.json(
      { ok: false, code: "forbidden", error: "Accès refusé." },
      { status: 403 }
    ),
  });

async function callRoute(body: unknown, sessionId = "sess-1") {
  const { PATCH } = await import("./[id]/status/route");
  const req = new Request("http://x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const ctx = { params: Promise.resolve({ id: sessionId }) };
  return PATCH(req, ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-8 route PATCH /api/sessions/[id]/status", () => {
  it("owner-mismatch → 403 + transitionSessionStatus JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue(forbid());

    const res = await callRoute({ status: "delivered" });
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessSession).toHaveBeenCalledWith(
      COMMERCIAL_B,
      "sess-1"
    );
    // Preuve du garde-fou : le service DB n'est jamais atteint.
    expect(mocks.transitionSessionStatus).not.toHaveBeenCalled();
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });

  it("payload invalide (status hors enum) → 400", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });

    const res = await callRoute({ status: "not-a-valid-status" });
    expect(res.status).toBe(400);
    expect(mocks.transitionSessionStatus).not.toHaveBeenCalled();
  });

  it("transition interdite → 409 transition_forbidden", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.transitionSessionStatus.mockResolvedValue({
      ok: false,
      reason: "transition_forbidden",
      from: "created",
      to: "delivered",
    });

    const res = await callRoute({ status: "delivered" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      ok: boolean;
      code: string;
      from: string;
      to: string;
    };
    expect(body.code).toBe("transition_forbidden");
    expect(body.from).toBe("created");
    expect(body.to).toBe("delivered");
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });

  it("support non validé (support_ready → delivered) → 409 support_not_validated", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.transitionSessionStatus.mockResolvedValue({
      ok: false,
      reason: "support_not_validated",
      from: "support_ready",
      to: "delivered",
    });

    const res = await callRoute({ status: "delivered" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("support_not_validated");
    expect(body.error).toContain("validé pédagogiquement");
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });

  it("session introuvable → 404", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.transitionSessionStatus.mockResolvedValue({
      ok: false,
      reason: "session_not_found",
    });

    const res = await callRoute({ status: "delivered" });
    expect(res.status).toBe(404);
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });

  it("happy path → 200 + createActivityLog appelé avec event=session_status_changed, metadata={from, to}", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.transitionSessionStatus.mockResolvedValue({
      ok: true,
      from: "dates_validated",
      to: "collection_open",
    });

    const res = await callRoute({ status: "collection_open" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      from: string;
      to: string;
    };
    expect(body.ok).toBe(true);
    expect(body.from).toBe("dates_validated");
    expect(body.to).toBe("collection_open");

    expect(mocks.createActivityLog).toHaveBeenCalledTimes(1);
    const call = mocks.createActivityLog.mock.calls[0][0];
    expect(call.eventType).toBe("session_status_changed");
    expect(call.sessionId).toBe("sess-1");
    expect(call.entityType).toBe("training_session");
    expect(call.entityId).toBe("sess-1");
    expect(call.metadata).toEqual({
      from: "dates_validated",
      to: "collection_open",
    });
    expect(call.actorId).toBe(COMMERCIAL_B.id);
  });
});
