import "server-only";

import type {
  AnswerRecord,
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type {
  AlertsSnapshot,
  RatiosSnapshot,
} from "@/lib/diagnostics/ratios-service";
import type { TrainingFundingSummary } from "@/lib/pricing/training-funding";
import { diagnosticChapters } from "@/lib/data/diagnostic-chapters";
import { diagnosticQuestions } from "@/lib/data/diagnostic-questions";
import type { DiagnosticChapter, TrainingModule } from "@/types";

const SYSTEM_PROMPT = `Tu es l'analyste pédagogique de Start Academy.
Ton rôle est de transformer un rendez-vous commercial en parcours de
formation personnalisé, justifié, chiffré quand possible.

Règles strictes — à respecter sans exception :
1. Le catalogue fourni ci-dessous est une SÉLECTION PERTINENTE pour
   ce diagnostic — pas le catalogue Start Academy complet. Tu ne dois
   utiliser QUE les moduleId présents dans cette sélection.
2. Tu ne dois JAMAIS inventer un module : si tu penses qu'un module
   Start Academy connu de ta mémoire d'entraînement serait pertinent
   mais qu'il N'EST PAS dans la sélection fournie, indique-le dans
   missingInformation avec une phrase claire (ex: « module attendu :
   accélérateur photo immobilière — absent de la sélection »). Tu ne
   le mets PAS dans recommendedModules.
3. Si rien dans la sélection ne convient, laisse recommendedModules
   vide et explique-le dans missingInformation.
4. Si la maturité outils est faible, recommande EN PRIORITÉ les
   modules marqués isFoundationModule (ChatGPT, NotebookLM, Claude,
   Gemini, Prompt, CRM, Canva) avant tout module avancé. Gamma
   n'est priorisé que s'il a été explicitement demandé par le client.
5. Chaque module recommandé doit être expliqué par rapport à une
   réponse client ou un signal faible — pas de justification générique.
6. Si des ratios commerciaux sont absents, indique-les dans
   missingInformation. N'invente JAMAIS un chiffre.
7. costPerParticipant : mets TOUJOURS null. La tarification Start
   Academy est calculée côté code (règle unique : 1 h = 42 € HT par
   participant). Tu peux expliquer le montant dans
   commercialExplanation si pertinent, mais tu ne décides JAMAIS
   du prix.
8. Le confidenceScore doit refléter ta certitude (0-100). Diminue-le
   quand des informations manquent.
9. Distingue toujours faits, hypothèses, recommandations.
10. **Pas de limite arbitraire au nombre de modules.** Tu recommandes
    autant de modules qu'il en faut pour couvrir les besoins identifiés —
    pas plus, pas moins. Minimum 3 modules pour rester crédible ;
    au-delà, tu phases (cf. règle 11).
11. **priorityTier — phasage qualitatif obligatoire** pour chaque
    module recommandé :
      - "essential"    : à programmer en session 1 (cœur du parcours)
      - "recommended"  : à intégrer dans le parcours principal
      - "optional"     : complémentaire — selon budget / temps
      - "later"        : à planifier en phase 2/3 ultérieure
    Au-delà de 12 modules, propose IMPÉRATIVEMENT un phasage cohérent
    (3-6 essentiels + recommended + later) pour éviter une session
    inadaptée à la durée. Une seule session ne doit pas dépasser ~25 h
    cumulées sur les modules essentiels.
12. **Ratios, alertes et contexte financement sont AUTORITAIRES.**
    Les blocs « Ratios calculés », « Alertes » et « Potentiel de
    financement » ci-dessous ont été produits par un moteur
    déterministe côté code. Tu les cites tels quels — tu ne les
    recalcules pas, tu ne les contredis pas, tu ne les arrondis pas.
13. **Le taux de consommation des droits est TOUJOURS une
    ESTIMATION.** Le libellé fourni est déjà préfixé « environ » —
    reprends-le tel quel dans commercialExplanation. Ne présente
    JAMAIS ce chiffre comme un droit acquis.
14. **Les synthèses par chapitre remplacent les réponses brutes.**
    Tu ne reçois pas les 80 réponses une à une ; tu reçois une
    synthèse par chapitre + les alertes + les ratios. Utilise ces
    éléments comme signal ; si un chapitre semble creux, indique-le
    dans missingInformation.
15. Retourne UNIQUEMENT un objet JSON valide conforme au schéma fourni.
    Pas de markdown, pas de commentaires, pas de texte hors JSON.`;

function formatCatalog(modules: TrainingModule[]): string {
  // Le LLM doit voir uniquement les modules existants avec leurs
  // moduleId exacts pour ne pas inventer.
  return modules
    .map((module) => {
      const parts = [
        `- id: ${module.id}`,
        `  name: ${module.name}`,
        `  family: ${module.family}`,
        `  sourceSheet: ${module.sourceSheet}`,
        `  targetProfile: ${module.targetProfile}`,
        `  durationHours: ${module.durationHours ?? "n/a"}`,
        `  level: ${module.level ?? "n/a"}`,
        `  isFoundationModule: ${module.isFoundationModule}`,
      ];
      if (module.needIdentification) {
        const trimmed = module.needIdentification
          .replace(/\s+/g, " ")
          .slice(0, 280);
        parts.push(`  needIdentification: ${trimmed}`);
      }
      if (module.diagnosticSignals.length > 0) {
        parts.push(
          `  diagnosticSignals: ${JSON.stringify(module.diagnosticSignals.slice(0, 5))}`
        );
      }
      return parts.join("\n");
    })
    .join("\n");
}

function formatClient(client: ClientRecord | null): string {
  if (!client) return "Client inconnu.";
  const lines = [
    `Entreprise: ${client.companyName}`,
    `Dirigeant: ${client.director ?? "inconnu"}`,
    `Email: ${client.email ?? "inconnu"}`,
    `Téléphone: ${client.phone ?? "inconnu"}`,
    `Collaborateurs: ${client.collaboratorsCount ?? "inconnu"}`,
    `Profils ciblés: ${
      client.teamTypology.length > 0 ? client.teamTypology.join(", ") : "inconnu"
    }`,
  ];
  return lines.join("\n");
}

function formatDiagnostic(diagnostic: DiagnosticRecord): string {
  return [
    `Mode: ${diagnostic.mode}`,
    `Statut: ${diagnostic.status}`,
    `Profils concernés: ${
      diagnostic.profilesInScope.length > 0
        ? diagnostic.profilesInScope.join(", ")
        : "—"
    }`,
    `Participants attendus: ${
      diagnostic.expectedParticipants ?? "inconnu"
    }`,
    `Objectif déclaré: ${diagnostic.declaredGoal ?? "—"}`,
    `Notes commerciales: ${diagnostic.notes ?? "—"}`,
  ].join("\n");
}

/**
 * v1.0 — Synthèses par chapitre (Étape 6). Remplace `formatAnswers`.
 * Le LLM reçoit une synthèse par chapitre (une ligne par question
 * répondue, avec flags PASSÉE / SIGNAL FAIBLE), pas les 80 réponses
 * brutes. Les questions sans réponse sont ignorées : elles remontent
 * via `alerts` si elles étaient `required: true` (cf. Étape 5,
 * alerte `missing_required_data`).
 */
function formatChapterSyntheses(answers: AnswerRecord[]): string {
  if (answers.length === 0) return "(Aucune réponse enregistrée.)";

  // Indexe les questions du référentiel v1.0 par id pour retrouver
  // le `chapter` (les réponses en base ne portent que la `category`).
  const questionsById = new Map(
    diagnosticQuestions.map((q) => [q.id, q])
  );

  // Regroupe les réponses par chapitre (1..11). Les IDs inconnus
  // (rares — questions retirées / renommées) sont regroupés sous
  // « autres » à la fin.
  const byChapter = new Map<number | "autres", AnswerRecord[]>();
  for (const a of answers) {
    const q = questionsById.get(a.questionId);
    const key = q ? q.chapter : "autres";
    const list = byChapter.get(key) ?? [];
    list.push(a);
    byChapter.set(key, list);
  }

  const parts: string[] = [];
  for (const meta of diagnosticChapters) {
    const list = byChapter.get(meta.chapter);
    if (!list || list.length === 0) continue;
    const lines = [`## Ch. ${meta.chapter} — ${meta.title}`];
    for (const a of list) {
      const flags = [
        a.isSkipped ? "PASSÉE" : null,
        a.isWeakSignal ? "SIGNAL FAIBLE" : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const noteSuffix = a.note ? ` — note interne: ${a.note}` : "";
      const answerText = a.isSkipped
        ? "(passée)"
        : (a.answer ?? "(vide)");
      lines.push(
        `- [${a.category ?? "n/a"}] ${a.questionText} → ${answerText}${flags ? ` (${flags})` : ""}${noteSuffix}`
      );
    }
    parts.push(lines.join("\n"));
  }

  // « autres » : réponses hors référentiel v1.0 (compat MVP1).
  const orphans = byChapter.get("autres");
  if (orphans && orphans.length > 0) {
    const lines = ["## Autres réponses (hors référentiel v1.0)"];
    for (const a of orphans) {
      lines.push(
        `- [${a.category ?? "n/a"}] ${a.questionText} → ${a.answer ?? "(vide)"}`
      );
    }
    parts.push(lines.join("\n"));
  }

  return parts.join("\n\n");
}

function formatRatios(snapshot: RatiosSnapshot | null): string {
  if (!snapshot) return "(Aucun ratio calculé — moteur non invoqué.)";
  const entries = Object.entries(snapshot.ratios);
  if (entries.length === 0) return "(Aucun ratio calculé.)";
  return entries
    .map(([key, value]) => {
      const label = snapshot.labels[key] ?? key;
      const display = value === null ? "non calculable" : String(value);
      return `- ${label}: ${display}`;
    })
    .join("\n");
}

function formatAlerts(snapshot: AlertsSnapshot | null): string {
  if (!snapshot || snapshot.alerts.length === 0) {
    return "(Aucune alerte déclenchée.)";
  }
  return snapshot.alerts
    .map((a) => {
      const chapter = a.chapter !== null ? `Ch.${a.chapter}` : "—";
      return `- [${chapter} · ${a.severity.toUpperCase()}] ${a.label}${a.threshold !== null ? ` (seuil ${a.threshold})` : ""}`;
    })
    .join("\n");
}

function formatFundingContext(
  summary: TrainingFundingSummary | null
): string {
  if (!summary) {
    return "(Aucune synthèse financement — participants non renseignés ou moteur non invoqué.)";
  }
  const lines = [
    `- Participants pris en compte: ${summary.totalParticipantCount}`,
    `- Éligibles (potentiellement): ${summary.eligibleParticipantCount}`,
    `- Budget total estimé: ${summary.totalBudget !== null ? `${summary.totalBudget} €` : "inconnu"}`,
    `- Prise en charge estimée totale: ${summary.estimatedFundingTotal} €`,
    `- Reste à charge estimé: ${summary.estimatedRemainingCost !== null ? `${summary.estimatedRemainingCost} €` : "inconnu"}`,
    `- Disclaimer: ${summary.disclaimer}`,
  ];
  return lines.join("\n");
}

const RESPONSE_SHAPE = `{
  "clientSummary": "string — synthèse du client en 2-4 phrases",
  "detectedNeeds": ["string"],
  "performanceIssues": ["string"],
  "toolMaturity": "low | medium | high",
  "skillLevel": "beginner | intermediate | advanced | mixed",
  "requiredFoundations": ["moduleId"],
  "recommendedModules": [
    {
      "moduleId": "id exact du catalogue",
      "moduleName": "nom exact du catalogue",
      "reason": "pourquoi ce module — basé sur une réponse ou un signal faible",
      "priority": 1,
      "priorityTier": "essential | recommended | optional | later",
      "durationHours": 4,
      "businessRatioTargeted": "string | null",
      "useCases": ["string"]
    }
  ],
  "totalDurationHours": 0,
  "costPerParticipant": null,
  "confidenceScore": 0,
  "missingInformation": ["string"],
  "commercialExplanation": "string — paragraphe argumenté pour le commercial",
  "alertsAcknowledged": ["code d'alerte que tu prends en compte — optionnel"]
}`;

export interface PromptInputs {
  client: ClientRecord | null;
  diagnostic: DiagnosticRecord;
  answers: AnswerRecord[];
  catalog: TrainingModule[];
  // v1.0 — Étape 6 · les 3 nouveaux blocs autoritaires
  ratios?: RatiosSnapshot | null;
  alerts?: AlertsSnapshot | null;
  fundingSummary?: TrainingFundingSummary | null;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

/**
 * v1.0 — le prompt reçoit désormais des synthèses par chapitre + les
 * ratios + les alertes + le contexte financement. Les appelants qui
 * ne fournissent pas ces blocs (rétro-compat) tombent sur les valeurs
 * par défaut (null → fallback texte « aucun »).
 */
export function buildRecommendationPrompt(inputs: PromptInputs): BuiltPrompt {
  const user = `# Contexte client

${formatClient(inputs.client)}

# Diagnostic

${formatDiagnostic(inputs.diagnostic)}

# Ratios calculés (AUTORITAIRES — cite-les tels quels)

${formatRatios(inputs.ratios ?? null)}

# Alertes déclenchées (AUTORITAIRES — inclus les codes traités dans alertsAcknowledged)

${formatAlerts(inputs.alerts ?? null)}

# Potentiel de financement (AUTORITAIRE)

${formatFundingContext(inputs.fundingSummary ?? null)}

# Synthèses par chapitre (${inputs.answers.length} réponses recensées)

${formatChapterSyntheses(inputs.answers)}

# Sélection pertinente du catalogue Start Academy (${inputs.catalog.length} modules)

Ci-dessous : les modules pré-sélectionnés pour ce diagnostic. Tu DOIS
choisir uniquement parmi cette sélection. Le catalogue complet contient
d'autres modules, mais ils ne sont PAS pertinents pour ce client —
ne les utilise pas.

${formatCatalog(inputs.catalog)}

# Format de sortie attendu

Retourne strictement un JSON respectant ce schéma :

${RESPONSE_SHAPE}

Rappels :
- moduleId DOIT exister dans la sélection ci-dessus — pas un autre
  moduleId que tu connaîtrais par ailleurs.
- Si tu penses qu'un module Start Academy serait pertinent mais
  n'apparaît PAS dans la sélection, signale-le dans
  missingInformation au lieu de l'inventer.
- Si maturité outils faible, requiredFoundations + premiers
  recommendedModules ciblent les bases outils (sauf Gamma, hors
  scope par défaut).
- totalDurationHours = somme des durationHours des modules retenus.
- N'invente ni prix ni ratios. Reprends les ratios du bloc « Ratios
  calculés » tels quels dans commercialExplanation. Ne recalcule ni
  n'arrondis.
- Le taux de consommation des droits est TOUJOURS une estimation —
  le libellé fourni est déjà préfixé « environ », reprends-le tel
  quel.
- Retourne UNIQUEMENT le JSON, sans texte autour.`;

  return { system: SYSTEM_PROMPT, user };
}
