/**
 * Service proposition commerciale — côté client.
 *
 * - `generateProposal` orchestre l'appel à la route serveur
 *   `/api/generate-training-proposal`, en passant le payload inline
 *   quand la recommandation vit dans localStorage (Supabase absent).
 * - `getCachedProposalByDiagnosticId` lit le cache local.
 * - `cacheProposalLocally` est exposé (signature utile pour les tests
 *   ou un usage manuel) — le service met aussi en cache automatiquement
 *   chaque génération réussie.
 *
 * Pas de persistance Supabase pour le MVP — aucune table dédiée
 * "proposals" n'a été créée. Si une persistance serveur devient
 * nécessaire, ajouter une mini-migration dédiée (par exemple
 * `proposals` + `proposal_artifacts`) plutôt que détourner une table
 * existante. À ce stade : localStorage suffisant pour l'usage MVP.
 */

import {
  getDiagnosticSummary,
  type ServiceMode,
  type ServiceResult,
} from "@/lib/diagnostics/diagnostic-service";
import { getRecommendationByDiagnosticId } from "@/lib/recommendations/recommendation-service";
import type { ProposalGenerationResult } from "@/lib/ai/proposal-schema";

export interface StoredProposal extends ProposalGenerationResult {
  id: string;
  diagnosticId: string;
  recommendationId: string | null;
}

const LS_KEY = "sa.proposals.fallback.v1";

interface LocalStore {
  items: StoredProposal[];
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

export function cacheProposalLocally(proposal: StoredProposal): void {
  const store = readLocal();
  store.items = store.items.filter(
    (it) => it.diagnosticId !== proposal.diagnosticId
  );
  store.items.unshift(proposal);
  writeLocal(store);
}

export interface ProposalOutcome {
  stored: StoredProposal;
  warnings: string[];
}

export async function generateProposal(
  diagnosticId: string,
  recommendationId?: string
): Promise<ServiceResult<ProposalOutcome | null>> {
  // 1. Charger diagnostic + recommandation côté client (Supabase ou localStorage).
  const summaryResult = await getDiagnosticSummary(diagnosticId);
  if (!summaryResult.data) {
    return {
      data: null,
      mode: summaryResult.mode,
      error: summaryResult.error ?? "Diagnostic introuvable.",
    };
  }

  const recommendationResult = await getRecommendationByDiagnosticId(diagnosticId);
  if (!recommendationResult.data) {
    return {
      data: null,
      mode: recommendationResult.mode,
      error:
        recommendationResult.error ??
        "Aucune recommandation disponible — lancez l'analyse avant la proposition.",
    };
  }

  // 2. Construire le payload pour la route serveur.
  const payload = {
    diagnosticId,
    recommendationId:
      recommendationId ??
      recommendationResult.data.supabaseRecommendationId ??
      undefined,
    diagnostic: summaryResult.data.diagnostic,
    client: summaryResult.data.client,
    recommendation: recommendationResult.data.recommendation,
  };

  // 3. POST.
  let response: Response;
  try {
    response = await fetch("/api/generate-training-proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Appel /api/generate-training-proposal impossible (${errorMessage(err)}).`,
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

  let result: ProposalGenerationResult;
  try {
    result = (await response.json()) as ProposalGenerationResult;
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Réponse invalide (${errorMessage(err)}).`,
    };
  }

  const stored: StoredProposal = {
    id: randomId(),
    diagnosticId,
    recommendationId:
      recommendationResult.data.supabaseRecommendationId ?? null,
    proposal: result.proposal,
    source: result.source,
    provider: result.provider,
    model: result.model,
    generatedAt: result.generatedAt,
    notes: result.notes,
  };

  cacheProposalLocally(stored);

  const warnings = [...result.notes];
  const mode: ServiceMode = "local"; // MVP : pas de persistance Supabase.

  return { data: { stored, warnings }, mode, error: null };
}

export async function getCachedProposalByDiagnosticId(
  diagnosticId: string
): Promise<ServiceResult<StoredProposal | null>> {
  const store = readLocal();
  const found = store.items.find((it) => it.diagnosticId === diagnosticId) ?? null;
  return { data: found, mode: "local", error: null };
}
