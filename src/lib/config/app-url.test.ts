import { afterEach, describe, expect, it, vi } from "vitest";

import { absoluteAppUrl } from "./app-url";

/**
 * Tests unitaires de `absoluteAppUrl()`.
 *
 * Politique verrouillée :
 *   • Var définie (dev ou prod) → renvoie la valeur sans slash final.
 *   • Var manquante en prod    → THROW explicite (invariant critique :
 *     empêche un lien `localhost` ou une URL de déploiement instable
 *     Vercel de partir dans un email à un dirigeant externe).
 *   • Var manquante en dev     → fallback silencieux `http://localhost:3000`.
 *
 * Politique de mock : `vi.stubEnv()` — l'assignation directe de
 * `process.env.NODE_ENV` est refusée au typecheck (readonly type Node).
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("absoluteAppUrl", () => {
  it("var définie en production → renvoie la valeur sans slash final", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "NEXT_PUBLIC_APP_URL",
      "https://start-academy-diagnostic.vercel.app"
    );
    expect(absoluteAppUrl()).toBe(
      "https://start-academy-diagnostic.vercel.app"
    );
  });

  it("var définie avec slash final → slash retiré", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "NEXT_PUBLIC_APP_URL",
      "https://start-academy-diagnostic.vercel.app/"
    );
    expect(absoluteAppUrl()).toBe(
      "https://start-academy-diagnostic.vercel.app"
    );
  });

  it("var manquante en PRODUCTION → THROW explicite", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(() => absoluteAppUrl()).toThrowError(
      /NEXT_PUBLIC_APP_URL manquante en production/
    );
  });

  it("var whitespace only en PRODUCTION → THROW", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "   ");
    expect(() => absoluteAppUrl()).toThrowError();
  });

  it("var manquante en DEV → fallback http://localhost:3000", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(absoluteAppUrl()).toBe("http://localhost:3000");
  });

  it("var manquante en TEST (non-production) → fallback localhost", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(absoluteAppUrl()).toBe("http://localhost:3000");
  });

  it("var définie en DEV → prend la valeur, jamais le fallback", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://dev.example.com");
    expect(absoluteAppUrl()).toBe("http://dev.example.com");
  });
});
