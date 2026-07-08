import { NextResponse } from "next/server";
import { z } from "zod";

import { buildRecommendationPrompt } from "@/lib/ai/build-recommendation-prompt";
import { selectRelevantModulesForAnalysis } from "@/lib/ai/select-relevant-modules-for-analysis";
import { buildHeuristicRecommendation } from "@/lib/ai/heuristic-recommendation";
import { callLlm, extractJsonObject } from "@/lib/ai/llm-client";
import {
  RecommendationSchema,
  type AnalyzeResult,
} from "@/lib/ai/recommendation-schema";
import { getTrainingModules } from "@/lib/modules/get-training-modules";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { calculateCostPerParticipant } from "@/lib/pricing/training-pricing";
import { ANSWER_CATEGORIES } from "@/types";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { createActivityLog } from "@/lib/activity/activity-log-service";
import { logAiGeneration } from "@/lib/ai/ai-monitoring-service";
import {
  checkAiRateLimit,
  formatRateLimitError,
} from "@/lib/ai/ai-rate-limit-service";
import type {
  AnswerRecord,
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import {
  computeRatiosAndAlerts,
  type RatiosDiagnosticInput,
  type RatiosParticipantInput,
} from "@/lib/diagnostics/ratios-service";
import { getActiveFundingConfig } from "@/lib/pricing/funding-config-service";
import {
  estimateTrainingFunding,
  type ParticipantFundingInput,
} from "@/lib/pricing/training-funding";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const ProfileTargetSchema = z.enum([
  "conseiller",
  "manager",
  "assistant",
  "direction",
]);

const DiagnosticPayloadSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  mode: z.enum(["guided", "transcript", "hybrid"]),
  status: z.enum([
    "draft",
    "in_progress",
    "transcript_uploaded",
    "ai_analyzed",
    "to_review",
    "validated",
  ]),
  declaredGoal: z.string().nullable(),
  profilesInScope: z.array(ProfileTargetSchema),
  expectedParticipants: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ClientPayloadSchema = z
  .object({
    id: z.string(),
    companyName: z.string(),
    director: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    collaboratorsCount: z.number().nullable(),
    teamTypology: z.array(ProfileTargetSchema),
    createdAt: z.string(),
  })
  .nullable();

const AnswerPayloadSchema = z.object({
  id: z.string(),
  diagnosticId: z.string(),
  questionId: z.string(),
  questionText: z.string(),
  // T-3 (fix 2026-07-08) : source unique ANSWER_CATEGORIES.
  category: z.enum(ANSWER_CATEGORIES).nullable(),
  answer: z.string().nullable(),
  note: z.string().nullable(),
  isWeakSignal: z.boolean(),
  isSkipped: z.boolean(),
  createdAt: z.string(),
});

const RequestSchema = z.object({
  diagnosticId: z.string().min(1),
  diagnostic: DiagnosticPayloadSchema.optional(),
  client: ClientPayloadSchema.optional(),
  answers: z.array(AnswerPayloadSchema).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LoadResult {
  diagnostic: DiagnosticRecord;
  client: ClientRecord | null;
  answers: AnswerRecord[];
  loadedFromSupabase: boolean;
  /**
   * v1.0 — Contexte enrichi pour le moteur ratios/alertes et le
   * calcul funding. Rempli uniquement en mode Supabase (les colonnes
   * v1.0 ne sont pas dans le payload inline hérité MVP1). En mode
   * inline, ces trois champs sont `null` / `[]` et le moteur n'est
   * pas invoqué — on garde le comportement historique.
   */
  ratiosDiagnostic: RatiosDiagnosticInput | null;
  ratiosParticipants: RatiosParticipantInput[];
  fundingParticipants: ParticipantFundingInput[];
}

async function loadFromSupabase(
  diagnosticId: string
): Promise<LoadResult | null> {
  const client =
    createSupabaseAdminClient() ?? createSupabaseServerClient();
  if (!client) return null;
  try {
    const { data: diagRow, error: diagErr } = await client
      .from("diagnostics")
      .select("*")
      .eq("id", diagnosticId)
      .maybeSingle();
    if (diagErr || !diagRow) return null;

    const { data: clientRow } = await client
      .from("clients")
      .select("*")
      .eq("id", diagRow.client_id)
      .maybeSingle();

    const { data: answerRows } = await client
      .from("diagnostic_answers")
      .select("*")
      .eq("diagnostic_id", diagnosticId)
      .order("created_at", { ascending: true });

    const { data: participantRows } = await client
      .from("diagnostic_participants")
      .select(
        "professional_status, previous_year_production, eligible_opco, formations_24m_amount"
      )
      .eq("diagnostic_id", diagnosticId);

    const ratiosDiagnostic: RatiosDiagnosticInput = {
      ventesNMoins1: diagRow.ventes_n_moins_1 ?? null,
      caGlobalNMoins1: diagRow.ca_global_n_moins_1 ?? null,
      nbSalaries: diagRow.nb_salaries ?? null,
      nbAgentsIndep: diagRow.nb_agents_indep ?? null,
      activiteRepartition:
        typeof diagRow.activite_repartition === "object" &&
        diagRow.activite_repartition !== null &&
        !Array.isArray(diagRow.activite_repartition)
          ? (diagRow.activite_repartition as Record<string, unknown>)
          : null,
    };

    const ratiosParticipants: RatiosParticipantInput[] = (
      participantRows ?? []
    ).map((p) => ({
      professionalStatus: p.professional_status,
      previousYearProduction: p.previous_year_production,
      eligibleOpco: p.eligible_opco,
      formations24mAmount: p.formations_24m_amount,
    }));

    const fundingParticipants: ParticipantFundingInput[] = (
      participantRows ?? []
    ).map((p) => ({
      professionalStatus: p.professional_status,
      previousYearProduction: p.previous_year_production,
      eligibleOpco: p.eligible_opco,
    }));

    return {
      ratiosDiagnostic,
      ratiosParticipants,
      fundingParticipants,
      diagnostic: {
        id: diagRow.id,
        clientId: diagRow.client_id,
        mode: diagRow.mode,
        status: diagRow.status,
        declaredGoal: diagRow.declared_goal,
        profilesInScope: diagRow.profiles_in_scope as DiagnosticRecord["profilesInScope"],
        expectedParticipants: diagRow.expected_participants,
        notes: diagRow.notes,
        createdAt: diagRow.created_at,
        updatedAt: diagRow.updated_at,
      },
      client: clientRow
        ? {
            id: clientRow.id,
            companyName: clientRow.company_name,
            director: clientRow.director,
            email: clientRow.email,
            phone: clientRow.phone,
            collaboratorsCount: clientRow.collaborators_count,
            teamTypology: clientRow.team_typology as ClientRecord["teamTypology"],
            createdAt: clientRow.created_at,
          }
        : null,
      answers: (answerRows ?? []).map((row) => ({
        id: row.id,
        diagnosticId: row.diagnostic_id,
        questionId: row.question_id,
        questionText: row.question_text ?? "",
        category: row.category as AnswerRecord["category"],
        answer: row.answer,
        note: row.note,
        isWeakSignal: row.is_weak_signal,
        isSkipped: row.is_skipped,
        createdAt: row.created_at,
      })),
      loadedFromSupabase: true,
    };
  } catch {
    return null;
  }
}

async function persistRecommendation(
  diagnosticId: string,
  result: AnalyzeResult
): Promise<{
  persisted: boolean;
  recommendationId: string | null;
  error: string | null;
}> {
  const client = createSupabaseAdminClient();
  if (!client) {
    return { persisted: false, recommendationId: null, error: null };
  }
  try {
    const rec = result.recommendation;
    const { data: insertedRec, error: recErr } = await client
      .from("recommendations")
      .insert({
        diagnostic_id: diagnosticId,
        status: "generated",
        client_summary: rec.clientSummary,
        detected_needs: rec.detectedNeeds,
        performance_issues: rec.performanceIssues,
        tool_maturity: rec.toolMaturity,
        skill_level: rec.skillLevel,
        required_foundations: rec.requiredFoundations,
        total_duration_hours: rec.totalDurationHours,
        // Règle Start Academy : 1 h = 42 € / participant. Calcul code-only,
        // peu importe ce que le LLM a mis dans `costPerParticipant`.
        cost_per_participant: calculateCostPerParticipant(
          rec.totalDurationHours
        ),
        confidence_score: rec.confidenceScore,
        missing_information: rec.missingInformation,
        commercial_explanation: rec.commercialExplanation,
      })
      .select("id")
      .single();
    if (recErr) throw recErr;

    if (rec.recommendedModules.length > 0) {
      const moduleRows = rec.recommendedModules.map((m) => ({
        recommendation_id: insertedRec.id,
        module_id: m.moduleId,
        position: m.priority,
        reason: m.reason,
        duration_hours: m.durationHours,
        business_ratio_targeted: m.businessRatioTargeted,
        use_cases: m.useCases,
        priority_tier: m.priorityTier ?? null,
      }));
      const { error: modErr } = await client
        .from("recommendation_modules")
        .insert(moduleRows);
      if (modErr) throw modErr;
    }

    // Update diagnostic status only when it makes sense.
    await client
      .from("diagnostics")
      .update({ status: "ai_analyzed" })
      .eq("id", diagnosticId);

    return {
      persisted: true,
      recommendationId: insertedRec.id,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Supabase";
    return { persisted: false, recommendationId: null, error: message };
  }
}

function extractUsage(raw: unknown): { input: number | null; output: number | null } {
  if (raw && typeof raw === "object" && "usage" in raw) {
    const usage = (raw as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
      .usage;
    return {
      input: usage?.prompt_tokens ?? null,
      output: usage?.completion_tokens ?? null,
    };
  }
  return { input: null, output: null };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Garde auth : route consomme des crédits OpenRouter — refus avant
  // tout parsing si l'appelant n'est pas un user interne authentifié.
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON body invalide" },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Garde ownership diagnostic : empêche un commercial de déclencher
  // l'analyse IA (et la consommation OpenRouter associée) sur un
  // diagnostic qui ne lui appartient pas (audit I-1). Admin bypass.
  const access = await assertCanAccessDiagnostic(
    auth.profile,
    parsed.data.diagnosticId
  );
  if (!access.ok) return access.response;

  // Rate limit : check après auth + ownership pour ne pas compter
  // les requêtes refusées. Failopen si l'infra rate-limit est KO
  // (préférable à un blocage faux positif sur panne Supabase).
  const ROUTE_PATH = "/api/analyze-training-need";
  const rate = await checkAiRateLimit({
    userId: auth.profile.id,
    route: ROUTE_PATH,
  });
  if (rate.ok && !rate.allowed) {
    void logAiGeneration({
      route: ROUTE_PATH,
      purpose: "analyze",
      provider: "rate-limiter",
      model: null,
      source: null,
      status: "rate_limited",
      diagnosticId: parsed.data.diagnosticId,
      createdBy: auth.profile.id,
      errorMessage: `Rate limit: ${rate.currentCount}/${rate.limit} appels sur la fenêtre.`,
    });
    return formatRateLimitError();
  }

  // 1. Charger les données — Supabase prioritaire, sinon payload inline.
  const fromSupabase = await loadFromSupabase(parsed.data.diagnosticId);
  const inline: LoadResult | null =
    parsed.data.diagnostic && parsed.data.answers
      ? {
          diagnostic: parsed.data.diagnostic as DiagnosticRecord,
          client: (parsed.data.client ?? null) as ClientRecord | null,
          answers: parsed.data.answers as AnswerRecord[],
          loadedFromSupabase: false,
          // Payload inline (hérité MVP1) — pas d'accès aux colonnes v1.0
          // ni aux participants. Le moteur ratios sera skippé plus bas.
          ratiosDiagnostic: null,
          ratiosParticipants: [],
          fundingParticipants: [],
        }
      : null;
  const loaded = fromSupabase ?? inline;
  if (!loaded) {
    return NextResponse.json(
      {
        error:
          "Diagnostic introuvable côté Supabase et aucun payload inline n'a été fourni.",
      },
      { status: 404 }
    );
  }

  // 2. Catalogue (Supabase si dispo, sinon catalogue local).
  const catalogResult = await getTrainingModules();
  const catalog = catalogResult.modules;

  // 2.bis Filtrage : on n'envoie au LLM qu'une sélection pertinente du
  //       catalogue (pas les 79 modules complets — économie d'~75 %
  //       des tokens d'input). La sélection reste un sous-ensemble du
  //       catalogue, jamais de modules fantômes.
  const selection = selectRelevantModulesForAnalysis({
    diagnostic: loaded.diagnostic,
    client: loaded.client,
    answers: loaded.answers,
    allModules: catalog,
  });
  const transmittedCatalog = selection.modules;

  // 3. Blocs autoritatifs v1.0 — ratios / alertes / financement.
  //    Calculés côté code (module pur) et injectés dans le prompt
  //    comme SEULE source de vérité pour ces 3 dimensions (cf.
  //    build-recommendation-prompt règles 12-14). Skipped en mode
  //    inline hérité (pas de participants ni de champs v1.0).
  let ratiosBlock = null;
  let alertsBlock = null;
  let fundingBlock = null;
  if (loaded.ratiosDiagnostic) {
    const fundingConfig = await getActiveFundingConfig().catch(() => undefined);
    const computed = computeRatiosAndAlerts({
      client: {
        collaboratorsCount: loaded.client?.collaboratorsCount ?? null,
      },
      diagnostic: loaded.ratiosDiagnostic,
      answers: loaded.answers.map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
        isSkipped: a.isSkipped,
      })),
      participants: loaded.ratiosParticipants,
      fundingConfig,
    });
    ratiosBlock = computed.ratios;
    alertsBlock = computed.alerts;
    fundingBlock = estimateTrainingFunding({
      participants: loaded.fundingParticipants,
      costPerParticipant: null,
      totalBudget: null,
      config: fundingConfig,
    });
  }

  // 4. Construire le prompt + tenter LLM.
  const prompt = buildRecommendationPrompt({
    client: loaded.client,
    diagnostic: loaded.diagnostic,
    answers: loaded.answers,
    catalog: transmittedCatalog,
    ratios: ratiosBlock,
    alerts: alertsBlock,
    fundingSummary: fundingBlock,
  });

  const notes: string[] = [];
  if (!loaded.loadedFromSupabase) {
    notes.push("Diagnostic chargé depuis le payload inline (Supabase indisponible).");
  }
  if (catalogResult.source === "local") {
    notes.push("Catalogue lu depuis le fallback local.");
    if (catalogResult.error) notes.push(catalogResult.error);
  }

  notes.push(
    `Catalogue filtré : ${selection.stats.transmitted} modules transmis sur ${selection.stats.totalCatalog}.`
  );

  if (process.env.NODE_ENV !== "production") {
    // Log de debug — désactivé en prod pour ne pas polluer les logs.
    console.log(
      "[analyze] catalog selection",
      {
        total: selection.stats.totalCatalog,
        transmitted: selection.stats.transmitted,
        foundationModules: selection.stats.foundationModules,
        families: selection.stats.families,
      }
    );
  }

  let result: AnalyzeResult | null = null;
  let llmDurationMs: number | null = null;
  let llmTokensInput: number | null = null;
  let llmTokensOutput: number | null = null;
  let llmErrorMessage: string | null = null;
  let fallbackReason: string | null = null;
  const llmStarted = Date.now();
  try {
    const llm = await callLlm(prompt);
    if (llm) {
      llmDurationMs = Date.now() - llmStarted;
      const usage = extractUsage(llm.raw);
      llmTokensInput = usage.input;
      llmTokensOutput = usage.output;
      try {
        const parsedJson = extractJsonObject(llm.content);
        const validated = RecommendationSchema.parse(parsedJson);
        // Le LLM n'a vu que `transmittedCatalog` — tout moduleId hors
        // de ce sous-ensemble est considéré comme inventé (ou tiré de
        // sa mémoire d'entraînement), donc retiré.
        const knownIds = new Set(transmittedCatalog.map((m) => m.id));
        const stripped = stripInventedModules(validated, knownIds, notes);
        result = {
          recommendation: stripped,
          source: "llm",
          provider: llm.provider,
          model: llm.model,
          generatedAt: new Date().toISOString(),
          notes,
        };
      } catch (validationErr) {
        const message =
          validationErr instanceof Error
            ? validationErr.message
            : "Erreur de validation";
        fallbackReason = `Validation Zod LLM rejetée : ${message}`;
        notes.push(
          `Réponse OpenRouter rejetée (${message}). Bascule sur le moteur heuristique local.`
        );
      }
    } else {
      fallbackReason = "OPENROUTER_API_KEY absente — heuristique direct";
      notes.push(
        "OPENROUTER_API_KEY non configurée — moteur heuristique local utilisé."
      );
    }
  } catch (llmErr) {
    const message =
      llmErr instanceof Error ? llmErr.message : "Erreur OpenRouter";
    llmErrorMessage = message;
    fallbackReason = `OpenRouter exception : ${message}`;
    notes.push(
      `Appel OpenRouter en échec (${message}). Bascule sur le moteur heuristique local.`
    );
  }

  if (!result) {
    const heuristic = buildHeuristicRecommendation({
      client: loaded.client,
      diagnostic: loaded.diagnostic,
      answers: loaded.answers,
      catalog,
    });
    const validated = RecommendationSchema.parse(heuristic);
    result = {
      recommendation: validated,
      source: "heuristic",
      provider: null,
      model: null,
      generatedAt: new Date().toISOString(),
      notes,
    };
  }

  // 4. Persistance Supabase si admin dispo.
  const persistence = await persistRecommendation(
    parsed.data.diagnosticId,
    result
  );

  // 4.bis Monitoring IA — best-effort, ne bloque jamais la réponse.
  // Status :
  //   - "success"  → LLM a réussi
  //   - "fallback" → heuristique appelée APRÈS un essai LLM raté ou non configuré
  //   - "error"    → exception OpenRouter (toujours fallback ensuite côté UX)
  const aiStatus =
    llmErrorMessage !== null
      ? "error"
      : result.source === "llm"
        ? "success"
        : "fallback";
  void logAiGeneration({
    route: "/api/analyze-training-need",
    purpose: "analyze",
    provider: result.source === "llm" ? "openrouter" : "internal-heuristic",
    model: result.model,
    source: result.source,
    status: aiStatus,
    durationMs: llmDurationMs,
    tokensInput: llmTokensInput,
    tokensOutput: llmTokensOutput,
    diagnosticId: parsed.data.diagnosticId,
    recommendationId: persistence.recommendationId,
    createdBy: auth.profile.id,
    errorMessage: llmErrorMessage,
    fallbackReason,
  });

  // 5. Journal d'activité — best-effort, ne bloque jamais la réponse.
  createActivityLog({
    eventType: "recommendation_generated",
    diagnosticId: parsed.data.diagnosticId,
    clientId: parsed.data.client?.id ?? null,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    metadata: {
      source: result.source,
      model: result.model,
      modulesCount: result.recommendation.recommendedModules.length,
      totalDurationHours: result.recommendation.totalDurationHours,
      confidenceScore: result.recommendation.confidenceScore,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({
    ...result,
    saved: persistence,
  });
}

/**
 * Si le LLM a inventé un moduleId qui n'existe pas, on le retire et on
 * pousse une note dans missingInformation. La spéc anti-hallucination
 * (PRD §16.1) exige qu'aucun module fantôme n'arrive jamais au commercial.
 */
function stripInventedModules(
  recommendation: ReturnType<typeof RecommendationSchema.parse>,
  knownIds: Set<string>,
  notes: string[]
) {
  const valid = recommendation.recommendedModules.filter((m) =>
    knownIds.has(m.moduleId)
  );
  const invented = recommendation.recommendedModules.filter(
    (m) => !knownIds.has(m.moduleId)
  );
  if (invented.length === 0) return recommendation;
  notes.push(
    `${invented.length} module(s) inventé(s) supprimé(s) : ${invented
      .map((m) => m.moduleId)
      .join(", ")}.`
  );
  return {
    ...recommendation,
    recommendedModules: valid.map((m, idx) => ({ ...m, priority: idx + 1 })),
    totalDurationHours: valid.reduce((sum, m) => sum + m.durationHours, 0),
    missingInformation: [
      ...recommendation.missingInformation,
      `LLM a tenté d'utiliser ${invented.length} moduleId inconnu(s) — relire le catalogue.`,
    ],
  };
}
