/**
 * Suivi post-formation interne — types partagés client/serveur.
 *
 * Persistance : table `post_training_reviews` + service
 * `post-training-service.ts`.
 *
 * Politique : tous ces types sont à usage strictement INTERNE
 * Start Academy. Aucune page publique (dirigeant / collaborateur /
 * formateur externe) ne les consomme. Voir
 * `docs/post-training-follow-up-prd.md`.
 */

export type PostTrainingReviewType =
  | "trainer"
  | "director"
  | "participant_summary"
  | "internal";

export type PostTrainingReviewStatus = "draft" | "completed" | "archived";

/** Score sur l'échelle 0..10 (entiers uniquement côté MVP). */
export type PostTrainingScore = number;

export interface PostTrainingFollowUpAction {
  /** Texte court de l'action. */
  label: string;
  /** Personne responsable (texte libre — pas de FK). */
  owner?: string | null;
  /** Échéance ISO (YYYY-MM-DD) si connue. */
  dueDate?: string | null;
  /** Statut applicatif simple — pas de FSM, libre. */
  status?: "open" | "done" | "abandoned" | null;
}

export interface PostTrainingReview {
  id: string;
  sessionId: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewType: PostTrainingReviewType;
  status: PostTrainingReviewStatus;
  satisfactionScore: number | null;
  perceivedValueScore: number | null;
  contentRelevanceScore: number | null;
  actionabilityScore: number | null;
  keySuccesses: string[];
  keyBlockers: string[];
  followUpActions: PostTrainingFollowUpAction[];
  trainerNotes: string | null;
  directorFeedback: string | null;
  participantFeedbackSummary: string | null;
  nextCommercialOpportunity: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PostTrainingReviewInput {
  sessionId: string;
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

export interface PostTrainingSummary {
  /** Moyenne des 4 scores sur les scores non null, arrondie à 0.1. */
  averageScore: number | null;
  scoresCount: number;
  hasFollowUpActions: boolean;
  hasCommercialOpportunity: boolean;
}

/**
 * Moyenne arrondie à 0.1 des 4 scores 0..10 quand au moins un est
 * renseigné. `null` si aucun score posé.
 */
export function calculatePostTrainingAverageScore(
  review: Pick<
    PostTrainingReview,
    | "satisfactionScore"
    | "perceivedValueScore"
    | "contentRelevanceScore"
    | "actionabilityScore"
  >
): { averageScore: number | null; scoresCount: number } {
  const candidates = [
    review.satisfactionScore,
    review.perceivedValueScore,
    review.contentRelevanceScore,
    review.actionabilityScore,
  ];
  const values = candidates.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (values.length === 0) return { averageScore: null, scoresCount: 0 };
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    averageScore: Math.round(avg * 10) / 10,
    scoresCount: values.length,
  };
}

export function summarizePostTrainingReview(
  review: PostTrainingReview
): PostTrainingSummary {
  const { averageScore, scoresCount } = calculatePostTrainingAverageScore(review);
  return {
    averageScore,
    scoresCount,
    hasFollowUpActions: review.followUpActions.length > 0,
    hasCommercialOpportunity:
      (review.nextCommercialOpportunity ?? "").trim().length > 0,
  };
}
