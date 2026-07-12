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
import { getSessionStatusById } from "@/lib/sessions/session-status-service";
import type { SessionStatus } from "@/types";

/**
 * Statuts session qui autorisent la lecture / écriture d'un bilan
 * post-formation (T-8-BIS). Motif produit :
 *   - `delivered`  = la formation a physiquement eu lieu, un bilan a
 *     un objet réel à commenter.
 *   - `report_sent` = le bilan a déjà été envoyé au client ; on autorise
 *     un update pour corriger une coquille, mais on trace explicitement
 *     la divergence potentielle avec la version reçue par le client via
 *     l'event `post_training_review_modified_after_send`.
 * Tout autre statut → 409 `session_status_precondition`.
 */
const REVIEW_ALLOWED_STATUSES: readonly SessionStatus[] = [
  "delivered",
  "report_sent",
] as const;

function isReviewAllowedStatus(status: SessionStatus | null): boolean {
  if (!status) return false;
  return (REVIEW_ALLOWED_STATUSES as readonly SessionStatus[]).includes(status);
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  created: "Créée",
  awaiting_client_validation: "En attente validation client",
  dates_to_position: "Dates à positionner",
  dates_validated: "Dates validées",
  collection_open: "Collecte ouverte",
  data_collected: "Données collectées",
  support_generating: "Support en génération",
  support_ready: "Support prêt",
  delivered: "Formation réalisée",
  report_sent: "Bilan envoyé",
};

function preconditionResponse(status: SessionStatus | null) {
  const label = status ? STATUS_LABEL[status] : "inconnu";
  return NextResponse.json(
    {
      ok: false,
      code: "session_status_precondition",
      error: `La session doit être « Formation réalisée » avant de saisir un bilan. Statut actuel : « ${label} ».`,
      currentStatus: status,
    },
    { status: 409 }
  );
}

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

  // Garde T-8-BIS — un review ne peut être lu que si la session est
  // dans un état où sa saisie a du sens (formation dispensée).
  // Empêche la remontée d'un review fantôme créé sur une session
  // encore en `created` (incohérence observée pendant smoke §4).
  const sessionStatus = await getSessionStatusById(sessionId);
  if (!isReviewAllowedStatus(sessionStatus)) {
    return preconditionResponse(sessionStatus);
  }

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

  // Garde T-8-BIS — la saisie/mise à jour d'un bilan n'est autorisée
  // que si la formation a physiquement eu lieu (statut ∈ delivered,
  // report_sent). Empêche la création d'un review sur session en
  // `created` (incohérence observée pendant smoke §4).
  const sessionStatus = await getSessionStatusById(sessionId);
  if (!isReviewAllowedStatus(sessionStatus)) {
    return preconditionResponse(sessionStatus);
  }

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
  //
  // Nuance T-8-BIS : quand la session est en `report_sent`, le bilan
  // a déjà été envoyé au client. Toute écriture ultérieure crée une
  // divergence potentielle entre la version reçue par le client et
  // la version en base. On émet un event dédié
  // `post_training_review_modified_after_send` (severity warning par
  // défaut, cf. activity-event-types.ts) qui remplace le trio
  // standard created/updated/completed pour cet acte précis, afin
  // que la trace soit non ambiguë dans le journal d'activité.
  const baseEvent = existing
    ? "post_training_review_updated"
    : "post_training_review_created";
  const standardEvent =
    review.status === "completed"
      ? "post_training_review_completed"
      : baseEvent;
  const eventType =
    sessionStatus === "report_sent"
      ? "post_training_review_modified_after_send"
      : standardEvent;
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
      sessionStatusAtWrite: sessionStatus,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({ ok: true, review });
}
