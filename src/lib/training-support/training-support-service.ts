/**
 * Service support de formation — côté client.
 *
 * Persistance :
 *   - Supabase si la session navigateur est authentifiée (RLS permet).
 *     Table cible : `training_supports` (migration 2026-05-23, contrainte
 *     `unique(session_id)` : un seul support par session pour le MVP).
 *   - Sinon fallback localStorage (clé `sa.training-supports.fallback.v1`).
 *
 * Aucune clé LLM n'est accédée ici : la route serveur garde le monopole
 * de l'appel modèle. L'API loggue dans `ai_generation_logs` ; la
 * persistance du support lui-même est faite ici, côté client, pour que
 * `created_by` reflète l'utilisateur authentifié (impossible avec
 * l'admin client server-side).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  getTrainingSessionById,
  listParticipantsBySession,
  type ServiceMode,
  type ServiceResult,
} from "@/lib/sessions/session-service";
import { getDiagnosticSummary } from "@/lib/diagnostics/diagnostic-service";
import { getRecommendationByDiagnosticId } from "@/lib/recommendations/recommendation-service";
import { getCachedProposalByDiagnosticId } from "@/lib/proposals/proposal-service";
import {
  TrainingSupportSchema,
  type TrainingSupport,
  type TrainingSupportGenerationResult,
  type TrainingSupportSource,
} from "@/lib/ai/training-support-schema";

export type SupportStatus = "draft" | "validated" | "archived";

export interface StoredTrainingSupport extends TrainingSupportGenerationResult {
  id: string;
  sessionId: string;
  diagnosticId: string | null;
  recommendationId: string | null;
  status: SupportStatus;
  persistedInSupabase: boolean;
}

// Fallback localStorage — usage strictement dev / démo. Voir
// `src/lib/storage/local-fallback.ts` pour la politique complète.
// En production avec Supabase, ce store n'est pas la source de vérité.
const LS_KEY = "sa.training-supports.fallback.v1";

interface LocalStore {
  items: StoredTrainingSupport[];
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as LocalStore;
    return { items: parsed.items ?? [] };
  } catch {
    return { items: [] };
  }
}

function writeLocal(store: LocalStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota / storage unavailable */
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Erreur inconnue";
}

function rowToStored(row: Tables<"training_supports">): StoredTrainingSupport {
  const support = parseSupportJson(row.support_json);
  return {
    id: row.id,
    sessionId: row.session_id,
    diagnosticId: row.diagnostic_id,
    recommendationId: row.recommendation_id,
    support,
    source: row.source as TrainingSupportSource,
    provider: row.source === "openrouter" ? "openrouter" : null,
    model: row.model,
    generatedAt: row.created_at,
    notes: [],
    status: row.status,
    persistedInSupabase: true,
  };
}

function parseSupportJson(value: Json): TrainingSupport {
  try {
    // Re-valider la donnée venant de Supabase au cas où elle aurait été
    // modifiée hors application — défense en profondeur.
    return TrainingSupportSchema.parse(value);
  } catch {
    // Si la donnée existante n'est pas parsable, on retourne un objet
    // minimal pour que l'UI puisse afficher un état dégradé sans crash.
    return {
      supportTitle: "Support indisponible",
      sessionSummary: "Le support stocké n'est pas conforme au schéma actuel.",
      targetAudience: "—",
      totalDurationHours: 0,
      pedagogicalIntent: "Régénérer le support pour reconstruire les données.",
      modules: [
        {
          moduleTitle: "Support à régénérer",
          durationHours: 1,
          problemStatement: "Données stockées incompatibles avec le schéma actuel.",
          awarenessSequence: "Relancer la génération du support.",
          fundamentals: [
            "Le schéma du support a évolué.",
            "Cliquer sur Régénérer pour obtenir un support complet.",
          ],
          aiAccelerator: {
            objective: "Reconstruire un support exploitable.",
            tools: [],
            examplePrompts: [],
          },
          concreteBusinessExercise: {
            title: "Régénération",
            context: "Données indisponibles.",
            instructions: [
              "Cliquer sur Régénérer.",
              "Vérifier le contenu obtenu.",
            ],
            expectedOutput: "Support à jour.",
          },
          realCasesToUse: [],
          stepClosing: "Support reconstruit.",
          fieldAction: "—",
          progressIndicator: "—",
        },
      ],
      facilitatorNotes: [],
      participantPreparation: [],
      materialsNeeded: [],
      missingInformation: ["Support stocké invalide."],
      confidenceScore: 0,
    };
  }
}

export function cacheTrainingSupportLocally(
  sessionId: string,
  support: StoredTrainingSupport
): void {
  const store = readLocal();
  store.items = store.items.filter((it) => it.sessionId !== sessionId);
  store.items.unshift(support);
  writeLocal(store);
}

// ---------------------------------------------------------------------------
// Persistance — saveTrainingSupport / updateTrainingSupportStatus
// ---------------------------------------------------------------------------

export interface SaveTrainingSupportInput {
  sessionId: string;
  diagnosticId: string | null;
  recommendationId: string | null;
  support: TrainingSupport;
  source: TrainingSupportSource;
  model: string | null;
  generatedAt: string;
  notes: string[];
}

export async function saveTrainingSupport(
  input: SaveTrainingSupportInput
): Promise<ServiceResult<StoredTrainingSupport>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_supports")
        .upsert(
          {
            session_id: input.sessionId,
            diagnostic_id: input.diagnosticId,
            recommendation_id: input.recommendationId,
            title: input.support.supportTitle,
            support_json: input.support as unknown as Json,
            source: input.source as "openrouter" | "heuristic",
            model: input.model,
            confidence_score: Math.round(input.support.confidenceScore),
            status: "draft",
          },
          { onConflict: "session_id" }
        )
        .select("*")
        .single();
      if (error) throw error;
      const stored: StoredTrainingSupport = {
        ...rowToStored(data),
        notes: input.notes,
      };
      // Synchronise aussi le cache local pour rester cohérent.
      cacheTrainingSupportLocally(input.sessionId, stored);
      return { data: stored, mode: "supabase", error: null };
    } catch (err) {
      return saveLocally(input, errorMessage(err));
    }
  }
  return saveLocally(input, "Variables Supabase non configurées");
}

function saveLocally(
  input: SaveTrainingSupportInput,
  error: string
): ServiceResult<StoredTrainingSupport> {
  const stored: StoredTrainingSupport = {
    id: randomId(),
    sessionId: input.sessionId,
    diagnosticId: input.diagnosticId,
    recommendationId: input.recommendationId,
    support: input.support,
    source: input.source,
    provider: input.source === "llm" ? "openrouter" : null,
    model: input.model,
    generatedAt: input.generatedAt,
    notes: input.notes,
    status: "draft",
    persistedInSupabase: false,
  };
  cacheTrainingSupportLocally(input.sessionId, stored);
  return { data: stored, mode: "local", error };
}

export async function updateTrainingSupportStatus(
  supportId: string,
  status: SupportStatus
): Promise<ServiceResult<StoredTrainingSupport | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_supports")
        .update({ status })
        .eq("id", supportId)
        .select("*")
        .single();
      if (error) throw error;
      const stored = rowToStored(data);
      cacheTrainingSupportLocally(stored.sessionId, stored);
      return { data: stored, mode: "supabase", error: null };
    } catch (err) {
      return updateStatusLocally(supportId, status, errorMessage(err));
    }
  }
  return updateStatusLocally(
    supportId,
    status,
    "Variables Supabase non configurées"
  );
}

function updateStatusLocally(
  supportId: string,
  status: SupportStatus,
  error: string
): ServiceResult<StoredTrainingSupport | null> {
  const store = readLocal();
  const idx = store.items.findIndex((it) => it.id === supportId);
  if (idx === -1) {
    return { data: null, mode: "local", error };
  }
  store.items[idx] = { ...store.items[idx], status };
  writeLocal(store);
  return { data: store.items[idx], mode: "local", error };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getTrainingSupportBySessionId(
  sessionId: string
): Promise<ServiceResult<StoredTrainingSupport | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_supports")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return readCachedFallback(sessionId, null);
      return { data: rowToStored(data), mode: "supabase", error: null };
    } catch (err) {
      return readCachedFallback(sessionId, errorMessage(err));
    }
  }
  return readCachedFallback(sessionId, "Variables Supabase non configurées");
}

function readCachedFallback(
  sessionId: string,
  error: string | null
): ServiceResult<StoredTrainingSupport | null> {
  const store = readLocal();
  const found = store.items.find((it) => it.sessionId === sessionId) ?? null;
  return { data: found, mode: "local", error };
}

// Alias rétro-compatible avec l'API existante du service.
export async function getCachedTrainingSupportBySessionId(
  sessionId: string
): Promise<ServiceResult<StoredTrainingSupport | null>> {
  return getTrainingSupportBySessionId(sessionId);
}

// ---------------------------------------------------------------------------
// Orchestration : génération + persistance
// ---------------------------------------------------------------------------

export interface TrainingSupportOutcome {
  stored: StoredTrainingSupport;
  warnings: string[];
}

export async function generateTrainingSupport(
  sessionId: string
): Promise<ServiceResult<TrainingSupportOutcome | null>> {
  // 1. Charger la session côté client.
  const sessionResult = await getTrainingSessionById(sessionId);
  if (!sessionResult.data) {
    return {
      data: null,
      mode: sessionResult.mode,
      error: sessionResult.error ?? "Session introuvable.",
    };
  }
  const session = sessionResult.data;
  const diagnosticId = session.diagnosticId;

  // 2. Charger diagnostic / recommandation / proposition / participants
  //    en parallèle (chaque appel a son fallback interne).
  const [diagSummary, recommendation, proposal, participants] = await Promise.all([
    diagnosticId
      ? getDiagnosticSummary(diagnosticId)
      : Promise.resolve({ data: null, mode: "local" as const, error: null }),
    diagnosticId
      ? getRecommendationByDiagnosticId(diagnosticId)
      : Promise.resolve({ data: null, mode: "local" as const, error: null }),
    diagnosticId
      ? getCachedProposalByDiagnosticId(diagnosticId)
      : Promise.resolve({ data: null, mode: "local" as const, error: null }),
    listParticipantsBySession(sessionId),
  ]);

  if (!recommendation.data) {
    // Le service local (session-service) connaît uniquement
    // "supabase" | "local". Si l'amont remonte "unavailable"
    // (preprod/prod sans API), on remappe en "local" et on transmet
    // le `error` explicite pour ne pas perdre le message.
    const downstreamMode =
      recommendation.mode === "unavailable" ? "local" : recommendation.mode;
    return {
      data: null,
      mode: downstreamMode,
      error:
        recommendation.error ??
        "Aucune recommandation associée — lancer l'analyse avant de générer le support.",
    };
  }

  // 3. POST API.
  const payload = {
    sessionId,
    session,
    diagnostic: diagSummary.data?.diagnostic,
    client: diagSummary.data?.client ?? null,
    recommendation: recommendation.data.recommendation,
    proposal: proposal.data?.proposal,
    participants: participants.data,
  };

  let response: Response;
  try {
    response = await fetch("/api/generate-training-support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Appel /api/generate-training-support impossible (${errorMessage(err)}).`,
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody && typeof errBody === "object" && "error" in errBody) {
        detail = String((errBody as { error: unknown }).error);
      }
    } catch {
      /* ignore */
    }
    return { data: null, mode: "local", error: `Échec de la génération : ${detail}` };
  }

  let result: TrainingSupportGenerationResult;
  try {
    result = (await response.json()) as TrainingSupportGenerationResult;
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Réponse invalide (${errorMessage(err)}).`,
    };
  }

  // 4. Persistance via le service (Supabase si auth, sinon localStorage).
  const saveResult = await saveTrainingSupport({
    sessionId,
    diagnosticId,
    recommendationId: recommendation.data.supabaseRecommendationId,
    support: result.support,
    source: result.source,
    model: result.model,
    generatedAt: result.generatedAt,
    notes: result.notes,
  });

  const warnings = [...result.notes];
  if (saveResult.mode === "local" && saveResult.error) {
    warnings.push(`Persistance Supabase: ${saveResult.error}`);
  }

  const mode: ServiceMode = saveResult.mode;
  return {
    data: { stored: saveResult.data, warnings },
    mode,
    error: null,
  };
}
