import { z } from "zod";

/**
 * Schéma Zod du support de formation *designé* en slides.
 *
 * Principe architectural — séparation stricte des responsabilités :
 *
 *   Claude (via OpenRouter)
 *     ➜ propose UNIQUEMENT le contenu et l'intention narrative :
 *       slideType, title, subtitle, mainMessage, contentBlocks,
 *       trainerNote, visualGuidance (layout / colorMood / icon nom).
 *
 *   React (composants Start Academy)
 *     ➜ impose le design final : layouts concrets, couleurs charte
 *       (#FFFFFF / #3EA9FF / #00527A), typographies (Rajdhani / Montserrat),
 *       espacements, icônes, rendu print.
 *
 * Conséquence : Claude ne peut JAMAIS choisir une couleur, une police
 * ou un layout libre. Les enums ci-dessous bornent l'espace de sortie.
 */

// ---------------------------------------------------------------------------
// Enums — surface de contrôle exposée au LLM.
// ---------------------------------------------------------------------------

export const SlideTypeSchema = z.enum([
  "cover",
  "section",
  "problem",
  "awareness",
  "fundamentals",
  "ai_accelerator",
  "exercise",
  "case_study",
  "field_action",
  "summary",
  "closing",
]);
export type SlideType = z.infer<typeof SlideTypeSchema>;

export const ContentBlockTypeSchema = z.enum([
  "text",
  "bullet_list",
  "numbered_steps",
  "quote",
  "highlight",
  "exercise",
  "prompt",
  "metric",
  "case",
  "warning",
  "checklist",
]);
export type ContentBlockType = z.infer<typeof ContentBlockTypeSchema>;

export const LayoutSchema = z.enum([
  "hero",
  "two_columns",
  "cards",
  "timeline",
  "framework",
  "exercise_canvas",
  "summary_grid",
]);
export type SlideLayout = z.infer<typeof LayoutSchema>;

export const ColorMoodSchema = z.enum([
  "deep_blue",
  "accent_blue",
  "white",
  "mixed",
]);
export type ColorMood = z.infer<typeof ColorMoodSchema>;

// ---------------------------------------------------------------------------
// Content blocks — `content` accepte string OU string[] selon le type.
// La normalisation finale est faite par le composant React.
// ---------------------------------------------------------------------------

export const ContentBlockSchema = z
  .object({
    type: ContentBlockTypeSchema,
    title: z.string().nullable(),
    content: z.union([z.string(), z.array(z.string())]),
  })
  .superRefine((value, ctx) => {
    const listTypes: ContentBlockType[] = [
      "bullet_list",
      "numbered_steps",
      "checklist",
    ];
    if (listTypes.includes(value.type) && !Array.isArray(value.content)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Pour les types liste (bullet_list / numbered_steps / checklist), content doit être un tableau de strings.",
        path: ["content"],
      });
    }
  });

export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// ---------------------------------------------------------------------------
// VisualGuidance — intention seulement, pas de design libre.
// ---------------------------------------------------------------------------

export const VisualGuidanceSchema = z.object({
  layout: LayoutSchema,
  /** Phrase courte décrivant l'effet attendu (3-12 mots). Indicatif. */
  emphasis: z.string().min(1),
  /** Nom d'icône (référence Lucide). Le composant React choisit l'icône réelle. */
  suggestedIcon: z.string().nullable(),
  colorMood: ColorMoodSchema,
});
export type VisualGuidance = z.infer<typeof VisualGuidanceSchema>;

// ---------------------------------------------------------------------------
// Slide
// ---------------------------------------------------------------------------

export const DesignedSlideSchema = z.object({
  slideNumber: z.number().int().positive(),
  slideType: SlideTypeSchema,
  title: z.string().min(1, "title requis"),
  subtitle: z.string().nullable(),
  mainMessage: z.string().min(1, "mainMessage requis"),
  contentBlocks: z.array(ContentBlockSchema).default([]),
  trainerNote: z.string().nullable(),
  visualGuidance: VisualGuidanceSchema,
});
export type DesignedSlide = z.infer<typeof DesignedSlideSchema>;

// ---------------------------------------------------------------------------
// Support designé complet
// ---------------------------------------------------------------------------

export const DesignedSupportSchema = z
  .object({
    designTitle: z.string().min(1),
    designSubtitle: z.string().min(1),
    visualIntent: z.string().min(1),
    slides: z
      .array(DesignedSlideSchema)
      .min(2, "Au moins 2 slides (couverture + clôture)"),
    designWarnings: z.array(z.string()).default([]),
    confidenceScore: z
      .number()
      .min(0, "confidenceScore >= 0")
      .max(100, "confidenceScore <= 100"),
  })
  .superRefine((value, ctx) => {
    // Garde-fou : la couverture doit ouvrir, la clôture doit fermer.
    if (value.slides[0]?.slideType !== "cover") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La première slide doit être de type 'cover'.",
        path: ["slides", 0, "slideType"],
      });
    }
    const last = value.slides[value.slides.length - 1];
    if (last && last.slideType !== "closing" && last.slideType !== "summary") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La dernière slide doit être de type 'closing' ou 'summary'.",
        path: ["slides", value.slides.length - 1, "slideType"],
      });
    }
  });

export type DesignedSupport = z.infer<typeof DesignedSupportSchema>;

// ---------------------------------------------------------------------------
// Résultat de génération
// ---------------------------------------------------------------------------

export type DesignedSupportSource = "llm" | "heuristic";

export interface DesignedSupportGenerationResult {
  design: DesignedSupport;
  source: DesignedSupportSource;
  provider: string | null;       // "openrouter" | null
  model: string | null;
  generatedAt: string;
  notes: string[];
}
