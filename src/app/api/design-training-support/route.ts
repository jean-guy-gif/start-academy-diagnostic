import { NextResponse } from "next/server";
import { z } from "zod";

import { buildDesignedSupportPrompt } from "@/lib/ai/build-designed-support-prompt";
import { buildHeuristicDesignedSupport } from "@/lib/ai/heuristic-designed-support";
import { selectCoachBrainContentForSupport } from "@/lib/coach-brain/coach-brain-service";
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
import {
  DesignedSupportSchema,
  type DesignedSupportGenerationResult,
} from "@/lib/ai/designed-support-schema";
import {
  TrainingSupportSchema,
  type TrainingSupport,
} from "@/lib/ai/training-support-schema";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import type { ClientRecord } from "@/lib/diagnostics/diagnostic-service";

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
  sessionId: z.string().min(1),
  // Payload inline pour le mode localStorage (mêmes garanties que les
  // autres routes : si Supabase est inaccessible, le service client
  // fournit le contexte ici).
  support: TrainingSupportSchema.optional(),
  client: ClientPayloadSchema.optional(),
});

// ---------------------------------------------------------------------------
// Chargement Supabase — récupère le support persisté et le client.
// ---------------------------------------------------------------------------

interface LoadedContext {
  support: TrainingSupport;
  client: ClientRecord | null;
  loadedFromSupabase: boolean;
}

async function loadFromSupabase(
  sessionId: string
): Promise<LoadedContext | null> {
  const client =
    createSupabaseAdminClient() ?? createSupabaseServerClient();
  if (!client) return null;
  try {
    const { data: supportRow, error: supportErr } = await client
      .from("training_supports")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (supportErr || !supportRow) return null;

    let support: TrainingSupport;
    try {
      support = TrainingSupportSchema.parse(supportRow.support_json);
    } catch {
      return null;
    }

    const { data: sessionRow } = await client
      .from("training_sessions")
      .select("client_id")
      .eq("id", sessionId)
      .maybeSingle();

    let clientRecord: ClientRecord | null = null;
    if (sessionRow?.client_id) {
      const { data: clientRow } = await client
        .from("clients")
        .select("*")
        .eq("id", sessionRow.client_id)
        .maybeSingle();
      if (clientRow) {
        clientRecord = {
          id: clientRow.id,
          companyName: clientRow.company_name,
          director: clientRow.director,
          email: clientRow.email,
          phone: clientRow.phone,
          collaboratorsCount: clientRow.collaborators_count,
          teamTypology: clientRow.team_typology as ClientRecord["teamTypology"],
          createdAt: clientRow.created_at,
        };
      }
    }

    return { support, client: clientRecord, loadedFromSupabase: true };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers monitoring IA — l'écriture passe désormais par
// `logAiGeneration` (cf. src/lib/ai/ai-monitoring-service.ts).
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

  // Garde d'ownership : seul admin ou un commercial/trainer interne
  // ayant accès à la session peut déclencher le design (et la
  // consommation de crédits OpenRouter associée).
  const access = await assertCanAccessSession(auth.profile, parsed.data.sessionId);
  if (!access.ok) return access.response;

  // Rate limit après ownership pour ne pas compter les refus.
  const ROUTE_PATH = "/api/design-training-support";
  const rate = await checkAiRateLimit({
    userId: auth.profile.id,
    route: ROUTE_PATH,
  });
  if (rate.ok && !rate.allowed) {
    void logAiGeneration({
      route: ROUTE_PATH,
      purpose: "design-training-support",
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

  // 1. Charger le support depuis Supabase, fallback payload inline.
  const fromSupabase = await loadFromSupabase(parsed.data.sessionId);
  const inline: LoadedContext | null = parsed.data.support
    ? {
        support: parsed.data.support as TrainingSupport,
        client: (parsed.data.client ?? null) as ClientRecord | null,
        loadedFromSupabase: false,
      }
    : null;
  const context = fromSupabase ?? inline;
  if (!context) {
    return NextResponse.json(
      {
        error:
          "Support pédagogique introuvable : ni Supabase ni payload inline disponibles.",
      },
      { status: 404 }
    );
  }

  // Coach Brain / COACHNXT — placeholder. Renvoie aujourd'hui un
  // contexte vide ; ne change rien au rendu tant que la lecture amont
  // `coach_brain_patterns` n'est pas branchée.
  const coachBrainContext = await selectCoachBrainContentForSupport({
    sessionId: parsed.data.sessionId,
  });

  const prompt = buildDesignedSupportPrompt({
    client: context.client,
    support: context.support,
    coachBrainContext,
  });

  const notes: string[] = [];
  if (!context.loadedFromSupabase) {
    notes.push("Support pédagogique chargé depuis le payload inline (Supabase indisponible).");
  }

  let result: DesignedSupportGenerationResult | null = null;
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
        const validated = DesignedSupportSchema.parse(parsedJson);
        // Renumérotation systématique : on ne fait jamais confiance à
        // ce que Claude pose sur slideNumber, c'est React qui décide.
        const renumbered = renumberSlides(validated);
        result = {
          design: renumbered,
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
    const heuristic = buildHeuristicDesignedSupport({
      client: context.client,
      support: context.support,
      coachBrainContext,
    });
    const validated = DesignedSupportSchema.parse(heuristic);
    result = {
      design: validated,
      source: "heuristic",
      provider: null,
      model: null,
      generatedAt: new Date().toISOString(),
      notes,
    };
  }

  const aiStatus =
    llmErrorMessage !== null
      ? "error"
      : result.source === "llm"
        ? "success"
        : "fallback";
  void logAiGeneration({
    route: "/api/design-training-support",
    purpose: "design-training-support",
    provider: result.source === "llm" ? "openrouter" : "internal-heuristic",
    model: result.model ?? llmModel,
    source: result.source,
    status: aiStatus,
    durationMs: llmDurationMs,
    tokensInput: llmTokensInput,
    tokensOutput: llmTokensOutput,
    sessionId: parsed.data.sessionId,
    createdBy: auth.profile.id,
    errorMessage: llmErrorMessage,
    fallbackReason,
  });

  createActivityLog({
    eventType: "designed_support_generated",
    sessionId: parsed.data.sessionId,
    clientId: context.client?.id ?? null,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    metadata: {
      source: result.source,
      model: result.model,
      slidesCount: result.design.slides.length,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json(result);
}

function renumberSlides(
  design: ReturnType<typeof DesignedSupportSchema.parse>
): ReturnType<typeof DesignedSupportSchema.parse> {
  return {
    ...design,
    slides: design.slides.map((slide, idx) => ({
      ...slide,
      slideNumber: idx + 1,
    })),
  };
}
