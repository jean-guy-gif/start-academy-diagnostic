import type {
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { Proposal } from "./proposal-schema";
import type {
  Recommendation,
  RecommendedModule,
} from "./recommendation-schema";
import type { ParticipantRecord } from "@/lib/sessions/session-service";
import type { TrainingSessionViewModel } from "@/types";
import type {
  AiAccelerator,
  ConcreteExercise,
  TrainingSupport,
  TrainingSupportModule,
} from "./training-support-schema";
import { normalizeSupportTitle } from "./normalize-support-title";
import type { CoachBrainContext } from "@/lib/coach-brain/coach-brain.types";

/**
 * Moteur heuristique de génération de support de formation.
 *
 * Stratégie :
 *   1. Reprend la liste des modules recommandés (jamais inventés).
 *   2. Construit la structure pédagogique obligatoire pour chacun.
 *   3. Injecte les cas concrets effectivement collectés. Ne fabrique
 *      jamais de "cas client". Si aucun cas, exercice générique métier
 *      et entrée dans missingInformation.
 *   4. Pas d'accélérateur IA inventé : tools/prompts uniquement quand
 *      le module est un socle outil ou rattaché à l'IA.
 *
 * Coach Brain / COACHNXT :
 *   - Le paramètre `coachBrainContext` est ACCEPTÉ pour parité de
 *     signature avec le pipeline LLM (route → builder de prompt) ; il
 *     n'est PAS encore consommé par l'heuristique. Quand on branchera
 *     la lecture amont (`coach_brain_patterns`), le moteur heuristique
 *     pourra injecter méthodes / exemples / scripts dans les modules
 *     correspondants, mais reste un filet de sécurité — il ne
 *     remplacera pas le LLM pour l'orchestration narrative.
 *   - COACHNXT = enrichissement pédagogique amont
 *   - Claude / OpenRouter = narration
 *   - React = design
 *   - Slide budget = garde-fou rythme/densité
 */

interface HeuristicInputs {
  client: ClientRecord | null;
  diagnostic: DiagnosticRecord | null;
  recommendation: Recommendation;
  proposal: Proposal | null;
  session: TrainingSessionViewModel | null;
  participants: ParticipantRecord[];
  /** Optionnel — réservé pour un futur enrichissement local. Pour
   *  l'instant ignoré : si présent, le rendu heuristique reste
   *  identique à la version sans Coach Brain. */
  coachBrainContext?: CoachBrainContext | null;
}

const IA_KEYWORDS = [
  "chatgpt",
  "chat gpt",
  "claude",
  "gamma",
  "gemini",
  "notebook",
  "prompt",
  "ia",
  "ai",
  "canva",
];

const FOUNDATION_PROMPTS: Record<string, string[]> = {
  chatgpt: [
    "Rédige un compte rendu vendeur structuré à partir des notes brutes ci-dessous, format mail.",
    "Liste 5 objections possibles d'un vendeur et propose une réponse pour chacune.",
  ],
  claude: [
    "Produis un déroulé de réunion vendeur en 7 étapes avec timing et points clés.",
    "Transforme ces notes terrain en synthèse client de 10 lignes pour un dirigeant.",
  ],
  gamma: [
    "Génère une présentation 5 slides pour une estimation stratégique en présentiel.",
  ],
  notebook: [
    "À partir des PV d'AG fournis, extrais les 3 points qui peuvent bloquer une offre.",
  ],
  gemini: [
    "Crée un tableau de suivi vendeur sur 30 jours, fréquence et indicateurs clés.",
  ],
  prompt: [
    "Construis un prompt réutilisable pour rédiger un compte rendu vendeur en 5 minutes.",
  ],
  crm: [
    "Liste 5 ratios commerciaux à suivre chaque semaine et leur méthode de calcul.",
  ],
  default: [
    "Rédige une trame mail relance vendeur, 4 paragraphes, à personnaliser sur 3 bullets.",
  ],
};

const GENERIC_FALLBACK_PROMPT =
  "Génère un compte rendu vendeur structuré à partir de tes notes terrain : contexte, motivation, prix, plan d'action.";

function detectAiContext(module: RecommendedModule): {
  isAi: boolean;
  tool: keyof typeof FOUNDATION_PROMPTS;
} {
  const haystack = `${module.moduleName} ${module.reason}`.toLowerCase();
  for (const kw of IA_KEYWORDS) {
    if (haystack.includes(kw)) {
      const key = kw.replace(/\s+/g, "");
      const matched = key in FOUNDATION_PROMPTS ? key : "default";
      return {
        isAi: true,
        tool: matched as keyof typeof FOUNDATION_PROMPTS,
      };
    }
  }
  return { isAi: false, tool: "default" };
}

function detectDomain(module: RecommendedModule):
  | "prospection"
  | "vendeur"
  | "acheteur"
  | "organisation"
  | "foundation"
  | "manager"
  | "other" {
  const text = `${module.moduleName} ${module.reason}`.toLowerCase();
  if (/(prospect|pige|secteur|contenu|réseaux|reseaux|pap)/.test(text)) {
    return "prospection";
  }
  if (/(vendeur|mandat|estimation|exclusiv|annonce|r1|r2|suivi)/.test(text)) {
    return "vendeur";
  }
  if (/(achet|visite|découv|decouv|offre|négoc|negoc|compromis)/.test(text)) {
    return "acheteur";
  }
  if (/(crm|routine|relance|pilotage|ratio|organisation)/.test(text)) {
    return "organisation";
  }
  if (/(base|chat|notebook|gamma|claude|gemini|prompt|canva)/.test(text)) {
    return "foundation";
  }
  if (/(manager|coaching|rituel|onboard|recrut)/.test(text)) {
    return "manager";
  }
  return "other";
}

const FUNDAMENTALS_PRESETS: Record<ReturnType<typeof detectDomain>, string[]> = {
  prospection: [
    "Identifier ses secteurs prioritaires et le volume de contacts attendu.",
    "Maîtriser un script d'accroche court (téléphone, PAP, terrain).",
    "Mesurer ses ratios contacts → RDV → mandats chaque semaine.",
  ],
  vendeur: [
    "Préparer un R1 avec une trame structurée (découverte, motivation, concurrence).",
    "Défendre une estimation par les données marché — pas par opinion.",
    "Conclure un mandat exclusif en activant 3 arguments différenciants.",
  ],
  acheteur: [
    "Qualifier un acquéreur en 7 questions avant toute visite.",
    "Conduire une visite par scénario, pas par énumération de pièces.",
    "Provoquer un retour d'offre dans les 48 h suivant la visite.",
  ],
  organisation: [
    "Planifier sa semaine commerciale par blocs (prospection / vendeur / acheteur).",
    "Tenir le CRM en flux continu, pas en rattrapage hebdomadaire.",
    "Piloter par 3 ratios : activité, transformation, délai moyen.",
  ],
  foundation: [
    "Paramétrer son outil IA avec instructions personnalisées et règles de confidentialité.",
    "Construire un prompt métier réutilisable (contexte, rôle, format de sortie).",
    "Standardiser les livrables produits par l'équipe (CR, mails, supports).",
  ],
  manager: [
    "Lire les ratios de chaque conseiller avant le point individuel.",
    "Installer un rituel hebdomadaire de pilotage commercial.",
    "Coacher sur le moment terrain où la performance se joue (estimation, visite, suivi).",
  ],
  other: [
    "Identifier le moment-clé du parcours commercial où le module fait gagner.",
    "Mettre en place une routine simple, applicable en moins d'une semaine.",
  ],
};

const FIELD_ACTION_PRESETS: Record<ReturnType<typeof detectDomain>, string> = {
  prospection: "Réaliser 10 contacts vendeurs qualifiés sur le secteur prioritaire dans les 7 jours.",
  vendeur: "Conduire un R1 ou un R2 vendeur en appliquant la trame validée et le restituer en équipe.",
  acheteur: "Qualifier 3 acquéreurs avant visite et provoquer un retour d'offre sur l'un d'eux.",
  organisation: "Tenir le CRM à jour chaque jour pendant 1 semaine et noter le ratio actions / décisions.",
  foundation: "Construire 1 prompt métier réutilisable et le partager à l'équipe.",
  manager: "Mener un point individuel structuré avec chaque conseiller dans la semaine suivante.",
  other: "Appliquer 1 routine du module pendant 7 jours et mesurer l'effet.",
};

const PROGRESS_INDICATOR_PRESETS: Record<ReturnType<typeof detectDomain>, string> = {
  prospection: "Nombre de contacts vendeurs qualifiés par semaine.",
  vendeur: "Taux estimation → mandat signé (objectif > 50 %).",
  acheteur: "Taux visite → offre déposée.",
  organisation: "Taux d'actions planifiées effectivement réalisées.",
  foundation: "Temps de production d'un livrable type (objectif divisé par 2).",
  manager: "Régularité des points individuels (1 / conseiller / semaine).",
  other: "Action terrain mesurable choisie par le formateur.",
};

function selectParticipantCasesForDomain(
  participants: ParticipantRecord[],
  domain: ReturnType<typeof detectDomain>
): ParticipantRecord[] {
  if (participants.length === 0) return [];
  if (domain === "other") return participants.filter((p) => p.concreteCase);
  const domainKeywords: Record<typeof domain, RegExp> = {
    prospection: /prospect|pige|contact|réseaux|reseaux|pap|secteur/i,
    vendeur: /vendeur|mandat|estimation|exclusiv|annonce|suivi/i,
    acheteur: /achet|visite|offre|négoc|negoc|compromis/i,
    organisation: /crm|routine|relance|pilotage|ratio|organisation/i,
    foundation: /chat|notebook|gamma|claude|gemini|prompt|outil|ia|canva/i,
    manager: /manager|coach|rituel|onboard|recrut/i,
  };
  const regex = domainKeywords[domain];
  return participants.filter(
    (p) =>
      p.concreteCase &&
      (regex.test(p.concreteCase) ||
        regex.test(p.mainProblem) ||
        regex.test(p.role))
  );
}

function buildAccelerator(module: RecommendedModule): AiAccelerator {
  const ai = detectAiContext(module);
  if (!ai.isAi) {
    return {
      objective: `Réduire le temps de production des livrables ${module.moduleName.toLowerCase()} et homogénéiser leur qualité.`,
      tools: [],
      examplePrompts: [],
    };
  }
  const prompts =
    FOUNDATION_PROMPTS[ai.tool] ?? FOUNDATION_PROMPTS.default ?? [
      GENERIC_FALLBACK_PROMPT,
    ];
  return {
    objective: `Gagner du temps sur ${module.moduleName} en exploitant un outil IA paramétré.`,
    tools: [ai.tool === "default" ? "ChatGPT" : capitalize(ai.tool)],
    examplePrompts: prompts,
  };
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildExercise(
  module: RecommendedModule,
  participants: ParticipantRecord[],
  domain: ReturnType<typeof detectDomain>
): { exercise: ConcreteExercise; realCases: string[]; missingCase: boolean } {
  const cases = selectParticipantCasesForDomain(participants, domain);
  const realCases = cases.map(
    (c) =>
      `${c.firstName} ${c.lastName} (${c.role || "rôle non précisé"}) — ${c.concreteCase}`
  );

  if (realCases.length > 0) {
    const first = cases[0];
    return {
      exercise: {
        title: `Cas réel : ${first.firstName} ${first.lastName} — ${module.moduleName}`,
        context: `Cas remonté par le participant : ${first.concreteCase}. Problématique associée : ${
          first.mainProblem || "à clarifier en début d'atelier"
        }.`,
        instructions: [
          "En binôme, identifier la décision à provoquer chez le client dans ce cas.",
          `Appliquer la méthode ${module.moduleName} étape par étape sur ce dossier réel.`,
          "Restituer en plénière : ce qui marche, ce qui résiste, ce que l'on testerait différemment.",
        ],
        expectedOutput: `Plan d'action pas-à-pas applicable cette semaine sur le dossier de ${first.firstName}.`,
      },
      realCases,
      missingCase: false,
    };
  }

  // Aucun cas réel — exercice générique métier, pas inventé.
  return {
    exercise: {
      title: `Exercice générique métier — ${module.moduleName}`,
      context:
        "Aucun cas réel n'a été collecté avant la formation. L'exercice utilise un scénario type immobilier que le formateur adaptera en séance.",
      instructions: [
        `Présenter la méthode ${module.moduleName} en 5 minutes maximum.`,
        "En binôme, jouer une situation représentative (vendeur ou acquéreur selon le module) et appliquer chaque étape de la méthode.",
        "Debrief plénière : 1 chose qui a fonctionné, 1 chose à retravailler.",
      ],
      expectedOutput:
        "Trame d'application immédiate (5 étapes max) à utiliser sur le terrain dès la semaine suivante.",
    },
    realCases: [],
    missingCase: true,
  };
}

function buildModule(
  module: RecommendedModule,
  participants: ParticipantRecord[]
): { node: TrainingSupportModule; missingCase: boolean } {
  const domain = detectDomain(module);
  const fundamentals = (FUNDAMENTALS_PRESETS[domain] ?? FUNDAMENTALS_PRESETS.other).slice(0, 4);
  const accelerator = buildAccelerator(module);
  const exerciseBundle = buildExercise(module, participants, domain);

  const node: TrainingSupportModule = {
    moduleTitle: module.moduleName,
    durationHours: module.durationHours > 0 ? module.durationHours : 2,
    problemStatement: module.reason,
    awarenessSequence: `Faire toucher du doigt la perte de performance liée au manque de méthode ${module.moduleName.toLowerCase()} : présenter un avant/après simple (ratio, délai, qualité de livrable) puis demander à chaque participant son propre constat.`,
    fundamentals,
    aiAccelerator: accelerator,
    concreteBusinessExercise: exerciseBundle.exercise,
    realCasesToUse: exerciseBundle.realCases,
    stepClosing: `Synthèse collective des apprentissages du module ${module.moduleName} : 2 réflexes acquis, 1 frein identifié, 1 action engagée.`,
    fieldAction: FIELD_ACTION_PRESETS[domain] ?? FIELD_ACTION_PRESETS.other,
    progressIndicator:
      PROGRESS_INDICATOR_PRESETS[domain] ?? PROGRESS_INDICATOR_PRESETS.other,
  };
  return { node, missingCase: exerciseBundle.missingCase };
}

export function buildHeuristicTrainingSupport(
  inputs: HeuristicInputs
): TrainingSupport {
  const recommendedModules = inputs.recommendation.recommendedModules;
  const builtModules: TrainingSupportModule[] = [];
  let modulesMissingCase = 0;

  // Renommé `module` → `catalogModule` : Next.js réserve `module`
  // comme identifiant global (règle @next/next/no-assign-module-variable).
  for (const catalogModule of recommendedModules) {
    const { node, missingCase } = buildModule(catalogModule, inputs.participants);
    builtModules.push(node);
    if (missingCase) modulesMissingCase += 1;
  }

  // Garde-fou Zod : au moins 1 module dans le support.
  if (builtModules.length === 0) {
    builtModules.push({
      moduleTitle: "Cadrage Start Academy",
      durationHours: 2,
      problemStatement:
        "Aucun module n'a été retenu par le moteur de recommandation. Cadrage à reprendre avec le commercial.",
      awarenessSequence:
        "Présenter le contexte client, les besoins détectés et les zones d'incertitude. Faire émerger les priorités terrain de l'équipe.",
      fundamentals: [
        "Identifier le moment-clé du parcours commercial où la performance se joue.",
        "Choisir un sujet prioritaire que l'équipe veut traiter dans les 30 jours.",
      ],
      aiAccelerator: {
        objective:
          "Mesurer l'apport potentiel de l'IA sur le sujet retenu (gain de temps, qualité).",
        tools: [],
        examplePrompts: [],
      },
      concreteBusinessExercise: {
        title: "Atelier de cadrage Start Academy",
        context:
          "Le formateur anime un atelier de cadrage avec l'équipe pour décider du sujet n°1.",
        instructions: [
          "Lister les 5 irritants commerciaux les plus coûteux selon les participants.",
          "Voter pour le sujet qui fera le plus gagner en 30 jours.",
        ],
        expectedOutput:
          "Sujet prioritaire + 1 action terrain engagée à la fin de l'atelier.",
      },
      realCasesToUse: [],
      stepClosing:
        "Acter le sujet retenu et le commercial relance Start Academy pour construire le programme dédié.",
      fieldAction:
        "Le manager partage le sujet retenu à l'équipe sous 48 h et organise un point hebdomadaire.",
      progressIndicator:
        "Décision écrite du sujet prioritaire dans le mandat de formation.",
    });
  }

  const totalDurationHours = builtModules.reduce(
    (sum, m) => sum + m.durationHours,
    0
  );

  const targetAudience =
    inputs.session?.targetAudience ??
    inputs.proposal?.trainingProgram.targetAudience ??
    (inputs.diagnostic && inputs.diagnostic.profilesInScope.length > 0
      ? `Profils ciblés : ${inputs.diagnostic.profilesInScope.join(", ")}.`
      : "Équipe commerciale à préciser.");

  // Évite le doublon « ProposalTitle … pour Agence X » quand la
  // proposition contient déjà le nom du client.
  const proposalTitle = inputs.session?.proposalTitle ?? "";
  const companyName = inputs.client?.companyName ?? "";
  const proposalMentionsCompany =
    companyName.length > 0 &&
    proposalTitle.toLowerCase().includes(companyName.toLowerCase());
  const sessionSummary =
    proposalTitle && companyName
      ? `${proposalTitle}${proposalMentionsCompany ? "" : ` pour ${companyName}`}. ${
          inputs.diagnostic?.declaredGoal ?? ""
        }`.trim()
      : inputs.recommendation.clientSummary;

  const pedagogicalIntent =
    inputs.proposal?.trainingProgram.pedagogicalObjectives.length
      ? inputs.proposal.trainingProgram.pedagogicalObjectives.join(" / ")
      : inputs.recommendation.detectedNeeds.join(" / ") ||
        "Activer une montée en performance mesurable sur les semaines suivant la formation.";

  // Compose un titre court via `normalizeSupportTitle` : si la
  // proposition existe déjà avec un titre signifiant, on l'utilise
  // tel quel (le normalizer évitera tout dédoublement
  // « Support formateur — Parcours de formation Start Academy — … »).
  const supportTitle = normalizeSupportTitle(
    inputs.proposal?.proposalTitle ??
      `Programme Start Academy — ${inputs.client?.companyName ?? ""}`,
    inputs.client?.companyName ?? null
  );

  const facilitatorNotes: string[] = [
    "Lire les diagnostics et les cas collectés avant la séance.",
    "Adapter la profondeur de chaque module au niveau réel observé en début d'atelier.",
    "Documenter en plénière les engagements terrain pour les rendre publics.",
  ];
  const participantPreparation: string[] = [
    "Apporter ses propres dossiers vendeurs ou acquéreurs en cours.",
    "Préparer 1 cas concret bloquant ou réussi pour le partager avec l'équipe.",
  ];
  const materialsNeeded: string[] = [
    "Salle équipée vidéoprojecteur + paperboard.",
    "Ordinateur ou tablette par participant avec accès aux outils IA paramétrés.",
    "Trames Start Academy (R1 vendeur, suivi vendeur, qualification acquéreur).",
  ];

  const missingInformation: string[] = [];
  if (modulesMissingCase > 0) {
    missingInformation.push(
      `${modulesMissingCase} module(s) sans cas réel collaborateur — exercice générique utilisé. Relancer la collecte avant la formation.`
    );
  }
  if (inputs.participants.length === 0) {
    missingInformation.push(
      "Aucun participant n'a encore rempli la collecte — relancer le dirigeant."
    );
  }
  if (!inputs.diagnostic?.declaredGoal) {
    missingInformation.push("Objectif dirigeant non documenté.");
  }
  if (inputs.recommendation.missingInformation.length > 0) {
    missingInformation.push(
      ...inputs.recommendation.missingInformation.map(
        (m) => `Recommandation : ${m}`
      )
    );
  }

  const baseConfidence = inputs.recommendation.confidenceScore;
  const informationPenalty = Math.min(missingInformation.length * 4, 20);
  const confidenceScore = Math.max(
    50,
    Math.min(75, Math.round(70 + baseConfidence / 10 - informationPenalty))
  );

  return {
    supportTitle,
    sessionSummary,
    targetAudience,
    totalDurationHours,
    pedagogicalIntent,
    modules: builtModules,
    facilitatorNotes,
    participantPreparation,
    materialsNeeded,
    missingInformation,
    confidenceScore,
  };
}
