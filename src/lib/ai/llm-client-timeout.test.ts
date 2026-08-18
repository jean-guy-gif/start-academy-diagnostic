import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BuiltPrompt } from "./build-recommendation-prompt";
import { callLlm } from "./llm-client";

/**
 * Correctif 4 lot fiabilité (audit externe).
 *
 * Preuve directe que `callLlm` équipe l'appel OpenRouter d'un
 * `AbortSignal` — et que si `fetch` throw une AbortError (timeout OU
 * annulation), l'erreur remonte au caller, qui bascule alors sur le
 * fallback heuristique (route `/api/generate-training-proposal`
 * enveloppe déjà `callLlm` dans un try/catch dédié).
 *
 * On ne teste PAS l'API OpenRouter réelle ni le vrai timeout Node.
 * On teste le CONTRAT : l'AbortSignal est passé à fetch, et une
 * AbortError propage bien.
 */

const PROMPT: BuiltPrompt = { system: "S", user: "U" };

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

describe("callLlm — timeout via AbortSignal (correctif 4)", () => {
  it("passe un AbortSignal à fetch (jamais d'appel sans horloge morte)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
      })
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await callLlm(PROMPT);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("propage une AbortError (chemin fallback route testé implicitement par le try/catch de la route)", async () => {
    const abortErr = new DOMException(
      "The operation was aborted",
      "AbortError"
    );
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(abortErr) as unknown as typeof fetch;

    await expect(callLlm(PROMPT)).rejects.toBe(abortErr);
    // Contrat aval : la route rattrape cette erreur dans son try/catch
    // et bascule sur `buildHeuristicProposal` — comportement déjà
    // exercé par le test end-to-end existant sur la génération
    // fallback (aucun ré-test ici, on vérifie uniquement la
    // propagation qui rend la bascule possible).
  });

  it("propage une TimeoutError (AbortSignal.timeout expiré côté prod)", async () => {
    const timeoutErr = new DOMException(
      "The operation timed out",
      "TimeoutError"
    );
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(timeoutErr) as unknown as typeof fetch;

    await expect(callLlm(PROMPT)).rejects.toBe(timeoutErr);
  });
});
