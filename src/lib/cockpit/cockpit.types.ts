/**
 * Cockpit Start Academy — types partagés.
 *
 * Vue interne d'agrégation : pas exposée publiquement. Réservée aux
 * rôles internes (`admin` / `commercial` / `trainer`).
 *
 * Module pur (pas de Supabase, pas de secret) — importable côté client
 * comme serveur.
 */

/**
 * Étape pipeline d'une formation Start Academy. Combine le statut
 * `training_sessions.status` et la présence des artefacts amont
 * (recommendation, support, etc.).
 */
export type CockpitStage =
  | "diagnostic_in_progress"
  | "recommendation_done"
  | "proposal_to_send"
  | "awaiting_validation"
  | "dates_to_position"
  | "dates_proposed"
  | "collection_open"
  | "collection_complete"
  | "support_to_generate"
  | "support_designing"
  | "ready_for_training"
  | "delivered"
  | "post_training";

/**
 * Statut métier interne — façade lisible des SQL status.
 * Pas une duplication 1:1 — on peut regrouper plusieurs SQL statuses
 * sous une même étiquette cockpit pour rendre la lecture plus claire.
 */
export type CockpitStatus =
  | "draft"
  | "in_progress"
  | "to_review"
  | "validated"
  | "ready"
  | "blocked";

export interface CockpitNextAction {
  label: string;
  href: string | null;
  /** "today" si à traiter aujourd'hui — pousse dans la liste « priorités ». */
  urgency: "today" | "this_week" | "later";
  /** Code stable pour analytics / filtres futurs. */
  code:
    | "generate_recommendation"
    | "generate_proposal"
    | "create_session"
    | "generate_client_link"
    | "propose_dates"
    | "await_client_choice"
    | "send_collection_link"
    | "remind_collaborators"
    | "generate_support"
    | "generate_designed_support"
    | "validate_designed_support"
    | "validate_support_quality"
    | "complete_post_training_review"
    | "sync_calendar"
    | "post_training_followup"
    | "none";
}

/**
 * Ligne pipeline — un dossier client / session / diagnostic.
 */
export interface CockpitPipelineItem {
  /** `session.id` si la session existe, sinon `diagnostic.id`. */
  id: string;
  kind: "diagnostic_only" | "session";
  clientName: string | null;
  director: string | null;
  expectedParticipants: number | null;
  /** Sources : recommendation.total_duration_hours quand dispo. */
  totalDurationHours: number | null;
  /** Calculé via training-pricing : durée × 42 × participants. */
  totalBudget: number | null;
  /** Reste à charge estimatif (PEC déjà déduite si participants saisis). */
  estimatedRemainingCost: number | null;
  /** Étape pipeline calculée. */
  stage: CockpitStage;
  /** Statut SQL brut (ex : `support_ready`) pour debug + filter. */
  rawStatus: string | null;
  /** Action prochaine — texte court + lien. */
  nextAction: CockpitNextAction;
  /** ISO timestamp `updated_at` de la session (ou du diagnostic). */
  updatedAt: string;
  diagnosticId: string | null;
  sessionId: string | null;
}

/**
 * KPI d'ensemble — pour la barre de cartes en haut du cockpit.
 */
export interface CockpitOverview {
  diagnosticsInProgress: number;
  proposalsToFinalize: number;
  proposalsSent: number;
  formationsValidated: number;
  supportsToGenerate: number;
  collectionsIncomplete: number;
  datesToPosition: number;
  formationsReady: number;
  /** Total tous statuts confondus — pour cadrer le volume. */
  totalActiveDossiers: number;
  /**
   * v1.0b — nombre de diagnostics dont `alerts_snapshot` contient au
   * moins une alerte (peu importe la sévérité). Alimenté par le
   * refresh best-effort côté routes answers / status (cf. Lot 1).
   * `0` si aucun snapshot présent.
   */
  diagnosticsWithAlerts: number;
}

/**
 * Action prioritaire affichée en colonne « À traiter aujourd'hui ».
 */
export interface CockpitPriorityAction {
  pipelineItemId: string;
  clientName: string | null;
  label: string;
  href: string | null;
  code: CockpitNextAction["code"];
  urgency: "today" | "this_week" | "later";
}

/**
 * Alerte système ou métier qui demande attention immédiate.
 */
export interface CockpitAlert {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
  href?: string | null;
}

export interface CockpitData {
  overview: CockpitOverview;
  pipeline: CockpitPipelineItem[];
  priorityActions: CockpitPriorityAction[];
  alerts: CockpitAlert[];
  /** Marker que la lecture s'est faite sans Supabase (env manquantes). */
  fellBackToEmpty: boolean;
}

export function emptyCockpitData(): CockpitData {
  return {
    overview: {
      diagnosticsInProgress: 0,
      proposalsToFinalize: 0,
      proposalsSent: 0,
      formationsValidated: 0,
      supportsToGenerate: 0,
      collectionsIncomplete: 0,
      datesToPosition: 0,
      formationsReady: 0,
      totalActiveDossiers: 0,
      diagnosticsWithAlerts: 0,
    },
    pipeline: [],
    priorityActions: [],
    alerts: [],
    fellBackToEmpty: true,
  };
}
