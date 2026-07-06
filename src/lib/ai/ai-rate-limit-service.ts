import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Rate limiting léger pour les routes IA OpenRouter.
 *
 * Stratégie MVP — fenêtre glissante simple basée sur la table
 * `ai_generation_logs` :
 *   - Pas de table dédiée, pas de Redis.
 *   - Pas de cache mémoire (serveur Next stateless → invalidé entre
 *     les requêtes).
 *   - Compte les lignes `ai_generation_logs` où
 *     `created_by = userId AND route = ? AND created_at >= now() - window`.
 *
 * Comme `created_by` est posé par la route IA (cf. `logAiGeneration`
 * appelée à la fin de chaque génération avec `auth.profile.id`), le
 * comptage est fiable dès qu'au moins une génération a abouti.
 *
 * Limites de cette approche (cf. `docs/ai-rate-limiting-prd.md`) :
 *   - Décompte uniquement les appels qui ont atteint `logAiGeneration`
 *     (en succès, fallback, erreur ou rate_limited). Un appel
 *     interrompu avant logging ne compte pas — acceptable car le
 *     budget OpenRouter est consommé seulement quand l'appel LLM
 *     part effectivement.
 *   - Pas de protection contre un burst dans une même milliseconde
 *     (lecture/écriture non transactionnelle).
 *
 * Évolutions futures : Redis / Upstash pour précision sub-seconde,
 * rate limit par IP en plus du user, budget mensuel global.
 */

export interface AiRouteLimit {
  windowMinutes: number;
  maxCalls: number;
}

/**
 * Limites par défaut. Modifiables via env si besoin (hors scope MVP —
 * éditer cette constante et redéployer).
 */
export const AI_ROUTE_LIMITS: Record<string, AiRouteLimit> = {
  "/api/analyze-training-need": { windowMinutes: 60, maxCalls: 20 },
  "/api/generate-training-proposal": { windowMinutes: 60, maxCalls: 15 },
  "/api/generate-training-support": { windowMinutes: 60, maxCalls: 8 },
  "/api/design-training-support": { windowMinutes: 60, maxCalls: 6 },
};

export function getAiRouteLimit(route: string): AiRouteLimit | null {
  return AI_ROUTE_LIMITS[route] ?? null;
}

export type AiRateLimitResult =
  | {
      ok: true;
      allowed: true;
      remaining: number;
      limit: number;
      currentCount: number;
      resetAt: string;
    }
  | {
      ok: true;
      allowed: false;
      remaining: 0;
      limit: number;
      currentCount: number;
      resetAt: string;
    }
  | {
      ok: false;
      reason: "unconfigured" | "supabase_unavailable" | "query_failed";
    };

export interface CheckAiRateLimitInput {
  userId: string;
  route: string;
  /** Override le défaut (ex. tests). */
  windowMinutes?: number;
  maxCalls?: number;
}

/**
 * Vérifie si l'utilisateur a dépassé la limite sur une route.
 * **NE PAS APPELER** avant le check d'auth + ownership — la lecture
 * est inutile si la requête est de toute façon refusée.
 *
 * Renvoie `{ ok: false, ... }` si la configuration / Supabase est
 * indisponible. Comportement caller recommandé : **autoriser l'appel
 * en cas d'échec interne** (failopen — éviter de bloquer la prod sur
 * une panne mineure). Le caller décide en fonction du `reason`.
 */
export async function checkAiRateLimit(
  input: CheckAiRateLimitInput
): Promise<AiRateLimitResult> {
  const defaults = getAiRouteLimit(input.route);
  if (!defaults) {
    return { ok: false, reason: "unconfigured" };
  }
  const windowMinutes = input.windowMinutes ?? defaults.windowMinutes;
  const limit = input.maxCalls ?? defaults.maxCalls;

  const client = createSupabaseAdminClient();
  if (!client) {
    return { ok: false, reason: "supabase_unavailable" };
  }

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  try {
    const { count, error } = await client
      .from("ai_generation_logs")
      .select("id", { count: "exact", head: true })
      .eq("created_by", input.userId)
      .eq("route", input.route)
      .gte("created_at", windowStart.toISOString());

    if (error || count === null) {
      return { ok: false, reason: "query_failed" };
    }

    // Reset approximatif : le slot le plus ancien expire au plus tard
    // dans `windowMinutes`. Pour MVP on reste sur cette borne haute
    // (jamais menteuse, parfois trop pessimiste).
    const resetAt = new Date(
      Date.now() + windowMinutes * 60 * 1000
    ).toISOString();

    if (count >= limit) {
      return {
        ok: true,
        allowed: false,
        remaining: 0,
        limit,
        currentCount: count,
        resetAt,
      };
    }
    return {
      ok: true,
      allowed: true,
      remaining: limit - count,
      limit,
      currentCount: count,
      resetAt,
    };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}

/**
 * Réponse HTTP 429 standardisée. À retourner depuis la route quand
 * `result.ok && !result.allowed`.
 */
export function formatRateLimitError(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "rate_limited",
      error: "Limite d'usage IA atteinte. Réessayez plus tard.",
    },
    { status: 429 }
  );
}

/**
 * Helper de journalisation pour les refus rate-limit. Les routes
 * appellent `logAiGeneration({ status: "rate_limited", source: null,
 * createdBy: userId, route, errorMessage })` directement pour tracer
 * la tentative bloquée dans `ai_generation_logs`. Le cockpit
 * remonte ces lignes via `AiUsageSummary.rateLimited7Days`.
 */
