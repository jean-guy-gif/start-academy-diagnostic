import type { StoredProposal } from "./proposal-service";
import { ProposalSchema } from "@/lib/ai/proposal-schema";

/**
 * Sauvegarde d'une proposition ÉDITÉE côté client — lot B2 édition
 * proposition (PR-2 UI). Appelle la route PUT existante :
 *
 *   PUT /api/diagnostics/[id]/proposal
 *
 * Le body attendu est un `PutBodySchema` complet (cf. route.ts).
 * On ré-envoie la totalité du `generation` : le proposal édité + les
 * métadonnées d'origine (source, provider, model, generatedAt) — la
 * route valide via `ProposalSchema.parse` et upsert par diagnostic_id.
 *
 * Retour : `{ ok: true, savedAt }` ou `{ ok: false, error }`. Le
 * garde-fou côté UI doit tester `ok` avant de quitter le mode
 * édition et de considérer les modifications comme persistées.
 */

export interface SaveProposalInput {
  diagnosticId: string;
  recommendationId: string | null;
  proposal: StoredProposal["proposal"];
  /**
   * Métadonnées du generation d'origine — préservées telles quelles
   * (source, provider, model, generatedAt). Après édition, la
   * proposition reste identifiée par sa génération d'origine ; on
   * ne mute PAS `generatedAt`.
   */
  source: "llm" | "heuristic";
  provider: string | null;
  model: string | null;
  generatedAt: string;
  notes: string[];
}

export type SaveProposalResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

export async function saveProposal(
  input: SaveProposalInput
): Promise<SaveProposalResult> {
  // Validation locale avant l'envoi — évite un aller-retour serveur
  // sur un pricing incohérent (superRefine Zod). En cas d'échec local,
  // on renvoie l'erreur SANS appeler la route (économie + UX).
  const localParse = ProposalSchema.safeParse(input.proposal);
  if (!localParse.success) {
    return {
      ok: false,
      error:
        "Proposition invalide — vérifiez que chaque module a un titre, une durée > 0 et un motif de remise si applicable.",
    };
  }

  const body = {
    recommendationId: input.recommendationId,
    generation: {
      proposal: localParse.data,
      source: input.source,
      provider: input.provider,
      model: input.model,
      generatedAt: input.generatedAt,
      notes: input.notes,
    },
  };

  let response: Response;
  try {
    response = await fetch(
      `/api/diagnostics/${encodeURIComponent(input.diagnosticId)}/proposal`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // Pas de cache sur les mutations — cohérent avec la route
        // `dynamic = 'force-dynamic'` et le GET `cache: 'no-store'`.
        cache: "no-store",
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur réseau";
    return {
      ok: false,
      error: `Connexion impossible — vérifiez le réseau et réessayez (${message}).`,
    };
  }

  if (!response.ok) {
    try {
      const json = (await response.json()) as { error?: string };
      return {
        ok: false,
        error: json.error ?? `Sauvegarde refusée (HTTP ${response.status}).`,
      };
    } catch {
      return {
        ok: false,
        error: `Sauvegarde refusée (HTTP ${response.status}).`,
      };
    }
  }

  return { ok: true, savedAt: new Date().toISOString() };
}
