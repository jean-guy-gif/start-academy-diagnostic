import { NextResponse } from "next/server";
import { z } from "zod";

import { buildTrainingSupportPrompt } from "@/lib/ai/build-training-support-prompt";
import { buildHeuristicTrainingSupport } from "@/lib/ai/heuristic-training-support";
import { selectCoachBrainContentForSupport } from "@/lib/coach-brain/coach-brain-service";
import {
  selectModulesForSupport,
  summarizeSupportModuleSelection,
} from "@/lib/recommendations/select-modules-for-support";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import { createActivityLog } from "@/lib/activity/activity-log-service";
import { logAiGeneration } from "@/lib/ai/ai-monitoring-service";
import {
  checkAiRateLimit,
  formatRateLimitError,
} from "@/lib/ai/ai-rate-limit-service";
import { callLlm, extractJsonObject } from "@/lib/ai/llm-client";
import { ProposalSchema, type Proposal } from "@/lib/ai/proposal-schema";
import { RecommendationSchema, type Recommendation } from "@/lib/ai/recommendation-schema";
import {
  TrainingSupportSchema,
  type TrainingSupportGenerationResult,
} from "@/lib/ai/training-support-schema";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import type {
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { ParticipantRecord } from "@/lib/sessions/session-service";
import type { TrainingSessionViewModel } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Schemas d'entrée
// ---------------------------------------------------------------------------

const ProfileTargetSchema = z.enum([
  "conseiller",
  "manager",
  "assistant",
  "direction",
]);

const SessionStatusSchema = z.enum([
  "created",
  "awaiting_client_validation",
  "dates_to_position",
  "dates_validated",
  "collection_open",
  "data_collected",
  "support_generating",
  "support_ready",
  "delivered",
  "report_sent",
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

const SessionPayloadSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  diagnosticId: z.string().nullable(),
  recommendationId: z.string().nullable(),
  clientName: z.string().nullable(),
  proposalTitle: z.string().nullable(),
  targetAudience: z.string().nullable(),
  totalDurationHours: z.number().nullable(),
  suggestedFormat: z.string().nullable(),
  participantCount: z.number().nullable(),
  costPerParticipant: z.number().nullable(),
  totalEstimatedCost: z.number().nullable(),
  status: SessionStatusSchema,
  dates: z.array(z.string()),
  validatedDate: z.string().nullable(),
  collectionLink: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(["supabase", "local"]),
});

const ParticipantPayloadSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  email: z.string(),
  estimatedLevel: z.string(),
  mainProblem: z.string(),
  personalGoal: z.string(),
  toolsUsed: z.array(z.string()),
  concreteCase: z.string(),
  createdAt: z.string(),
});

const RequestSchema = z.object({
  sessionId: z.string().min(1),
  session: SessionPayloadSchema.optional(),
  diagnostic: DiagnosticPayloadSchema.optional(),
  client: ClientPayloadSchema.optional(),
  recommendation: RecommendationSchema.optional(),
  proposal: ProposalSchema.optional(),
  participants: z.array(ParticipantPayloadSchema).optional(),
});

// ---------------------------------------------------------------------------
// Chargement Supabase
// ---------------------------------------------------------------------------

interface LoadedContext {
  session: TrainingSessionViewModel | null;
  diagnostic: DiagnosticRecord | null;
  client: ClientRecord | null;
  recommendation: Recommendation | null;
  proposal: Proposal | null;
  participants: ParticipantRecord[];
  loadedFromSupabase: boolean;
}

async function loadFromSupabase(
  sessionId: string
): Promise<LoadedContext | null> {
  const client =
    createSupabaseAdminClient() ?? createSupabaseServerClient();
  if (!client) return null;

  try {
    const { data: sessionRow, error: sessionErr } = await client
      .from("training_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionErr || !sessionRow) return null;

    const [{ data: clientRow }, { data: diagRow }, { data: participantsRows }] =
      await Promise.all([
        client
          .from("clients")
          .select("*")
          .eq("id", sessionRow.client_id)
          .maybeSingle(),
        sessionRow.diagnostic_id
          ? client
              .from("diagnostics")
              .select("*")
              .eq("id", sessionRow.diagnostic_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        client
          .from("session_participants")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
      ]);

    const recommendation = sessionRow.recommendation_id
      ? await loadRecommendationFromSupabase(client, sessionRow.recommendation_id)
      : sessionRow.diagnostic_id
        ? await loadLatestRecommendationByDiagnostic(client, sessionRow.diagnostic_id)
        : null;

    const session: TrainingSessionViewModel = {
      id: sessionRow.id,
      clientId: sessionRow.client_id,
      diagnosticId: sessionRow.diagnostic_id,
      recommendationId: sessionRow.recommendation_id,
      clientName: clientRow?.company_name ?? null,
      proposalTitle: null,
      targetAudience: null,
      totalDurationHours: recommendation?.totalDurationHours ?? null,
      suggestedFormat: null,
      participantCount: sessionRow.expected_participants ?? null,
      costPerParticipant: recommendation?.costPerParticipant ?? null,
      totalEstimatedCost: null,
      status: sessionRow.status,
      dates: sessionRow.proposed_dates,
      validatedDate: sessionRow.validated_date,
      collectionLink: `/sessions/${sessionRow.id}/collect`,
      notes: sessionRow.notes,
      createdAt: sessionRow.created_at,
      updatedAt: sessionRow.updated_at,
      source: "supabase",
    };

    const diagnostic: DiagnosticRecord | null = diagRow
      ? {
          id: diagRow.id,
          clientId: diagRow.client_id,
          mode: diagRow.mode,
          status: diagRow.status,
          declaredGoal: diagRow.declared_goal,
          profilesInScope:
            diagRow.profiles_in_scope as DiagnosticRecord["profilesInScope"],
          expectedParticipants: diagRow.expected_participants,
          notes: diagRow.notes,
          createdAt: diagRow.created_at,
          updatedAt: diagRow.updated_at,
        }
      : null;

    const clientRec: ClientRecord | null = clientRow
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
      : null;

    const participants: ParticipantRecord[] = (participantsRows ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role ?? "",
      email: row.email,
      estimatedLevel: row.estimated_level ?? "",
      personalGoal: row.personal_goal ?? "",
      mainProblem: row.main_problem ?? "",
      toolsUsed: Array.isArray(row.tools_used)
        ? (row.tools_used as string[]).filter((v) => typeof v === "string")
        : [],
      concreteCase: row.concrete_case ?? "",
      createdAt: row.created_at,
    }));

    return {
      session,
      diagnostic,
      client: clientRec,
      recommendation,
      proposal: null, // Pas de table proposals : la proposition reste côté client (localStorage).
      participants,
      loadedFromSupabase: true,
    };
  } catch {
    return null;
  }
}

async function loadRecommendationFromSupabase(
  client: SupabaseClient<Database>,
  recommendationId: string
): Promise<Recommendation | null> {
  const { data, error } = await client
    .from("recommendations")
    .select(
      "*, recommendation_modules(module_id, position, reason, duration_hours, business_ratio_targeted, use_cases, priority_tier)"
    )
    .eq("id", recommendationId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRecommendation(data);
}

async function loadLatestRecommendationByDiagnostic(
  client: SupabaseClient<Database>,
  diagnosticId: string
): Promise<Recommendation | null> {
  const { data, error } = await client
    .from("recommendations")
    .select(
      "*, recommendation_modules(module_id, position, reason, duration_hours, business_ratio_targeted, use_cases, priority_tier)"
    )
    .eq("diagnostic_id", diagnosticId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return mapRecommendation(data[0]);
}

interface RecommendationRow {
  client_summary: string | null;
  detected_needs: unknown;
  performance_issues: unknown;
  tool_maturity: string | null;
  skill_level: string | null;
  required_foundations: unknown;
  total_duration_hours: number | null;
  cost_per_participant: number | null;
  confidence_score: number | null;
  missing_information: unknown;
  commercial_explanation: string | null;
  recommendation_modules: {
    module_id: string;
    position: number;
    reason: string | null;
    duration_hours: number | null;
    business_ratio_targeted: string | null;
    use_cases: unknown;
    priority_tier?: "essential" | "recommended" | "optional" | "later" | null;
  }[] | null;
}

function mapRecommendation(row: RecommendationRow): Recommendation {
  const modules = (row.recommendation_modules ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      moduleId: m.module_id,
      moduleName: m.module_id,
      reason: m.reason ?? "",
      priority: m.position || 1,
      priorityTier: m.priority_tier ?? null,
      durationHours: m.duration_hours ?? 0,
      businessRatioTargeted: m.business_ratio_targeted,
      useCases: Array.isArray(m.use_cases) ? (m.use_cases as string[]) : [],
    }));
  return {
    clientSummary: row.client_summary ?? "",
    detectedNeeds: toStringArray(row.detected_needs),
    performanceIssues: toStringArray(row.performance_issues),
    toolMaturity: (row.tool_maturity ?? "medium") as Recommendation["toolMaturity"],
    skillLevel: (row.skill_level ?? "mixed") as Recommendation["skillLevel"],
    requiredFoundations: toStringArray(row.required_foundations),
    recommendedModules: modules,
    totalDurationHours: Number(row.total_duration_hours ?? 0),
    costPerParticipant:
      row.cost_per_participant === null ? null : Number(row.cost_per_participant),
    confidenceScore: Number(row.confidence_score ?? 0),
    missingInformation: toStringArray(row.missing_information),
    commercialExplanation: row.commercial_explanation ?? "",
    alertsAcknowledged: [],
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

// ---------------------------------------------------------------------------
// Helpers monitoring IA — l'écriture passe désormais par
// `logAiGeneration` (cf. src/lib/ai/ai-monitoring-service.ts) qui ne
// persiste plus le prompt complet (politique de minimisation).
// ---------------------------------------------------------------------------

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
    return NextResponse.json({ error: "JSON body invalide" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Garde d'ownership : empêche un internal user d'invoquer la
  // génération (et la consommation de crédits OpenRouter) sur une
  // session qui ne lui appartient pas. Admin → bypass.
  const access = await assertCanAccessSession(auth.profile, parsed.data.sessionId);
  if (!access.ok) return access.response;

  // Rate limit après ownership pour ne pas compter les refus.
  const ROUTE_PATH = "/api/generate-training-support";
  const rate = await checkAiRateLimit({
    userId: auth.profile.id,
    route: ROUTE_PATH,
  });
  if (rate.ok && !rate.allowed) {
    void logAiGeneration({
      route: ROUTE_PATH,
      purpose: "generate-training-support",
      provider: "rate-limiter",
      model: null,
      source: null,
      status: "rate_limited",
      sessionId: parsed.data.sessionId,
      createdBy: auth.profile.id,
      errorMessage: `Rate limit: ${rate.currentCount}/${rate.limit} appels sur la fenêtre.`,
    });
    return formatRateLimitError();
  }

  const fromSupabase = await loadFromSupabase(parsed.data.sessionId);

  const inline: LoadedContext | null =
    parsed.data.session && parsed.data.recommendation
      ? {
          session: parsed.data.session as TrainingSessionViewModel,
          diagnostic: (parsed.data.diagnostic ?? null) as DiagnosticRecord | null,
          client: (parsed.data.client ?? null) as ClientRecord | null,
          recommendation: parsed.data.recommendation as Recommendation,
          proposal: (parsed.data.proposal ?? null) as Proposal | null,
          participants: (parsed.data.participants ?? []) as ParticipantRecord[],
          loadedFromSupabase: false,
        }
      : null;

  const context = fromSupabase ?? inline;
  if (!context || !context.recommendation) {
    return NextResponse.json(
      {
        error:
          "Contexte introuvable : ni la session/recommandation Supabase ni le payload inline ne sont disponibles.",
      },
      { status: 404 }
    );
  }

  // Inline payload peut fournir une proposition là où Supabase ne l'a pas.
  const mergedProposal: Proposal | null =
    context.proposal ?? ((parsed.data.proposal ?? null) as Proposal | null);
  // Merge participants : si Supabase n'en a renvoyé aucun mais qu'un payload
  // inline en fournit, on garde ceux du payload (collecte localStorage).
  const mergedParticipants: ParticipantRecord[] =
    context.participants.length > 0
      ? context.participants
      : ((parsed.data.participants ?? []) as ParticipantRecord[]);

  // Filtre support principal : on ne descend dans le support pédago
  // que les modules tagués `essential` + `recommended` (cf.
  // docs/regression-after-funding-and-participants.md §4.1). Les
  // modules `optional` / `later` restent visibles dans la
  // recommandation et la proposition mais ne surchargent pas le PDF.
  const moduleSelection = selectModulesForSupport(
    context.recommendation.recommendedModules
  );
  const recommendationForSupport = {
    ...context.recommendation,
    recommendedModules: moduleSelection.selectedModules,
  };
  const moduleSelectionNotes = summarizeSupportModuleSelection(moduleSelection);

  // Coach Brain / COACHNXT — placeholder. Renvoie aujourd'hui un
  // contexte vide ; ne change rien au rendu tant que la lecture amont
  // `coach_brain_patterns` n'est pas branchée (cf.
  // docs/coach-brain-integration-plan.md).
  const coachBrainContext = await selectCoachBrainContentForSupport({
    sessionId: parsed.data.sessionId,
    moduleIds: moduleSelection.selectedModules.map((m) => m.moduleId),
  });

  const prompt = buildTrainingSupportPrompt({
    client: context.client,
    diagnostic: context.diagnostic,
    recommendation: recommendationForSupport,
    proposal: mergedProposal,
    session: context.session,
    participants: mergedParticipants,
    coachBrainContext,
  });

  const notes: string[] = [];
  if (!context.loadedFromSupabase) {
    notes.push("Session chargée depuis le payload inline (Supabase indisponible).");
  }
  if (mergedParticipants.length === 0) {
    notes.push("Aucun participant collecté — exercices génériques utilisés.");
  }
  notes.push(...moduleSelectionNotes);

  let result: TrainingSupportGenerationResult | null = null;
  let llmDurationMs = 0;
  let llmTokensInput: number | null = null;
  let llmTokensOutput: number | null = null;
  let llmModel: string | null = null;
  let llmErrorMessage: string | null = null;
  let fallbackReason: string | null = null;
  const llmStarted = Date.now();

  try {
    const llm = await callLlm(prompt);
    if (llm) {
      llmDurationMs = Date.now() - llmStarted;
      llmModel = llm.model;
      const usage = extractUsage(llm.raw);
      llmTokensInput = usage.input;
      llmTokensOutput = usage.output;
      try {
        const parsedJson = extractJsonObject(llm.content);
        const validated = TrainingSupportSchema.parse(parsedJson);
        result = {
          support: validated,
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
    const message = llmErr instanceof Error ? llmErr.message : "Erreur OpenRouter";
    llmErrorMessage = message;
    fallbackReason = `OpenRouter exception : ${message}`;
    notes.push(
      `Appel OpenRouter en échec (${message}). Bascule sur le moteur heuristique local.`
    );
  }

  if (!result) {
    const heuristic = buildHeuristicTrainingSupport({
      client: context.client,
      diagnostic: context.diagnostic,
      recommendation: recommendationForSupport,
      proposal: mergedProposal,
      session: context.session,
      participants: mergedParticipants,
      coachBrainContext,
    });
    const validated = TrainingSupportSchema.parse(heuristic);
    result = {
      support: validated,
      source: "heuristic",
      provider: null,
      model: null,
      generatedAt: new Date().toISOString(),
      notes,
    };
  }

  // Monitoring IA — remplace l'ancien logGeneration (qui poussait des
  // prompts/responses entiers dans ai_generation_logs et alourdissait
  // la table). On stocke uniquement les méta-données techniques.
  const aiStatus =
    llmErrorMessage !== null
      ? "error"
      : result.source === "llm"
        ? "success"
        : "fallback";
  void logAiGeneration({
    route: "/api/generate-training-support",
    purpose: "generate-training-support",
    provider: result.source === "llm" ? "openrouter" : "internal-heuristic",
    model: result.model ?? llmModel,
    source: result.source,
    status: aiStatus,
    durationMs: llmDurationMs,
    tokensInput: llmTokensInput,
    tokensOutput: llmTokensOutput,
    sessionId: parsed.data.sessionId,
    diagnosticId: context.diagnostic?.id ?? null,
    recommendationId: context.session?.recommendationId ?? null,
    createdBy: auth.profile.id,
    errorMessage: llmErrorMessage,
    fallbackReason,
  });

  createActivityLog({
    eventType: "training_support_generated",
    sessionId: parsed.data.sessionId,
    diagnosticId: context.diagnostic?.id ?? null,
    clientId: context.client?.id ?? null,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    metadata: {
      source: result.source,
      model: result.model,
      supportTitle: result.support.supportTitle,
      totalDurationHours: result.support.totalDurationHours,
      modulesCount: result.support.modules.length,
      participantsCount: mergedParticipants.length,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json(result);
}
