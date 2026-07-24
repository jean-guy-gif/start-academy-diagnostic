/**
 * Service recommandation côté client.
 *
 * Orchestre :
 *   1. Récupération du diagnostic + réponses via diagnostic-service
 *      (Supabase si dispo, sinon localStorage).
 *   2. Appel de la route serveur /api/analyze-training-need en
 *      passant le payload inline quand on est en mode local.
 *   3. Persistance de la recommandation côté Supabase (effectuée par
 *      la route) ou côté localStorage (effectuée ici en fallback).
 *
 * Aucune clé LLM n'est jamais accédée ici : le serveur garde le
 * monopole de l'appel modèle.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getDiagnosticSummary,
  type DiagnosticSummary,
  type ServiceMode,
  type ServiceResult,
} from "@/lib/diagnostics/diagnostic-service";
import type {
  AnalyzeResult,
  Recommendation,
} from "@/lib/ai/recommendation-schema";
import { isLocalFallbackAllowed } from "@/lib/storage/local-fallback";

export interface StoredRecommendation extends AnalyzeResult {
  id: string;
  diagnosticId: string;
  persistedInSupabase: boolean;
  supabaseRecommendationId: string | null;
}

// Fallback localStorage — usage strictement dev / démo. Voir la
// politique complète dans `src/lib/storage/local-fallback.ts`. En
// production avec Supabase, ce store ne doit jamais être l'unique
// source de vérité.
const LS_KEY = "sa.recommendations.fallback.v1";

interface LocalStore {
  items: StoredRecommendation[];
}

function readLocal(): LocalStore {
  // Fail-closed : hors mode local, aucune lecture localStorage — les
  // données métier ne doivent JAMAIS resurgir en preprod/production.
  if (!isLocalFallbackAllowed()) return { items: [] };
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
  // Fail-closed : hors mode local, aucune écriture localStorage.
  if (!isLocalFallbackAllowed()) return;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota or storage unavailable */
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

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export interface AnalyzeOutcome {
  stored: StoredRecommendation;
  warnings: string[];
}

export async function analyzeDiagnostic(
  diagnosticId: string
): Promise<ServiceResult<AnalyzeOutcome | null>> {
  const summaryResult = await getDiagnosticSummary(diagnosticId);
  if (!summaryResult.data) {
    return {
      data: null,
      mode: summaryResult.mode,
      error: summaryResult.error ?? "Diagnostic introuvable.",
    };
  }

  const payload = buildPayload(diagnosticId, summaryResult.data);

  let response: Response;
  try {
    response = await fetch("/api/analyze-training-need", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Appel /api/analyze-training-need impossible (${errorMessage(err)}).`,
    };
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body && typeof body === "object" && "error" in body) {
        detail = String((body as { error: unknown }).error);
      }
    } catch {
      /* ignore */
    }
    return {
      data: null,
      mode: "local",
      error: `Échec de l'analyse : ${detail}`,
    };
  }

  let body: AnalyzeResult & {
    saved: {
      persisted: boolean;
      recommendationId: string | null;
      error: string | null;
    };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Réponse invalide (${errorMessage(err)}).`,
    };
  }

  const warnings = [...body.notes];
  if (body.saved.error) warnings.push(`Persistance Supabase: ${body.saved.error}`);

  const stored: StoredRecommendation = {
    id: body.saved.recommendationId ?? randomId(),
    diagnosticId,
    recommendation: body.recommendation,
    source: body.source,
    provider: body.provider,
    model: body.model,
    generatedAt: body.generatedAt,
    notes: body.notes,
    persistedInSupabase: body.saved.persisted,
    supabaseRecommendationId: body.saved.recommendationId,
  };

  // Cache local quand pas persisté Supabase (pour retrouver le résultat sur
  // /diagnostics/[id]/recommendation au prochain reload).
  if (!stored.persistedInSupabase) {
    const store = readLocal();
    store.items = store.items.filter((it) => it.diagnosticId !== diagnosticId);
    store.items.unshift(stored);
    writeLocal(store);
  }

  const mode: ServiceMode = stored.persistedInSupabase ? "supabase" : "local";
  return { data: { stored, warnings }, mode, error: null };
}

export async function getRecommendationByDiagnosticId(
  diagnosticId: string
): Promise<ServiceResult<StoredRecommendation | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("recommendations")
        .select(
          "id, diagnostic_id, client_summary, detected_needs, performance_issues, tool_maturity, skill_level, required_foundations, total_duration_hours, cost_per_participant, confidence_score, missing_information, commercial_explanation, created_at, recommendation_modules(module_id, position, reason, duration_hours, business_ratio_targeted, use_cases, priority_tier)"
        )
        .eq("diagnostic_id", diagnosticId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return readLocalCopy(diagnosticId, null);

      const row = data as typeof data & {
        recommendation_modules:
          | {
              module_id: string;
              position: number;
              reason: string | null;
              duration_hours: number | null;
              business_ratio_targeted: string | null;
              use_cases: unknown;
              priority_tier?:
                | "essential"
                | "recommended"
                | "optional"
                | "later"
                | null;
            }[]
          | null;
      };

      const modules = (row.recommendation_modules ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          moduleId: m.module_id,
          moduleName: m.module_id, // fallback en attendant un join modules
          reason: m.reason ?? "",
          priority: m.position || 1,
          priorityTier: m.priority_tier ?? null,
          durationHours: m.duration_hours ?? 0,
          businessRatioTargeted: m.business_ratio_targeted,
          useCases: Array.isArray(m.use_cases) ? (m.use_cases as string[]) : [],
        }));

      const recommendation: Recommendation = {
        clientSummary: row.client_summary ?? "",
        detectedNeeds: toStringArray(row.detected_needs),
        performanceIssues: toStringArray(row.performance_issues),
        toolMaturity: (row.tool_maturity ?? "medium") as Recommendation["toolMaturity"],
        skillLevel: (row.skill_level ?? "mixed") as Recommendation["skillLevel"],
        requiredFoundations: toStringArray(row.required_foundations),
        recommendedModules: modules,
        totalDurationHours: Number(row.total_duration_hours ?? 0),
        costPerParticipant:
          row.cost_per_participant === null
            ? null
            : Number(row.cost_per_participant),
        confidenceScore: Number(row.confidence_score ?? 0),
        missingInformation: toStringArray(row.missing_information),
        commercialExplanation: row.commercial_explanation ?? "",
        alertsAcknowledged: [],
      };

      const stored: StoredRecommendation = {
        id: row.id,
        diagnosticId,
        recommendation,
        source: "llm", // la table ne stocke pas la source, on suppose LLM par défaut
        provider: null,
        model: null,
        generatedAt: row.created_at,
        notes: [],
        persistedInSupabase: true,
        supabaseRecommendationId: row.id,
      };
      return { data: stored, mode: "supabase", error: null };
    } catch (err) {
      return readLocalCopy(diagnosticId, errorMessage(err));
    }
  }
  return readLocalCopy(diagnosticId, "Variables Supabase non configurées");
}

function readLocalCopy(
  diagnosticId: string,
  error: string | null
): ServiceResult<StoredRecommendation | null> {
  const store = readLocal();
  const found = store.items.find((it) => it.diagnosticId === diagnosticId) ?? null;
  return { data: found, mode: "local", error };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function buildPayload(diagnosticId: string, summary: DiagnosticSummary) {
  return {
    diagnosticId,
    diagnostic: summary.diagnostic,
    client: summary.client,
    answers: summary.answers,
  };
}
