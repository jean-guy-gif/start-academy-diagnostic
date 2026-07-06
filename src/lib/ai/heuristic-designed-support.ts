import type { ClientRecord } from "@/lib/diagnostics/diagnostic-service";
import type { TrainingSupport, TrainingSupportModule } from "./training-support-schema";
import type {
  ContentBlock,
  DesignedSlide,
  DesignedSupport,
} from "./designed-support-schema";
import { normalizeSupportTitle } from "./normalize-support-title";
import type { CoachBrainContext } from "@/lib/coach-brain/coach-brain.types";

/**
 * Fallback heuristique : reconstruit le déroulé de slides à partir du
 * support brut. Strictement déterministe, jamais d'invention.
 *
 * Chorégraphie Start Academy (alignée sur le prompt) :
 *
 *   1. cover
 *   2. section — Objectif business (30 / 60 jours)
 *   3. section — Programme synthétique
 *   4. Pour chaque module :
 *        problem ➜ awareness ➜ fundamentals
 *        ➜ ai_accelerator (uniquement si outils/prompts disponibles)
 *        ➜ exercise
 *        ➜ case_study (uniquement si realCasesToUse non vide)
 *        ➜ field_action
 *   5. summary — plan d'action consolidé
 *   6. closing — engagement et suite à 30 jours
 *
 * Garde-fous :
 *   - Aucun cas réel inventé : si realCasesToUse vide, slide case_study
 *     omise et message ajouté dans designWarnings.
 *   - Aucun prompt IA inventé : si examplePrompts vide, pas de bloc
 *     "prompt" dans la slide ai_accelerator.
 *
 * Coach Brain / COACHNXT :
 *   - Le paramètre `coachBrainContext` est ACCEPTÉ pour parité de
 *     signature avec le pipeline LLM ; il n'est PAS consommé ici. Quand
 *     la lecture amont sera branchée (`coach_brain_patterns`), on
 *     pourra injecter des slide_reference ou des exemples comme content
 *     blocks supplémentaires, mais le moteur restera un filet de
 *     sécurité — il ne remplacera pas le LLM pour le rythme.
 *   - COACHNXT = enrichissement pédagogique amont
 *   - Claude / OpenRouter = narration
 *   - React = design
 *   - Slide budget = garde-fou rythme/densité
 */

interface HeuristicInputs {
  client: ClientRecord | null;
  support: TrainingSupport;
  /** Optionnel — réservé pour un futur enrichissement local. Pour
   *  l'instant ignoré : si présent, le rendu heuristique reste
   *  identique à la version sans Coach Brain. */
  coachBrainContext?: CoachBrainContext | null;
}

let nextNumber = 1;

function nextSlideNumber(reset = false): number {
  if (reset) nextNumber = 1;
  return nextNumber++;
}

function block(
  type: ContentBlock["type"],
  title: string | null,
  content: string | string[]
): ContentBlock {
  return { type, title, content };
}

// ---------------------------------------------------------------------------
// Slides d'ouverture
// ---------------------------------------------------------------------------

function buildCover(
  support: TrainingSupport,
  client: ClientRecord | null
): DesignedSlide {
  const blocks: ContentBlock[] = [];
  if (client?.companyName) {
    blocks.push(block("highlight", "Pour", client.companyName));
  }
  blocks.push(block("metric", "Durée", `${support.totalDurationHours} h`));
  blocks.push(
    block("highlight", "Public", support.targetAudience)
  );
  return {
    slideNumber: nextSlideNumber(true),
    slideType: "cover",
    title: normalizeSupportTitle(
      support.supportTitle,
      client?.companyName ?? null
    ),
    subtitle: support.sessionSummary.split(".")[0]?.trim() ?? null,
    mainMessage: support.pedagogicalIntent,
    contentBlocks: blocks,
    trainerNote:
      "Ouvrir en racontant le contexte business client : pourquoi cette formation, pourquoi maintenant.",
    visualGuidance: {
      layout: "hero",
      emphasis: "Marquer l'ambition Start Academy",
      suggestedIcon: null,
      colorMood: "deep_blue",
    },
  };
}

function buildObjective(support: TrainingSupport): DesignedSlide {
  // Construit les objectifs business courts à partir des besoins
  // détectés et de l'intention pédagogique.
  const goalBullets = (support.facilitatorNotes.length > 0
    ? support.facilitatorNotes
    : []
  )
    .concat(support.pedagogicalIntent ? [support.pedagogicalIntent] : [])
    .slice(0, 4);

  return {
    slideNumber: nextSlideNumber(),
    slideType: "section",
    title: "Objectif",
    subtitle: "Ce que l'équipe doit avoir gagné à 30 / 60 jours",
    mainMessage:
      support.pedagogicalIntent ||
      "Activer une montée en performance mesurable sur les semaines suivant la formation.",
    contentBlocks:
      goalBullets.length > 0
        ? [block("bullet_list", "Cap business", goalBullets)]
        : [],
    trainerNote:
      "Faire valider l'objectif par le dirigeant en début de séance — engagement public.",
    visualGuidance: {
      layout: "framework",
      emphasis: "Aligner l'équipe sur le cap commercial",
      suggestedIcon: "Target",
      colorMood: "accent_blue",
    },
  };
}

function buildProgram(support: TrainingSupport): DesignedSlide {
  const items = support.modules.map(
    (m, idx) =>
      `${idx + 1}. ${m.moduleTitle} — ${m.durationHours} h`
  );
  return {
    slideNumber: nextSlideNumber(),
    slideType: "section",
    title: "Programme",
    subtitle: `${support.modules.length} module${support.modules.length > 1 ? "s" : ""} — ${support.totalDurationHours} h cumulées`,
    mainMessage:
      "Chaque module suit la même structure : problématique, fondamentaux, accélérateur IA, exercice terrain, action mesurable.",
    contentBlocks: [block("numbered_steps", "Modules", items)],
    trainerNote:
      "Annoncer le rythme : 1 module = 1 méthode + 1 cas + 1 action terrain.",
    visualGuidance: {
      layout: "summary_grid",
      emphasis: "Rendre la promesse Start Academy visible",
      suggestedIcon: "Layers",
      colorMood: "white",
    },
  };
}

// ---------------------------------------------------------------------------
// Slides par module
// ---------------------------------------------------------------------------

function buildProblem(module: TrainingSupportModule): DesignedSlide {
  return {
    slideNumber: nextSlideNumber(),
    slideType: "problem",
    title: "La douleur métier",
    subtitle: module.moduleTitle,
    mainMessage: module.problemStatement,
    contentBlocks: [
      block("warning", "Risque si on ne traite pas", module.problemStatement),
    ],
    trainerNote:
      "Faire reformuler la douleur avec les mots des participants — ne pas l'imposer.",
    visualGuidance: {
      layout: "framework",
      emphasis: "Rendre la douleur tangible et coûteuse",
      suggestedIcon: "AlertTriangle",
      colorMood: "deep_blue",
    },
  };
}

function buildAwareness(module: TrainingSupportModule): DesignedSlide {
  return {
    slideNumber: nextSlideNumber(),
    slideType: "awareness",
    title: "Prise de conscience",
    subtitle: module.moduleTitle,
    mainMessage: module.awarenessSequence,
    contentBlocks: [block("quote", null, module.awarenessSequence)],
    trainerNote:
      "Provoquer la décision : « Qu'est-ce que je change dès lundi ? »",
    visualGuidance: {
      layout: "two_columns",
      emphasis: "Faire émerger le déclic individuel",
      suggestedIcon: "Lightbulb",
      colorMood: "white",
    },
  };
}

// Whitelist des modules qui SONT eux-mêmes un outil/IA socle. Pour
// ceux-là, la slide « Accélérateur IA » est redondante (le module est
// son propre accélérateur). Les prompts/outils sont alors injectés dans
// la slide « Méthode » à la place.
const FOUNDATION_TOOL_MODULE_RX =
  /\b(chat\s*gpt|gpt-?[345]|prompt|notebook\s*lm|notebooklm|claude|gemini|gamma|crm|canva|ia de base|socle ia|outils? ia)\b/i;

function isFoundationToolModule(module: TrainingSupportModule): boolean {
  return FOUNDATION_TOOL_MODULE_RX.test(module.moduleTitle);
}

function buildFundamentals(
  module: TrainingSupportModule,
  injectAccelerator: boolean
): DesignedSlide {
  const contentBlocks: ContentBlock[] = [
    block("numbered_steps", "Étapes clés", module.fundamentals),
  ];

  // Injection de l'accélérateur IA dans la slide fondamentaux quand le
  // module EST un outil socle (Prompt, ChatGPT, Gamma, NotebookLM, etc.).
  if (injectAccelerator) {
    if (module.aiAccelerator.tools.length > 0) {
      contentBlocks.push(
        block("bullet_list", "Outils mobilisés", module.aiAccelerator.tools)
      );
    }
    if (module.aiAccelerator.examplePrompts.length > 0) {
      contentBlocks.push(
        block(
          "prompt",
          "Prompts à projeter",
          module.aiAccelerator.examplePrompts
        )
      );
    }
  }

  return {
    slideNumber: nextSlideNumber(),
    slideType: "fundamentals",
    title: "Méthode",
    subtitle: module.moduleTitle,
    mainMessage: injectAccelerator
      ? "Les fondamentaux pour exploiter l'outil dès cette semaine."
      : "Les fondamentaux Start Academy à appliquer dès cette semaine.",
    contentBlocks,
    trainerNote: injectAccelerator
      ? "Démontrer un prompt en live AVANT de faire pratiquer — éviter l'effet boîte noire."
      : "Faire reformuler chaque étape par un participant différent — vérifier la compréhension.",
    visualGuidance: {
      layout: injectAccelerator ? "framework" : "cards",
      emphasis: injectAccelerator
        ? "Ancrer la méthode et outiller l'équipe"
        : "Ancrer la méthode pas à pas",
      suggestedIcon: injectAccelerator ? "Wrench" : "Wrench",
      colorMood: "accent_blue",
    },
  };
}

function shouldBuildAccelerator(module: TrainingSupportModule): boolean {
  // Pas de slide accélérateur séparée pour les modules qui SONT
  // eux-mêmes l'outil socle (cf. isFoundationToolModule) — les prompts
  // sont injectés dans la slide Méthode.
  if (isFoundationToolModule(module)) return false;
  return (
    module.aiAccelerator.tools.length > 0 ||
    module.aiAccelerator.examplePrompts.length > 0 ||
    module.aiAccelerator.objective.trim().length > 0
  );
}

function buildAccelerator(module: TrainingSupportModule): DesignedSlide {
  const blocks: ContentBlock[] = [
    block("highlight", "Objectif IA", module.aiAccelerator.objective),
  ];
  if (module.aiAccelerator.tools.length > 0) {
    blocks.push(
      block("bullet_list", "Outils mobilisés", module.aiAccelerator.tools)
    );
  }
  if (module.aiAccelerator.examplePrompts.length > 0) {
    blocks.push(
      block(
        "prompt",
        "Prompts à projeter en séance",
        module.aiAccelerator.examplePrompts
      )
    );
  }
  return {
    slideNumber: nextSlideNumber(),
    slideType: "ai_accelerator",
    title: "Accélérateur IA",
    subtitle: module.moduleTitle,
    mainMessage: module.aiAccelerator.objective,
    contentBlocks: blocks,
    trainerNote:
      "Démontrer le prompt en live AVANT de faire pratiquer — éviter l'effet boîte noire.",
    visualGuidance: {
      layout: "framework",
      emphasis: "Outiller avec un prompt prêt à projeter",
      suggestedIcon: "Zap",
      colorMood: "deep_blue",
    },
  };
}

function buildExercise(module: TrainingSupportModule): DesignedSlide {
  return {
    slideNumber: nextSlideNumber(),
    slideType: "exercise",
    title: "Exercice métier",
    subtitle: module.concreteBusinessExercise.title,
    mainMessage: module.concreteBusinessExercise.context,
    contentBlocks: [
      block(
        "numbered_steps",
        "Consignes",
        module.concreteBusinessExercise.instructions
      ),
      block(
        "highlight",
        "Livrable attendu",
        module.concreteBusinessExercise.expectedOutput
      ),
    ],
    trainerNote:
      "Constituer les binômes AVANT le top départ — éviter les pertes de temps.",
    visualGuidance: {
      layout: "exercise_canvas",
      emphasis: "Mettre l'équipe en action terrain",
      suggestedIcon: "Hammer",
      colorMood: "accent_blue",
    },
  };
}

function shouldBuildCaseStudy(module: TrainingSupportModule): boolean {
  return module.realCasesToUse.length > 0;
}

function buildCaseStudy(module: TrainingSupportModule): DesignedSlide {
  return {
    slideNumber: nextSlideNumber(),
    slideType: "case_study",
    title: "Cas terrain de l'équipe",
    subtitle: module.moduleTitle,
    mainMessage:
      "Les cas remontés par les participants servent de base de travail.",
    contentBlocks: [block("case", "Dossiers à traiter", module.realCasesToUse)],
    trainerNote:
      "Affecter chaque cas à un binôme dès l'ouverture de la slide.",
    visualGuidance: {
      layout: "cards",
      emphasis: "Ancrer la méthode sur les vrais dossiers",
      suggestedIcon: "ClipboardCheck",
      colorMood: "white",
    },
  };
}

function buildFieldAction(module: TrainingSupportModule): DesignedSlide {
  return {
    slideNumber: nextSlideNumber(),
    slideType: "field_action",
    title: "Action terrain",
    subtitle: module.moduleTitle,
    mainMessage: module.fieldAction,
    contentBlocks: [
      block("checklist", "À faire cette semaine", [module.fieldAction]),
      block("metric", "Indicateur", module.progressIndicator),
    ],
    trainerNote:
      "Faire écrire publiquement l'engagement de chaque participant — pas d'engagement = pas d'effet.",
    visualGuidance: {
      layout: "summary_grid",
      emphasis: "Engager une action mesurable sous 7 jours",
      suggestedIcon: "Target",
      colorMood: "deep_blue",
    },
  };
}

// ---------------------------------------------------------------------------
// Slides de clôture
// ---------------------------------------------------------------------------

function buildSummary(support: TrainingSupport): DesignedSlide {
  const items = support.modules.map(
    (m) => `${m.moduleTitle} → ${m.progressIndicator}`
  );
  return {
    slideNumber: nextSlideNumber(),
    slideType: "summary",
    title: "Plan d'action",
    subtitle: "Ce que l'équipe emporte de la session",
    mainMessage: support.pedagogicalIntent,
    contentBlocks: [
      block("checklist", "Engagements du jour", items),
    ],
    trainerNote:
      "Désigner un pilote du suivi à 30 jours avant la fin de la séance.",
    visualGuidance: {
      layout: "summary_grid",
      emphasis: "Rendre les engagements visibles et publics",
      suggestedIcon: "ListChecks",
      colorMood: "mixed",
    },
  };
}

function buildClosing(support: TrainingSupport): DesignedSlide {
  return {
    slideNumber: nextSlideNumber(),
    slideType: "closing",
    title: "Merci",
    subtitle: normalizeSupportTitle(support.supportTitle),
    mainMessage:
      "Start Academy revient dans 30 jours pour mesurer les ratios et ajuster le plan.",
    contentBlocks: [
      block(
        "text",
        "Prochaine étape",
        "Suivi à 30 jours : lecture des indicateurs, points individuels, ajustement du plan."
      ),
    ],
    trainerNote: "Confirmer la date de retour avant la fin de la séance.",
    visualGuidance: {
      layout: "hero",
      emphasis: "Refermer sur l'engagement Start Academy",
      suggestedIcon: "CheckCircle2",
      colorMood: "deep_blue",
    },
  };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

export function buildHeuristicDesignedSupport(
  inputs: HeuristicInputs
): DesignedSupport {
  const slides: DesignedSlide[] = [];
  const warnings: string[] = [];

  slides.push(buildCover(inputs.support, inputs.client));
  slides.push(buildObjective(inputs.support));
  slides.push(buildProgram(inputs.support));

  // Renommé `module` → `catalogModule` : Next.js réserve `module`
  // comme identifiant global (règle @next/next/no-assign-module-variable).
  for (const catalogModule of inputs.support.modules) {
    const isFoundationTool = isFoundationToolModule(catalogModule);
    slides.push(buildProblem(catalogModule));
    slides.push(buildAwareness(catalogModule));
    slides.push(buildFundamentals(catalogModule, isFoundationTool));
    if (shouldBuildAccelerator(catalogModule)) {
      slides.push(buildAccelerator(catalogModule));
    }
    slides.push(buildExercise(catalogModule));
    if (shouldBuildCaseStudy(catalogModule)) {
      slides.push(buildCaseStudy(catalogModule));
    } else if (!isFoundationTool) {
      // Pour les modules socles outils, ne pas pousser de warning :
      // aucun cas réel n'est pertinent pour un module « ChatGPT »
      // ou « Prompt » — l'exercice est par nature générique métier.
      warnings.push(
        `Module « ${catalogModule.moduleTitle} » : aucun cas réel collaborateur disponible — slide case_study omise.`
      );
    }
    slides.push(buildFieldAction(catalogModule));
  }

  slides.push(buildSummary(inputs.support));
  slides.push(buildClosing(inputs.support));

  if (inputs.support.missingInformation.length > 0) {
    warnings.push(
      `Informations manquantes héritées du support brut (${inputs.support.missingInformation.length}).`
    );
  }

  // Confiance bornée [50, 75], pénalisée par chaque warning.
  const baseConfidence = inputs.support.confidenceScore;
  const penalty = Math.min(warnings.length * 4, 20);
  const confidenceScore = Math.max(
    50,
    Math.min(75, Math.round(65 + baseConfidence / 10 - penalty))
  );

  return {
    designTitle: normalizeSupportTitle(
      inputs.support.supportTitle,
      inputs.client?.companyName ?? null
    ),
    designSubtitle:
      inputs.support.sessionSummary.split(".")[0]?.trim() ?? "Programme Start Academy",
    visualIntent:
      "Déroulé court, rythmé, terrain — une idée forte par slide, une action terrain par module.",
    slides,
    designWarnings: warnings,
    confidenceScore,
  };
}
