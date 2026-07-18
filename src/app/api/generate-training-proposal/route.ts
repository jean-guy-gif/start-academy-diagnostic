import { NextResponse } from "next/server";
import { z } from "zod";

import { buildProposalPrompt } from "@/lib/ai/build-proposal-prompt";
import { buildHeuristicProposal } from "@/lib/ai/heuristic-proposal";
import { callLlm, extractJsonObject } from "@/lib/ai/llm-client";
import {
  ProposalSchema,
  type ProposalGenerationResult,
} from "@/lib/ai/proposal-schema";
import { RecommendationSchema } from "@/lib/ai/recommendation-schema";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import type {
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { Recommendation } from "@/lib/ai/recommendation-schema";
import type { Pricing } from "@/lib/ai/proposal-schema";
import {
  buildPricingNote,
  calculateCostPerParticipant,
  calculateTotalTrainingBudget,
} from "@/lib/pricing/training-pricing";
import { getActiveFundingConfig } from "@/lib/pricing/funding-config-service";
import {
  estimateTrainingFunding,
  type ParticipantProfessionalStatus,
} from "@/lib/pricing/training-funding";
import { listDiagnosticParticipants } from "@/lib/diagnostics/diagnostic-participants-service";
import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { createActivityLog } from "@/lib/activity/activity-log-service";
import { logAiGeneration } from "@/lib/ai/ai-monitoring-service";
import {
  checkAiRateLimit,
  formatRateLimitError,
} from "@/lib/ai/ai-rate-limit-service";

export const runtime = "nodejs";

/**
 * Applique la règle tarifaire Start Academy
 * (`pricePerHourPerParticipant` € HT / heure / participant, tout
 * compris) + l'estimation de prise en charge à un objet `Pricing` —
 * utilisée AVANT validation Zod côté route LLM. Le LLM ne décide
 * jamais du prix : il met null partout, le code écrase ces valeurs ici.
 *
 * Le tarif horaire est injecté depuis `funding_config` (seed
 * PRICE_PER_HOUR_PER_PARTICIPANT) — pas de constante en dur ici.
 *
 * `participants` optionnel : si fourni (lecture diagnostic_participants),
 * on calcule `estimatedFundingTotal` et `estimatedRemainingCost`. Sinon
 * ces champs restent null.
 */
function applyStartAcademyPricing(
  totalDurationHours: number | null,
  participantCount: number | null,
  pricePerHourPerParticipant: number,
  participants:
    | {
        professionalStatus: ParticipantProfessionalStatus | null;
        previousYearProduction: number | null;
        eligibleOpco?: boolean | null;
        ageficeAmountConsumedCurrentYear?: number | null;
      }[]
    | null = null,
  opcoEpAmountConsumedCurrentYear: number | null = null
): Pricing {
  const costPerParticipant = calculateCostPerParticipant(
    totalDurationHours,
    pricePerHourPerParticipant
  );
  const totalEstimatedCost = calculateTotalTrainingBudget(
    totalDurationHours,
    participantCount,
    pricePerHourPerParticipant
  );

  let estimatedFundingTotal: number | null = null;
  let estimatedRemainingCost: number | null = null;
  let eligibleParticipantCount: number | null = null;
  let fundingDisclaimer: string | null = null;
  if (participants && participants.length > 0 && costPerParticipant !== null) {
    const summary = estimateTrainingFunding({
      participants,
      costPerParticipant,
      totalBudget: totalEstimatedCost,
      opcoEpAmountConsumedCurrentYear,
    });
    estimatedFundingTotal = summary.estimatedFundingTotal;
    estimatedRemainingCost = summary.estimatedRemainingCost;
    eligibleParticipantCount = summary.eligibleParticipantCount;
    fundingDisclaimer = summary.disclaimer;
  }

  return {
    costPerParticipant,
    participantCount,
    totalEstimatedCost,
    pricingNote:
      totalEstimatedCost === null
        ? buildPricingNote({
            totalDurationHours,
            participantCount,
            pricePerHourPerParticipant,
          })
        : null,
    estimatedFundingTotal,
    estimatedRemainingCost,
    eligibleParticipantCount,
    fundingDisclaimer,
  };
}

// ---------------------------------------------------------------------------
// Schemas d'entrée
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

const RequestSchema = z.object({
  diagnosticId: z.string().min(1),
  recommendationId: z.string().optional(),
  recommendation: RecommendationSchema.optional(),
  diagnostic: DiagnosticPayloadSchema.optional(),
  client: ClientPayloadSchema.optional(),
});

// ---------------------------------------------------------------------------
// Chargement Supabase
// ---------------------------------------------------------------------------

interface LoadedContext {
  diagnostic: DiagnosticRecord;
  client: ClientRecord | null;
  recommendation: Recommendation;
  loadedFromSupabase: boolean;
  // Chantier A funding-opco-ep §9.1 — consommation OPCO EP déjà entamée
  // par l'entreprise sur l'année civile en cours. Sert à retrancher
  // l'enveloppe salariés avant plafonnement (cf. training-funding.ts).
  // NULL = non renseigné → warning « estimation à valider », pas 0
  // silencieux (cf. PRD §9.3).
  opcoEpAmountConsumedCurrentYear: number | null;
}

async function loadFromSupabase(
  diagnosticId: string,
  recommendationId: string | undefined
): Promise<LoadedContext | null> {
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

    let recQuery = client
      .from("recommendations")
      .select(
        "*, recommendation_modules(module_id, position, reason, duration_hours, business_ratio_targeted, use_cases, priority_tier)"
      )
      .eq("diagnostic_id", diagnosticId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (recommendationId) {
      recQuery = client
        .from("recommendations")
        .select(
          "*, recommendation_modules(module_id, position, reason, duration_hours, business_ratio_targeted, use_cases, priority_tier)"
        )
        .eq("id", recommendationId)
        .limit(1);
    }

    const { data: recRows, error: recErr } = await recQuery;
    if (recErr || !recRows || recRows.length === 0) return null;
    const recRow = recRows[0];

    const recModules = (recRow.recommendation_modules ?? [])
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

    const recommendation: Recommendation = {
      clientSummary: recRow.client_summary ?? "",
      detectedNeeds: toStringArray(recRow.detected_needs),
      performanceIssues: toStringArray(recRow.performance_issues),
      toolMaturity:
        (recRow.tool_maturity ?? "medium") as Recommendation["toolMaturity"],
      skillLevel:
        (recRow.skill_level ?? "mixed") as Recommendation["skillLevel"],
      requiredFoundations: toStringArray(recRow.required_foundations),
      recommendedModules: recModules,
      totalDurationHours: Number(recRow.total_duration_hours ?? 0),
      costPerParticipant:
        recRow.cost_per_participant === null
          ? null
          : Number(recRow.cost_per_participant),
      confidenceScore: Number(recRow.confidence_score ?? 0),
      missingInformation: toStringArray(recRow.missing_information),
      commercialExplanation: recRow.commercial_explanation ?? "",
      alertsAcknowledged: [],
    };

    return {
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
      recommendation,
      loadedFromSupabase: true,
      opcoEpAmountConsumedCurrentYear:
        diagRow.opco_ep_amount_consumed_current_year ?? null,
    };
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
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
  // la génération de proposition (et la consommation OpenRouter
  // associée) sur un diagnostic qui ne lui appartient pas (audit
  // I-2). Admin bypass.
  const access = await assertCanAccessDiagnostic(
    auth.profile,
    parsed.data.diagnosticId
  );
  if (!access.ok) return access.response;

  // Rate limit après ownership pour ne pas pénaliser les requêtes
  // refusées. Failopen si l'infra rate-limit est KO.
  const ROUTE_PATH = "/api/generate-training-proposal";
  const rate = await checkAiRateLimit({
    userId: auth.profile.id,
    route: ROUTE_PATH,
  });
  if (rate.ok && !rate.allowed) {
    void logAiGeneration({
      route: ROUTE_PATH,
      purpose: "generate_proposal",
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

  // 1. Charger le contexte (Supabase prioritaire, sinon payload inline).
  const fromSupabase = await loadFromSupabase(
    parsed.data.diagnosticId,
    parsed.data.recommendationId
  );

  const inline =
    parsed.data.diagnostic && parsed.data.recommendation
      ? {
          diagnostic: parsed.data.diagnostic as DiagnosticRecord,
          client: (parsed.data.client ?? null) as ClientRecord | null,
          recommendation: parsed.data.recommendation as Recommendation,
          loadedFromSupabase: false,
          // Payload inline hérité MVP1 — pas de champ v1.0. Défaut null
          // → warning « estimation à valider » côté funding.
          opcoEpAmountConsumedCurrentYear: null,
        }
      : null;

  const context = fromSupabase ?? inline;
  if (!context) {
    return NextResponse.json(
      {
        error:
          "Contexte introuvable : ni la recommandation Supabase ni le payload inline ne sont disponibles.",
      },
      { status: 404 }
    );
  }

  // 2. Construire le prompt et tenter OpenRouter.
  const prompt = buildProposalPrompt({
    client: context.client,
    diagnostic: context.diagnostic,
    recommendation: context.recommendation,
  });

  const notes: string[] = [];
  if (!context.loadedFromSupabase) {
    notes.push("Recommandation chargée depuis le payload inline (Supabase indisponible).");
  }

  // Charge la liste prévisionnelle des participants pour pouvoir
  // estimer la prise en charge (règle agent commercial indépendant
  // production N-1 > 7 000 €, plafond 3 000 € / pers.). Vide si pas
  // encore renseigné — le pricing tombe alors juste sur cost +
  // total sans funding.
  const diagParticipants = await listDiagnosticParticipants(
    context.diagnostic.id
  );
  // T-6 (fix 2026-07-08) : propage eligibleOpco pour que la branche
  // salarié OPCO EP du moteur funding soit prise en compte. Sans ça,
  // estimateTrainingFunding retourne 0 € pour tout salarié éligible
  // (manque à gagner commercial visible sur la proposition).
  const fundingParticipants = diagParticipants.map((p) => ({
    professionalStatus: p.professionalStatus as ParticipantProfessionalStatus | null,
    previousYearProduction: p.previousYearProduction,
    eligibleOpco: p.eligibleOpco ?? null,
    // Chantier A funding-opco-ep §9.2 — cf. training-funding.ts
    ageficeAmountConsumedCurrentYear:
      p.ageficeAmountConsumedCurrentYear ?? null,
  }));

  // Tarif horaire Start Academy lu depuis `funding_config` (seed
  // PRICE_PER_HOUR_PER_PARTICIPANT). `getActiveFundingConfig()` est
  // best-effort et retombe silencieusement sur `DEFAULT_FUNDING_CONFIG`
  // en cas d'indisponibilité Supabase — jamais de throw.
  const fundingConfigForPricing = await getActiveFundingConfig();
  const pricePerHour = fundingConfigForPricing.pricePerHourPerParticipant;

  let result: ProposalGenerationResult | null = null;
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
        const validated = ProposalSchema.parse(parsedJson);
        // Règle Start Academy : la tarification est calculée par le code,
        // jamais par le LLM. On overrid les champs pricing à partir de
        // la recommandation + diagnostic + participants prévisionnels,
        // peu importe ce que Claude a mis dans sa sortie.
        const pricingApplied: typeof validated = {
          ...validated,
          pricing: applyStartAcademyPricing(
            context.recommendation.totalDurationHours,
            context.diagnostic.expectedParticipants ?? null,
            pricePerHour,
            fundingParticipants.length > 0 ? fundingParticipants : null,
            context.opcoEpAmountConsumedCurrentYear
          ),
        };
        result = {
          proposal: pricingApplied,
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
    const heuristic = buildHeuristicProposal({
      client: context.client,
      diagnostic: context.diagnostic,
      recommendation: context.recommendation,
      pricePerHourPerParticipant: pricePerHour,
    });
    const heuristicWithFunding: typeof heuristic = {
      ...heuristic,
      pricing: applyStartAcademyPricing(
        context.recommendation.totalDurationHours,
        context.diagnostic.expectedParticipants ?? null,
        pricePerHour,
        fundingParticipants.length > 0 ? fundingParticipants : null,
        context.opcoEpAmountConsumedCurrentYear
      ),
    };
    const validated = ProposalSchema.parse(heuristicWithFunding);
    result = {
      proposal: validated,
      source: "heuristic",
      provider: null,
      model: null,
      generatedAt: new Date().toISOString(),
      notes,
    };
  }

  // Pas de persistance Supabase : aucune table dédiée pour les
  // propositions. Le client gère le cache localStorage.
  createActivityLog({
    eventType: "proposal_generated",
    diagnosticId: context.diagnostic.id,
    clientId: context.client?.id ?? null,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    metadata: {
      source: result.source,
      model: result.model,
      proposalTitle: result.proposal.proposalTitle,
      totalDurationHours: result.proposal.trainingProgram.totalDurationHours,
      costPerParticipant: result.proposal.pricing.costPerParticipant,
      totalEstimatedCost: result.proposal.pricing.totalEstimatedCost,
      eligibleParticipantCount:
        result.proposal.pricing.eligibleParticipantCount ?? null,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  const aiStatus =
    llmErrorMessage !== null
      ? "error"
      : result.source === "llm"
        ? "success"
        : "fallback";
  void logAiGeneration({
    route: "/api/generate-training-proposal",
    purpose: "generate_proposal",
    provider: result.source === "llm" ? "openrouter" : "internal-heuristic",
    model: result.model,
    source: result.source,
    status: aiStatus,
    durationMs: llmDurationMs,
    tokensInput: llmTokensInput,
    tokensOutput: llmTokensOutput,
    diagnosticId: context.diagnostic.id,
    createdBy: auth.profile.id,
    errorMessage: llmErrorMessage,
    fallbackReason,
  });

  return NextResponse.json(result);
}
