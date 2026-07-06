import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import {
  calculatePostTrainingAverageScore,
  createPostTrainingReview,
  getPostTrainingReviewBySession,
  updatePostTrainingReview,
} from "@/lib/post-training/post-training-service";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ScoreSchema = z
  .number()
  .int()
  .min(0)
  .max(10)
  .nullable()
  .optional();

const FollowUpActionSchema = z.object({
  label: z.string().min(1).max(300),
  owner: z.string().max(120).nullable().optional(),
  dueDate: z.string().max(40).nullable().optional(),
  status: z.enum(["open", "done", "abandoned"]).nullable().optional(),
});

const PutBodySchema = z.object({
  reviewType: z
    .enum(["trainer", "director", "participant_summary", "internal"])
    .optional(),
  status: z.enum(["draft", "completed", "archived"]).optional(),
  satisfactionScore: ScoreSchema,
  perceivedValueScore: ScoreSchema,
  contentRelevanceScore: ScoreSchema,
  actionabilityScore: ScoreSchema,
  keySuccesses: z.array(z.string().max(500)).max(50).optional(),
  keyBlockers: z.array(z.string().max(500)).max(50).optional(),
  followUpActions: z.array(FollowUpActionSchema).max(50).optional(),
  trainerNotes: z.string().max(8000).nullable().optional(),
  directorFeedback: z.string().max(8000).nullable().optional(),
  participantFeedbackSummary: z.string().max(8000).nullable().optional(),
  nextCommercialOpportunity: z.string().max(4000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/sessions/[id]/post-training-review
 * Retourne la review courante ou `null` si aucune.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "sessionId manquant." },
      { status: 400 }
    );
  }

  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

  const review = await getPostTrainingReviewBySession(sessionId);
  return NextResponse.json({ ok: true, review });
}

/**
 * PUT /api/sessions/[id]/post-training-review
 * Upsert : crée la review si aucune, sinon met à jour la plus
 * récente. Logge dans `activity_logs` (status + score moyen, JAMAIS
 * le contenu des notes).
 */
export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await context.params;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "sessionId manquant." },
      { status: 400 }
    );
  }

  const access = await assertCanAccessSession(auth.profile, sessionId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "Corps JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        error: "Payload invalide.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const existing = await getPostTrainingReviewBySession(sessionId);
  const review = existing
    ? await updatePostTrainingReview(existing.id, {
        reviewType: parsed.data.reviewType,
        status: parsed.data.status,
        satisfactionScore: parsed.data.satisfactionScore,
        perceivedValueScore: parsed.data.perceivedValueScore,
        contentRelevanceScore: parsed.data.contentRelevanceScore,
        actionabilityScore: parsed.data.actionabilityScore,
        keySuccesses: parsed.data.keySuccesses,
        keyBlockers: parsed.data.keyBlockers,
        followUpActions: parsed.data.followUpActions,
        trainerNotes: parsed.data.trainerNotes,
        directorFeedback: parsed.data.directorFeedback,
        participantFeedbackSummary: parsed.data.participantFeedbackSummary,
        nextCommercialOpportunity: parsed.data.nextCommercialOpportunity,
        metadata: parsed.data.metadata,
      })
    : await createPostTrainingReview({
        sessionId,
        reviewerId: auth.profile.id,
        reviewerName: auth.profile.full_name ?? auth.profile.email ?? null,
        reviewType: parsed.data.reviewType ?? "internal",
        status: parsed.data.status ?? "draft",
        satisfactionScore: parsed.data.satisfactionScore ?? null,
        perceivedValueScore: parsed.data.perceivedValueScore ?? null,
        contentRelevanceScore: parsed.data.contentRelevanceScore ?? null,
        actionabilityScore: parsed.data.actionabilityScore ?? null,
        keySuccesses: parsed.data.keySuccesses,
        keyBlockers: parsed.data.keyBlockers,
        followUpActions: parsed.data.followUpActions,
        trainerNotes: parsed.data.trainerNotes ?? null,
        directorFeedback: parsed.data.directorFeedback ?? null,
        participantFeedbackSummary:
          parsed.data.participantFeedbackSummary ?? null,
        nextCommercialOpportunity:
          parsed.data.nextCommercialOpportunity ?? null,
        metadata: parsed.data.metadata,
      });

  if (!review) {
    return NextResponse.json(
      {
        ok: false,
        code: "save_failed",
        error: "Enregistrement de la review impossible.",
      },
      { status: 500 }
    );
  }

  // Journalisation activity_logs — JAMAIS le contenu des notes.
  const baseEvent = existing
    ? "post_training_review_updated"
    : "post_training_review_created";
  const eventType =
    review.status === "completed"
      ? "post_training_review_completed"
      : baseEvent;
  const { averageScore, scoresCount } =
    calculatePostTrainingAverageScore(review);

  createActivityLog({
    eventType,
    sessionId,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    entityType: "post_training_review",
    entityId: review.id,
    metadata: {
      status: review.status,
      reviewType: review.reviewType,
      averageScore,
      scoresCount,
      followUpActionsCount: review.followUpActions.length,
      hasCommercialOpportunity:
        (review.nextCommercialOpportunity ?? "").trim().length > 0,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({ ok: true, review });
}
