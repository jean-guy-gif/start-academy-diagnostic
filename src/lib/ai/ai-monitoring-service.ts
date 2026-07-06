import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Service de monitoring IA / coûts OpenRouter.
 *
 * Règle d'or — un échec d'écriture ici ne DOIT JAMAIS faire échouer
 * une génération métier. Toutes les fonctions sont try/catchées,
 * silencieuses (console.warn), et retournent une valeur de fallback.
 *
 * Politique de données :
 *   - On ne persiste JAMAIS le prompt complet ni la réponse complète.
 *     Seuls les méta-paramètres techniques (route, modèle, durée,
 *     tokens, statut) et un éventuel `error.slice(0, 500)`.
 *   - On ne persiste AUCUNE clé OpenRouter, NI le diagnostic / support
 *     en clair.
 */

/**
 * Tarifs OpenRouter approximatifs en USD par 1M tokens (input / output).
 * Volontairement conservateur — utilisé pour donner un ordre de grandeur,
 * pas pour facturer le client. À mettre à jour quand un modèle change.
 *
 * Conversion EUR ≈ USD * EUR_PER_USD (constante figée pour le MVP).
 */
const MODEL_PRICING_USD_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  // Anthropic via OpenRouter — repères ~mai 2026 (à actualiser).
  "anthropic/claude-sonnet-4.5": { input: 3, output: 15 },
  "anthropic/claude-3.5-sonnet": { input: 3, output: 15 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4 },
  "anthropic/claude-3-opus": { input: 15, output: 75 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
};

const FALLBACK_PRICING_USD_PER_MTOK = { input: 2, output: 10 };
const EUR_PER_USD = 0.92;

export interface EstimateCostInput {
  model: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
}

/**
 * Coût estimé en euros. Renvoie null si les tokens sont absents
 * (OpenRouter ne renvoie pas toujours `usage`).
 */
export function estimateOpenRouterCost(input: EstimateCostInput): number | null {
  if (input.tokensInput === null && input.tokensOutput === null) return null;
  const pricing =
    input.model && MODEL_PRICING_USD_PER_MTOK[input.model]
      ? MODEL_PRICING_USD_PER_MTOK[input.model]
      : FALLBACK_PRICING_USD_PER_MTOK;
  const inTokens = input.tokensInput ?? 0;
  const outTokens = input.tokensOutput ?? 0;
  const usd =
    (inTokens / 1_000_000) * pricing.input +
    (outTokens / 1_000_000) * pricing.output;
  return Math.round(usd * EUR_PER_USD * 10_000) / 10_000;
}

export type AiGenerationStatus =
  | "success"
  | "fallback"
  | "error"
  | "partial"
  | "rate_limited";
export type AiGenerationSource = "llm" | "heuristic";

export interface LogAiGenerationInput {
  route: string;
  provider?: string | null;
  model?: string | null;
  /** `null` autorisé pour les lignes `rate_limited` (pas d'inférence IA). */
  source: AiGenerationSource | null;
  status: AiGenerationStatus;
  durationMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  sessionId?: string | null;
  diagnosticId?: string | null;
  recommendationId?: string | null;
  createdBy?: string | null;
  errorMessage?: string | null;
  fallbackReason?: string | null;
  /** Purpose libre déjà utilisé en MVP1 — kept for backwards compat. */
  purpose?: string | null;
}

/**
 * Écrit une ligne dans `ai_generation_logs`. JAMAIS bloquant.
 * Retourne l'id créé en cas de succès, null sinon.
 */
export async function logAiGeneration(
  input: LogAiGenerationInput
): Promise<string | null> {
  // Best-effort intégral : absorbe aussi un éventuel failfast
  // SUPABASE_SERVICE_ROLE_KEY en preprod/prod. La génération métier
  // doit toujours réussir, même si le monitoring est cassé.
  let client: ReturnType<typeof createSupabaseAdminClient>;
  try {
    client = createSupabaseAdminClient();
  } catch (err) {
    console.warn(
      "[ai-monitoring] Admin client indisponible — log IA ignoré:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
  if (!client) {
    console.warn("[ai-monitoring] Supabase non configuré — log IA ignoré.");
    return null;
  }
  try {
    const tokensInput = input.tokensInput ?? null;
    const tokensOutput = input.tokensOutput ?? null;
    const totalTokens =
      tokensInput === null && tokensOutput === null
        ? null
        : (tokensInput ?? 0) + (tokensOutput ?? 0);
    const cost = estimateOpenRouterCost({
      model: input.model ?? null,
      tokensInput,
      tokensOutput,
    });
    // `error` est tronqué pour ne pas pousser du payload sensible
    // dans le journal (un message OpenRouter peut citer le prompt).
    const errorTrimmed =
      input.errorMessage && input.errorMessage.length > 0
        ? input.errorMessage.slice(0, 500)
        : input.fallbackReason
          ? input.fallbackReason.slice(0, 500)
          : null;

    const { data, error } = await client
      .from("ai_generation_logs")
      .insert({
        route: input.route,
        purpose: input.purpose ?? input.route,
        provider: input.provider ?? "internal-heuristic",
        model: input.model ?? null,
        source: input.source,
        status: input.status,
        duration_ms: input.durationMs ?? null,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        total_tokens: totalTokens,
        cost_estimate: cost,
        session_id: input.sessionId ?? null,
        diagnostic_id: input.diagnosticId ?? null,
        recommendation_id: input.recommendationId ?? null,
        created_by: input.createdBy ?? null,
        error: errorTrimmed,
        // On ne persiste PAS prompt/response complets ; on garde la
        // colonne jsonb existante mais on l'écrit avec un résumé léger
        // (route + source) pour rester compatible avec le schéma MVP1.
        prompt: null,
        response: null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.warn(
        `[ai-monitoring] insert refusé pour ${input.route}: ${error?.message ?? "no data"}`
      );
      return null;
    }
    return data.id;
  } catch (err) {
    console.warn(
      `[ai-monitoring] exception sur ${input.route}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export interface AiGenerationRecord {
  id: string;
  route: string | null;
  purpose: string | null;
  provider: string;
  model: string | null;
  source: AiGenerationSource | null;
  status: AiGenerationStatus;
  durationMs: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  totalTokens: number | null;
  costEstimate: number | null;
  sessionId: string | null;
  diagnosticId: string | null;
  recommendationId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  route: string | null;
  purpose: string | null;
  provider: string;
  model: string | null;
  source: AiGenerationSource | null;
  status: AiGenerationStatus;
  duration_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  total_tokens: number | null;
  cost_estimate: number | null;
  session_id: string | null;
  diagnostic_id: string | null;
  recommendation_id: string | null;
  error: string | null;
  created_at: string;
}

function rowToRecord(row: RawRow): AiGenerationRecord {
  return {
    id: row.id,
    route: row.route,
    purpose: row.purpose,
    provider: row.provider,
    model: row.model,
    source: row.source,
    status: row.status,
    durationMs: row.duration_ms,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    totalTokens: row.total_tokens,
    costEstimate: row.cost_estimate === null ? null : Number(row.cost_estimate),
    sessionId: row.session_id,
    diagnosticId: row.diagnostic_id,
    recommendationId: row.recommendation_id,
    errorMessage: row.error,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  "id, route, purpose, provider, model, source, status, duration_ms, tokens_input, tokens_output, total_tokens, cost_estimate, session_id, diagnostic_id, recommendation_id, error, created_at";

export async function getRecentAiGenerations(
  limit = 10
): Promise<AiGenerationRecord[]> {
  const client = createSupabaseAdminClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("ai_generation_logs")
      .select(SELECT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as RawRow[]).map(rowToRecord);
  } catch {
    return [];
  }
}

export interface AiUsageSummary {
  /** Fenêtre temporelle (ISO start) — utile pour debug / affichage. */
  windowStart: string;
  callsToday: number;
  calls7Days: number;
  estimatedCost7DaysEur: number;
  fallbackRate7Days: number;
  errorCount7Days: number;
  /** Nombre d'appels refusés par le rate limiter sur 7 jours. */
  rateLimited7Days: number;
  lastError: {
    route: string | null;
    message: string | null;
    createdAt: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Budget mensuel — cf. docs/ai-budget-prd.md
// ---------------------------------------------------------------------------

export interface AiBudgetConfig {
  /** Budget mensuel en EUR. `null` si non configuré. */
  budgetEur: number | null;
  /** Pourcentage déclenchant le `warning`. Défaut 80. */
  warningThresholdPercent: number;
}

/**
 * Lit la config budget depuis l'environnement (server-only).
 * - `AI_MONTHLY_BUDGET_EUR` : nombre positif, sinon `null`.
 * - `AI_MONTHLY_WARNING_THRESHOLD_PERCENT` : 1..100, sinon 80.
 */
export function readAiBudgetConfig(): AiBudgetConfig {
  let budgetEur: number | null = null;
  const rawBudget = process.env.AI_MONTHLY_BUDGET_EUR;
  if (rawBudget) {
    const n = Number(rawBudget);
    if (Number.isFinite(n) && n > 0) budgetEur = n;
  }

  let warningThresholdPercent = 80;
  const rawThreshold = process.env.AI_MONTHLY_WARNING_THRESHOLD_PERCENT;
  if (rawThreshold) {
    const n = Number(rawThreshold);
    if (Number.isFinite(n) && n > 0 && n <= 100) {
      warningThresholdPercent = n;
    }
  }

  return { budgetEur, warningThresholdPercent };
}

export type AiBudgetStatus = "ok" | "warning" | "exceeded" | "not_configured";

export interface AiMonthlyBudgetStatus {
  budgetEur: number | null;
  spentEur: number;
  remainingEur: number | null;
  /** % utilisé (0..). `null` si budget non configuré. */
  percentUsed: number | null;
  warningThresholdPercent: number;
  status: AiBudgetStatus;
  /** ISO du 1er jour du mois calendaire courant. */
  windowStart: string;
}

/**
 * Agrégat budget mensuel — somme `estimated_cost_eur` depuis le 1er
 * du mois courant, comparée au budget configuré.
 *
 * Best-effort : si Supabase est indisponible, on retourne un objet
 * cohérent (spent = 0, status = ok ou not_configured selon config).
 * Ne crash jamais. Aucune écriture.
 */
export async function getAiMonthlyBudgetStatus(): Promise<AiMonthlyBudgetStatus> {
  const config = readAiBudgetConfig();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowStart = monthStart.toISOString();

  const buildEmpty = (): AiMonthlyBudgetStatus => ({
    budgetEur: config.budgetEur,
    spentEur: 0,
    remainingEur: config.budgetEur,
    percentUsed: config.budgetEur === null ? null : 0,
    warningThresholdPercent: config.warningThresholdPercent,
    status: config.budgetEur === null ? "not_configured" : "ok",
    windowStart,
  });

  const client = createSupabaseAdminClient();
  if (!client) return buildEmpty();

  try {
    const { data, error } = await client
      .from("ai_generation_logs")
      .select("cost_estimate")
      .gte("created_at", windowStart);
    if (error || !data) return buildEmpty();

    let spent = 0;
    for (const row of data as Array<{ cost_estimate: number | string | null }>) {
      if (row.cost_estimate !== null) {
        const n = Number(row.cost_estimate);
        if (Number.isFinite(n)) spent += n;
      }
    }
    const spentEur = Math.round(spent * 10_000) / 10_000;

    if (config.budgetEur === null) {
      return {
        budgetEur: null,
        spentEur,
        remainingEur: null,
        percentUsed: null,
        warningThresholdPercent: config.warningThresholdPercent,
        status: "not_configured",
        windowStart,
      };
    }

    const percentUsed =
      Math.round((spentEur / config.budgetEur) * 1000) / 10; // une décimale
    const remainingEur =
      Math.round(Math.max(0, config.budgetEur - spentEur) * 10_000) / 10_000;

    let status: AiBudgetStatus = "ok";
    if (percentUsed >= 100) status = "exceeded";
    else if (percentUsed >= config.warningThresholdPercent) status = "warning";

    return {
      budgetEur: config.budgetEur,
      spentEur,
      remainingEur,
      percentUsed,
      warningThresholdPercent: config.warningThresholdPercent,
      status,
      windowStart,
    };
  } catch {
    return buildEmpty();
  }
}

/**
 * Agrégats principaux : appels du jour, fenêtre 7 jours, coût estimé,
 * taux de fallback, dernière erreur. Volontairement simple (un seul
 * SELECT bornée à 7 jours).
 */
export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const empty: AiUsageSummary = {
    windowStart: sevenDaysAgo.toISOString(),
    callsToday: 0,
    calls7Days: 0,
    estimatedCost7DaysEur: 0,
    fallbackRate7Days: 0,
    errorCount7Days: 0,
    rateLimited7Days: 0,
    lastError: null,
  };

  const client = createSupabaseAdminClient();
  if (!client) return empty;

  try {
    const { data, error } = await client
      .from("ai_generation_logs")
      .select(
        "route, source, status, cost_estimate, error, created_at"
      )
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });
    if (error || !data) return empty;

    let callsToday = 0;
    let calls7Days = 0;
    let costSum = 0;
    let fallbackCount = 0;
    let errorCount = 0;
    let rateLimitedCount = 0;
    let lastError: AiUsageSummary["lastError"] = null;

    for (const row of data as Array<{
      route: string | null;
      source: string | null;
      status: string;
      cost_estimate: number | string | null;
      error: string | null;
      created_at: string;
    }>) {
      calls7Days += 1;
      const created = new Date(row.created_at);
      if (created >= startOfDay) callsToday += 1;
      if (row.cost_estimate !== null) {
        const n = Number(row.cost_estimate);
        if (Number.isFinite(n)) costSum += n;
      }
      if (row.status === "fallback" || row.source === "heuristic") {
        fallbackCount += 1;
      }
      if (row.status === "rate_limited") {
        rateLimitedCount += 1;
      }
      if (row.status === "error") {
        errorCount += 1;
        if (!lastError) {
          lastError = {
            route: row.route,
            message: row.error,
            createdAt: row.created_at,
          };
        }
      }
    }

    return {
      windowStart: sevenDaysAgo.toISOString(),
      callsToday,
      calls7Days,
      estimatedCost7DaysEur: Math.round(costSum * 10_000) / 10_000,
      fallbackRate7Days:
        calls7Days === 0
          ? 0
          : Math.round((fallbackCount / calls7Days) * 1000) / 1000,
      errorCount7Days: errorCount,
      rateLimited7Days: rateLimitedCount,
      lastError,
    };
  } catch {
    return empty;
  }
}
