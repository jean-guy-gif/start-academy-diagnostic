import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Tests d'ownership T-9 + T-10a + T-10b (2026-07-09).
 *
 * Ces tests prouvent le refus cross-commercial sur les 7 points
 * d'entrée durcis. Approche : on mock les helpers d'auth et le client
 * Supabase, et on vérifie deux choses par test :
 *   • Owner-mismatch → HTTP 403, ET le service_role ne doit pas
 *     avoir été appelé (l'assertion doit bloquer AVANT la DB).
 *   • Le retrait de l'appel `assertCanAccessDiagnostic|Client|Session`
 *     ferait échouer ces tests — c'est le garde-fou anti-régression.
 */

// ─── Mocks partagés ──────────────────────────────────────────────

vi.mock("@/lib/auth/require-api-role", () => ({
  requireApiRole: vi.fn(),
}));
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/auth/assert-diagnostic-access", () => ({
  assertCanAccessDiagnostic: vi.fn(),
}));
vi.mock("@/lib/auth/assert-client-access", () => ({
  assertCanAccessClient: vi.fn(),
}));
vi.mock("@/lib/auth/assert-session-access", () => ({
  assertCanAccessSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseRouteHandlerClient: vi.fn(),
}));
vi.mock("@/lib/diagnostics/refresh-snapshots", () => ({
  refreshDiagnosticSnapshots: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/activity/activity-log-service", () => ({
  createActivityLog: vi.fn().mockResolvedValue(null),
  listRecentActivity: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/diagnostics/diagnostic-participants-service", () => ({
  listDiagnosticParticipants: vi.fn().mockResolvedValue([]),
  replaceDiagnosticParticipants: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/email/gmail-draft-service", () => ({
  isGmailDraftAvailable: vi.fn().mockReturnValue(false),
  createGmailDraft: vi.fn().mockResolvedValue({
    ok: false,
    code: "not_configured",
    message: "n/a",
  }),
}));

// ─── Helpers de mock ─────────────────────────────────────────────

async function importMocks() {
  const requireModule = await import("@/lib/auth/require-api-role");
  const currentModule = await import("@/lib/auth/get-current-user");
  const diagMod = await import("@/lib/auth/assert-diagnostic-access");
  const clientMod = await import("@/lib/auth/assert-client-access");
  const sessMod = await import("@/lib/auth/assert-session-access");
  const supaMod = await import("@/lib/supabase/server");
  return {
    requireApiRole: vi.mocked(requireModule.requireApiRole),
    getCurrentProfile: vi.mocked(currentModule.getCurrentProfile),
    assertCanAccessDiagnostic: vi.mocked(diagMod.assertCanAccessDiagnostic),
    assertCanAccessClient: vi.mocked(clientMod.assertCanAccessClient),
    assertCanAccessSession: vi.mocked(sessMod.assertCanAccessSession),
    createSupabaseAdminClient: vi.mocked(supaMod.createSupabaseAdminClient),
    createSupabaseRouteHandlerClient: vi.mocked(
      supaMod.createSupabaseRouteHandlerClient
    ),
  };
}

const OTHER_B = {
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests par route ─────────────────────────────────────────────

describe("T-9 #1 — GET /api/diagnostics (liste racine, RLS-aware)", () => {
  it("bascule sur le client route-handler cookie (createSupabaseRouteHandlerClient)", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: OTHER_B });
    // Le RLS-aware client renvoie [] naturellement (aucune ligne owner B).
    mocks.createSupabaseRouteHandlerClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://x/api/diagnostics"));
    expect(res.status).toBe(200);
    expect(mocks.createSupabaseRouteHandlerClient).toHaveBeenCalled();
    // Preuve du fix : createSupabaseAdminClient NE doit PAS être appelé
    // sur la liste racine (bypass RLS interdit après T-9).
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    const body = (await res.json()) as { ok: boolean; items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

describe("T-9 #2 — GET /api/diagnostics/[id]/summary", () => {
  it("owner-mismatch → 403 + service_role JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: OTHER_B });
    mocks.assertCanAccessDiagnostic.mockResolvedValue(forbid());
    const { GET } = await import("./[id]/summary/route");
    const ctx = { params: Promise.resolve({ id: "DIAG_A" }) };
    const res = await GET(new Request("http://x"), ctx);
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessDiagnostic).toHaveBeenCalledWith(
      OTHER_B,
      "DIAG_A"
    );
    // Preuve du fix : service_role bloqué en amont.
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

describe("T-9 #3 — POST /api/diagnostics/[id]/answers", () => {
  it("owner-mismatch → 403 + service_role JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: OTHER_B });
    mocks.assertCanAccessDiagnostic.mockResolvedValue(forbid());
    const { POST } = await import("./[id]/answers/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        questionId: "q1",
        questionText: "Q1",
        answer: "A",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: "DIAG_A" }) };
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessDiagnostic).toHaveBeenCalledWith(
      OTHER_B,
      "DIAG_A"
    );
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

describe("T-9 #4 — PATCH /api/diagnostics/[id]/status", () => {
  it("owner-mismatch → 403 + service_role JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: OTHER_B });
    mocks.assertCanAccessDiagnostic.mockResolvedValue(forbid());
    const { PATCH } = await import("./[id]/status/route");
    const req = new Request("http://x", {
      method: "PATCH",
      body: JSON.stringify({ status: "to_review" }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: "DIAG_A" }) };
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessDiagnostic).toHaveBeenCalledWith(
      OTHER_B,
      "DIAG_A"
    );
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

describe("T-9 #5 — GET/PUT /api/diagnostics/[id]/participants", () => {
  it("GET owner-mismatch → 403 + service participants JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.getCurrentProfile.mockResolvedValue(OTHER_B);
    mocks.assertCanAccessDiagnostic.mockResolvedValue(forbid());
    const { GET } = await import("./[id]/participants/route");
    const ctx = { params: Promise.resolve({ id: "DIAG_A" }) };
    const res = await GET(new Request("http://x"), ctx);
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessDiagnostic).toHaveBeenCalledWith(
      OTHER_B,
      "DIAG_A"
    );
    const svc = await import("@/lib/diagnostics/diagnostic-participants-service");
    expect(svc.listDiagnosticParticipants).not.toHaveBeenCalled();
  });

  it("PUT owner-mismatch → 403 + replaceDiagnosticParticipants JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.getCurrentProfile.mockResolvedValue(OTHER_B);
    mocks.assertCanAccessDiagnostic.mockResolvedValue(forbid());
    const { PUT } = await import("./[id]/participants/route");
    const req = new Request("http://x", {
      method: "PUT",
      body: JSON.stringify({ participants: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { params: Promise.resolve({ id: "DIAG_A" }) };
    const res = await PUT(req, ctx);
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessDiagnostic).toHaveBeenCalledWith(
      OTHER_B,
      "DIAG_A"
    );
    const svc = await import("@/lib/diagnostics/diagnostic-participants-service");
    expect(svc.replaceDiagnosticParticipants).not.toHaveBeenCalled();
  });
});

describe("T-10a — POST /api/diagnostics/create : client-mismatch → 403", () => {
  it("clientId owner-mismatch → 403 + insert JAMAIS tenté", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: OTHER_B });
    mocks.assertCanAccessClient.mockResolvedValue(forbid());
    const { POST } = await import("./create/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        clientId: "00000000-0000-0000-0000-000000000000",
        mode: "guided",
        profilesInScope: [],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessClient).toHaveBeenCalledWith(
      OTHER_B,
      "00000000-0000-0000-0000-000000000000"
    );
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

describe("T-10b — POST /api/email/create-draft : session-mismatch → 403", () => {
  it("sessionId owner-mismatch → 403 + createGmailDraft JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.getCurrentProfile.mockResolvedValue(OTHER_B);
    mocks.assertCanAccessSession.mockResolvedValue(forbid());
    const { POST } = await import("../email/create-draft/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        to: "x@y.test",
        subject: "s",
        body: "b",
        sessionId: "SESS_A",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mocks.assertCanAccessSession).toHaveBeenCalledWith(
      OTHER_B,
      "SESS_A"
    );
    const gmail = await import("@/lib/email/gmail-draft-service");
    expect(gmail.createGmailDraft).not.toHaveBeenCalled();
  });

  it("aucun ID → aucune assertion, la route passe (draft libre autorisé)", async () => {
    const mocks = await importMocks();
    mocks.getCurrentProfile.mockResolvedValue(OTHER_B);
    const gmailMod = await import("@/lib/email/gmail-draft-service");
    vi.mocked(gmailMod.isGmailDraftAvailable).mockReturnValue(false);
    const { POST } = await import("../email/create-draft/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ to: "x@y.test", subject: "s", body: "b" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    // Sans ID → assertion JAMAIS appelée. La route court-circuite sur
    // not_configured (HTTP 200 + code = "not_configured").
    expect(mocks.assertCanAccessSession).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
