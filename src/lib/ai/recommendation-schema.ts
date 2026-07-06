import { z } from "zod";

/**
 * Schéma Zod strict pour la sortie du moteur de recommandation IA.
 * Aligné sur PRD §16.2 (format JSON imposé pour les recommandations) et
 * sur le schéma SQL `recommendations` + `recommendation_modules`.
 *
 * Toute sortie LLM ou moteur heuristique doit passer par
 * `RecommendationSchema.parse()` avant persistance.
 */

export const ToolMaturitySchema = z.enum(["low", "medium", "high"]);
export type ToolMaturity = z.infer<typeof ToolMaturitySchema>;

export const SkillLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "mixed",
]);
export type SkillLevel = z.infer<typeof SkillLevelSchema>;

/**
 * Phasage qualitatif d'un module recommandé.
 *
 * - essential   : à programmer dès la première session (cœur du parcours)
 * - recommended : à intégrer dans le parcours principal
 * - optional    : complémentaire — selon budget / temps disponibles
 * - later       : planifier en phase 2/3 ultérieure
 *
 * Optionnel (`null`) pour rester rétro-compatible avec les
 * recommandations historiques générées avant cette migration.
 */
export const PriorityTierSchema = z
  .enum(["essential", "recommended", "optional", "later"])
  .nullable();
export type PriorityTier = z.infer<typeof PriorityTierSchema>;

export const RecommendedModuleSchema = z.object({
  moduleId: z.string().min(1, "moduleId requis"),
  moduleName: z.string().min(1, "moduleName requis"),
  reason: z.string().min(1, "reason requis"),
  priority: z.number().int().positive("priority doit être un entier positif"),
  /**
   * Phasage qualitatif — utilisé par la UI pour afficher un badge
   * (Essentiel / Recommandé / Optionnel / Plus tard). Optionnel pour
   * la rétro-compatibilité ; quand absent l'UI traite comme "recommended".
   */
  priorityTier: PriorityTierSchema.optional().default(null),
  durationHours: z.number().positive("durationHours doit être > 0"),
  businessRatioTargeted: z.string().nullable(),
  useCases: z.array(z.string()).default([]),
});

export type RecommendedModule = z.infer<typeof RecommendedModuleSchema>;

export const RecommendationSchema = z
  .object({
    clientSummary: z.string().min(1, "clientSummary requis"),
    detectedNeeds: z.array(z.string()).default([]),
    performanceIssues: z.array(z.string()).default([]),
    toolMaturity: ToolMaturitySchema,
    skillLevel: SkillLevelSchema,
    requiredFoundations: z.array(z.string()).default([]),
    recommendedModules: z.array(RecommendedModuleSchema).default([]),
    totalDurationHours: z.number().nonnegative("totalDurationHours >= 0"),
    costPerParticipant: z.number().nonnegative().nullable(),
    confidenceScore: z
      .number()
      .min(0, "confidenceScore >= 0")
      .max(100, "confidenceScore <= 100"),
    missingInformation: z.array(z.string()).default([]),
    commercialExplanation: z.string().min(1, "commercialExplanation requis"),
    /**
     * v1.0b — codes d'alertes explicitement reconnues par le LLM.
     * Optionnel + défaut `[]` (rétro-compat MVP1). Le LLM peut lister
     * ici les alertes qu'il a prises en compte dans son raisonnement
     * (cf. règle 13 du SYSTEM_PROMPT). L'UI cockpit peut ensuite
     * afficher un badge "acknowledgé par l'IA".
     */
    alertsAcknowledged: z.array(z.string()).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (
      value.recommendedModules.length === 0 &&
      value.missingInformation.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "recommendedModules vide n'est autorisé que si missingInformation explique pourquoi.",
        path: ["recommendedModules"],
      });
    }
  });

export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Source du résultat — utilisé côté UI pour afficher un badge discret.
 */
export type RecommendationSource = "llm" | "heuristic";

export interface AnalyzeResult {
  recommendation: Recommendation;
  source: RecommendationSource;
  provider: string | null;       // "openrouter" | null
  model: string | null;
  generatedAt: string;
  notes: string[];                // warnings non bloquants
}
