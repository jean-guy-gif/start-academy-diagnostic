import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

import {
  SUPPORT_QUALITY_CRITERIA,
  calculateSupportQualityScore,
  type SupportQualityChecklist,
  type SupportQualityCriterion,
  type SupportQualityReview,
  type SupportQualityReviewInput,
  type SupportQualityStatus,
} from "./support-quality.types";

/**
 * Service de validation pédagogique — server-only. Utilise
 * `createSupabaseAdminClient()` (service_role) pour bypasser RLS.
 * Les routes API doivent en amont :
 *   1. `requireApiRole(INTERNAL_APP_ROLES)`.
 *   2. `assertCanAccessSession(profile, sessionId)`.
 * Aucune donnée sensible n'est manipulée ici (la table contient une
 * checklist de notes 0..3 + notes texte libre — pas de données
 * client brutes).
 */

interface ReviewRow {
  id: string;
  session_id: string;
  training_support_id: string | null;
  designed_support_id: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  status: SupportQualityStatus;
  score_total: number | null;
  score_max: number | null;
  score_percent: number | string | null;
  checklist: Json;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToReview(row: ReviewRow): SupportQualityReview {
  return {
    id: row.id,
    sessionId: row.session_id,
    trainingSupportId: row.training_support_id,
    designedSupportId: row.designed_support_id,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    status: row.status,
    scoreTotal: row.score_total,
    scoreMax: row.score_max,
    scorePercent:
      row.score_percent === null ? null : Number(row.score_percent),
    checklist:
      typeof row.checklist === "object" && row.checklist !== null
        ? (row.checklist as SupportQualityChecklist)
        : {},
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Renvoie la checklist de référence (figée côté code). Utile côté UI
 * pour afficher les critères dans le même ordre partout.
 */
export function getSupportQualityChecklist(): readonly SupportQualityCriterion[] {
  return SUPPORT_QUALITY_CRITERIA;
}

const SELECT_COLUMNS =
  "id, session_id, training_support_id, designed_support_id, reviewer_id, reviewer_name, status, score_total, score_max, score_percent, checklist, notes, created_at, updated_at";

/**
 * Lit la review (unique courante) pour une session. `null` si aucune.
 * Non bloquant — renvoie null sur erreur.
 */
export async function getSupportQualityReviewBySession(
  sessionId: string
): Promise<SupportQualityReview | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("support_quality_reviews")
      .select(SELECT_COLUMNS)
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return rowToReview(data as ReviewRow);
  } catch {
    return null;
  }
}

export interface CreateReviewInput extends SupportQualityReviewInput {
  reviewerId: string | null;
  reviewerName: string | null;
}

/**
 * Crée une review. Recalcule le score côté serveur à partir de la
 * checklist passée — empêche un client malveillant d'envoyer un
 * score artificiellement haut.
 */
export async function createSupportQualityReview(
  input: CreateReviewInput
): Promise<SupportQualityReview | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const checklist = input.checklist ?? {};
  const score = calculateSupportQualityScore(checklist);
  try {
    const { data, error } = await client
      .from("support_quality_reviews")
      .insert({
        session_id: input.sessionId,
        training_support_id: input.trainingSupportId ?? null,
        designed_support_id: input.designedSupportId ?? null,
        reviewer_id: input.reviewerId,
        reviewer_name: input.reviewerName,
        status: input.status ?? "draft",
        score_total: score.max === 0 ? null : score.total,
        score_max: score.max === 0 ? null : score.max,
        score_percent: score.max === 0 ? null : score.percent,
        checklist: checklist as Json,
        notes: input.notes ?? null,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error || !data) return null;
    return rowToReview(data as ReviewRow);
  } catch {
    return null;
  }
}

export interface UpdateReviewInput {
  trainingSupportId?: string | null;
  designedSupportId?: string | null;
  status?: SupportQualityStatus;
  checklist?: SupportQualityChecklist;
  notes?: string | null;
}

/**
 * Met à jour une review. Recalcule le score si la checklist change.
 */
export async function updateSupportQualityReview(
  id: string,
  input: UpdateReviewInput
): Promise<SupportQualityReview | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const patch: TablesUpdate<"support_quality_reviews"> = {};
  if (input.trainingSupportId !== undefined)
    patch.training_support_id = input.trainingSupportId;
  if (input.designedSupportId !== undefined)
    patch.designed_support_id = input.designedSupportId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.checklist !== undefined) {
    const score = calculateSupportQualityScore(input.checklist);
    patch.checklist = input.checklist as Json;
    patch.score_total = score.max === 0 ? null : score.total;
    patch.score_max = score.max === 0 ? null : score.max;
    patch.score_percent = score.max === 0 ? null : score.percent;
  }
  try {
    const { data, error } = await client
      .from("support_quality_reviews")
      .update(patch)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .single();
    if (error || !data) return null;
    return rowToReview(data as ReviewRow);
  } catch {
    return null;
  }
}

/**
 * Renvoie le nombre de sessions ayant un support designé mais
 * aucune review `validated`. Utilisé pour le KPI cockpit
 * « Supports à valider ».
 */
export async function countSupportsAwaitingQualityReview(): Promise<number> {
  const client = createSupabaseAdminClient();
  if (!client) return 0;
  try {
    // Étape 1 : sessions ayant un designed support.
    const { data: designed, error: designedErr } = await client
      .from("designed_training_supports")
      .select("session_id");
    if (designedErr || !designed) return 0;
    const sessionIds = Array.from(
      new Set(
        (designed as Array<{ session_id: string }>).map((r) => r.session_id)
      )
    );
    if (sessionIds.length === 0) return 0;

    // Étape 2 : reviews `validated` parmi ces sessions.
    const { data: validated, error: reviewErr } = await client
      .from("support_quality_reviews")
      .select("session_id")
      .eq("status", "validated")
      .in("session_id", sessionIds);
    if (reviewErr || !validated) return sessionIds.length;
    const validatedSet = new Set(
      (validated as Array<{ session_id: string }>).map((r) => r.session_id)
    );
    return sessionIds.filter((id) => !validatedSet.has(id)).length;
  } catch {
    return 0;
  }
}
