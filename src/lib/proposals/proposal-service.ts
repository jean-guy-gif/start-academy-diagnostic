/**
 * Service proposition commerciale — côté client.
 *
 * Historique 2026-07-18 : suppression complète du cache localStorage
 * (audit Q1 persistance). Les propositions vivent désormais en base
 * (`public.proposals`, migration `20260718150000_add_proposals.sql`),
 * accessibles à tout utilisateur interne selon les policies RLS
 * `owner_or_admin` — un commercial voit ses propres propositions,
 * un admin voit celles de tout le monde. Fin des re-générations en
 * doublon dues au cache local qui ignorait les écritures d'un autre
 * navigateur/compte.
 *
 * Ce service orchestre côté client :
 *   - `generateProposal` → POST /api/generate-training-proposal → PUT
 *     /api/diagnostics/[id]/proposal (persistance).
 *   - `getProposalByDiagnosticId` → GET /api/diagnostics/[id]/proposal.
 *
 * Toutes les routes API sont durcies (requireApiRole +
 * assertCanAccessDiagnostic + doctrine service_role §7). Aucun accès
 * direct à Supabase depuis ce module client.
 */

import type { ServiceResult } from "@/lib/diagnostics/diagnostic-service";
import { getDiagnosticSummary } from "@/lib/diagnostics/diagnostic-service";
import { getRecommendationByDiagnosticId } from "@/lib/recommendations/recommendation-service";
import type { ProposalGenerationResult } from "@/lib/ai/proposal-schema";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  classifyGenerationPreflight,
  type PreflightAction,
  type PreflightKind,
} from "@/lib/proposals/proposal-preflight";

/**
 * Vue client d'une proposition persistée. Contient l'objet Proposal
 * (validé Zod côté serveur) + les métadonnées de génération +
 * identifiants de persistance.
 */
export interface StoredProposal extends ProposalGenerationResult {
  id: string;
  diagnosticId: string;
  recommendationId: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Erreur inconnue";
}

/**
 * Payload retourné par `GET /api/diagnostics/[id]/proposal`.
 * `proposal: null` = aucune proposition encore générée.
 */
interface GetProposalResponse {
  ok: boolean;
  proposal: (StoredProposal & { createdBy: string | null }) | null;
  error?: string;
}

interface PutProposalResponse {
  ok: boolean;
  proposal?: StoredProposal & { createdBy: string | null };
  error?: string;
}

export interface ProposalOutcome {
  stored: StoredProposal;
  warnings: string[];
}

/**
 * Métadonnées d'échec du preflight — permet à l'UI de rendre un CTA
 * dédié (bouton « Recharger la page » pour session expirée, etc.).
 * `null` = pas d'échec preflight (soit succès, soit échec plus tardif
 * type POST/PUT dont l'UI utilise le message brut).
 */
export interface ProposalErrorContext {
  kind: PreflightKind;
  action: PreflightAction;
}

/**
 * Vérifie la présence d'une session Supabase browser valide.
 *   • `null` si le client n'est pas initialisé (env absente, mode dev)
 *     — l'appelant laisse passer.
 *   • `true` si `getSession()` renvoie une session non-null sans erreur.
 *   • `false` sinon (session expirée / absente / erreur network).
 */
async function detectBrowserSession(): Promise<boolean | null> {
  const client = createSupabaseBrowserClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return false;
    return data.session !== null;
  } catch {
    return false;
  }
}

export async function generateProposal(
  diagnosticId: string,
  recommendationId?: string
): Promise<
  ServiceResult<ProposalOutcome | null> & {
    errorContext?: ProposalErrorContext;
  }
> {
  // 0. Session Supabase browser — court-circuit si absente/expirée
  //    pour éviter que l'UI affiche « Aucune recommandation » alors
  //    que le vrai souci est l'auth.
  const sessionPresent = await detectBrowserSession();

  // 1. Charger diagnostic + recommandation côté client (Supabase RLS-aware).
  //    Note : chaque service peut retourner data=null avec error=null
  //    (fallback local vide, RLS silencieux) OU data=null avec error !== null
  //    (erreur explicite). Le preflight distingue les deux.
  const summaryResult = await getDiagnosticSummary(diagnosticId);
  const recommendationResult = await getRecommendationByDiagnosticId(
    diagnosticId
  );

  const preflight = classifyGenerationPreflight({
    sessionPresent,
    summary: summaryResult,
    reco: recommendationResult,
  });
  if (!preflight.ok) {
    return {
      data: null,
      mode: summaryResult.mode,
      error: preflight.message,
      errorContext: { kind: preflight.kind, action: preflight.action },
    };
  }

  // Preflight OK ⇒ `summaryResult.data` et `recommendationResult.data`
  // sont non-nulls (contrat de `classifyGenerationPreflight`).
  const summary = summaryResult.data!;
  const recommendation = recommendationResult.data!;

  const supabaseRecommendationId =
    recommendationId ?? recommendation.supabaseRecommendationId ?? null;

  // 2. Générer via LLM (fallback heuristique côté serveur).
  const payload = {
    diagnosticId,
    recommendationId: supabaseRecommendationId ?? undefined,
    diagnostic: summary.diagnostic,
    client: summary.client,
    recommendation: recommendation.recommendation,
  };

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

  // 3. Persister via PUT (upsert par diagnostic_id — la 2ᵉ génération
  //    écrase la 1ère, comportement identique à l'ancien cache local
  //    mais désormais partagé entre internes).
  let putResponse: Response;
  try {
    putResponse = await fetch(`/api/diagnostics/${diagnosticId}/proposal`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendationId: supabaseRecommendationId,
        generation: result,
      }),
    });
  } catch (err) {
    return {
      data: null,
      mode: "local",
      error: `Persistance impossible (${errorMessage(err)}).`,
    };
  }

  if (!putResponse.ok) {
    let detail = `HTTP ${putResponse.status}`;
    try {
      const errBody = await putResponse.json();
      if (errBody && typeof errBody === "object" && "error" in errBody) {
        detail = String((errBody as { error: unknown }).error);
      }
    } catch {
      /* ignore */
    }
    return {
      data: null,
      mode: "supabase",
      error: `Échec de la persistance : ${detail}`,
    };
  }

  let putBody: PutProposalResponse;
  try {
    putBody = (await putResponse.json()) as PutProposalResponse;
  } catch (err) {
    return {
      data: null,
      mode: "supabase",
      error: `Réponse de persistance invalide (${errorMessage(err)}).`,
    };
  }

  if (!putBody.proposal) {
    return {
      data: null,
      mode: "supabase",
      error: putBody.error ?? "Persistance sans retour.",
    };
  }

  const stored: StoredProposal = {
    id: putBody.proposal.id,
    diagnosticId: putBody.proposal.diagnosticId,
    recommendationId: putBody.proposal.recommendationId,
    proposal: putBody.proposal.proposal,
    source: putBody.proposal.source,
    provider: putBody.proposal.provider,
    model: putBody.proposal.model,
    generatedAt: putBody.proposal.generatedAt,
    notes: putBody.proposal.notes,
  };

  return {
    data: { stored, warnings: [...result.notes] },
    mode: "supabase",
    error: null,
  };
}

/**
 * Lit la proposition active d'un diagnostic depuis la base
 * (`GET /api/diagnostics/[id]/proposal`). Renvoie `null` dans `data`
 * si aucune proposition n'a encore été générée.
 */
export async function getProposalByDiagnosticId(
  diagnosticId: string
): Promise<ServiceResult<StoredProposal | null>> {
  let response: Response;
  try {
    response = await fetch(`/api/diagnostics/${diagnosticId}/proposal`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return {
      data: null,
      mode: "supabase",
      error: `Lecture impossible (${errorMessage(err)}).`,
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
    return {
      data: null,
      mode: "supabase",
      error: `Échec de la lecture : ${detail}`,
    };
  }
  let body: GetProposalResponse;
  try {
    body = (await response.json()) as GetProposalResponse;
  } catch (err) {
    return {
      data: null,
      mode: "supabase",
      error: `Réponse invalide (${errorMessage(err)}).`,
    };
  }
  if (!body.proposal) {
    return { data: null, mode: "supabase", error: null };
  }
  const stored: StoredProposal = {
    id: body.proposal.id,
    diagnosticId: body.proposal.diagnosticId,
    recommendationId: body.proposal.recommendationId,
    proposal: body.proposal.proposal,
    source: body.proposal.source,
    provider: body.proposal.provider,
    model: body.proposal.model,
    generatedAt: body.proposal.generatedAt,
    notes: body.proposal.notes,
  };
  return { data: stored, mode: "supabase", error: null };
}
