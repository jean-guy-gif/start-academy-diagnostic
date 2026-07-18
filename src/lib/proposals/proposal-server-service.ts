import "server-only";

import {
  ProposalSchema,
  type ProposalGenerationResult,
} from "@/lib/ai/proposal-schema";
import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import type { ProfileWithRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Service serveur pour la persistance des propositions
 * (`public.proposals`, migration `20260718150000_add_proposals.sql`).
 *
 * Doctrine `service_role` §7 (rls-hardening-plan.md) : chaque fonction
 * exige `assertCanAccessDiagnostic(profile, diagnosticId)` AVANT toute
 * requête via `createSupabaseAdminClient`. Le service_role bypasse RLS
 * uniquement après ownership check explicite.
 */

// ---------------------------------------------------------------------------
// Type persisté (row Supabase)
// ---------------------------------------------------------------------------

export interface StoredProposalRecord {
  id: string;
  diagnosticId: string;
  recommendationId: string | null;
  proposal: ProposalGenerationResult["proposal"];
  source: ProposalGenerationResult["source"];
  provider: ProposalGenerationResult["provider"];
  model: ProposalGenerationResult["model"];
  generatedAt: string;
  notes: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProposalRow {
  id: string;
  diagnostic_id: string;
  recommendation_id: string | null;
  proposal_json: unknown;
  source: string;
  provider: string | null;
  model: string | null;
  generated_at: string;
  notes: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convertit une row Supabase en `StoredProposalRecord`. Le champ
 * `proposal_json` est validé contre `ProposalSchema` (Zod strict) —
 * une row corrompue lève une erreur au parse, jamais un objet
 * silencieusement invalide.
 */
function fromRow(row: ProposalRow): StoredProposalRecord {
  const proposal = ProposalSchema.parse(row.proposal_json);
  const source =
    row.source === "llm" || row.source === "heuristic"
      ? row.source
      : (() => {
          throw new Error(
            `proposals.source invalide en base : « ${row.source} » (attendu llm|heuristic)`
          );
        })();
  return {
    id: row.id,
    diagnosticId: row.diagnostic_id,
    recommendationId: row.recommendation_id,
    proposal,
    source,
    provider: row.provider,
    model: row.model,
    generatedAt: row.generated_at,
    notes: row.notes ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GetProposalResult =
  | { ok: true; proposal: StoredProposalRecord | null }
  | { ok: false; reason: "forbidden" | "persistence_failed"; message?: string };

export type UpsertProposalResult =
  | { ok: true; proposal: StoredProposalRecord }
  | { ok: false; reason: "forbidden" | "persistence_failed"; message?: string };

export interface UpsertProposalInput {
  recommendationId: string | null;
  generation: ProposalGenerationResult;
}

/**
 * Lit la proposition active d'un diagnostic (`unique(diagnostic_id)` :
 * il y en a au plus une). Renvoie `{ ok: true, proposal: null }` si
 * aucune n'existe encore — pas d'erreur.
 *
 * Sécurité :
 *   • `assertCanAccessDiagnostic` OBLIGATOIRE avant toute lecture DB.
 *     Owner-mismatch → `{ ok: false, reason: 'forbidden' }` ET
 *     `createSupabaseAdminClient` JAMAIS invoqué (garde-fou pattern T-9).
 */
export async function getProposalByDiagnosticId(
  diagnosticId: string,
  profile: ProfileWithRole
): Promise<GetProposalResult> {
  const access = await assertCanAccessDiagnostic(profile, diagnosticId);
  if (!access.ok) {
    return { ok: false, reason: "forbidden" };
  }
  const client = createSupabaseAdminClient();
  if (!client) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: "service_role indisponible",
    };
  }
  const { data, error } = await client
    .from("proposals")
    .select(
      "id, diagnostic_id, recommendation_id, proposal_json, source, provider, model, generated_at, notes, created_by, created_at, updated_at"
    )
    .eq("diagnostic_id", diagnosticId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: error.message,
    };
  }
  if (!data) return { ok: true, proposal: null };
  try {
    return { ok: true, proposal: fromRow(data as ProposalRow) };
  } catch (err) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: err instanceof Error ? err.message : "row invalide",
    };
  }
}

/**
 * Upsert d'une proposition sur un diagnostic. La contrainte
 * `unique(diagnostic_id)` garantit qu'il y a au plus une proposition
 * par diagnostic — la 2ᵉ génération écrase la 1ère (même `id`, mêmes
 * `created_at`/`created_by`, `generated_at` et contenu mis à jour).
 *
 * Sécurité :
 *   • `assertCanAccessDiagnostic` OBLIGATOIRE. Owner-mismatch → 403
 *     ET `createSupabaseAdminClient` JAMAIS invoqué.
 *   • `created_by = profile.id` — jamais un input externe (empêche un
 *     appelant de bricoler le propriétaire).
 */
export async function upsertProposal(
  diagnosticId: string,
  input: UpsertProposalInput,
  profile: ProfileWithRole
): Promise<UpsertProposalResult> {
  const access = await assertCanAccessDiagnostic(profile, diagnosticId);
  if (!access.ok) {
    return { ok: false, reason: "forbidden" };
  }
  const client = createSupabaseAdminClient();
  if (!client) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: "service_role indisponible",
    };
  }

  // Validation défensive côté service — la route API valide déjà, mais
  // on garantit ici que ce qui part en base est propre.
  const parsed = ProposalSchema.parse(input.generation.proposal);

  // Cast `as never` sur la row d'upsert : la table `proposals` n'est
  // pas encore présente dans `database.types.ts` (types générés par
  // la migration au moment du db pull). Le shape est validé par la
  // migration `20260718150000_add_proposals.sql` et par les tests
  // ownership + contract jsonb ; le cast débloque uniquement le
  // typage `never[]` transitoire.
  const upsertRow = {
    diagnostic_id: diagnosticId,
    recommendation_id: input.recommendationId,
    proposal_json: parsed,
    source: input.generation.source,
    provider: input.generation.provider,
    model: input.generation.model,
    generated_at: input.generation.generatedAt,
    notes: input.generation.notes,
    created_by: profile.id,
  } as never;
  const { data, error } = await client
    .from("proposals")
    .upsert(upsertRow, { onConflict: "diagnostic_id" })
    .select(
      "id, diagnostic_id, recommendation_id, proposal_json, source, provider, model, generated_at, notes, created_by, created_at, updated_at"
    )
    .single();
  if (error || !data) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: error?.message ?? "upsert failed",
    };
  }
  try {
    return { ok: true, proposal: fromRow(data as ProposalRow) };
  } catch (err) {
    return {
      ok: false,
      reason: "persistence_failed",
      message: err instanceof Error ? err.message : "row invalide",
    };
  }
}
