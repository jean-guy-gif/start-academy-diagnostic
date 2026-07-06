/**
 * Validation pédagogique interne des supports Start Academy.
 *
 * Ces types sont partagés client/serveur — pas de dépendance
 * `server-only`. Ne contiennent que des descripteurs (id, label,
 * description) et des helpers de calcul.
 *
 * Persistance : table `support_quality_reviews` + service
 * `support-quality-service.ts`.
 */

/** Identifiants stables des critères — utilisés comme clés JSON. */
export type SupportQualityCriterionId =
  | "diagnostic_alignment"
  | "module_relevance"
  | "pedagogical_pace"
  | "objective_clarity"
  | "awareness_quality"
  | "fundamentals_quality"
  | "ai_accelerator_quality"
  | "exercise_quality"
  | "participant_integration"
  | "prompts_executable"
  | "timing_realistic"
  | "design_readability"
  | "brand_compliance"
  | "no_invented_content"
  | "no_sensitive_data"
  | "trainer_exploitable";

/** Note sur l'échelle 0..3 (0 = non conforme, 3 = validé). */
export type SupportQualityRating = 0 | 1 | 2 | 3;

export interface SupportQualityCriterion {
  id: SupportQualityCriterionId;
  label: string;
  description: string;
}

/**
 * Liste de référence — figée côté code. Toute évolution requiert
 * une mise à jour du PRD (`docs/support-quality-validation-prd.md`).
 */
export const SUPPORT_QUALITY_CRITERIA: readonly SupportQualityCriterion[] = [
  {
    id: "diagnostic_alignment",
    label: "Cohérence avec le diagnostic",
    description:
      "Le support reprend les besoins identifiés, les profils visés et le contexte client.",
  },
  {
    id: "module_relevance",
    label: "Pertinence des modules",
    description:
      "Les modules sélectionnés couvrent les attendus de la recommandation, dans le bon ordre.",
  },
  {
    id: "pedagogical_pace",
    label: "Rythme pédagogique",
    description:
      "Alternance théorie / pratique / IA respectée ; pas de phase trop longue ni trop courte.",
  },
  {
    id: "objective_clarity",
    label: "Clarté des objectifs",
    description:
      "Chaque module a un objectif explicite, formulé en compétence acquise.",
  },
  {
    id: "awareness_quality",
    label: "Qualité des prises de conscience",
    description:
      "Les séquences de prise de conscience embarquent un déclic métier identifiable.",
  },
  {
    id: "fundamentals_quality",
    label: "Qualité des fondamentaux",
    description:
      "Les fondamentaux sont actionnables, formulés en méthodologie réutilisable.",
  },
  {
    id: "ai_accelerator_quality",
    label: "Qualité des accélérateurs IA",
    description:
      "Objectif clair, outils nommés, intégration métier — pas de discours générique.",
  },
  {
    id: "exercise_quality",
    label: "Qualité des exercices",
    description:
      "Cas concret, instructions complètes (≥ 2), output attendu défini.",
  },
  {
    id: "participant_integration",
    label: "Intégration des cas collaborateurs",
    description:
      "Cas réels remontés via collecte présents OU séquences génériques argumentées.",
  },
  {
    id: "prompts_executable",
    label: "Prompts exploitables",
    description:
      "Au moins un prompt exemple par accélérateur IA avec outil. Pas de prompt vague.",
  },
  {
    id: "timing_realistic",
    label: "Timing réaliste",
    description:
      "La durée déclarée par module correspond à la charge réelle (théorie + exo + débrief).",
  },
  {
    id: "design_readability",
    label: "Lisibilité du design",
    description:
      "Slides aérées, hiérarchie visuelle claire, texte non saturé (support designé).",
  },
  {
    id: "brand_compliance",
    label: "Conformité charte Start Academy",
    description:
      "Couleurs, typo, ton de voix conformes ; pas de mention parasite.",
  },
  {
    id: "no_invented_content",
    label: "Absence de contenu inventé",
    description:
      "Aucun module / outil / chiffre fantôme. Tous les éléments sourcés sur le catalogue ou la recommandation.",
  },
  {
    id: "no_sensitive_data",
    label: "Absence de données sensibles",
    description:
      "Pas de production N-1 individuelle, pas de CNI/RIB, pas d'email participant cité tel quel.",
  },
  {
    id: "trainer_exploitable",
    label: "Exploitabilité formateur",
    description:
      "Le formateur peut utiliser le support tel quel le jour J, sans réécriture.",
  },
];

export type SupportQualityChecklist = Partial<
  Record<SupportQualityCriterionId, SupportQualityRating>
>;

export type SupportQualityStatus =
  | "draft"
  | "needs_revision"
  | "validated"
  | "rejected";

export interface SupportQualityScore {
  total: number;
  max: number;
  /** Pourcentage 0..100 (deux décimales). */
  percent: number;
}

/**
 * Calcul du score sur la base d'une checklist. `max` = nombre de
 * critères notés × 3 (les critères non notés ne comptent ni dans
 * `total` ni dans `max`, pour ne pas pénaliser une review partielle).
 *
 * `percent = total / max * 100`, ou 0 si aucune note posée.
 */
export function calculateSupportQualityScore(
  checklist: SupportQualityChecklist
): SupportQualityScore {
  let total = 0;
  let count = 0;
  for (const criterion of SUPPORT_QUALITY_CRITERIA) {
    const rating = checklist[criterion.id];
    if (typeof rating === "number") {
      total += rating;
      count += 1;
    }
  }
  const max = count * 3;
  const percent =
    max === 0 ? 0 : Math.round((total / max) * 10_000) / 100;
  return { total, max, percent };
}

export interface SupportQualityReview {
  id: string;
  sessionId: string;
  trainingSupportId: string | null;
  designedSupportId: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  status: SupportQualityStatus;
  scoreTotal: number | null;
  scoreMax: number | null;
  scorePercent: number | null;
  checklist: SupportQualityChecklist;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportQualityReviewInput {
  sessionId: string;
  trainingSupportId?: string | null;
  designedSupportId?: string | null;
  status?: SupportQualityStatus;
  checklist?: SupportQualityChecklist;
  notes?: string | null;
}

export const DEFAULT_QUALITY_STATUS: SupportQualityStatus = "draft";
