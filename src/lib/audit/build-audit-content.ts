/**
 * Moteur pur et déterministe transformant les réponses du diagnostic
 * guidé (71 questions, chapitres 3-11) en contenu d'audit structuré
 * consommable par le rendu et le prompt IA.
 *
 * Aucun appel réseau, aucun accès Supabase, aucune IA. Pur transform
 * `(answers + participants + recommendation) → AuditContent`.
 *
 * Les alertes ne sont PAS dupliquées : le module reçoit
 * `alerts: DiagnosticAlert[]` en entrée (venant de
 * `computeRatiosAndAlerts` de `ratios-service.ts`) et les propage
 * telles quelles dans la structure d'audit + les priorise pour la
 * synthèse dirigeant.
 *
 * Cas particuliers documentés dans `docs/diagnostic-cleanup-backlog.md` :
 *   • `google-reviews-score` typé `percent` en source mais traité
 *     ici comme note sur 5 (unit `rating_5`, benchmark 4.5).
 *
 * Note post lot answer-labels : les 2 anciens doublons Ch.3
 * `prospecting-pige-tool` et Ch.4 `estimation-tool` ont été supprimés
 * du questionnaire (consolidation en Ch.10 `tools-pige` / `tools-estimation`).
 * Il n'y a donc plus de logique de dédup verbatim par valeur la plus longue.
 */

import type { AnswerRecord } from "@/lib/diagnostics/diagnostic-service";
import type {
  AlertSeverity,
  BenchmarksOverride,
  DiagnosticAlert,
} from "@/lib/diagnostics/ratios-service";
import { DEFAULT_BENCHMARKS } from "@/lib/diagnostics/ratios-service";
import { diagnosticQuestions } from "@/lib/data/diagnostic-questions";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type AuditBlock = "performance_chain" | "practices";

export type QuestionRole =
  | "ratio_input"
  | "practice_flag"
  | "verbatim"
  | "context";

export type PracticeTheme =
  | "prospecting_setup"
  | "seller_rituals"
  | "mandates_setup"
  | "commercial_followup"
  | "buyer_process"
  | "db_reputation"
  | "tools_ai"
  | "management";

export type RatioUnit =
  | "percent"
  | "count"
  | "months"
  | "rating_5"
  | "ratio";

/**
 * Trois états distincts (au lieu du `"unknown"` fourre-tout précédent) :
 *   • `above` / `below` — valeur ET repère présents, comparaison faite ;
 *   • `no_benchmark` — valeur présente MAIS aucun repère de référence
 *     (afficher la valeur seule, aucune mention de statut — surtout pas
 *     « Non mesuré » sous un chiffre qui existe) ;
 *   • `no_data` — pas de réponse (afficher « Non renseigné », pas de
 *     valeur, pas de badge de statut).
 */
export type RatioStatus = "above" | "below" | "no_benchmark" | "no_data";

export interface AuditRatio {
  key: string;
  label: string;
  value: number | null;
  unit: RatioUnit;
  benchmark: number | null;
  status: RatioStatus;
  sourceQuestionIds: string[];
  /**
   * `true` = plus la valeur est basse, mieux c'est (ex. taux de chute
   * compromis→acte, durée mandat). Le consommateur (prompt IA, rendu
   * print) doit inverser sa lecture. Défaut : `false`.
   */
  higherIsWorse?: boolean;
  /**
   * `true` = ratio conservé dans la structure pour compat, mais NE DOIT
   * PAS être rendu — c'est un dérivé d'un autre ratio déjà présent
   * (ex. `chuteCompromisActePercent` = 100 − `compromisToActePercent` :
   * même fait métier, ne pas dupliquer à l'écran ni au print).
   */
  derived?: boolean;
}

export interface PracticeFlag {
  key: string;
  label: string;
  theme: PracticeTheme;
  /** Booléen pour yesno ; string / string[] pour choice / multichoice ; null si non renseigné. */
  value: boolean | string | string[] | null;
  sourceQuestionId: string;
  /**
   * Libellés humains par valeur technique pour choice / multichoice —
   * propagés depuis `DiagnosticQuestion.optionLabels` afin que les
   * consommateurs (rendu audit, prompt IA) puissent humaniser sans
   * ré-importer le questionnaire. `undefined` si la question ne
   * fournit pas de mapping.
   */
  optionLabels?: Record<string, string>;
}

export interface Verbatim {
  key: string;
  label: string;
  content: string;
  sourceQuestionIds: string[];
}

/**
 * Constat de manque tiré des flags "pratique absente" — version courte
 * du bloc Pratiques imprimé. Formulation en dur par ID de question
 * (mapping `PRACTICE_GAP_STATEMENTS`), aucune IA. En attendant le lot
 * audit-3 qui portera une rédaction plus complète, ce format permet de
 * livrer un doc client sobre : par thème, une ligne par pratique
 * absente, phrase de constat.
 */
export interface PracticeGap {
  key: string;
  theme: PracticeTheme;
  /** Phrase de constat prête à imprimer, ex. « Pas de trame de découverte vendeur ». */
  statement: string;
  sourceQuestionId: string;
}

export interface NumberedPriority {
  rank: number;
  title: string;
  severity: AlertSeverity;
  sourceAlertCodes: string[];
}

export interface CompletenessStats {
  answeredCount: number;
  totalCount: number;
}

export interface AuditContent {
  completeness: CompletenessStats & {
    byBlock: Record<AuditBlock, CompletenessStats>;
  };
  performanceChain: {
    ratios: AuditRatio[];
  };
  practices: {
    flags: PracticeFlag[];
    /** Constats de manque prêts à imprimer (version courte). */
    gaps: PracticeGap[];
    verbatims: Verbatim[];
  };
  /** Pass-through de TOUTES les alertes reçues en entrée. */
  alerts: DiagnosticAlert[];
  /**
   * Sous-ensemble des alertes destinées au **commercial** uniquement
   * (`audience === "internal"`) — données obligatoires manquantes,
   * préconditions non satisfaites. JAMAIS rendues dans le doc client
   * ni utilisées pour prioriser la synthèse dirigeant.
   */
  internalAlerts: DiagnosticAlert[];
  summary: {
    keyMetrics: AuditRatio[];
    /** N alertes client les plus sévères — `audience === "client"` uniquement. */
    topAlerts: DiagnosticAlert[];
  };
  /** Dérivées des alertes client uniquement — jamais des alertes internes. */
  priorities: NumberedPriority[];
}

export interface BuildAuditContentInput {
  answers: AnswerRecord[];
  alerts?: DiagnosticAlert[];
  /**
   * Nombre max d'alertes à faire remonter dans `summary.topAlerts` et
   * `priorities`. Défaut : 3.
   */
  topAlertsLimit?: number;
  /**
   * Override des seuils. Passé tel quel — les seuils exposés par
   * `AuditRatio.benchmark` seront ceux du merge
   * `{ ...DEFAULT_BENCHMARKS, ...benchmarks }`. Le contract test
   * `benchmarks-are-shared` prouve qu'aucune valeur n'est copiée en
   * dur dans ce module.
   */
  benchmarks?: BenchmarksOverride;
}

// ---------------------------------------------------------------------------
// Configuration modifiable en une ligne
// ---------------------------------------------------------------------------

/**
 * Liste de PRÉFÉRENCE des ratios candidats pour la synthèse dirigeant.
 * `buildSummary` prend les 3 PREMIERS ratios de cette liste qui sont
 * effectivement renseignés (`value !== null`) — jamais un ratio « Non
 * mesuré » ne sera affiché en synthèse.
 *
 * Si moins de 3 ratios sont renseignés, la synthèse n'affiche que
 * ceux qui existent. Étendre la liste (candidats supplémentaires en
 * fin) reste sans effet tant que les 3 premiers renseignés sont
 * suffisants — c'est l'ordre de préférence qui prime.
 *
 * Correction issue de l'audit imprimé — ne pas afficher de chiffre
 * absent en synthèse (« Non mesuré » dans une case en gras, c'est
 * contre-productif pour un dirigeant).
 */
export const SUMMARY_KEY_METRICS: readonly string[] = [
  // Ratios prioritaires (ordre de préférence produit) :
  "estimationToMandatPercent",
  "exclusivityPercent",
  "mandatesAverageDurationMonths",
  // Repli : si les 3 premiers ne sont pas renseignés, on remonte
  // ces candidats dans l'ordre — évite un keyMetrics vide.
  "contactsToRdvPercent",
  "compromisToActePercent",
  "offresToCompromisPercent",
];

/** Nombre max de key metrics affichés en synthèse (contrainte design). */
export const SUMMARY_KEY_METRICS_MAX = 3;

/**
 * Formulation en dur des constats de manque pour les questions de type
 * `yesno`. Émis quand la réponse vaut `false`. Une pratique non listée
 * ici → aucun constat émis (élargissement contrôlé, pas d'IA). À faire
 * évoluer au lot audit-3.
 */
export const PRACTICE_GAP_STATEMENTS: Readonly<Record<string, string>> = {
  "prospecting-script": "Pas de script de prospection formalisé",
  "seller-discovery-formalized": "Pas de trame de découverte vendeur",
  "seller-written-valuation": "Pas d'avis de valeur écrit remis en RDV",
  "buyers-discovery-formalized": "Pas de trame de découverte acquéreur",
  "buyers-financing-verified": "Financement acquéreur non vérifié avant visites",
  "tools-esignature": "Signature électronique non déployée",
  "tool-team-access": "Outils IA pas partagés à l'équipe",
  "tool-chatgpt-setup": "Outils IA utilisés sans paramétrage agence",
  "tool-chatgpt-instructions":
    "L'IA ne connaît ni l'agence, ni le secteur, ni les usages maison",
  "tool-prompts-standard":
    "Chaque conseiller utilise l'IA à sa façon — qualité inégale selon qui s'en sert",
  "tool-anti-hallucination":
    "Aucune vérification des contenus produits par l'IA avant usage client",
  "tool-notebook-created":
    "Les documents internes (règlements, PV d'AG) ne sont pas exploités par l'IA",
  "mgmt-coaching-individual": "Pas d'entretien individuel régulier",
  "exec-manager-reporting":
    "Pas de remontée d'activité organisée entre deux réunions",
};

/**
 * Sentinelle pour la clé "sélection vide" dans `PRACTICE_CHOICE_GAP_RULES`.
 * S'applique aux `multichoice` uniquement — si l'utilisateur a répondu
 * MAIS n'a coché aucune option, ce constat est émis. Sans effet sur
 * les `choice`.
 */
export const CHOICE_GAP_EMPTY_KEY = "__empty__";

/**
 * Constats de manque pour les questions de type `choice` OU `multichoice`.
 * Un constat spécifique par valeur retenue ; une valeur non listée → aucun
 * constat émis. Comme `PRACTICE_GAP_STATEMENTS`, mapping en dur, pas d'IA.
 *
 * Comparaison insensible à la casse — la valeur est normalisée
 * (`trim().toLowerCase()`) avant lookup. Toutes les clés sont donc en
 * minuscules.
 *
 * Cas particulier `multichoice` : la clé `CHOICE_GAP_EMPTY_KEY` matche
 * une sélection vide (utilisateur a répondu mais aucune option cochée).
 * Le même constat peut être associé à `aucun` ET à `__empty__` pour
 * couvrir les deux cas — c'est explicitement la sémantique demandée
 * pour `tools-ai-usage`.
 */
export const PRACTICE_CHOICE_GAP_RULES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "mandates-price-above-market": {
    souvent:
      "Prise de mandats au-dessus du prix de marché sans stratégie de repli",
  },
  "db-crm-uptodate": {
    // `non` = la fiche au hasard « raconte n'importe quoi » côté question.
    // Voir docs de `db-crm-uptodate` : choices = ["oui", "non", "partiellement"].
    // Pas de valeur `obsolete` dans le questionnaire.
    non: "Base de contacts obsolète",
    partiellement: "Base de contacts partiellement à jour",
  },
  "tools-ai-usage": {
    // multichoice — constat unique déclenché soit par la présence de
    // `aucun` dans la sélection, soit par une sélection vide (aucune
    // option cochée). Deux entrées volontairement redondantes pour
    // exprimer la sémantique produit demandée.
    aucun: "Aucun outil IA utilisé au quotidien",
    [CHOICE_GAP_EMPTY_KEY]: "Aucun outil IA utilisé au quotidien",
  },
};

// Note Google — pas de benchmark ici. `DEFAULT_BENCHMARKS` ne fournit
// pas de seuil pour une note sur 5, et introduire une valeur en dur
// dans ce module dupliquerait un référentiel produit qui n'existe pas
// encore. Statut résultant : `unknown` tant que le seuil n'est pas
// centralisé (cf. `docs/diagnostic-cleanup-backlog.md` — retypage
// `rating` en chantier séparé qui posera le benchmark côté DB).

// ---------------------------------------------------------------------------
// Mapping — 71 IDs → (bloc, role, thème / verbatim key)
// Test contract `mapping-coverage` échoue si un ID du fichier source
// n'est pas ici, ou si un ID ici n'existe plus dans la source.
// ---------------------------------------------------------------------------

interface MappingEntry {
  block: AuditBlock;
  role: QuestionRole;
  theme?: PracticeTheme;
  /** Clé du verbatim (permet le regroupement `pige_tool` par ex.). */
  verbatimKey?: string;
  verbatimLabel?: string;
}

export const QUESTION_MAPPING: Readonly<Record<string, MappingEntry>> = {
  // Ch.3 — Prospection
  "prospecting-methods": {
    block: "practices",
    role: "practice_flag",
    theme: "prospecting_setup",
  },
  "prospecting-who": {
    block: "practices",
    role: "practice_flag",
    theme: "prospecting_setup",
  },
  "perf-contacts-week": { block: "performance_chain", role: "ratio_input" },
  "prospecting-contacts-per-month": {
    block: "performance_chain",
    role: "ratio_input",
  },
  // Rôle `context` : donnée quantitative (heures/semaine par agent)
  // qui n'alimente ni un ratio calculé (aucun dénominateur pertinent
  // dans le questionnaire), ni un flag comportemental. Elle nourrit
  // la lecture qualitative de la maturité prospection dans le prompt
  // IA (« l'équipe consacre X h/semaine ») sans être affichée comme
  // KPI. Seule question actuellement en `context` — inventaire à
  // reconsidérer si d'autres compteurs sans dénominateur émergent.
  "prospecting-hours-per-week": {
    block: "practices",
    role: "context",
  },
  "perf-rate-rdv": { block: "performance_chain", role: "ratio_input" },
  "prospecting-script": {
    block: "practices",
    role: "practice_flag",
    theme: "prospecting_setup",
  },
  "skill-prospection": {
    block: "practices",
    role: "practice_flag",
    theme: "prospecting_setup",
  },
  // Ch.4 — RDV vendeur
  "seller-meetings-per-month": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "perf-rate-estimation": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "seller-meeting-format": {
    block: "practices",
    role: "practice_flag",
    theme: "seller_rituals",
  },
  "seller-discovery-formalized": {
    block: "practices",
    role: "practice_flag",
    theme: "seller_rituals",
  },
  "estimation-delivery-delay": {
    block: "practices",
    role: "practice_flag",
    theme: "seller_rituals",
  },
  "seller-written-valuation": {
    block: "practices",
    role: "practice_flag",
    theme: "seller_rituals",
  },
  "skill-qualification": {
    block: "practices",
    role: "practice_flag",
    theme: "seller_rituals",
  },
  "skill-estimation": {
    block: "practices",
    role: "practice_flag",
    theme: "seller_rituals",
  },
  "skill-objections": {
    block: "practices",
    role: "practice_flag",
    theme: "seller_rituals",
  },
  // Ch.5 — Mandats
  "mandates-active-stock": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "mandates-per-month": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "perf-rate-mandat": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "perf-rate-exclusivity": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "mandates-exclusivity-percent": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "mandates-price-above-market": {
    block: "practices",
    role: "practice_flag",
    theme: "mandates_setup",
  },
  "skill-price-defense": {
    block: "practices",
    role: "practice_flag",
    theme: "mandates_setup",
  },
  "mandates-average-duration-months": {
    block: "performance_chain",
    role: "ratio_input",
  },
  // Ch.6 — Commercialisation
  "commercial-followup-frequency": {
    block: "practices",
    role: "practice_flag",
    theme: "commercial_followup",
  },
  "commercial-price-drop-per-month-percent": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "commercial-requalification-process": {
    block: "practices",
    role: "practice_flag",
    theme: "commercial_followup",
  },
  // Ch.7 — Acquéreurs
  "buyers-sources-repartition": {
    block: "practices",
    role: "verbatim",
    verbatimKey: "buyers_sources",
    verbatimLabel: "Répartition des sources acquéreurs",
  },
  "buyers-contacts-per-month": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "buyers-discovery-formalized": {
    block: "practices",
    role: "practice_flag",
    theme: "buyer_process",
  },
  "buyers-financing-verified": {
    block: "practices",
    role: "practice_flag",
    theme: "buyer_process",
  },
  // Ch.8 — Tunnel visites/offres/actes
  "visits-per-month": { block: "performance_chain", role: "ratio_input" },
  "offers-per-month": { block: "performance_chain", role: "ratio_input" },
  "compromis-per-month": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "actes-per-month": { block: "performance_chain", role: "ratio_input" },
  "chute-compromis-acte-percent": {
    block: "performance_chain",
    role: "ratio_input",
  },
  // Ch.9 — BDD & e-réputation
  "db-volume": { block: "performance_chain", role: "ratio_input" },
  "db-crm-uptodate": {
    block: "practices",
    role: "practice_flag",
    theme: "db_reputation",
  },
  "perf-crm-usage": { block: "performance_chain", role: "ratio_input" },
  "db-exploitation": {
    block: "practices",
    role: "practice_flag",
    theme: "db_reputation",
  },
  "google-reviews-count": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "google-reviews-score": {
    block: "performance_chain",
    role: "ratio_input",
  },
  "reviews-collection-process": {
    block: "practices",
    role: "practice_flag",
    theme: "db_reputation",
  },
  // Ch.10 — Outils & IA
  "tools-metier": {
    block: "practices",
    role: "verbatim",
    verbatimKey: "tools_metier",
    verbatimLabel: "Logiciel métier",
  },
  "tools-estimation": {
    block: "practices",
    role: "verbatim",
    verbatimKey: "tools_estimation",
    verbatimLabel: "Outil d'estimation (chapitre Outils)",
  },
  "tools-pige": {
    block: "practices",
    role: "verbatim",
    verbatimKey: "pige_tool",
    verbatimLabel: "Outil de pige utilisé",
  },
  "tools-portals": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tools-esignature": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tools-ai-usage": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-chatgpt-usage": {
    block: "practices",
    role: "verbatim",
    verbatimKey: "chatgpt_usage",
    verbatimLabel: "Usage ChatGPT dans les rendez-vous",
  },
  "tool-claude-gemini": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-team-access": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-chatgpt-setup": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-chatgpt-instructions": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-prompts-standard": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-anti-hallucination": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-notebooklm": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-notebook-created": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  "tool-gamma": {
    block: "practices",
    role: "practice_flag",
    theme: "tools_ai",
  },
  // Ch.11 — Management
  "mgmt-team-meeting-frequency": {
    block: "practices",
    role: "practice_flag",
    theme: "management",
  },
  "exec-manager-reporting": {
    block: "practices",
    role: "practice_flag",
    theme: "management",
  },
  "mgmt-coaching-individual": {
    block: "practices",
    role: "practice_flag",
    theme: "management",
  },
  "exec-week-structure": {
    block: "practices",
    role: "practice_flag",
    theme: "management",
  },
  "exec-autonomy": {
    block: "practices",
    role: "practice_flag",
    theme: "management",
  },
  "mgmt-indicators-followed": {
    block: "practices",
    role: "practice_flag",
    theme: "management",
  },
  "mgmt-recruitment": {
    block: "practices",
    role: "practice_flag",
    theme: "management",
  },
  "mgmt-top3-difficulties": {
    block: "practices",
    role: "verbatim",
    verbatimKey: "top3_difficulties",
    verbatimLabel: "Top 3 difficultés actuelles",
  },
  "mgmt-top3-priorities": {
    block: "practices",
    role: "verbatim",
    verbatimKey: "top3_priorities",
    verbatimLabel: "Top 3 priorités",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findAnswer(
  answers: AnswerRecord[],
  questionId: string
): AnswerRecord | null {
  return answers.find((a) => a.questionId === questionId) ?? null;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const normalized = trimmed.replace(/%/g, "").replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function answerNumber(
  answers: AnswerRecord[],
  questionId: string
): number | null {
  return parseNumber(findAnswer(answers, questionId)?.answer ?? null);
}

function ratioPercent(
  numerator: number | null,
  denominator: number | null
): number | null {
  if (
    numerator === null ||
    denominator === null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function computeStatus(
  value: number | null,
  benchmark: number | null
): RatioStatus {
  if (value === null) return "no_data";
  if (benchmark === null) return "no_benchmark";
  return value >= benchmark ? "above" : "below";
}

function isAnswered(a: AnswerRecord | null): boolean {
  if (!a) return false;
  if (a.isSkipped) return false;
  const trimmed = (a.answer ?? "").trim();
  return trimmed.length > 0;
}

function severityRank(s: AlertSeverity): number {
  switch (s) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

function parseMultichoice(raw: string | null): string[] {
  if (!raw) return [];
  // Convention MVP : les multichoice sérialisées comme JSON array OU
  // liste séparée par virgules.
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => String(v).trim())
          .filter((v) => v.length > 0);
      }
    } catch {
      /* fall-through */
    }
  }
  return trimmed
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// ---------------------------------------------------------------------------
// Sous-builders
// ---------------------------------------------------------------------------

function buildPerformanceRatios(
  answers: AnswerRecord[],
  benchmarks: typeof DEFAULT_BENCHMARKS
): AuditRatio[] {
  const contactsPerMonth = answerNumber(
    answers,
    "prospecting-contacts-per-month"
  );
  const rdvPerMonth = answerNumber(answers, "seller-meetings-per-month");
  const perfRateEstimation = answerNumber(answers, "perf-rate-estimation");
  const perfRateMandat = answerNumber(answers, "perf-rate-mandat");
  const perfRateExclusivity = answerNumber(answers, "perf-rate-exclusivity");
  const exclusivityPercent = answerNumber(
    answers,
    "mandates-exclusivity-percent"
  );
  const mandatesAvgMonths = answerNumber(
    answers,
    "mandates-average-duration-months"
  );
  const visits = answerNumber(answers, "visits-per-month");
  const offers = answerNumber(answers, "offers-per-month");
  const compromis = answerNumber(answers, "compromis-per-month");
  const actes = answerNumber(answers, "actes-per-month");
  const chuteCompromisActe = answerNumber(
    answers,
    "chute-compromis-acte-percent"
  );
  const priceDrop = answerNumber(
    answers,
    "commercial-price-drop-per-month-percent"
  );
  const dbVolume = answerNumber(answers, "db-volume");
  const crmUsage = answerNumber(answers, "perf-crm-usage");
  const reviewsCount = answerNumber(answers, "google-reviews-count");
  const reviewsScore = answerNumber(answers, "google-reviews-score");

  const contactsToRdv = ratioPercent(rdvPerMonth, contactsPerMonth);
  const visitesToOffres = ratioPercent(offers, visits);
  const offresToCompromis = ratioPercent(compromis, offers);
  const compromisToActe = ratioPercent(actes, compromis);

  return [
    {
      key: "contactsToRdvPercent",
      label: "Contacts vendeurs → RDV (%)",
      value: contactsToRdv,
      unit: "percent",
      benchmark: benchmarks.contactsToRdvPercent,
      status: computeStatus(contactsToRdv, benchmarks.contactsToRdvPercent),
      sourceQuestionIds: [
        "prospecting-contacts-per-month",
        "seller-meetings-per-month",
      ],
    },
    {
      key: "rdvToEstimationPercent",
      label: "RDV vendeur → estimation (%)",
      value: perfRateEstimation,
      unit: "percent",
      benchmark: null,
      status: computeStatus(perfRateEstimation, null),
      sourceQuestionIds: ["perf-rate-estimation"],
    },
    {
      key: "estimationToMandatPercent",
      label: "Estimation → mandat (%)",
      value: perfRateMandat,
      unit: "percent",
      benchmark: benchmarks.rdvToMandatPercent,
      status: computeStatus(perfRateMandat, benchmarks.rdvToMandatPercent),
      sourceQuestionIds: ["perf-rate-mandat"],
    },
    {
      key: "simpleToExcluPercent",
      label: "Mandat simple → exclusivité (%)",
      value: perfRateExclusivity,
      unit: "percent",
      benchmark: null,
      status: computeStatus(perfRateExclusivity, null),
      sourceQuestionIds: ["perf-rate-exclusivity"],
    },
    {
      key: "exclusivityPercent",
      label: "Part d'exclusivité dans les rentrées (%)",
      value: exclusivityPercent,
      unit: "percent",
      benchmark: benchmarks.exclusivityPercent,
      status: computeStatus(exclusivityPercent, benchmarks.exclusivityPercent),
      sourceQuestionIds: ["mandates-exclusivity-percent"],
    },
    {
      key: "mandatesAverageDurationMonths",
      label: "Durée moyenne des mandats (mois)",
      value: mandatesAvgMonths,
      unit: "months",
      benchmark: null,
      status: computeStatus(mandatesAvgMonths, null),
      sourceQuestionIds: ["mandates-average-duration-months"],
      higherIsWorse: true,
    },
    {
      key: "visitesToOffresPercent",
      label: "Visites → offres (%)",
      value: visitesToOffres,
      unit: "percent",
      benchmark: null,
      status: computeStatus(visitesToOffres, null),
      sourceQuestionIds: ["visits-per-month", "offers-per-month"],
    },
    {
      key: "offresToCompromisPercent",
      label: "Offres → compromis (%)",
      value: offresToCompromis,
      unit: "percent",
      benchmark: benchmarks.offresToCompromisPercent,
      status: computeStatus(
        offresToCompromis,
        benchmarks.offresToCompromisPercent
      ),
      sourceQuestionIds: ["offers-per-month", "compromis-per-month"],
    },
    {
      key: "compromisToActePercent",
      label: "Compromis → acte (%)",
      value: compromisToActe,
      unit: "percent",
      benchmark: benchmarks.compromisToActePercent,
      status: computeStatus(
        compromisToActe,
        benchmarks.compromisToActePercent
      ),
      sourceQuestionIds: ["compromis-per-month", "actes-per-month"],
    },
    {
      key: "chuteCompromisActePercent",
      label: "Taux de chute compromis → acte (%)",
      value: chuteCompromisActe,
      unit: "percent",
      benchmark: null,
      status: computeStatus(chuteCompromisActe, null),
      sourceQuestionIds: ["chute-compromis-acte-percent"],
      higherIsWorse: true,
      // Dérivé de `compromisToActePercent` (100 - x). Conservé dans la
      // structure pour compat (consommateurs externes possibles), mais
      // filtré du rendu print — ne pas afficher deux fois le même fait.
      derived: true,
    },
    {
      key: "priceDropPerMonthPercent",
      label: "Baisses de prix obtenues par mois sur le stock (%)",
      value: priceDrop,
      unit: "percent",
      benchmark: null,
      status: computeStatus(priceDrop, null),
      sourceQuestionIds: ["commercial-price-drop-per-month-percent"],
    },
    {
      key: "dbVolume",
      label: "Volume de la base de contacts",
      value: dbVolume,
      unit: "count",
      benchmark: null,
      status: computeStatus(dbVolume, null),
      sourceQuestionIds: ["db-volume"],
    },
    {
      key: "crmUsagePercent",
      label: "Taux d'utilisation du CRM dans l'équipe (%)",
      value: crmUsage,
      unit: "percent",
      benchmark: null,
      status: computeStatus(crmUsage, null),
      sourceQuestionIds: ["perf-crm-usage"],
    },
    {
      key: "googleReviewsCount",
      label: "Nombre d'avis Google",
      value: reviewsCount,
      unit: "count",
      benchmark: null,
      status: computeStatus(reviewsCount, null),
      sourceQuestionIds: ["google-reviews-count"],
    },
    {
      // Note Google — typée `percent` en source, traitée comme note sur 5
      // ici (`unit: rating_5`). Pas de benchmark : introduire un seuil
      // en dur dupliquerait un référentiel qui n'existe pas encore côté
      // `DEFAULT_BENCHMARKS`. Statut `unknown` jusqu'à ce que le
      // retypage `rating` du backlog pose le seuil au bon endroit.
      key: "googleReviewsScore",
      label: "Note Google (sur 5)",
      value: reviewsScore,
      unit: "rating_5",
      benchmark: null,
      status: computeStatus(reviewsScore, null),
      sourceQuestionIds: ["google-reviews-score"],
    },
  ];
}

function buildPracticeFlags(answers: AnswerRecord[]): PracticeFlag[] {
  const flags: PracticeFlag[] = [];
  for (const [questionId, mapping] of Object.entries(QUESTION_MAPPING)) {
    if (mapping.role !== "practice_flag") continue;
    const q = diagnosticQuestions.find((x) => x.id === questionId);
    const a = findAnswer(answers, questionId);
    let value: PracticeFlag["value"] = null;
    if (isAnswered(a)) {
      const raw = a!.answer!.trim();
      if (q?.type === "yesno") {
        value = raw.toLowerCase() === "oui" || raw.toLowerCase() === "true";
      } else if (q?.type === "multichoice") {
        value = parseMultichoice(raw);
      } else {
        value = raw;
      }
    }
    flags.push({
      key: questionId,
      label: q?.question ?? questionId,
      theme: mapping.theme!,
      value,
      sourceQuestionId: questionId,
      optionLabels: q?.optionLabels,
    });
  }
  return flags;
}

function buildPracticeGaps(flags: PracticeFlag[]): PracticeGap[] {
  const gaps: PracticeGap[] = [];
  for (const flag of flags) {
    const mapping = QUESTION_MAPPING[flag.sourceQuestionId];
    if (!mapping?.theme) continue;

    // yesno : constat émis quand la pratique est absente (value === false).
    if (flag.value === false) {
      const statement = PRACTICE_GAP_STATEMENTS[flag.sourceQuestionId];
      if (!statement) continue;
      gaps.push({
        key: flag.sourceQuestionId,
        theme: mapping.theme,
        statement,
        sourceQuestionId: flag.sourceQuestionId,
      });
      continue;
    }

    // choice : constat spécifique par valeur retenue (ex. « souvent »
    // pour mandats-price-above-market → constat de dérive tarifaire).
    // Comparaison lowercased pour aligner avec le stockage saisi.
    if (typeof flag.value === "string") {
      const rules = PRACTICE_CHOICE_GAP_RULES[flag.sourceQuestionId];
      if (!rules) continue;
      const key = flag.value.trim().toLowerCase();
      const statement = rules[key];
      if (!statement) continue;
      gaps.push({
        key: `${flag.sourceQuestionId}:${key}`,
        theme: mapping.theme,
        statement,
        sourceQuestionId: flag.sourceQuestionId,
      });
      continue;
    }

    // multichoice : constat émis si une des valeurs sélectionnées matche
    // une règle, OU si la sélection est vide (clé sentinelle __empty__).
    // Un seul gap par question — la première règle qui matche gagne
    // (ordre naturel : __empty__ pris en compte quand la sélection l'est).
    if (Array.isArray(flag.value)) {
      const rules = PRACTICE_CHOICE_GAP_RULES[flag.sourceQuestionId];
      if (!rules) continue;
      const normalized = flag.value
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.length > 0);
      const lookupKeys =
        normalized.length === 0 ? [CHOICE_GAP_EMPTY_KEY] : normalized;
      for (const key of lookupKeys) {
        const statement = rules[key];
        if (!statement) continue;
        gaps.push({
          key: `${flag.sourceQuestionId}:${key}`,
          theme: mapping.theme,
          statement,
          sourceQuestionId: flag.sourceQuestionId,
        });
        break;
      }
    }
  }
  return gaps;
}

function buildVerbatims(answers: AnswerRecord[]): Verbatim[] {
  // Regroupement par verbatimKey (permet le dédup pige_tool).
  const groups = new Map<
    string,
    { label: string; entries: { qid: string; content: string }[] }
  >();
  for (const [questionId, mapping] of Object.entries(QUESTION_MAPPING)) {
    if (mapping.role !== "verbatim") continue;
    const key = mapping.verbatimKey ?? questionId;
    const label = mapping.verbatimLabel ?? questionId;
    const a = findAnswer(answers, questionId);
    if (!isAnswered(a)) continue;
    const raw = a!.answer!.trim();
    const bucket = groups.get(key) ?? { label, entries: [] };
    bucket.entries.push({ qid: questionId, content: raw });
    groups.set(key, bucket);
  }
  const verbatims: Verbatim[] = [];
  for (const [key, bucket] of groups) {
    if (bucket.entries.length === 0) continue;
    // Dédup : garder la valeur la plus longue quand plusieurs sources
    // pointent la même verbatimKey (ex. pige_tool = prospecting-pige-tool
    // + tools-pige).
    const winner = bucket.entries.reduce((best, cur) =>
      cur.content.length > best.content.length ? cur : best
    );
    verbatims.push({
      key,
      label: bucket.label,
      content: winner.content,
      sourceQuestionIds: bucket.entries.map((e) => e.qid),
    });
  }
  return verbatims;
}

function buildCompleteness(
  answers: AnswerRecord[]
): AuditContent["completeness"] {
  const mappedIds = Object.keys(QUESTION_MAPPING);
  const answeredIds = new Set(
    mappedIds.filter((qid) => isAnswered(findAnswer(answers, qid)))
  );
  const totalCount = mappedIds.length;
  const answeredCount = answeredIds.size;

  const byBlock: Record<AuditBlock, CompletenessStats> = {
    performance_chain: { answeredCount: 0, totalCount: 0 },
    practices: { answeredCount: 0, totalCount: 0 },
  };
  for (const qid of mappedIds) {
    const block = QUESTION_MAPPING[qid].block;
    byBlock[block].totalCount += 1;
    if (answeredIds.has(qid)) byBlock[block].answeredCount += 1;
  }
  return { answeredCount, totalCount, byBlock };
}

function buildSummary(
  ratios: AuditRatio[],
  alerts: DiagnosticAlert[],
  topAlertsLimit: number
): AuditContent["summary"] {
  // Liste de préférence : on parcourt les candidats et on prend les
  // SUMMARY_KEY_METRICS_MAX premiers qui sont RÉELLEMENT renseignés
  // (value !== null). Jamais un « Non mesuré » en synthèse (correction
  // audit imprimé).
  const byKey = new Map(ratios.map((r) => [r.key, r]));
  const keyMetrics: AuditRatio[] = [];
  for (const key of SUMMARY_KEY_METRICS) {
    if (keyMetrics.length >= SUMMARY_KEY_METRICS_MAX) break;
    const found = byKey.get(key);
    if (found && found.value !== null) keyMetrics.push(found);
  }
  const topAlerts = [...alerts]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, topAlertsLimit);
  return { keyMetrics, topAlerts };
}

function buildPriorities(
  alerts: DiagnosticAlert[],
  topAlertsLimit: number
): NumberedPriority[] {
  return [...alerts]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, topAlertsLimit)
    .map((alert, idx) => ({
      rank: idx + 1,
      title: alert.label,
      severity: alert.severity,
      sourceAlertCodes: [alert.code],
    }));
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export function buildAuditContent(
  input: BuildAuditContentInput
): AuditContent {
  const alerts = input.alerts ?? [];
  const topAlertsLimit = input.topAlertsLimit ?? 3;
  const benchmarks = { ...DEFAULT_BENCHMARKS, ...(input.benchmarks ?? {}) };
  // Séparation structurelle (jamais par matching de texte de code) :
  // seul le champ `audience` gouverne l'appartenance au doc client
  // vs à l'encart interne commercial.
  const clientAlerts = alerts.filter((a) => a.audience === "client");
  const internalAlerts = alerts.filter((a) => a.audience === "internal");
  const ratios = buildPerformanceRatios(input.answers, benchmarks);
  const flags = buildPracticeFlags(input.answers);
  const gaps = buildPracticeGaps(flags);
  const verbatims = buildVerbatims(input.answers);
  const completeness = buildCompleteness(input.answers);
  // Synthèse dirigeant et priorités : uniquement alertes client. Un
  // « donnée obligatoire manquante » ne peut pas figurer dans un doc
  // remis au dirigeant — c'est un signal de pilotage commercial.
  const summary = buildSummary(ratios, clientAlerts, topAlertsLimit);
  const priorities = buildPriorities(clientAlerts, topAlertsLimit);
  return {
    completeness,
    performanceChain: { ratios },
    practices: { flags, gaps, verbatims },
    alerts,
    internalAlerts,
    summary,
    priorities,
  };
}
