import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests T-8-BIS — pré-condition de statut session pour le bilan
 * post-formation.
 *
 * Contrats vérifiés :
 *   • GET/PUT sur session en `created` → 409 `session_status_precondition`
 *     + review NON lue, NON écrite, NON loggée.
 *   • GET/PUT sur session en `delivered` → 200 + review lue/écrite,
 *     event standard `post_training_review_created/updated/completed`.
 *   • PUT sur session en `report_sent` → 200 + event
 *     `post_training_review_modified_after_send` (trace de divergence
 *     avec la version reçue par le client).
 *
 * Politique de mock : on isole la route de la couche DB en mockant
 * `getSessionStatusById`, `getPostTrainingReviewBySession`,
 * `createPostTrainingReview`, `updatePostTrainingReview`.
 */

vi.mock("@/lib/auth/require-api-role", () => ({
  requireApiRole: vi.fn(),
}));
vi.mock("@/lib/auth/assert-session-access", () => ({
  assertCanAccessSession: vi.fn(),
}));
vi.mock("@/lib/sessions/session-status-service", () => ({
  getSessionStatusById: vi.fn(),
}));
vi.mock("@/lib/post-training/post-training-service", () => ({
  calculatePostTrainingAverageScore: vi.fn().mockReturnValue({
    averageScore: 8,
    scoresCount: 4,
  }),
  createPostTrainingReview: vi.fn(),
  getPostTrainingReviewBySession: vi.fn(),
  updatePostTrainingReview: vi.fn(),
}));
vi.mock("@/lib/activity/activity-log-service", () => ({
  createActivityLog: vi.fn().mockResolvedValue(null),
}));

async function importMocks() {
  const auth = await import("@/lib/auth/require-api-role");
  const access = await import("@/lib/auth/assert-session-access");
  const svcStatus = await import("@/lib/sessions/session-status-service");
  const svcReview = await import("@/lib/post-training/post-training-service");
  const log = await import("@/lib/activity/activity-log-service");
  return {
    requireApiRole: vi.mocked(auth.requireApiRole),
    assertCanAccessSession: vi.mocked(access.assertCanAccessSession),
    getSessionStatusById: vi.mocked(svcStatus.getSessionStatusById),
    getPostTrainingReviewBySession: vi.mocked(
      svcReview.getPostTrainingReviewBySession
    ),
    createPostTrainingReview: vi.mocked(svcReview.createPostTrainingReview),
    updatePostTrainingReview: vi.mocked(svcReview.updatePostTrainingReview),
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

const FAKE_REVIEW = {
  id: "rev-1",
  sessionId: "sess-1",
  reviewerId: "userB",
  reviewerName: "Commercial B",
  reviewType: "internal" as const,
  status: "draft" as const,
  satisfactionScore: 8,
  perceivedValueScore: 8,
  contentRelevanceScore: 8,
  actionabilityScore: 8,
  keySuccesses: [] as string[],
  keyBlockers: [] as string[],
  followUpActions: [] as never[],
  trainerNotes: null,
  directorFeedback: null,
  participantFeedbackSummary: null,
  nextCommercialOpportunity: null,
  metadata: {},
  createdAt: "2026-07-12T00:00:00Z",
  updatedAt: "2026-07-12T00:00:00Z",
};

function requestFor(method: "GET" | "PUT", body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request("http://x", init);
}

async function callGet(sessionId = "sess-1") {
  const { GET } = await import("./[id]/post-training-review/route");
  const ctx = { params: Promise.resolve({ id: sessionId }) };
  return GET(requestFor("GET"), ctx);
}

async function callPut(body: unknown, sessionId = "sess-1") {
  const { PUT } = await import("./[id]/post-training-review/route");
  const ctx = { params: Promise.resolve({ id: sessionId }) };
  return PUT(requestFor("PUT", body), ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-8-BIS pré-condition — GET post-training-review", () => {
  it("session en `created` → 409 session_status_precondition + review NON lue", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("created");

    const res = await callGet();
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      code: string;
      error: string;
      currentStatus: string;
    };
    expect(body.code).toBe("session_status_precondition");
    expect(body.error).toContain("Formation réalisée");
    expect(body.currentStatus).toBe("created");
    // Le service review n'est PAS invoqué.
    expect(mocks.getPostTrainingReviewBySession).not.toHaveBeenCalled();
  });

  it("session en `delivered` → 200 + review renvoyée", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("delivered");
    mocks.getPostTrainingReviewBySession.mockResolvedValue(FAKE_REVIEW);

    const res = await callGet();
    expect(res.status).toBe(200);
    expect(mocks.getPostTrainingReviewBySession).toHaveBeenCalledWith("sess-1");
  });

  it("session en `report_sent` → 200 (autorisé pour lecture)", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("report_sent");
    mocks.getPostTrainingReviewBySession.mockResolvedValue(FAKE_REVIEW);

    const res = await callGet();
    expect(res.status).toBe(200);
  });
});

describe("T-8-BIS pré-condition — PUT post-training-review", () => {
  it("session en `created` → 409 + NI createReview NI updateReview NI activity_log", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("created");

    const res = await callPut({ satisfactionScore: 8 });
    expect(res.status).toBe(409);
    expect(mocks.createPostTrainingReview).not.toHaveBeenCalled();
    expect(mocks.updatePostTrainingReview).not.toHaveBeenCalled();
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });

  it("session en `support_ready` → 409 (juste avant delivered)", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("support_ready");

    const res = await callPut({ satisfactionScore: 8 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { currentStatus: string };
    expect(body.currentStatus).toBe("support_ready");
  });

  it("session en `delivered` — CREATE : event `post_training_review_created`, sessionStatusAtWrite=delivered", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("delivered");
    mocks.getPostTrainingReviewBySession.mockResolvedValue(null);
    mocks.createPostTrainingReview.mockResolvedValue(FAKE_REVIEW);

    const res = await callPut({ satisfactionScore: 8 });
    expect(res.status).toBe(200);
    expect(mocks.createActivityLog).toHaveBeenCalledTimes(1);
    const call = mocks.createActivityLog.mock.calls[0][0];
    expect(call.eventType).toBe("post_training_review_created");
    expect(call.metadata?.sessionStatusAtWrite).toBe("delivered");
  });

  it("session en `delivered` — UPDATE completed : event `post_training_review_completed`", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("delivered");
    mocks.getPostTrainingReviewBySession.mockResolvedValue(FAKE_REVIEW);
    mocks.updatePostTrainingReview.mockResolvedValue({
      ...FAKE_REVIEW,
      status: "completed",
    });

    const res = await callPut({ status: "completed" });
    expect(res.status).toBe(200);
    const call = mocks.createActivityLog.mock.calls[0][0];
    expect(call.eventType).toBe("post_training_review_completed");
  });

  it("session en `report_sent` — event `post_training_review_modified_after_send` (divergence tracée)", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.getSessionStatusById.mockResolvedValue("report_sent");
    mocks.getPostTrainingReviewBySession.mockResolvedValue(FAKE_REVIEW);
    mocks.updatePostTrainingReview.mockResolvedValue(FAKE_REVIEW);

    const res = await callPut({ directorFeedback: "Correction post-envoi" });
    expect(res.status).toBe(200);
    expect(mocks.createActivityLog).toHaveBeenCalledTimes(1);
    const call = mocks.createActivityLog.mock.calls[0][0];
    // Preuve du fix nuance 2 : event distinct pour tracer la divergence.
    expect(call.eventType).toBe("post_training_review_modified_after_send");
    expect(call.metadata?.sessionStatusAtWrite).toBe("report_sent");
  });

  it("owner-mismatch → 403 + getSessionStatusById JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: COMMERCIAL_B });
    mocks.assertCanAccessSession.mockResolvedValue({
      ok: false as const,
      response: NextResponse.json(
        { ok: false, code: "forbidden" },
        { status: 403 }
      ),
    });

    const res = await callPut({ satisfactionScore: 8 });
    expect(res.status).toBe(403);
    // Preuve : la garde d'ownership est bien AVANT toute lecture DB.
    expect(mocks.getSessionStatusById).not.toHaveBeenCalled();
  });
});
