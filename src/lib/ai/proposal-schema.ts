import { z } from "zod";

/**
 * Schéma Zod strict pour la sortie du générateur de proposition
 * commerciale (PRD §6.5 / §13). Toute sortie LLM ou heuristique
 * doit passer par `ProposalSchema.parse()` avant d'être affichée ou
 * mise en cache.
 */

export const ProposalModuleSchema = z.object({
  title: z.string().min(1, "title requis"),
  durationHours: z.number().positive("durationHours > 0"),
  whyThisModule: z.string().min(1, "whyThisModule requis"),
  themes: z.array(z.string()).default([]),
  businessUseCases: z.array(z.string()).default([]),
  expectedOutcomes: z.array(z.string()).default([]),
});

export type ProposalModule = z.infer<typeof ProposalModuleSchema>;

export const TrainingProgramSchema = z.object({
  totalDurationHours: z.number().nonnegative("totalDurationHours >= 0"),
  suggestedFormat: z.string().min(1, "suggestedFormat requis"),
  targetAudience: z.string().min(1, "targetAudience requis"),
  pedagogicalObjectives: z.array(z.string()).default([]),
  modules: z.array(ProposalModuleSchema).default([]),
});

export type TrainingProgram = z.infer<typeof TrainingProgramSchema>;

export const PricingSchema = z
  .object({
    costPerParticipant: z.number().nonnegative().nullable(),
    participantCount: z.number().int().positive().nullable(),
    totalEstimatedCost: z.number().nonnegative().nullable(),
    pricingNote: z.string().nullable(),
    /**
     * Estimation de prise en charge potentielle (règle MVP : agents
     * commerciaux indépendants avec production N-1 > 7 000 €, plafond
     * 3 000 € par participant). Optionnel — null tant que les
     * `diagnostic_participants` ne sont pas remplis.
     */
    estimatedFundingTotal: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    /** Reste à charge = totalBudget − estimatedFundingTotal (≥ 0). */
    estimatedRemainingCost: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    /** Nombre de participants potentiellement éligibles à la prise en charge. */
    eligibleParticipantCount: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
    /** Mention non-contractuelle obligatoire dès qu'on affiche un montant. */
    fundingDisclaimer: z.string().nullable().optional().default(null),
    /**
     * Décision agrégée d'affichage pour la branche indé AGEFICE
     * présentiel — miroir de `TrainingFundingSummary.
     * ageficePresentielCoverage`. `null` = chemin fallback
     * (trainingHours non propagé).
     */
    ageficePresentielCoverage: z
      .enum(["badge", "alert", "none"])
      .nullable()
      .optional()
      .default(null),
    /**
     * Notes distinctes issues des estimations par participant
     * (dedupliquées côté moteur — même cas métier = une seule note).
     * `.default([])` garantit la rétro-compat : les proposal_json
     * persistés en base AVANT ce lot n'ont pas ce champ et parsent
     * proprement en `fundingNotes = []` (test legacy dédié).
     */
    fundingNotes: z.array(z.string()).optional().default([]),
    /**
     * Remise commerciale saisie par le commercial dans l'éditeur de
     * proposition (lot B2). `unit` = comment la valeur est SAISIE
     * (« euros » ou « percent »), `valueEuros` = équivalent normalisé
     * en € (source de vérité pour le recalcul aval). `reason` = motif
     * obligatoire non vide dès qu'une remise est appliquée. `null` =
     * pas de remise (état par défaut, rétro-compat legacy).
     */
    commercialDiscount: z
      .object({
        unit: z.enum(["euros", "percent"]),
        valueEuros: z.number().nonnegative(),
        percentDisplay: z.number().nonnegative(),
        reason: z.string().min(1, "Motif de remise requis"),
      })
      .nullable()
      .optional()
      .default(null),
    /**
     * Coût final après remise = `totalEstimatedCost − commercialDiscount.valueEuros`,
     * jamais négatif. `null` = pas de remise appliquée (finalCost effectif
     * = totalEstimatedCost). Recalculé côté client par
     * `applyCommercialDiscount` et re-validé côté serveur au PUT.
     */
    finalCost: z.number().nonnegative().nullable().optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.costPerParticipant === null) {
      if (!value.pricingNote || value.pricingNote.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "pricingNote obligatoire lorsque costPerParticipant est null (PRD §16.1).",
          path: ["pricingNote"],
        });
      }
    }
    if (
      value.totalEstimatedCost !== null &&
      value.costPerParticipant !== null &&
      value.participantCount !== null
    ) {
      const expected = value.costPerParticipant * value.participantCount;
      if (Math.abs(expected - value.totalEstimatedCost) > 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "totalEstimatedCost incohérent avec costPerParticipant × participantCount.",
          path: ["totalEstimatedCost"],
        });
      }
    }
  });

export type Pricing = z.infer<typeof PricingSchema>;

export const NextStepSchema = z.object({
  title: z.string().min(1, "title requis"),
  description: z.string().min(1, "description requise"),
  actionRequired: z.string().min(1, "actionRequired requis"),
});

export const NextStepsGuideSchema = z.object({
  steps: z.array(NextStepSchema).min(1, "Au moins une étape requise"),
});

export type NextStepsGuide = z.infer<typeof NextStepsGuideSchema>;

export const ExecutiveEmailSchema = z.object({
  subject: z.string().min(1, "subject obligatoire"),
  body: z.string().min(1, "body obligatoire"),
});

export type ExecutiveEmail = z.infer<typeof ExecutiveEmailSchema>;

export const InternalCommunicationPackSchema = z.object({
  whatsappMessage: z.string().min(1),
  internalEmail: z.string().min(1),
  teamMeetingPitch: z.string().min(1),
  linkedinPost: z.string().min(1),
});

export type InternalCommunicationPack = z.infer<
  typeof InternalCommunicationPackSchema
>;

export const ProposalSchema = z.object({
  proposalTitle: z.string().min(1),
  executiveSummary: z.string().min(1),
  trainingProgram: TrainingProgramSchema,
  pricing: PricingSchema,
  nextStepsGuide: NextStepsGuideSchema,
  executiveEmail: ExecutiveEmailSchema,
  internalCommunicationPack: InternalCommunicationPackSchema,
  missingInformation: z.array(z.string()).default([]),
  confidenceScore: z
    .number()
    .min(0, "confidenceScore >= 0")
    .max(100, "confidenceScore <= 100"),
});

export type Proposal = z.infer<typeof ProposalSchema>;

export type ProposalSource = "llm" | "heuristic";

export interface ProposalGenerationResult {
  proposal: Proposal;
  source: ProposalSource;
  provider: string | null;       // "openrouter" | null
  model: string | null;
  generatedAt: string;
  notes: string[];
}
