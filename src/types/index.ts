// Domain types for the Start Academy diagnostic platform.
// Aligned with the PRD section 10 ("Données à stocker") and the
// catalogue Excel (Conseiller / Manager / Assistantes).

export type ProfileTarget =
  | "conseiller"
  | "manager"
  | "assistant"
  | "direction";

export type SourceSheet = "Conseiller" | "Manager" | "Assistantes";

export type DiagnosticMode = "guided" | "transcript" | "hybrid";

export type DiagnosticStatus =
  | "draft"
  | "in_progress"
  | "transcript_uploaded"
  | "ai_analyzed"
  | "to_review"
  | "validated";

export type ProposalStatus =
  | "not_generated"
  | "generated"
  | "to_review"
  | "sent"
  | "opened"
  | "accepted"
  | "refused"
  | "to_rework";

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

export type MaturityLevel = "low" | "medium" | "high";

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "mixed";

export interface Client {
  id: string;
  companyName: string;
  sector: string;
  director: string;
  email: string;
  phone?: string;
  collaborators: number;
  teamTypology: ProfileTarget[];
}

/**
 * Catégorie d'une réponse — union élargie v1.0 pour aligner sur les
 * 11 chapitres du référentiel. Les 4 valeurs MVP1 sont conservées et
 * restent valides côté base (cf. migration 20260704).
 *
 * Source unique de vérité (T-3, fix 2026-07-08) : la constante
 * `ANSWER_CATEGORIES` sert à la fois de source runtime (Zod enums,
 * itérations) et de source type (via `(typeof ANSWER_CATEGORIES)[number]`).
 * Ne PAS dupliquer cette liste ailleurs — les routes API
 * `answers/route.ts` etc. importent la constante directement.
 * Doit rester ⊆ des valeurs autorisées par le check_constraint
 * `diagnostic_answers_category_check` (migration 20260704).
 */
export const ANSWER_CATEGORIES = [
  // Valeurs MVP1 (rétro-compat, ne pas retirer)
  "tool_maturity",
  "commercial_performance",
  "business_skill",
  "execution",
  // Valeurs v1.0 alignées sur les chapitres du référentiel
  "identity",            // Ch. 1
  "team",                // Ch. 2 effectifs
  "funding",             // Ch. 2.4 financement
  "prospecting",         // Ch. 3
  "seller_meeting",      // Ch. 4
  "mandates",            // Ch. 5
  "commercial_followup", // Ch. 6
  "buyers",              // Ch. 7
  "visits_offers",       // Ch. 8
  "db_reputation",       // Ch. 9
  "tools_ai",            // Ch. 10
  "management",          // Ch. 11
] as const;

export type AnswerCategory = (typeof ANSWER_CATEGORIES)[number];

/**
 * Type de réponse attendu — utilisé par la UI pour choisir le
 * widget (input number, select, textarea, etc.) et par le moteur
 * ratios/alertes pour interpréter la valeur.
 */
export type DiagnosticQuestionType =
  | "text"
  | "int"
  | "percent"
  | "money"
  | "date"
  | "url"
  | "choice"
  | "multichoice"
  | "yesno";

/**
 * Chapitre du référentiel v1.0 (1..11) — cf.
 * `docs/Diagnostic question referential.md`.
 */
export type DiagnosticChapter = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface DiagnosticQuestion {
  id: string;
  /** Chapitre (1..11) du référentiel. Défaut historique = 10 pour
   * les questions MVP1 tools/perf/skill/exec — cf. mapping ci-dessous. */
  chapter: DiagnosticChapter;
  /** Sous-section optionnelle (« 2.1 », « 2.2 »…). */
  subsection?: string;
  category: AnswerCategory;
  profile: ProfileTarget | "all";
  question: string;
  /** Type de valeur attendu. Défaut historique = "text". */
  type: DiagnosticQuestionType;
  /** O/F du référentiel. Défaut = false. */
  required: boolean;
  /** Choix disponibles pour type = "choice" / "multichoice". */
  choices?: string[];
  /**
   * Question conditionnelle — n'est affichée que si la réponse à
   * `questionId` est égale à `equals` (string) ou fait partie de
   * `equals` (string[]). Non-généralisation : cette forme reste
   * volontairement simple.
   */
  showIf?: { questionId: string; equals: string | string[] };
  /**
   * v1.0 correction (5) — pré-remplissage inter-chapitres. Deux
   * cas concrets uniquement : outil de pige (Ch.3 → Ch.10) et
   * outil d'estimation (Ch.4 → Ch.10). Pas de moteur générique :
   * la UI regarde ce champ et pré-remplit la réponse depuis la
   * réponse déjà donnée à `questionId`.
   */
  prefillFrom?: { questionId: string };
  /** Ce que la réponse alimente (documentaire uniquement). */
  alimente?: string[];
  hint?: string;
}

/**
 * Module de formation issu du catalogue Excel.
 * Les champs nullables reflètent les cellules vides du fichier source.
 * Le futur moteur de recommandation s'appuie sur :
 *  - `family` + `targetProfile` pour filtrer
 *  - `isFoundationModule` pour prioriser les bases outils
 *  - `diagnosticSignals` pour scorer un module à partir des phrases entendues
 *  - `durationHours` + `level` pour calculer durée totale et progression
 */
export interface TrainingModule {
  id: string;
  name: string;
  family: string;
  sourceSheet: SourceSheet;
  targetProfile: ProfileTarget;
  durationHours: number | null;
  level: number | null;
  tools: string | null;
  paying: boolean | null;
  platform: string | null;
  needIdentification: string | null;
  isFoundationModule: boolean;
  diagnosticSignals: string[];
}

/** Lien entre une famille de performance commerciale et les modules à déclencher. */
export interface PerformanceDiagnosticFamily {
  family: string;
  questions: string | null;
  ratio: string | null;
  threshold: string | null;
  triggeredModules: string | null;
}

/** Diagnostic d'un outil socle (ChatGPT, NotebookLM, Gamma, CRM, etc.). */
export interface ToolBaseDiagnostic {
  tool: string;
  questions: string | null;
  level: string | null;
  performanceImpact: string | null;
  weakSignals: string | null;
  moduleToTrigger: string | null;
}

/** Phrase entendue en RDV → modules à proposer en priorité. */
export interface DiagnosticSignalMapping {
  signal: string;
  modules: string;
}

export interface Diagnostic {
  id: string;
  clientId: string;
  commercialId: string;
  meetingDate: string;
  mode: DiagnosticMode;
  status: DiagnosticStatus;
  createdAt: string;
}

export interface TrainingSession {
  id: string;
  clientId: string;
  diagnosticId: string;
  status: SessionStatus;
  proposedDates: string[];
  validatedDate?: string;
  expectedParticipants: number;
}

/**
 * Vue composée d'une session formation pour l'UI — assemble des données
 * issues de la table `training_sessions`, de la table `clients` côté
 * Supabase, et — quand on est en fallback local — du cache localStorage
 * de la proposition + de la recommandation.
 *
 * Le champ `collectionLink` est dérivé de `id` : aucune colonne SQL
 * dédiée n'est nécessaire dans la migration actuelle.
 */
export interface TrainingSessionViewModel {
  id: string;
  clientId: string;
  diagnosticId: string | null;
  recommendationId: string | null;
  clientName: string | null;
  proposalTitle: string | null;
  targetAudience: string | null;
  totalDurationHours: number | null;
  suggestedFormat: string | null;
  participantCount: number | null;
  costPerParticipant: number | null;
  totalEstimatedCost: number | null;
  status: SessionStatus;
  dates: string[];
  validatedDate: string | null;
  collectionLink: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** "supabase" si la fiche vient de Supabase, "local" sinon. */
  source: "supabase" | "local";
}
