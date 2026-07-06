import type {
  AnswerRecord,
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { ProfileTarget, TrainingModule } from "@/types";

/**
 * Sélection pertinente du catalogue pour la route `/analyze`.
 *
 * Objectif : éviter d'envoyer les 79 modules complets au LLM
 * (prompt qui dépasse facilement 12 k tokens) et lui transmettre
 * uniquement les modules **pertinents pour ce diagnostic**.
 *
 * Garanties :
 *   - Aucun module inventé : on filtre depuis `allModules`, jamais on
 *     n'en crée.
 *   - Toujours au moins 8 modules retournés si le catalogue le permet
 *     (complétion par modules génériques du profil ciblé).
 *   - Plafond strict à 20 modules.
 *   - Gamma n'est PRIORISÉ que si explicitement évoqué par les
 *     réponses — le produit ne pousse pas Gamma par défaut.
 */

interface SelectionParams {
  diagnostic: DiagnosticRecord;
  client: ClientRecord | null;
  answers: AnswerRecord[];
  allModules: TrainingModule[];
}

export interface ModuleSelectionStats {
  totalCatalog: number;
  transmitted: number;
  foundationModules: number;
  families: string[];
}

export interface SelectionResult {
  modules: TrainingModule[];
  stats: ModuleSelectionStats;
}

// ---------------------------------------------------------------------------
// Normalisation texte
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function concatenateAnswers(answers: AnswerRecord[]): string {
  return answers
    .map((a) =>
      [a.questionText, a.answer, a.note].filter(Boolean).join(" ")
    )
    .map(normalize)
    .join(" \n ");
}

// ---------------------------------------------------------------------------
// Détection signaux forts dans les réponses
// ---------------------------------------------------------------------------

const NEGATIVE_TOKENS_RX =
  /(non|jamais|aucun|inconnu|pas (paramétr|configur|connaî|connu|standardis)|ne (sait|sais) pas|ne connai|irrégulier|absent|peu de)/i;

interface DetectedSignals {
  toolMaturityLow: boolean;
  explicitlyMentionsGamma: boolean;
  domains: Set<DomainKey>;
}

type DomainKey =
  | "prospection"
  | "mandats"
  | "exclusivite"
  | "estimation"
  | "suivi_vendeur"
  | "baisse_prix"
  | "acheteur"
  | "negociation"
  | "qualification_acquereur"
  | "visite_offre"
  | "organisation_crm"
  | "manager";

const DOMAIN_KEYWORDS: Record<DomainKey, RegExp> = {
  prospection: /(prospect|pige|pap|secteur|base de donn|leads?|réseaux sociaux)/i,
  mandats: /(mandats?|manque de mandats|peu de mandats|prise de mandat)/i,
  exclusivite: /(exclusiv|mandat simple)/i,
  estimation: /(estimation|estim\.|estimer)/i,
  suivi_vendeur: /(suivi vendeur|suivi des vendeurs|compte rendu vendeur)/i,
  baisse_prix: /(baisse de prix|baisser le prix|défendre (le|un) prix|baisser le mandat)/i,
  acheteur: /(achet|acquér|visite)/i,
  negociation: /(négoci|offre|compromis)/i,
  qualification_acquereur: /(qualifi|qualification acqu|découv)/i,
  visite_offre: /(visite.*offre|visites? sans offres?|peu d'offres)/i,
  organisation_crm: /(crm|relance|routine|régularité|pilotage|ratio|tableau de bord)/i,
  manager: /(manager|pilotage équipe|coaching|rituel|onboard)/i,
};

const TOOL_NEGATIVE_RX =
  /(chatgpt|chat gpt|notebook ?lm|prompt|claude|gemini)/i;

function detectSignals(
  fullText: string,
  answers: AnswerRecord[]
): DetectedSignals {
  const domains = new Set<DomainKey>();
  for (const [key, rx] of Object.entries(DOMAIN_KEYWORDS) as [
    DomainKey,
    RegExp,
  ][]) {
    if (rx.test(fullText)) domains.add(key);
  }

  // Maturité outils faible : au moins 2 réponses négatives sur les
  // outils, OU plus de 2 signaux faibles + 1 mention d'outil non maîtrisé.
  let toolNegatives = 0;
  let toolWeakSignals = 0;
  for (const a of answers) {
    const text = normalize(
      [a.questionText, a.answer, a.note].filter(Boolean).join(" ")
    );
    if (TOOL_NEGATIVE_RX.test(text) && NEGATIVE_TOKENS_RX.test(text)) {
      toolNegatives += 1;
    }
    if (TOOL_NEGATIVE_RX.test(text) && a.isWeakSignal) {
      toolWeakSignals += 1;
    }
  }
  const toolMaturityLow = toolNegatives >= 2 || toolWeakSignals >= 2;

  // Gamma : "ne priorise Gamma que si explicitement évoqué". On
  // considère "explicitement évoqué" comme une mention dans une réponse
  // ET sans marqueur négatif fort (« jamais utilisé » est précisément
  // ce qui ne déclencherait PAS la priorité Gamma).
  const explicitlyMentionsGamma =
    /(gamma)/i.test(fullText) &&
    /(gamma[^.]{0,40}(souhait|aimer|envisage|voulons|besoin))/i.test(
      fullText
    );

  return { toolMaturityLow, explicitlyMentionsGamma, domains };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface ScoredModule {
  module: TrainingModule;
  score: number;
  reasons: string[];
}

const FAMILY_DOMAIN_MAP: { rx: RegExp; domain: DomainKey }[] = [
  { rx: /prospection/i, domain: "prospection" },
  { rx: /vendeur/i, domain: "mandats" },
  { rx: /vendeur/i, domain: "estimation" },
  { rx: /vendeur/i, domain: "suivi_vendeur" },
  { rx: /vendeur/i, domain: "exclusivite" },
  { rx: /acheteur/i, domain: "acheteur" },
  { rx: /acheteur/i, domain: "qualification_acquereur" },
  { rx: /admin/i, domain: "organisation_crm" },
  { rx: /usecase/i, domain: "manager" },
];

function isGammaModule(module: TrainingModule): boolean {
  return /\bgamma\b/i.test(module.name);
}

function familyMatchesDomain(
  family: string,
  domain: DomainKey
): boolean {
  return FAMILY_DOMAIN_MAP.some(
    (m) => m.domain === domain && m.rx.test(family)
  );
}

function titleMatchesDomain(name: string, domain: DomainKey): boolean {
  return DOMAIN_KEYWORDS[domain].test(name);
}

function scoreModule(
  module: TrainingModule,
  fullText: string,
  signals: DetectedSignals
): ScoredModule {
  let score = 0;
  const reasons: string[] = [];

  // 1) Modules socles outils si maturité outils faible.
  if (signals.toolMaturityLow && module.isFoundationModule) {
    if (isGammaModule(module) && !signals.explicitlyMentionsGamma) {
      // Gamma hors scope : inclus à très faible score (pas prioritaire).
      score += 1;
      reasons.push(
        "Module socle (Gamma) — inclus mais non prioritaire (pas évoqué explicitement)"
      );
    } else {
      score += 6;
      reasons.push("Module socle outil — maturité IA faible détectée");
    }
  }

  // 2) Match diagnosticSignals du module avec le texte des réponses.
  for (const signal of module.diagnosticSignals) {
    if (!signal) continue;
    // On compare le segment avant " — " quand présent (le préfixe est
    // le signal réel, le suffixe est la description / seuil d'alerte).
    const head = normalize(signal.split("—")[0].trim());
    if (head.length >= 3 && fullText.includes(head)) {
      score += 4;
      reasons.push(`Signal du module présent dans les réponses : « ${head} »`);
      break;
    }
  }

  // 3) Famille / title qui matchent un domaine actif.
  for (const domain of signals.domains) {
    if (
      familyMatchesDomain(module.family, domain) ||
      titleMatchesDomain(module.name, domain)
    ) {
      score += 3;
      reasons.push(`Module aligné avec le domaine actif : ${domain}`);
      break;
    }
  }

  // 4) Module présent par défaut quand le profil correspond et qu'on
  //    a peu d'autres signaux (boost faible pour rester sélectionnable).
  if (score === 0) score = 0;

  return { module, score, reasons };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export function selectRelevantModulesForAnalysis(
  params: SelectionParams
): SelectionResult {
  const profilesInScope = new Set<ProfileTarget>(
    params.diagnostic.profilesInScope
  );
  const fullText = concatenateAnswers(params.answers);
  const signals = detectSignals(fullText, params.answers);

  // 1. Filtrage par profil ciblé. Si aucun profil dans le diagnostic,
  //    on ne filtre pas (cas dégradé).
  const profileEligible =
    profilesInScope.size === 0
      ? params.allModules
      : params.allModules.filter((m) =>
          profilesInScope.has(m.targetProfile)
        );

  // 2. Scoring sur les modules éligibles.
  const scored = profileEligible
    .map((m) => scoreModule(m, fullText, signals))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // 3. Top 20 max.
  let selected = scored.slice(0, 20).map((s) => s.module);

  // 4. Si moins de 8 modules, compléter avec génériques du profil.
  //    On évite d'ajouter Gamma en complétion (hors scope).
  if (selected.length < 8) {
    const alreadyChosen = new Set(selected.map((m) => m.id));
    const completers = profileEligible.filter(
      (m) => !alreadyChosen.has(m.id) && !isGammaModule(m)
    );
    for (const m of completers) {
      if (selected.length >= 8) break;
      selected.push(m);
    }
  }

  const families = Array.from(new Set(selected.map((m) => m.family)));
  const foundationCount = selected.filter((m) => m.isFoundationModule).length;

  return {
    modules: selected,
    stats: {
      totalCatalog: params.allModules.length,
      transmitted: selected.length,
      foundationModules: foundationCount,
      families,
    },
  };
}
