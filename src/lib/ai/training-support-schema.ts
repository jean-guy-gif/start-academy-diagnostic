import { z } from "zod";

/**
 * Schéma Zod strict pour la sortie du générateur de support de formation
 * (PRD §7.10 / §13.4). Toute sortie LLM ou heuristique doit passer par
 * `TrainingSupportSchema.parse()` avant affichage ou cache.
 *
 * Chaque module respecte la structure pédagogique obligatoire Start
 * Academy : problématique → prise de conscience → fondamentaux →
 * accélérateur IA → exercice métier → cas réels → clôture → action
 * terrain → indicateur de progression.
 */

export const AiAcceleratorSchema = z.object({
  objective: z.string().min(1, "objective requis"),
  tools: z.array(z.string()).default([]),
  examplePrompts: z.array(z.string()).default([]),
});

export type AiAccelerator = z.infer<typeof AiAcceleratorSchema>;

export const ConcreteExerciseSchema = z.object({
  title: z.string().min(1, "title requis"),
  context: z.string().min(1, "context requis"),
  instructions: z
    .array(z.string())
    .min(2, "Au moins 2 instructions par exercice"),
  expectedOutput: z.string().min(1, "expectedOutput requis"),
});

export type ConcreteExercise = z.infer<typeof ConcreteExerciseSchema>;

export const TrainingSupportModuleSchema = z
  .object({
    moduleTitle: z.string().min(1, "moduleTitle requis"),
    durationHours: z.number().positive("durationHours > 0"),
    problemStatement: z.string().min(1, "problemStatement requis"),
    awarenessSequence: z.string().min(1, "awarenessSequence requis"),
    fundamentals: z
      .array(z.string())
      .min(2, "Au moins 2 fondamentaux par module"),
    aiAccelerator: AiAcceleratorSchema,
    concreteBusinessExercise: ConcreteExerciseSchema,
    realCasesToUse: z.array(z.string()).default([]),
    stepClosing: z.string().min(1, "stepClosing requis"),
    fieldAction: z.string().min(1, "fieldAction requis"),
    progressIndicator: z.string().min(1, "progressIndicator requis"),
  })
  .superRefine((value, ctx) => {
    // Si des outils IA sont déclarés, il faut au moins 1 prompt exemple
    // pour rester opérationnel côté formateur (anti-discours théorique).
    if (
      value.aiAccelerator.tools.length > 0 &&
      value.aiAccelerator.examplePrompts.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "examplePrompts >= 1 quand l'accélérateur IA déclare des outils.",
        path: ["aiAccelerator", "examplePrompts"],
      });
    }
  });

export type TrainingSupportModule = z.infer<typeof TrainingSupportModuleSchema>;

export const TrainingSupportSchema = z.object({
  supportTitle: z.string().min(1, "supportTitle requis"),
  sessionSummary: z.string().min(1, "sessionSummary requis"),
  targetAudience: z.string().min(1, "targetAudience requis"),
  totalDurationHours: z.number().nonnegative("totalDurationHours >= 0"),
  pedagogicalIntent: z.string().min(1, "pedagogicalIntent requis"),
  modules: z
    .array(TrainingSupportModuleSchema)
    .min(1, "Au moins 1 module dans le support"),
  facilitatorNotes: z.array(z.string()).default([]),
  participantPreparation: z.array(z.string()).default([]),
  materialsNeeded: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  confidenceScore: z
    .number()
    .min(0, "confidenceScore >= 0")
    .max(100, "confidenceScore <= 100"),
});

export type TrainingSupport = z.infer<typeof TrainingSupportSchema>;

export type TrainingSupportSource = "llm" | "heuristic";

export interface TrainingSupportGenerationResult {
  support: TrainingSupport;
  source: TrainingSupportSource;
  provider: string | null;       // "openrouter" | null
  model: string | null;
  generatedAt: string;
  notes: string[];
}
