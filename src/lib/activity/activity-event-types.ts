/**
 * Types d'événements suivis dans le journal d'activité interne.
 *
 * Liste fermée — toute nouvelle valeur doit être ajoutée ici ET
 * documentée dans `docs/activity-log-prd.md`.
 *
 * Module pur — importable client et serveur.
 */

export const ACTIVITY_EVENT_TYPES = [
  "diagnostic_created",
  "diagnostic_completed",
  "recommendation_generated",
  "proposal_generated",
  "session_created",
  "access_link_created",
  "participant_submitted",
  "document_uploaded",
  "date_option_created",
  "date_option_selected",
  "training_support_generated",
  "designed_support_generated",
  "support_validated",
  "support_archived",
  "support_quality_review_created",
  "support_quality_review_updated",
  "support_quality_validated",
  "support_quality_rejected",
  "post_training_review_created",
  "post_training_review_updated",
  "post_training_review_completed",
  "note_added",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export type ActivitySeverity = "info" | "success" | "warning" | "error";

export function parseActivityEventType(
  value: unknown
): ActivityEventType | null {
  if (typeof value !== "string") return null;
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(value)
    ? (value as ActivityEventType)
    : null;
}

/**
 * Libellés français standardisés par event_type. Utilisés quand
 * l'appelant ne fournit pas de label explicite, ou en fallback côté
 * UI si la base contient un label hérité illisible.
 */
const DEFAULT_LABELS: Record<ActivityEventType, string> = {
  diagnostic_created: "Diagnostic créé",
  diagnostic_completed: "Diagnostic complété",
  recommendation_generated: "Recommandation générée",
  proposal_generated: "Proposition générée",
  session_created: "Session créée",
  access_link_created: "Lien d'accès généré",
  participant_submitted: "Collaborateur a soumis sa préparation",
  document_uploaded: "Document déposé",
  date_option_created: "Créneau proposé",
  date_option_selected: "Créneau choisi",
  training_support_generated: "Support pédagogique généré",
  designed_support_generated: "Support designé généré",
  support_validated: "Support validé",
  support_archived: "Support archivé",
  support_quality_review_created: "Validation pédagogique démarrée",
  support_quality_review_updated: "Validation pédagogique mise à jour",
  support_quality_validated: "Support validé pédagogiquement",
  support_quality_rejected: "Support rejeté par validation pédagogique",
  post_training_review_created: "Suivi post-formation démarré",
  post_training_review_updated: "Suivi post-formation mis à jour",
  post_training_review_completed: "Suivi post-formation complété",
  note_added: "Note interne ajoutée",
};

export function buildActivityLabel(
  eventType: ActivityEventType | string,
  metadata?: Record<string, unknown>
): string {
  const parsed = parseActivityEventType(eventType);
  if (!parsed) return String(eventType);
  let label = DEFAULT_LABELS[parsed];
  // Enrichissements légers pour quelques events fréquents — uniquement
  // des chiffres / labels sûrs (pas de contenu sensible).
  if (metadata) {
    if (
      parsed === "access_link_created" &&
      typeof metadata.accessType === "string"
    ) {
      const map: Record<string, string> = {
        client_session_view: "dirigeant",
        participant_collect: "collecte collaborateurs",
        trainer_session_view: "formateur",
      };
      const kind = map[metadata.accessType as string];
      if (kind) label = `Lien ${kind} généré`;
    }
    if (parsed === "training_support_generated" && metadata.source === "heuristic") {
      label = "Support pédagogique généré (fallback heuristique)";
    }
    if (
      parsed === "designed_support_generated" &&
      metadata.source === "heuristic"
    ) {
      label = "Support designé généré (fallback heuristique)";
    }
  }
  return label;
}

/**
 * Severity par défaut associée à chaque event. Les routes peuvent
 * surcharger via le paramètre `severity`.
 */
export function defaultSeverity(
  eventType: ActivityEventType
): ActivitySeverity {
  switch (eventType) {
    case "recommendation_generated":
    case "proposal_generated":
    case "training_support_generated":
    case "designed_support_generated":
    case "support_validated":
    case "support_quality_validated":
    case "post_training_review_completed":
    case "date_option_selected":
      return "success";
    case "support_archived":
    case "support_quality_rejected":
      return "warning";
    default:
      return "info";
  }
}
