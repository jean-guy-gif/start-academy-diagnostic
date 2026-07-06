import type {
  AnswerRecord,
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { TrainingModule } from "@/types";

import type {
  Recommendation,
  RecommendedModule,
  SkillLevel,
  ToolMaturity,
} from "./recommendation-schema";

/**
 * Moteur de recommandation heuristique — fallback sans LLM externe.
 *
 * Stratégie :
 *  1. Normalise toutes les réponses en texte de travail.
 *  2. Détecte la maturité outils via présence / absence de mots-clés
 *     socle (ChatGPT, NotebookLM, Gamma, prompt, CRM, IA de base).
 *  3. Détecte les domaines à activer (socle, prospection, vendeur,
 *     acheteur, organisation) via mots-clés.
 *  4. Score chaque module du catalogue selon :
 *       +3 si famille correspond à un domaine actif
 *       +2 par signal du module présent dans une réponse / note
 *       +1 par mot-clé du nom du module présent dans une réponse
 *       +1 si signal faible aligné avec le domaine
 *       +1 si maturité outils faible et isFoundationModule
 *  5. Garde les meilleurs, max 8, en priorisant les socles d'abord
 *     lorsque la maturité outils est faible.
 *  6. Calcule confidenceScore entre 50 et 75 (jamais 100 sans LLM).
 */

interface HeuristicInputs {
  client: ClientRecord | null;
  diagnostic: DiagnosticRecord;
  answers: AnswerRecord[];
  catalog: TrainingModule[];
}

const FOUNDATION_KEYWORDS = [
  "chatgpt",
  "chat gpt",
  "notebooklm",
  "notebook lm",
  "gamma",
  "claude",
  "gemini",
  "prompt",
  "crm",
  "canva",
];

const NEGATIVE_TOKENS = [
  "non",
  "jamais",
  "aucun",
  "rien",
  "pas",
  "inconnu",
  "ne sait pas",
  "pas paramétré",
  "pas connaitre",
  "pas configuré",
  "irrégulier",
  "manque",
  "absent",
];

interface DomainDefinition {
  id:
    | "foundation"
    | "prospection"
    | "vendeur"
    | "acheteur"
    | "organisation"
    | "manager";
  keywords: string[];
  familyMatch: (family: string) => boolean;
}

const DOMAINS: DomainDefinition[] = [
  {
    id: "foundation",
    keywords: FOUNDATION_KEYWORDS,
    familyMatch: (f) => f.toLowerCase().includes("base"),
  },
  {
    id: "prospection",
    keywords: [
      "prospection",
      "pige",
      "pap",
      "lead",
      "contact vendeur",
      "secteur",
      "base de données",
      "réseaux sociaux",
      "contenu",
    ],
    familyMatch: (f) =>
      f.toLowerCase().includes("prospection") ||
      f.toLowerCase().includes("usecase"),
  },
  {
    id: "vendeur",
    keywords: [
      "estimation",
      "mandat",
      "exclusivité",
      "objection",
      "baisse de prix",
      "suivi vendeur",
      "compte rendu",
      "r1",
      "r2",
      "vendeur",
      "annonce",
      "photo",
    ],
    familyMatch: (f) => f.toLowerCase().includes("vendeur"),
  },
  {
    id: "acheteur",
    keywords: [
      "acquéreur",
      "acheteur",
      "visite",
      "découverte",
      "financement",
      "négociation",
      "offre",
      "compromis",
    ],
    familyMatch: (f) => f.toLowerCase().includes("acheteur"),
  },
  {
    id: "organisation",
    keywords: [
      "relance",
      "routine",
      "régularité",
      "planification",
      "ratio",
      "tableau de bord",
      "pilotage",
      "discipline",
      "boite mail",
      "agenda",
    ],
    familyMatch: (f) =>
      f.toLowerCase().includes("admin") ||
      f.toLowerCase().includes("organisation"),
  },
  {
    id: "manager",
    keywords: [
      "coaching",
      "point individuel",
      "rituel",
      "manager",
      "recrutement",
      "onboarding",
    ],
    familyMatch: (f) =>
      f.toLowerCase().includes("manager") ||
      f.toLowerCase().includes("usecase"),
  },
];

function normalize(value: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function collectText(answers: AnswerRecord[]): {
  full: string;
  perAnswer: { question: string; full: string; answer: AnswerRecord }[];
} {
  const perAnswer = answers.map((a) => ({
    question: normalize(a.questionText),
    full: [a.questionText, a.answer, a.note].map(normalize).join(" "),
    answer: a,
  }));
  return {
    full: perAnswer.map((a) => a.full).join(" \n "),
    perAnswer,
  };
}

function detectActiveDomains(fullText: string): Set<DomainDefinition["id"]> {
  const active = new Set<DomainDefinition["id"]>();
  for (const domain of DOMAINS) {
    if (
      domain.keywords.some((kw) =>
        fullText.includes(normalize(kw))
      )
    ) {
      active.add(domain.id);
    }
  }
  return active;
}

function detectToolMaturity(perAnswer: ReturnType<typeof collectText>["perAnswer"]): ToolMaturity {
  let negative = 0;
  let positive = 0;
  for (const item of perAnswer) {
    const mentionsTool = FOUNDATION_KEYWORDS.some((kw) =>
      item.question.includes(normalize(kw))
    );
    if (!mentionsTool) continue;
    const hasNegative = NEGATIVE_TOKENS.some((tok) =>
      item.full.includes(normalize(tok))
    );
    if (item.answer.isSkipped) {
      negative += 1;
      continue;
    }
    if (hasNegative || (item.answer.answer ?? "").trim().length === 0) {
      negative += 1;
    } else {
      positive += 1;
    }
  }
  if (negative >= 3 && negative > positive) return "low";
  if (positive >= 3 && positive > negative) return "high";
  return "medium";
}

function detectSkillLevel(
  perAnswer: ReturnType<typeof collectText>["perAnswer"],
  diagnostic: DiagnosticRecord
): SkillLevel {
  const profiles = new Set(diagnostic.profilesInScope);
  if (profiles.size > 1) return "mixed";
  let beginnerSignals = 0;
  let advancedSignals = 0;
  for (const item of perAnswer) {
    if (item.answer.isWeakSignal) beginnerSignals += 1;
    if (item.answer.isSkipped) beginnerSignals += 1;
    if (NEGATIVE_TOKENS.some((tok) => item.full.includes(normalize(tok)))) {
      beginnerSignals += 1;
    }
    if (
      item.full.includes("maitrise") ||
      item.full.includes("avance") ||
      item.full.includes("solide") ||
      item.full.includes("equipe autonome")
    ) {
      advancedSignals += 1;
    }
  }
  if (advancedSignals >= 3 && advancedSignals > beginnerSignals) return "advanced";
  if (beginnerSignals >= 4) return "beginner";
  return "intermediate";
}

interface ScoredModule {
  module: TrainingModule;
  score: number;
  reasons: string[];
}

function scoreCatalog(
  catalog: TrainingModule[],
  inputs: {
    perAnswer: ReturnType<typeof collectText>["perAnswer"];
    fullText: string;
    domains: Set<DomainDefinition["id"]>;
    toolMaturity: ToolMaturity;
  }
): ScoredModule[] {
  const eligibleProfiles = new Set(["conseiller", "manager", "assistant", "direction"]);
  return catalog
    .filter((m) => eligibleProfiles.has(m.targetProfile))
    .map<ScoredModule>((module) => {
      let score = 0;
      const reasons: string[] = [];

      // Domain alignment via family
      for (const domain of DOMAINS) {
        if (
          inputs.domains.has(domain.id) &&
          domain.familyMatch(module.family)
        ) {
          score += 3;
          reasons.push(
            `Domaine ${domain.id} détecté dans les réponses, aligné avec la famille « ${module.family} ».`
          );
          break;
        }
      }

      // Module's own diagnostic signals appearing in answer text
      for (const signal of module.diagnosticSignals) {
        const normSignal = normalize(signal);
        const tokens = normSignal
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 4);
        for (const token of tokens) {
          if (inputs.fullText.includes(token)) {
            score += 2;
            reasons.push(
              `Signal « ${signal} » corrélé avec une réponse client (token: ${token}).`
            );
            break;
          }
        }
      }

      // Name keyword overlap with answer text
      const nameTokens = normalize(module.name)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3);
      for (const token of nameTokens) {
        if (inputs.fullText.includes(token)) {
          score += 1;
          reasons.push(
            `Nom du module évoqué dans les réponses (token: ${token}).`
          );
          break;
        }
      }

      // Weak signals get an extra push toward foundation/organisation modules
      const weakSignalsCount = inputs.perAnswer.filter(
        (a) => a.answer.isWeakSignal
      ).length;
      if (weakSignalsCount >= 2 && module.isFoundationModule) {
        score += 1;
        reasons.push(
          `${weakSignalsCount} signaux faibles détectés — renforcer les bases est prioritaire.`
        );
      }

      // Foundation boost when tool maturity is low
      if (inputs.toolMaturity === "low" && module.isFoundationModule) {
        score += 2;
        reasons.push(
          "Maturité outils faible — module socle obligatoire avant tout module avancé."
        );
      }

      return { module, score, reasons };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

function pickRecommended(
  scored: ScoredModule[],
  toolMaturity: ToolMaturity,
  diagnostic: DiagnosticRecord
): ScoredModule[] {
  const profilesInScope = new Set(diagnostic.profilesInScope);
  const matchingProfile = scored.filter(
    (s) =>
      profilesInScope.size === 0 ||
      profilesInScope.has(s.module.targetProfile)
  );
  const pool = matchingProfile.length > 0 ? matchingProfile : scored;

  const foundations = pool.filter((s) => s.module.isFoundationModule);
  const advanced = pool.filter((s) => !s.module.isFoundationModule);

  const result: ScoredModule[] = [];
  if (toolMaturity === "low") {
    // Ensure at least 2 foundation modules before any advanced one.
    for (const m of foundations) {
      if (result.length >= 2) break;
      result.push(m);
    }
  }

  // Plus de cap arbitraire à 8 modules — on garde tous les modules
  // pertinents (foundations + advanced). Le UI affichera leur
  // phasage via `priorityTier` (essential / recommended / later).
  for (const m of [...foundations, ...advanced]) {
    if (!result.find((r) => r.module.id === m.module.id)) {
      result.push(m);
    }
  }

  return result;
}

function buildDetectedNeeds(
  domains: Set<DomainDefinition["id"]>,
  diagnostic: DiagnosticRecord
): string[] {
  const labels: Record<DomainDefinition["id"], string> = {
    foundation: "Mise à niveau sur les bases outils IA",
    prospection: "Renforcement de la prospection vendeurs",
    vendeur: "Amélioration du parcours vendeur (estimation, mandat, suivi)",
    acheteur: "Travail sur la qualification et la conversion acquéreur",
    organisation: "Discipline d'activité et pilotage par ratios",
    manager: "Outillage et rituels du manager",
  };
  const needs: string[] = [];
  for (const domain of DOMAINS) {
    if (domains.has(domain.id)) needs.push(labels[domain.id]);
  }
  if (diagnostic.declaredGoal) {
    needs.push(`Objectif déclaré : ${diagnostic.declaredGoal}`);
  }
  return needs;
}

function buildMissingInformation(
  perAnswer: ReturnType<typeof collectText>["perAnswer"],
  diagnostic: DiagnosticRecord
): string[] {
  const missing: string[] = [];
  const skipped = perAnswer.filter((a) => a.answer.isSkipped);
  if (skipped.length > 0) {
    missing.push(
      `${skipped.length} question(s) passée(s) — réponses à compléter pour fiabiliser le diagnostic.`
    );
  }
  const ratiosKeywords = [
    "ratio",
    "taux",
    "nombre de contacts",
    "nombre de rdv",
    "nombre de mandats",
  ];
  const hasRatios = perAnswer.some(
    (a) =>
      ratiosKeywords.some((kw) => a.question.includes(normalize(kw))) &&
      (a.answer.answer ?? "").trim().length > 0 &&
      !a.answer.isSkipped
  );
  if (!hasRatios) {
    missing.push(
      "Ratios commerciaux non renseignés (contacts, RDV, estimations, mandats, offres)."
    );
  }
  if (!diagnostic.expectedParticipants) {
    missing.push("Nombre exact de participants à confirmer.");
  }
  missing.push(
    "Règle tarifaire non disponible côté plateforme — coût par participant à valider en interne."
  );
  return missing;
}

export function buildHeuristicRecommendation(
  inputs: HeuristicInputs
): Recommendation {
  const { client, diagnostic, answers, catalog } = inputs;
  const { full: fullText, perAnswer } = collectText(answers);
  const domains = detectActiveDomains(fullText);
  const toolMaturity = detectToolMaturity(perAnswer);
  const skillLevel = detectSkillLevel(perAnswer, diagnostic);
  const scored = scoreCatalog(catalog, {
    perAnswer,
    fullText,
    domains,
    toolMaturity,
  });
  const chosen = pickRecommended(scored, toolMaturity, diagnostic);

  // Phasage heuristique amélioré (cf. audit pilote §4.5) :
  //
  //   essential   : socles si maturité IA faible
  //                 + modules directement liés à un domaine actif
  //                   (suivi vendeur, estimation→mandat, baisse prix,
  //                   prospection, R2…) sur les 6 premiers rangs.
  //   recommended : modules métier importants mais hors signaux forts,
  //                 ou socles si maturité moyenne/haute.
  //   optional    : modules à score faible (réponse faible signal),
  //                 utiles si durée/budget disponibles.
  //   later       : modules périphériques OU bascule défensive si la
  //                 durée cumulée des essentiels dépasse 25 h.
  //
  // Règle de garde : si le cumul `essential` dépasse 25 h, on rebascule
  // les essentiels les moins prioritaires en `later` pour garder une
  // session principale tenable. Les `recommended` peuvent eux aussi
  // descendre en `later` si la durée totale (essential + recommended)
  // dépasse 35 h.

  const ESSENTIAL_MAX_HOURS = 25;
  const ESSENTIAL_PLUS_RECOMMENDED_MAX = 35;

  // Un module appartient à un domaine actif si SA famille matche
  // celle d'un domaine détecté dans le diagnostic (cf. `DOMAINS`).
  function moduleInActiveDomain(family: string): boolean {
    for (const def of DOMAINS) {
      if (def.familyMatch(family) && domains.has(def.id)) return true;
    }
    return false;
  }

  function inferInitialTier(
    s: ScoredModule,
    idx: number
  ): "essential" | "recommended" | "optional" | "later" {
    const isFoundation = s.module.isFoundationModule;
    const inActiveDomain = moduleInActiveDomain(s.module.family);

    // Maturité IA faible + module socle → essentiel (apprendre les
    // outils avant tout).
    if (toolMaturity === "low" && isFoundation) return "essential";

    // Module touchant un domaine actif (suivi vendeur, estimation,
    // etc.) sur les 6 premiers rangs → essentiel.
    if (inActiveDomain && idx < 6) return "essential";

    // Module métier dans les 10 premiers et pas de signal direct →
    // recommended.
    if (idx < 10) {
      // Score faible (peu de signaux dans les réponses) → optionnel.
      if (s.score < 2) return "optional";
      return "recommended";
    }

    // Au-delà du rang 10 → later (phase 2 ou 3).
    return "later";
  }

  type TieredEntry = {
    s: ScoredModule;
    idx: number;
    tier: "essential" | "recommended" | "optional" | "later";
    duration: number;
  };

  const initial: TieredEntry[] = chosen.map((s, idx) => ({
    s,
    idx,
    tier: inferInitialTier(s, idx),
    duration:
      s.module.durationHours && s.module.durationHours > 0
        ? s.module.durationHours
        : 2,
  }));

  // Garde-fou durée : si l'enveloppe `essential` dépasse 25 h,
  // bascule les essentiels les moins prioritaires (idx élevé) en
  // `later`. Les foundations restent prioritaires sur les autres.
  let essentialHours = initial
    .filter((e) => e.tier === "essential")
    .reduce((sum, e) => sum + e.duration, 0);
  if (essentialHours > ESSENTIAL_MAX_HOURS) {
    const essentialsByPriority = initial
      .filter((e) => e.tier === "essential")
      .sort((a, b) => {
        // Foundations restent prioritaires
        const aFnd = a.s.module.isFoundationModule ? 0 : 1;
        const bFnd = b.s.module.isFoundationModule ? 0 : 1;
        if (aFnd !== bFnd) return aFnd - bFnd;
        return a.idx - b.idx;
      });
    for (let i = essentialsByPriority.length - 1; i >= 0; i--) {
      if (essentialHours <= ESSENTIAL_MAX_HOURS) break;
      const target = essentialsByPriority[i];
      if (target.s.module.isFoundationModule) continue; // ne touche pas aux socles
      target.tier = "later";
      essentialHours -= target.duration;
    }
  }

  // Garde-fou cumul : essential + recommended ne doit pas dépasser
  // 35 h cumulées. Au-delà → bascule les `recommended` les moins
  // prioritaires en `later`.
  let cumulativeHours = initial
    .filter((e) => e.tier === "essential" || e.tier === "recommended")
    .reduce((sum, e) => sum + e.duration, 0);
  if (cumulativeHours > ESSENTIAL_PLUS_RECOMMENDED_MAX) {
    const recsByPriority = initial
      .filter((e) => e.tier === "recommended")
      .sort((a, b) => b.idx - a.idx);
    for (const target of recsByPriority) {
      if (cumulativeHours <= ESSENTIAL_PLUS_RECOMMENDED_MAX) break;
      target.tier = "later";
      cumulativeHours -= target.duration;
    }
  }

  const recommendedModules: RecommendedModule[] = initial.map((e) => ({
    moduleId: e.s.module.id,
    moduleName: e.s.module.name,
    reason:
      e.s.reasons[0] ??
      `Module pertinent pour la famille « ${e.s.module.family} » au regard du diagnostic.`,
    priority: e.idx + 1,
    priorityTier: e.tier,
    durationHours: e.duration,
    businessRatioTargeted: null,
    useCases: e.s.module.diagnosticSignals.slice(0, 2),
  }));

  const totalDurationHours = recommendedModules.reduce(
    (sum, m) => sum + m.durationHours,
    0
  );

  const requiredFoundations = recommendedModules
    .filter((m) => {
      const mod = catalog.find((c) => c.id === m.moduleId);
      return mod?.isFoundationModule === true;
    })
    .map((m) => m.moduleId);

  const detectedNeeds = buildDetectedNeeds(domains, diagnostic);
  const missingInformation = buildMissingInformation(perAnswer, diagnostic);

  const performanceIssues: string[] = [];
  if (domains.has("prospection")) {
    performanceIssues.push("Volume de contacts vendeurs insuffisant ou irrégulier.");
  }
  if (domains.has("vendeur")) {
    performanceIssues.push("Conversion estimation → mandat ou mandat → exclusivité à améliorer.");
  }
  if (domains.has("acheteur")) {
    performanceIssues.push("Conversion visite → offre à renforcer.");
  }
  if (domains.has("organisation")) {
    performanceIssues.push("Manque de régularité dans le pilotage commercial.");
  }

  // Confidence : entre 50 et 75 selon densité d'information
  const answeredCount = perAnswer.filter((a) => !a.answer.isSkipped).length;
  const answeredRatio = perAnswer.length === 0 ? 0 : answeredCount / perAnswer.length;
  const confidenceScore = Math.round(50 + answeredRatio * 25);

  const clientSummary = client
    ? `${client.companyName}${
        client.director ? ` — dirigée par ${client.director}` : ""
      }. Équipe${
        client.collaboratorsCount ? ` de ${client.collaboratorsCount} personne(s)` : ""
      } sur les profils ${diagnostic.profilesInScope.join(", ") || "non précisés"}.`
    : `Client non renseigné. Diagnostic en mode ${diagnostic.mode}, ${perAnswer.length} réponse(s).`;

  const commercialExplanation = [
    `Recommandation générée par le moteur heuristique local (sans LLM externe).`,
    `Maturité outils estimée : ${toolMaturity}. Niveau métier estimé : ${skillLevel}.`,
    chosen.length > 0
      ? `Parcours en ${chosen.length} module(s), durée cumulée ${totalDurationHours} h, ` +
        `démarrant par ${
          toolMaturity === "low" ? "les bases outils IA puis " : ""
        }les modules les plus prioritaires.`
      : `Aucun module n'a pu être priorisé automatiquement — voir missingInformation.`,
    `Ce résultat doit être relu par le commercial et complété si nécessaire.`,
  ].join(" ");

  return {
    clientSummary,
    detectedNeeds,
    performanceIssues,
    toolMaturity,
    skillLevel,
    requiredFoundations,
    recommendedModules,
    totalDurationHours,
    costPerParticipant: null,
    confidenceScore,
    missingInformation,
    commercialExplanation,
    // v1.0b : heuristique locale n'analyse pas les alertes → toujours [].
    alertsAcknowledged: [],
  };
}
