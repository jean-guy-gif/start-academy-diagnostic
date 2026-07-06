import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";

import {
  calculatePostTrainingAverageScore,
  type PostTrainingFollowUpAction,
  type PostTrainingReview,
  type PostTrainingReviewInput,
  type PostTrainingReviewStatus,
  type PostTrainingReviewType,
} from "./post-training.types";

/**
 * Service suivi post-formation — server-only. Utilise
 * `createSupabaseAdminClient()` (service_role) pour bypasser RLS.
 * Les routes API doivent en amont :
 *   1. `requireApiRole(INTERNAL_APP_ROLES)`.
 *   2. `assertCanAccessSession(profile, sessionId)`.
 *
 * Notes sensibles (texte libre) : présentes dans la table mais
 * jamais loggées dans `activity_logs` (cf. PRD §G).
 */

interface ReviewRow {
  id: string;
  session_id: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  review_type: PostTrainingReviewType;
  status: PostTrainingReviewStatus;
  satisfaction_score: number | null;
  perceived_value_score: number | null;
  content_relevance_score: number | null;
  actionability_score: number | null;
  key_successes: Json;
  key_blockers: Json;
  follow_up_actions: Json;
  trainer_notes: string | null;
  director_feedback: string | null;
  participant_feedback_summary: string | null;
  next_commercial_opportunity: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

function toStringArray(value: Json): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function toFollowUpActions(value: Json): PostTrainingFollowUpAction[] {
  if (!Array.isArray(value)) return [];
  const out: PostTrainingFollowUpAction[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label : "";
    if (label.length === 0) continue;
    const owner = typeof raw.owner === "string" ? raw.owner : null;
    const dueDate = typeof raw.dueDate === "string" ? raw.dueDate : null;
    const statusRaw = raw.status;
    const status =
      statusRaw === "open" ||
      statusRaw === "done" ||
      statusRaw === "abandoned"
        ? statusRaw
        : null;
    out.push({ label, owner, dueDate, status });
  }
  return out;
}

function rowToReview(row: ReviewRow): PostTrainingReview {
  return {
    id: row.id,
    sessionId: row.session_id,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    reviewType: row.review_type,
    status: row.status,
    satisfactionScore: row.satisfaction_score,
    perceivedValueScore: row.perceived_value_score,
    contentRelevanceScore: row.content_relevance_score,
    actionabilityScore: row.actionability_score,
    keySuccesses: toStringArray(row.key_successes),
    keyBlockers: toStringArray(row.key_blockers),
    followUpActions: toFollowUpActions(row.follow_up_actions),
    trainerNotes: row.trainer_notes,
    directorFeedback: row.director_feedback,
    participantFeedbackSummary: row.participant_feedback_summary,
    nextCommercialOpportunity: row.next_commercial_opportunity,
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  "id, session_id, reviewer_id, reviewer_name, review_type, status, satisfaction_score, perceived_value_score, content_relevance_score, actionability_score, key_successes, key_blockers, follow_up_actions, trainer_notes, director_feedback, participant_feedback_summary, next_commercial_opportunity, metadata, created_at, updated_at";

/**
 * Renvoie la review courante (la plus récente) pour une session.
 * `null` si aucune. Non bloquant.
 */
export async function getPostTrainingReviewBySession(
  sessionId: string
): Promise<PostTrainingReview | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("post_training_reviews")
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

export interface CreateReviewInput extends PostTrainingReviewInput {
  reviewerId: string | null;
  reviewerName: string | null;
}

export async function createPostTrainingReview(
  input: CreateReviewInput
): Promise<PostTrainingReview | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("post_training_reviews")
      .insert({
        session_id: input.sessionId,
        reviewer_id: input.reviewerId,
        reviewer_name: input.reviewerName,
        review_type: input.reviewType ?? "internal",
        status: input.status ?? "draft",
        satisfaction_score: input.satisfactionScore ?? null,
        perceived_value_score: input.perceivedValueScore ?? null,
        content_relevance_score: input.contentRelevanceScore ?? null,
        actionability_score: input.actionabilityScore ?? null,
        key_successes: (input.keySuccesses ?? []) as Json,
        key_blockers: (input.keyBlockers ?? []) as Json,
        follow_up_actions: (input.followUpActions ?? []) as unknown as Json,
        trainer_notes: input.trainerNotes ?? null,
        director_feedback: input.directorFeedback ?? null,
        participant_feedback_summary: input.participantFeedbackSummary ?? null,
        next_commercial_opportunity: input.nextCommercialOpportunity ?? null,
        metadata: (input.metadata ?? {}) as Json,
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
  reviewType?: PostTrainingReviewType;
  status?: PostTrainingReviewStatus;
  satisfactionScore?: number | null;
  perceivedValueScore?: number | null;
  contentRelevanceScore?: number | null;
  actionabilityScore?: number | null;
  keySuccesses?: string[];
  keyBlockers?: string[];
  followUpActions?: PostTrainingFollowUpAction[];
  trainerNotes?: string | null;
  directorFeedback?: string | null;
  participantFeedbackSummary?: string | null;
  nextCommercialOpportunity?: string | null;
  metadata?: Record<string, unknown>;
}

export async function updatePostTrainingReview(
  id: string,
  input: UpdateReviewInput
): Promise<PostTrainingReview | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const patch: TablesUpdate<"post_training_reviews"> = {};
  if (input.reviewType !== undefined) patch.review_type = input.reviewType;
  if (input.status !== undefined) patch.status = input.status;
  if (input.satisfactionScore !== undefined)
    patch.satisfaction_score = input.satisfactionScore;
  if (input.perceivedValueScore !== undefined)
    patch.perceived_value_score = input.perceivedValueScore;
  if (input.contentRelevanceScore !== undefined)
    patch.content_relevance_score = input.contentRelevanceScore;
  if (input.actionabilityScore !== undefined)
    patch.actionability_score = input.actionabilityScore;
  if (input.keySuccesses !== undefined)
    patch.key_successes = input.keySuccesses as Json;
  if (input.keyBlockers !== undefined)
    patch.key_blockers = input.keyBlockers as Json;
  if (input.followUpActions !== undefined)
    patch.follow_up_actions = input.followUpActions as unknown as Json;
  if (input.trainerNotes !== undefined) patch.trainer_notes = input.trainerNotes;
  if (input.directorFeedback !== undefined)
    patch.director_feedback = input.directorFeedback;
  if (input.participantFeedbackSummary !== undefined)
    patch.participant_feedback_summary = input.participantFeedbackSummary;
  if (input.nextCommercialOpportunity !== undefined)
    patch.next_commercial_opportunity = input.nextCommercialOpportunity;
  if (input.metadata !== undefined) patch.metadata = input.metadata as Json;
  try {
    const { data, error } = await client
      .from("post_training_reviews")
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
 * Compte les sessions `delivered` sans review courante en statut
 * `completed`. Utilisé pour le KPI cockpit.
 */
export async function countSessionsAwaitingPostTrainingReview(): Promise<number> {
  const client = createSupabaseAdminClient();
  if (!client) return 0;
  try {
    const { data: sessions, error: sessionsErr } = await client
      .from("training_sessions")
      .select("id")
      .eq("status", "delivered");
    if (sessionsErr || !sessions) return 0;
    const sessionIds = (sessions as Array<{ id: string }>).map((r) => r.id);
    if (sessionIds.length === 0) return 0;

    const { data: completed, error: reviewErr } = await client
      .from("post_training_reviews")
      .select("session_id")
      .eq("status", "completed")
      .in("session_id", sessionIds);
    if (reviewErr || !completed) return sessionIds.length;
    const completedSet = new Set(
      (completed as Array<{ session_id: string }>).map((r) => r.session_id)
    );
    return sessionIds.filter((id) => !completedSet.has(id)).length;
  } catch {
    return 0;
  }
}

export { calculatePostTrainingAverageScore };
