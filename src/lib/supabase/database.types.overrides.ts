/**
 * Overrides des colonnes gérées par CHECK constraint (au lieu d'un
 * vrai enum Postgres). `supabase gen types typescript` produit
 * `string` pour ces colonnes parce qu'il ne lit pas les CHECK
 * constraints ; le domaine métier a besoin d'unions strictes.
 *
 * Ce fichier est le seul point d'édition manuelle pour tout enum
 * fabriqué via CHECK : `database.types.generated.ts` est ré-écrit
 * intégralement à chaque regen, et `database.types.ts` (wrapper) ne
 * fait qu'appliquer les overrides ci-dessous — aucune modification à
 * y porter à la main.
 *
 * Ajouter un override :
 *   1. Créer une migration additive avec le CHECK constraint souhaité.
 *   2. Regénérer `database.types.generated.ts` (elle produira
 *      `string`).
 *   3. Ajouter ici l'union sous `TableOverrides.<table>.<column>`.
 *      Pas besoin de re-générer.
 *
 * Chantier C1 (2026-07-18) — première version : reprend les 22
 * colonnes qui étaient éditées manuellement dans le fichier généré
 * avant regen, et rend explicite le contrat entre la DB et le code.
 */

// ---------------------------------------------------------------------------
// Unions nommées — importées par le code applicatif (ex. `type SupportStatus`
// est importé depuis `training-support-service.ts`, mais la source de vérité
// SQL vit ici pour éviter la divergence).
// ---------------------------------------------------------------------------

export type ProfessionalStatus =
  | "salarie"
  | "agent_commercial_independant"
  | "autre";

export type SupportStatus = "draft" | "validated" | "archived";
export type DesignedSupportStatus = "draft" | "validated" | "archived";
export type SupportSource = "openrouter" | "heuristic" | "llm";

export type DiagnosticMode = "guided" | "transcript" | "hybrid";
export type DiagnosticStatus =
  | "draft"
  | "in_progress"
  | "transcript_uploaded"
  | "ai_analyzed"
  | "to_review"
  | "validated";

export type SessionStatus =
  | "created"
  | "awaiting_client_validation"
  | "dates_to_position"
  | "dates_validated"
  | "collection_open"
  | "data_collected"
  | "support_generating"
  | "support_ready"
  | "delivered"
  | "report_sent";

export type RecommendationStatus =
  | "not_generated"
  | "generated"
  | "to_review"
  | "sent"
  | "opened"
  | "accepted"
  | "refused";

export type ProfileTarget = "conseiller" | "manager" | "assistant" | "direction";
export type SourceSheet = "Conseiller" | "Manager" | "Assistantes";
export type ProfileRole =
  | "admin"
  | "commercial"
  | "trainer"
  | "client_viewer"
  | "participant";
export type PriorityTier =
  | "essential"
  | "recommended"
  | "optional"
  | "later";
export type ToolMaturity = "low" | "medium" | "high";
export type SkillLevel = "beginner" | "intermediate" | "advanced" | "mixed";
export type YesNoUnknown = "oui" | "non" | "ne_sait_pas";
export type ContractType = "temps_plein" | "temps_partiel";
export type ExpertLevel = "debutant" | "confirme" | "expert";
export type FundingEligibility =
  | "potentially_eligible"
  | "not_eligible"
  | "unknown";
export type SessionDateFormat = "presentiel" | "visio" | "hybride";
export type SessionDateStatus =
  | "proposed"
  | "selected"
  | "rejected"
  | "cancelled";
export type PostTrainingReviewStatus = "draft" | "completed" | "archived";
export type SupportQualityReviewStatus =
  | "draft"
  | "needs_revision"
  | "validated"
  | "rejected";
export type ActivityLogSeverity = "info" | "success" | "warning" | "error";
export type AiGenerationSource = "llm" | "heuristic";
export type AiGenerationStatus =
  | "success"
  | "error"
  | "partial"
  | "fallback"
  | "rate_limited";

// ---------------------------------------------------------------------------
// Table → column → override. Consommé par le wrapper `database.types.ts`.
// ---------------------------------------------------------------------------

export type TableOverrides = {
  activity_logs: {
    severity: ActivityLogSeverity;
  };
  ai_generation_logs: {
    source: AiGenerationSource | null;
    status: AiGenerationStatus;
  };
  designed_training_supports: {
    source: SupportSource;
    status: DesignedSupportStatus;
  };
  diagnostic_participants: {
    professional_status: ProfessionalStatus | null;
    expert_level: ExpertLevel | null;
    contract_type: ContractType | null;
    funding_eligibility: FundingEligibility;
  };
  diagnostics: {
    mode: DiagnosticMode;
    status: DiagnosticStatus;
    agefice_used_before: YesNoUnknown | null;
    opco_used_before: YesNoUnknown | null;
    profiles_in_scope: ProfileTarget[];
  };
  post_training_reviews: {
    status: PostTrainingReviewStatus;
  };
  profiles: {
    role: ProfileRole;
  };
  recommendation_modules: {
    priority_tier: PriorityTier | null;
  };
  recommendations: {
    status: RecommendationStatus;
    tool_maturity: ToolMaturity | null;
    skill_level: SkillLevel | null;
  };
  session_date_options: {
    format: SessionDateFormat | null;
    status: SessionDateStatus;
  };
  session_participants: {
    professional_status: ProfessionalStatus | null;
  };
  support_quality_reviews: {
    status: SupportQualityReviewStatus;
  };
  training_modules: {
    source_sheet: SourceSheet;
    target_profile: ProfileTarget;
  };
  training_sessions: {
    status: SessionStatus;
  };
  training_supports: {
    source: SupportSource;
    status: SupportStatus;
  };
};
