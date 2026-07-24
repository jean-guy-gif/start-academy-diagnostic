import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isLocalFallbackAllowed } from "./local-fallback";

/**
 * Chantier fallback fail-closed (2026-07-24) : la fonction ne retourne
 * `true` QUE dans deux cas explicites — `NEXT_PUBLIC_APP_ENV='local'`
 * ou `NODE_ENV='development'` sans APP_ENV. Toute autre configuration
 * (preprod, production, undefined avec NODE_ENV=production, valeurs
 * inattendues) retourne `false`. Aucun repli sur
 * `DISABLE_LOCAL_FALLBACK` ni sur « Supabase non configuré ».
 */

const ORIGINAL_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function setEnv(appEnv: string | undefined, nodeEnv: string | undefined) {
  if (appEnv === undefined) delete process.env.NEXT_PUBLIC_APP_ENV;
  else process.env.NEXT_PUBLIC_APP_ENV = appEnv;
  if (nodeEnv === undefined) delete (process.env as Record<string, string>).NODE_ENV;
  else (process.env as Record<string, string>).NODE_ENV = nodeEnv;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  setEnv(ORIGINAL_APP_ENV, ORIGINAL_NODE_ENV);
});

describe("isLocalFallbackAllowed — fail-closed", () => {
  it("NEXT_PUBLIC_APP_ENV=local → true (mode dev explicite)", () => {
    setEnv("local", "development");
    expect(isLocalFallbackAllowed()).toBe(true);
  });

  it("NEXT_PUBLIC_APP_ENV=Local (mixed case) → true", () => {
    setEnv("Local", "development");
    expect(isLocalFallbackAllowed()).toBe(true);
  });

  it("APP_ENV absent + NODE_ENV=development → true (dev pur)", () => {
    setEnv(undefined, "development");
    expect(isLocalFallbackAllowed()).toBe(true);
  });

  it("NEXT_PUBLIC_APP_ENV=preprod → false", () => {
    setEnv("preprod", "production");
    expect(isLocalFallbackAllowed()).toBe(false);
  });

  it("NEXT_PUBLIC_APP_ENV=production → false", () => {
    setEnv("production", "production");
    expect(isLocalFallbackAllowed()).toBe(false);
  });

  it("APP_ENV absent + NODE_ENV=production → false (fail-closed strict)", () => {
    setEnv(undefined, "production");
    expect(isLocalFallbackAllowed()).toBe(false);
  });

  it("NEXT_PUBLIC_APP_ENV=quelquechose-inattendu → false", () => {
    setEnv("staging", "production");
    expect(isLocalFallbackAllowed()).toBe(false);
  });

  it("APP_ENV vide '' → false", () => {
    setEnv("", "production");
    expect(isLocalFallbackAllowed()).toBe(false);
  });

  it("aucun repli sur DISABLE_LOCAL_FALLBACK (jamais consulté)", () => {
    setEnv("preprod", "production");
    process.env.DISABLE_LOCAL_FALLBACK = "false";
    expect(isLocalFallbackAllowed()).toBe(false);
    delete process.env.DISABLE_LOCAL_FALLBACK;
  });
});
