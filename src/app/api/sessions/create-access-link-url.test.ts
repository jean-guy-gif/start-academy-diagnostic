import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Test de non-régression — la route
 * `POST /api/sessions/[id]/create-access-link` DOIT renvoyer une
 * URL absolue commençant par `http` (et non un path relatif).
 *
 * Retour au comportement historique (renvoi d'un path relatif type
 * `/public/session/…`, préfixé côté client par `window.location.origin`)
 * ferait échouer ce test. Motif produit : les liens envoyés à un
 * dirigeant externe doivent porter l'URL stable configurée dans
 * `NEXT_PUBLIC_APP_URL`, pas l'URL de déploiement instable Vercel.
 */

vi.mock("@/lib/auth/require-api-role", () => ({
  requireApiRole: vi.fn(),
}));
vi.mock("@/lib/auth/assert-session-access", () => ({
  assertCanAccessSession: vi.fn(),
}));
vi.mock("@/lib/public-access/public-token-service", () => ({
  generatePublicToken: vi.fn(),
}));
vi.mock("@/lib/config/app-url", () => ({
  absoluteAppUrl: vi.fn(),
}));
vi.mock("@/lib/activity/activity-log-service", () => ({
  createActivityLog: vi.fn().mockResolvedValue(null),
}));

async function importMocks() {
  const auth = await import("@/lib/auth/require-api-role");
  const access = await import("@/lib/auth/assert-session-access");
  const token = await import("@/lib/public-access/public-token-service");
  const url = await import("@/lib/config/app-url");
  return {
    requireApiRole: vi.mocked(auth.requireApiRole),
    assertCanAccessSession: vi.mocked(access.assertCanAccessSession),
    generatePublicToken: vi.mocked(token.generatePublicToken),
    absoluteAppUrl: vi.mocked(url.absoluteAppUrl),
  };
}

const PROFILE = {
  id: "user-1",
  role: "commercial" as const,
  email: "u@t.test",
  full_name: "User",
  organization: null,
};

async function callRoute(body: unknown, sessionId = "sess-1") {
  const { POST } = await import("./[id]/create-access-link/route");
  const req = new Request("http://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const ctx = { params: Promise.resolve({ id: sessionId }) };
  return POST(req, ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sessions/[id]/create-access-link — URL absolue (fix Vercel)", () => {
  it("renvoie une URL absolue préfixée par absoluteAppUrl()", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: PROFILE });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.absoluteAppUrl.mockReturnValue(
      "https://start-academy-diagnostic.vercel.app"
    );
    mocks.generatePublicToken.mockResolvedValue({
      id: "tok-id",
      accessType: "client_session_view",
      publicPath: "/public/session/rawtoken123",
      token: "rawtoken123",
      expiresAt: null,
      maxUses: null,
      sessionId: "sess-1",
      tokenHash: "hash",
    } as never);

    const res = await callRoute({ accessType: "client_session_view" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { url: string };
    // Preuve du fix : URL absolue.
    expect(body.url).toMatch(/^https?:\/\//);
    expect(body.url).toBe(
      "https://start-academy-diagnostic.vercel.app/public/session/rawtoken123"
    );
    // Preuve de non-régression : n'est PLUS un path relatif.
    expect(body.url.startsWith("/")).toBe(false);
    // absoluteAppUrl a bien été invoquée (preuve que la source unique
    // sert de préfixe).
    expect(mocks.absoluteAppUrl).toHaveBeenCalledOnce();
  });

  it("échoue explicitement si absoluteAppUrl throw (invariant prod)", async () => {
    const mocks = await importMocks();
    mocks.requireApiRole.mockResolvedValue({ ok: true, profile: PROFILE });
    mocks.assertCanAccessSession.mockResolvedValue({ ok: true });
    mocks.absoluteAppUrl.mockImplementation(() => {
      throw new Error("NEXT_PUBLIC_APP_URL manquante en production. …");
    });
    mocks.generatePublicToken.mockResolvedValue({
      id: "tok-id",
      accessType: "participant_collect",
      publicPath: "/public/collect/rawtoken456",
      token: "rawtoken456",
      expiresAt: null,
      maxUses: null,
      sessionId: "sess-1",
      tokenHash: "hash",
    } as never);

    const res = await callRoute({ accessType: "participant_collect" });
    // La route encapsule les erreurs de génération en 500 — le message
    // doit inclure la trace de NEXT_PUBLIC_APP_URL.
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("generate_failed");
    expect(body.error).toContain("NEXT_PUBLIC_APP_URL");
  });
});
