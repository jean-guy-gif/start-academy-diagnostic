import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessSession } from "@/lib/auth/assert-session-access";
import {
  createSupportQualityReview,
  getSupportQualityReviewBySession,
  updateSupportQualityReview,
} from "@/lib/training-support/support-quality-service";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RatingSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const ChecklistSchema = z.record(z.string(), RatingSchema);

const StatusSchema = z.enum([
  "draft",
  "needs_revision",
  "validated",
  "rejected",
]);

const PutBodySchema = z.object({
  trainingSupportId: z.string().uuid().nullable().optional(),
  designedSupportId: z.string().uuid().nullable().optional(),
  status: StatusSchema.optional(),
  checklist: ChecklistSchema.optional(),
  notes: z.string().max(4000).nullable().optional(),
});

/**
 * GET /api/sessions/[id]/support-quality
 * Retourne la review (unique courante) ou `null` si aucune.
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

  const review = await getSupportQualityReviewBySession(sessionId);
  return NextResponse.json({ ok: true, review });
}

/**
 * PUT /api/sessions/[id]/support-quality
 * Upsert : si une review existe, met à jour ; sinon crée.
 * Journalise un événement d'activité approprié (best-effort).
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

  const existing = await getSupportQualityReviewBySession(sessionId);
  const review = existing
    ? await updateSupportQualityReview(existing.id, {
        trainingSupportId: parsed.data.trainingSupportId,
        designedSupportId: parsed.data.designedSupportId,
        status: parsed.data.status,
        checklist: parsed.data.checklist,
        notes: parsed.data.notes,
      })
    : await createSupportQualityReview({
        sessionId,
        trainingSupportId: parsed.data.trainingSupportId,
        designedSupportId: parsed.data.designedSupportId,
        reviewerId: auth.profile.id,
        reviewerName: auth.profile.full_name ?? auth.profile.email ?? null,
        status: parsed.data.status,
        checklist: parsed.data.checklist,
        notes: parsed.data.notes,
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

  // Journalisation activity_logs. Politique : on logge le statut +
  // le score, pas le contenu des notes (texte libre potentiellement
  // sensible).
  const baseEvent = existing
    ? "support_quality_review_updated"
    : "support_quality_review_created";
  const transitionEvent =
    review.status === "validated"
      ? "support_quality_validated"
      : review.status === "rejected"
        ? "support_quality_rejected"
        : null;
  const eventType = transitionEvent ?? baseEvent;

  createActivityLog({
    eventType,
    sessionId,
    actorId: auth.profile.id,
    actorName: auth.profile.full_name ?? auth.profile.email ?? null,
    actorRole: auth.profile.role,
    entityType: "support_quality_review",
    entityId: review.id,
    metadata: {
      status: review.status,
      scoreTotal: review.scoreTotal,
      scoreMax: review.scoreMax,
      scorePercent: review.scorePercent,
      designedSupportId: review.designedSupportId,
      trainingSupportId: review.trainingSupportId,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({ ok: true, review });
}
