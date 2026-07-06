/**
 * Coach Brain / COACHNXT — types de la matière pédagogique injectable.
 *
 * Périmètre de ce projet :
 *   - Start Academy Diagnostic est CONSOMMATEUR de patterns Coach Brain.
 *   - L'amont (COACHNXT : RAG local SQLite vector + Ollama, table
 *     `coach_brain_patterns` côté NXT Performance) n'est PAS recréé ici.
 *   - On définit la forme des patterns côté lecture (cf. CoachBrainPattern)
 *     et la forme du contexte injecté dans les prompts (cf. CoachBrainContext).
 *
 * Séparation des responsabilités — STRICTE :
 *   - Coach Brain / COACHNXT : enrichissement pédagogique amont.
 *   - Claude / OpenRouter    : narration (sélection, reformulation, structure).
 *   - React                  : design (charte, layouts, icônes, rendu PDF).
 *   - Slide budget           : garde-fou rythme/densité — fourchette indicative.
 *
 * Module pur (pas de Supabase, pas de secret) — importable client comme serveur.
 */

// ---------------------------------------------------------------------------
// Sources & catégories
// ---------------------------------------------------------------------------

/**
 * Provenance d'un contenu Coach Brain. Sert d'auditabilité côté logs
 * et de filtre éventuel côté service. La chaîne brute `source` reste
 * libre (`nxt-performance:conf-r2-2024`, `start-academy:masterclass-2025-q1`,
 * `client-upload:<doc_id>`) — `sourceType` permet de regrouper.
 */
export type CoachBrainSourceType =
  | "nxt_performance"
  | "start_academy"
  | "coachnxt_local_rag"
  | "client_upload"
  | "manual"
  | "unknown";

export interface CoachBrainSource {
  /** Chaîne libre identifiant l'origine précise. */
  source: string;
  /** Catégorie de la source — utilisée par le filtrage / les logs. */
  sourceType: CoachBrainSourceType;
}

export type CoachBrainCategory =
  | "method"
  | "script"
  | "objection"
  | "exercise"
  | "example"
  | "prompt"
  | "slide_reference";

export type CoachBrainTargetProfile =
  | "conseiller"
  | "manager"
  | "assistant"
  | "direction";

// ---------------------------------------------------------------------------
// Pattern brut côté coach_brain_patterns (NXT Performance)
// ---------------------------------------------------------------------------

/**
 * Forme « pivot » d'un pattern tel qu'il sera lu depuis
 * `coach_brain_patterns` (table Supabase possédée par NXT Performance).
 *
 * Ce type est volontairement permissif :
 *   - les champs optionnels reflètent le fait que la table NXT
 *     Performance peut évoluer indépendamment ;
 *   - les conversions (snake_case ↔ camelCase, parsing tags, etc.)
 *     se font dans `coach-brain-pattern-adapter.ts`.
 *
 * Tant qu'on n'a pas branché la lecture amont, ce type reste un
 * contrat statique — aucun service ne le produit encore.
 */
export interface CoachBrainPattern {
  id: string;
  title: string;
  category: CoachBrainCategory;
  source: string;
  sourceType?: CoachBrainSourceType;
  tags?: string[];
  moduleFamily?: string | null;
  targetProfile?: CoachBrainTargetProfile | null;
  content: string;
  summary?: string | null;
  visualHint?: string | null;
  usageGuidance?: string | null;
  priority?: number;
  confidenceScore?: number;
  relatedModuleIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Items du contexte injecté dans les prompts
// ---------------------------------------------------------------------------

export interface CoachBrainItemBase {
  /** Identifiant stable côté amont (ex : `nxt:conf-r2-2024:slide-12`). */
  id: string;
  /** Titre court à afficher dans le prompt. */
  title: string;
  /** Catégorie — utilisée pour grouper et cibler l'usage. */
  category: CoachBrainCategory;
  /** Provenance (chaîne libre, ex : `nxt-performance:conf-r2-2024`). */
  source: string;
  /** Type de source — facilite filtre/log côté service. */
  sourceType: CoachBrainSourceType;
  /** Tags libres (vocabulaire métier, signaux, niveaux). */
  tags: string[];
  /** Famille de module métier (`vendeur`, `acquereur`, `estimation`, etc.).
   *  Null = transversal. */
  moduleFamily: string | null;
  /** Profil cible. Null = tous profils. */
  targetProfile: CoachBrainTargetProfile | null;
  /** Matière brute. Texte court préféré — la curation se fait côté
   *  service / adapter, PAS dans le prompt. Cap recommandé ~600 chars. */
  content: string;
  /** Résumé éventuel — si présent, à privilégier dans le prompt
   *  pour économiser le budget tokens. */
  summary: string | null;
  /** Indication visuelle (schéma, image mentale, analogie) — aide
   *  Claude pour layout / emphasis. Optionnel. */
  visualHint: string | null;
  /** Conseil d'usage pédagogique : quand / dans quel module injecter
   *  ce contenu. Aide Claude à le placer correctement. */
  usageGuidance: string | null;
  /** 0–100, plus haut = plus saillant. Utilisé par le ranking côté
   *  service avant l'envoi au prompt. */
  priority: number;
  /** 0–1 — confiance de l'amont (RAG / pattern miner) sur la
   *  pertinence du pattern. Optionnel selon les sources. */
  confidenceScore: number | null;
  /** Ids des modules Start Academy auxquels ce contenu se rattache.
   *  Vide = transversal / à classer par Claude. */
  relatedModuleIds: string[];
  /** Métadonnées NXT Performance. ISO 8601. */
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CoachBrainMethod extends CoachBrainItemBase {
  category: "method";
}
export interface CoachBrainScript extends CoachBrainItemBase {
  category: "script";
}
export interface CoachBrainObjection extends CoachBrainItemBase {
  category: "objection";
}
export interface CoachBrainExercise extends CoachBrainItemBase {
  category: "exercise";
}
export interface CoachBrainExample extends CoachBrainItemBase {
  category: "example";
}
export interface CoachBrainPrompt extends CoachBrainItemBase {
  category: "prompt";
}
export interface CoachBrainSlideReference extends CoachBrainItemBase {
  category: "slide_reference";
}

export type CoachBrainItem =
  | CoachBrainMethod
  | CoachBrainScript
  | CoachBrainObjection
  | CoachBrainExercise
  | CoachBrainExample
  | CoachBrainPrompt
  | CoachBrainSlideReference;

// ---------------------------------------------------------------------------
// Contexte agrégé
// ---------------------------------------------------------------------------

/**
 * Contexte Coach Brain transmis aux builders de prompt.
 * Groupé par catégorie pour faciliter la sérialisation dans le prompt
 * et la curation côté service.
 */
export interface CoachBrainContext {
  methods: CoachBrainMethod[];
  scripts: CoachBrainScript[];
  objections: CoachBrainObjection[];
  exercises: CoachBrainExercise[];
  examples: CoachBrainExample[];
  prompts: CoachBrainPrompt[];
  slideReferences: CoachBrainSlideReference[];
}

export const EMPTY_COACH_BRAIN_CONTEXT: CoachBrainContext = {
  methods: [],
  scripts: [],
  objections: [],
  exercises: [],
  examples: [],
  prompts: [],
  slideReferences: [],
};

export function isCoachBrainContextEmpty(
  ctx: CoachBrainContext | null | undefined
): boolean {
  if (!ctx) return true;
  return (
    ctx.methods.length === 0 &&
    ctx.scripts.length === 0 &&
    ctx.objections.length === 0 &&
    ctx.exercises.length === 0 &&
    ctx.examples.length === 0 &&
    ctx.prompts.length === 0 &&
    ctx.slideReferences.length === 0
  );
}

export function countCoachBrainItems(
  ctx: CoachBrainContext | null | undefined
): number {
  if (!ctx) return 0;
  return (
    ctx.methods.length +
    ctx.scripts.length +
    ctx.objections.length +
    ctx.exercises.length +
    ctx.examples.length +
    ctx.prompts.length +
    ctx.slideReferences.length
  );
}
