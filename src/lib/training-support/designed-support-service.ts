/**
 * Service support designé — côté client.
 *
 * Persistance :
 *   - Supabase si la session navigateur est authentifiée (RLS permet).
 *     Table cible : `designed_training_supports` (migration 2026-05-23,
 *     contrainte `unique(session_id)` : un seul design par session pour
 *     le MVP).
 *   - Sinon fallback localStorage (clé `sa.designed-supports.fallback.v1`).
 *
 * Aucune clé LLM n'est accédée ici : la route serveur garde le monopole
 * de l'appel modèle. L'API loggue dans `ai_generation_logs` ; la
 * persistance du design lui-même est faite ici, côté client, pour que
 * `created_by` reflète l'utilisateur authentifié.
 *
 * Le support pédagogique brut (`training_supports`) n'est JAMAIS
 * écrasé : les deux artefacts coexistent et sont liés par
 * `training_support_id`.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { getDiagnosticSummary } from "@/lib/diagnostics/diagnostic-service";
import {
  getTrainingSessionById,
  type ServiceMode,
  type ServiceResult,
} from "@/lib/sessions/session-service";
import { getTrainingSupportBySessionId } from "@/lib/training-support/training-support-service";
import {
  DesignedSupportSchema,
  type DesignedSupport,
  type DesignedSupportGenerationResult,
  type DesignedSupportSource,
} from "@/lib/ai/designed-support-schema";

export type DesignedSupportStatus = "draft" | "validated" | "archived";

export interface StoredDesignedSupport extends DesignedSupportGenerationResult {
  id: string;
  sessionId: string;
  trainingSupportId: string | null;
  status: DesignedSupportStatus;
  persistedInSupabase: boolean;
}

// ---------------------------------------------------------------------------
// localStorage store
//
// Fallback strictement dev / démo. Voir `src/lib/storage/local-fallback.ts`
// pour la politique : aucune sécurité, aucune ségrégation par user, à ne
// pas utiliser comme source de vérité en production.
// ---------------------------------------------------------------------------

const LS_KEY = "sa.designed-supports.fallback.v1";

interface LocalStore {
  items: StoredDesignedSupport[];
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

function rowToStored(
  row: Tables<"designed_training_supports">,
  notes: string[] = []
): StoredDesignedSupport {
  const design = parseDesignJson(row.designed_json);
  return {
    id: row.id,
    sessionId: row.session_id,
    trainingSupportId: row.training_support_id,
    design,
    source: row.source as DesignedSupportSource,
    provider: row.source === "openrouter" ? "openrouter" : null,
    model: row.model,
    generatedAt: row.created_at,
    notes,
    status: row.status,
    persistedInSupabase: true,
  };
}

function parseDesignJson(value: Json): DesignedSupport {
  try {
    // Défense en profondeur : on revalide ce qui sort de Supabase
    // au cas où la donnée aurait été modifiée hors application.
    return DesignedSupportSchema.parse(value);
  } catch {
    // Fallback minimal lisible — JAMAIS de crash UI.
    return {
      designTitle: "Design indisponible",
      designSubtitle: "Le design stocké n'est pas conforme au schéma actuel.",
      visualIntent: "Régénérer le design pour reconstruire les slides.",
      slides: [
        {
          slideNumber: 1,
          slideType: "cover",
          title: "Design à régénérer",
          subtitle: "Données stockées incompatibles avec le schéma actuel.",
          mainMessage:
            "Cliquer sur Régénérer pour reconstruire un déroulé complet.",
          contentBlocks: [],
          trainerNote: null,
          visualGuidance: {
            layout: "hero",
            emphasis: "Régénérer",
            suggestedIcon: null,
            colorMood: "deep_blue",
          },
        },
        {
          slideNumber: 2,
          slideType: "closing",
          title: "Merci",
          subtitle: null,
          mainMessage: "Le design sera reconstruit à la prochaine génération.",
          contentBlocks: [],
          trainerNote: null,
          visualGuidance: {
            layout: "hero",
            emphasis: "Refermer",
            suggestedIcon: null,
            colorMood: "deep_blue",
          },
        },
      ],
      designWarnings: ["Design stocké invalide."],
      confidenceScore: 0,
    };
  }
}

export function cacheDesignedSupportLocally(
  sessionId: string,
  stored: StoredDesignedSupport
): void {
  const store = readLocal();
  store.items = store.items.filter((it) => it.sessionId !== sessionId);
  store.items.unshift(stored);
  writeLocal(store);
}

// ---------------------------------------------------------------------------
// Persistance — saveDesignedSupport / updateDesignedSupportStatus
// ---------------------------------------------------------------------------

export interface SaveDesignedSupportInput {
  sessionId: string;
  trainingSupportId: string | null;
  design: DesignedSupport;
  source: DesignedSupportSource;
  model: string | null;
  generatedAt: string;
  notes: string[];
}

export async function saveDesignedSupport(
  input: SaveDesignedSupportInput
): Promise<ServiceResult<StoredDesignedSupport>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("designed_training_supports")
        .upsert(
          {
            session_id: input.sessionId,
            training_support_id: input.trainingSupportId,
            title: input.design.designTitle,
            subtitle: input.design.designSubtitle || null,
            visual_intent: input.design.visualIntent || null,
            designed_json: input.design as unknown as Json,
            source: input.source,
            model: input.model,
            confidence_score: Math.round(input.design.confidenceScore),
            status: "draft",
          },
          { onConflict: "session_id" }
        )
        .select("*")
        .single();
      if (error) throw error;
      const stored: StoredDesignedSupport = {
        ...rowToStored(data, input.notes),
      };
      // Synchronise le cache local pour cohérence offline.
      cacheDesignedSupportLocally(input.sessionId, stored);
      return { data: stored, mode: "supabase", error: null };
    } catch (err) {
      return saveLocally(input, errorMessage(err));
    }
  }
  return saveLocally(input, "Variables Supabase non configurées");
}

function saveLocally(
  input: SaveDesignedSupportInput,
  error: string
): ServiceResult<StoredDesignedSupport> {
  const stored: StoredDesignedSupport = {
    id: randomId(),
    sessionId: input.sessionId,
    trainingSupportId: input.trainingSupportId,
    design: input.design,
    source: input.source,
    provider: input.source === "llm" ? "openrouter" : null,
    model: input.model,
    generatedAt: input.generatedAt,
    notes: input.notes,
    status: "draft",
    persistedInSupabase: false,
  };
  cacheDesignedSupportLocally(input.sessionId, stored);
  return { data: stored, mode: "local", error };
}

export async function updateDesignedSupportStatus(
  supportId: string,
  status: DesignedSupportStatus
): Promise<ServiceResult<StoredDesignedSupport | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("designed_training_supports")
        .update({ status })
        .eq("id", supportId)
        .select("*")
        .single();
      if (error) throw error;
      const stored = rowToStored(data);
      cacheDesignedSupportLocally(stored.sessionId, stored);
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
  status: DesignedSupportStatus,
  error: string
): ServiceResult<StoredDesignedSupport | null> {
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

export async function getDesignedSupportBySessionId(
  sessionId: string
): Promise<ServiceResult<StoredDesignedSupport | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("designed_training_supports")
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
): ServiceResult<StoredDesignedSupport | null> {
  const store = readLocal();
  const found = store.items.find((it) => it.sessionId === sessionId) ?? null;
  return { data: found, mode: "local", error };
}

// Alias rétro-compatible avec l'API existante du service.
export async function getCachedDesignedSupportBySessionId(
  sessionId: string
): Promise<ServiceResult<StoredDesignedSupport | null>> {
  return getDesignedSupportBySessionId(sessionId);
}

// ---------------------------------------------------------------------------
// Orchestration : génération + persistance
// ---------------------------------------------------------------------------

export interface DesignedSupportOutcome {
  stored: StoredDesignedSupport;
  warnings: string[];
}

export async function generateDesignedSupport(
  sessionId: string
): Promise<ServiceResult<DesignedSupportOutcome | null>> {
  // 1. Le support pédagogique brut est indispensable (et fournit le
  //    training_support_id si persisté Supabase).
  const supportResult = await getTrainingSupportBySessionId(sessionId);
  if (!supportResult.data) {
    return {
      data: null,
      mode: supportResult.mode,
      error:
        supportResult.error ??
        "Aucun support pédagogique trouvé — générer d'abord le support de formation.",
    };
  }

  // 2. Le client (pour personnaliser la couverture) est lu via la session.
  const sessionResult = await getTrainingSessionById(sessionId);
  const diagnosticId = sessionResult.data?.diagnosticId ?? null;
  const summary = diagnosticId
    ? await getDiagnosticSummary(diagnosticId)
    : null;
  const client = summary?.data?.client ?? null;

  // 3. Payload pour la route serveur (inline pour fonctionner même
  //    sans Supabase server-side).
  const payload = {
    sessionId,
    support: supportResult.data.support,
    client,
  };

  // 4. POST API.
  let response: Response;
  try {
    response = await fetch("/api/design-training-support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Appel /api/design-training-support impossible (${errorMessage(err)}).`,
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
    return { data: null, mode: "local", error: `Échec du design : ${detail}` };
  }

  let result: DesignedSupportGenerationResult;
  try {
    result = (await response.json()) as DesignedSupportGenerationResult;
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Réponse invalide (${errorMessage(err)}).`,
    };
  }

  // 5. Persistance via le service (Supabase si auth, sinon localStorage).
  //    `trainingSupportId` n'est passé que si le support brut est en
  //    Supabase (id UUID valide). Sinon null (cas localStorage-only).
  const trainingSupportId = supportResult.data.persistedInSupabase
    ? supportResult.data.id
    : null;

  const saveResult = await saveDesignedSupport({
    sessionId,
    trainingSupportId,
    design: result.design,
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
