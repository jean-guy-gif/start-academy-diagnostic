import "server-only";

import type { BuiltPrompt } from "./build-recommendation-prompt";

/**
 * Client LLM via OpenRouter — passerelle unique vers les modèles externes.
 *
 * Variables d'environnement (server-only) :
 *   - OPENROUTER_API_KEY   : requise pour activer l'IA externe
 *   - OPENROUTER_MODEL     : ex. "anthropic/claude-3.5-sonnet" (défaut)
 *   - OPENROUTER_SITE_URL  : passée en HTTP-Referer (analytics OpenRouter)
 *   - OPENROUTER_APP_NAME  : passée en X-Title (analytics OpenRouter)
 *
 * Si la clé est absente OU que la requête échoue, `callLlm()` renvoie
 * `null` et l'API bascule automatiquement sur le moteur heuristique
 * local (cf. src/lib/ai/heuristic-recommendation.ts).
 *
 * `server-only` casse le build si ce module est importé par un composant
 * client : la clé OpenRouter ne quitte donc jamais le serveur.
 */

/**
 * Modèle Anthropic par défaut sur OpenRouter.
 *
 * Note : `anthropic/claude-3.5-sonnet` a été retiré du catalogue
 * OpenRouter (404). Le successeur direct dans la même gamme
 * Sonnet est `anthropic/claude-sonnet-4.5`. Toujours overridable via
 * la variable d'environnement `OPENROUTER_MODEL`.
 */
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

/**
 * Budget de sortie par défaut. 8192 couvre les générations longues
 * (support designé avec ~50 slides). Le code clampe la valeur dans
 * [1024, 12000] pour éviter les valeurs aberrantes ou des coûts
 * incontrôlés. Overridable via `OPENROUTER_MAX_TOKENS`.
 */
const OPENROUTER_DEFAULT_MAX_TOKENS = 8192;
const OPENROUTER_MIN_MAX_TOKENS = 1024;

/**
 * Correctif 4 lot fiabilité (audit externe) — plus jamais d'appel
 * OpenRouter sans horloge morte. Une génération qui pend au-delà de
 * cette limite est abandonnée côté client HTTP et le caller bascule
 * sur le fallback heuristique (comportement testé au niveau route).
 *
 * 55 s laisse une marge confortable sous la limite `maxDuration = 60`
 * exportée par la route `/api/generate-training-proposal`, pour que
 * le fallback ait le temps de calculer et de renvoyer une réponse
 * avant l'expiration serverless.
 */
const OPENROUTER_DEFAULT_TIMEOUT_MS = 55_000;

function resolveTimeoutMs(): number {
  const raw = process.env.OPENROUTER_TIMEOUT_MS;
  if (!raw) return OPENROUTER_DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return OPENROUTER_DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}
// Hard cap relevé pour absorber les routes longues
// (`/generate-training-support` produit ~10 k tokens pour 9 modules,
// `/design-training-support` peut dépasser 14 k tokens sur 50+ slides
// quand le style Start Academy / NXT Performance accepte un déroulé
// dynamique). 20000 reste un cap défensif côté plateforme : on
// limite la sortie même si Sonnet 4.5 accepte au-delà.
const OPENROUTER_HARD_MAX_TOKENS = 20000;

function resolveMaxTokens(): number {
  const raw = process.env.OPENROUTER_MAX_TOKENS;
  if (!raw) return OPENROUTER_DEFAULT_MAX_TOKENS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return OPENROUTER_DEFAULT_MAX_TOKENS;
  if (parsed < OPENROUTER_MIN_MAX_TOKENS) return OPENROUTER_DEFAULT_MAX_TOKENS;
  if (parsed > OPENROUTER_HARD_MAX_TOKENS) return OPENROUTER_HARD_MAX_TOKENS;
  return parsed;
}

export interface LlmCallResult {
  content: string;
  provider: "openrouter";
  model: string;
  raw?: unknown;
}

interface OpenRouterChoice {
  message?: { role?: string; content?: string };
}

interface OpenRouterResponse {
  model?: string;
  choices?: OpenRouterChoice[];
}

export async function callLlm(
  prompt: BuiltPrompt
): Promise<LlmCallResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL ?? OPENROUTER_DEFAULT_MODEL;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }

  // `max_tokens` borné via `resolveMaxTokens` :
  //   - défaut 8192 (couvre un support designé complet).
  //   - clampé dans [1024, 12000].
  //   - fallback au défaut si la valeur env est invalide.
  const maxTokens = resolveMaxTokens();

  const body = {
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  };

  // Correctif 4 : AbortSignal.timeout — l'appel est abandonné après
  // OPENROUTER_TIMEOUT_MS (défaut 55 s). Un timeout throw une
  // `TimeoutError`/`AbortError` que le caller route rattrape et convertit
  // en bascule fallback heuristique.
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(resolveTimeoutMs()),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter request failed (${response.status}): ${detail.slice(0, 500)}`
    );
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content ?? "";

  return {
    content,
    provider: "openrouter",
    model: data.model ?? model,
    raw: data,
  };
}

/**
 * Extrait le premier objet JSON d'un texte LLM, même s'il est entouré
 * de markdown / commentaires (certains modèles ignorent `response_format`).
 * Lève si rien d'analysable.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  // Fenced code block: ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  // Direct parse first
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through */
  }

  // Bracket extraction for the largest top-level object
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Aucun objet JSON détecté dans la réponse LLM.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
