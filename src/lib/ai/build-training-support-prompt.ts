import "server-only";

import type {
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { Proposal } from "./proposal-schema";
import type { Recommendation } from "./recommendation-schema";
import type { ParticipantRecord } from "@/lib/sessions/session-service";
import type { TrainingSessionViewModel } from "@/types";
import {
  isCoachBrainContextEmpty,
  type CoachBrainContext,
  type CoachBrainItem,
} from "@/lib/coach-brain/coach-brain.types";

/**
 * Construit le prompt OpenRouter pour générer un support de formation
 * Start Academy. Reste server-only et ne contient aucune clé.
 */

const SYSTEM_PROMPT = `Tu es le générateur de support de formation Start Academy.
Tu produis un support de formation immobilier opérationnel, conçu pour
être animé par un formateur expérimenté devant une équipe terrain.

Charte pédagogique Start Academy :
- Concret, terrain, immobilier. Pas de théorie déconnectée.
- Vocabulaire opérationnel : mandat, estimation, vendeur, acquéreur,
  visite, offre, compromis, ratios, prospection, suivi, exclusivité.
- Exercices applicables dès le retour terrain.
- Si les niveaux des participants sont mixtes, prévoir une animation
  progressive (du débutant à l'avancé).
- Pas de discours générique. Chaque module doit produire un changement
  observable.

Règles strictes :
1. N'invente JAMAIS de données client (chiffre, ratio, nom de vendeur,
   adresse de bien). Si une donnée manque, mets-la dans
   missingInformation et propose un exercice générique métier.
2. N'invente JAMAIS de cas réel collaborateur. Les realCasesToUse
   doivent reprendre les cas effectivement collectés dans le payload.
   Si aucun cas n'a été collecté, laisse realCasesToUse vide et
   indique-le dans missingInformation.
3. Chaque module DOIT suivre exactement cette structure :
   1) problemStatement
   2) awarenessSequence
   3) fundamentals (>= 2)
   4) aiAccelerator (objective + tools + examplePrompts si tools non vide)
   5) concreteBusinessExercise (>= 2 instructions)
   6) realCasesToUse (cas collectés OU vide si rien)
   7) stepClosing
   8) fieldAction
   9) progressIndicator
4. fundamentals : 2 à 4 points de méthode courts et applicables.
5. aiAccelerator : si le module est un socle outil ou si l'IA peut
   accélérer le métier ciblé, ajoute des outils et au moins 1 prompt
   exemple opérationnel. Sinon, garde tools/examplePrompts vides mais
   décris un objectif d'amélioration.
6. concreteBusinessExercise.instructions : au moins 2 étapes claires.
7. fieldAction : 1 action terrain mesurable à appliquer la semaine
   suivant la formation.
8. progressIndicator : 1 indicateur observable et chiffré quand
   possible (ratio, délai, nombre).
9. confidenceScore reflète ta certitude (0-100). Diminue-le quand
   informations clés manquent.
10. Retourne UNIQUEMENT un objet JSON valide conforme au schéma.
    Pas de markdown, pas de texte hors JSON.

CONTRAINTES DE LONGUEUR (impératif pour éviter une sortie tronquée) :
- problemStatement, awarenessSequence, stepClosing, fieldAction,
  progressIndicator : 1 à 2 phrases courtes (max 200 caractères).
- fundamentals : 2 à 4 items, chacun max 100 caractères.
- aiAccelerator.objective : 1 phrase (max 150 caractères).
- aiAccelerator.tools : max 3 items courts.
- aiAccelerator.examplePrompts : 1 à 2 prompts, chacun max 200 caractères.
- concreteBusinessExercise.title : max 80 caractères.
- concreteBusinessExercise.context : 1 à 2 phrases (max 250 caractères).
- concreteBusinessExercise.instructions : 2 à 4 items, chacun max 120 caractères.
- concreteBusinessExercise.expectedOutput : 1 phrase (max 150 caractères).
- realCasesToUse : reprendre TEL QUEL le cas collecté (pas de paraphrase).
- facilitatorNotes, participantPreparation, materialsNeeded,
  missingInformation : 2 à 4 items courts chacun.
- pedagogicalIntent, sessionSummary : 2 à 3 phrases max.
La sortie totale doit rester en dessous de 12 000 tokens.
Si l'enveloppe budgétaire approche, raccourcis encore les champs
qualitatifs (awarenessSequence, stepClosing) avant ceux structurants
(fundamentals, instructions).

COACH BRAIN / COACHNXT — Matière pédagogique de référence :
Si une section « # Coach Brain / COACHNXT Context » apparaît dans le
prompt utilisateur, tu DOIS la traiter comme matière pédagogique
première (méthodes, scripts, objections, exercices, exemples terrain,
prompts IA, slides de référence venant de NXT Performance / Start
Academy). Règles strictes :
1. Sélectionne UNIQUEMENT ce qui sert directement l'objectif d'un module
   recommandé. Ne déverse pas la matière brute.
2. Préfère démontrer (exemple, image mentale, script, objection) plutôt
   qu'expliquer.
3. Si un contenu Coach Brain est trop long pour la slide, déplace-le
   en trainerNote au lieu de gonfler les blocs structurants.
4. Respecte le style Start Academy / NXT Performance : plusieurs slides
   courtes valent mieux qu'une slide chargée. UNE idée par slide.
5. Le slide budget reste un garde-fou — n'AUGMENTE PAS le nombre de
   modules ou la durée parce que plus de matière est disponible.
6. N'INVENTE PAS de contenu Coach Brain absent du prompt. N'invente
   AUCUN cas client ni chiffre.
7. Ne reproduis pas la matière mot pour mot : reformule pour intégrer
   au déroulé Start Academy.
Si aucune section Coach Brain n'est fournie, IGNORE complètement ces
règles — le comportement par défaut s'applique sans changement.`;

function formatClient(client: ClientRecord | null): string {
  if (!client) return "Client : non renseigné.";
  return [
    `Entreprise : ${client.companyName}`,
    `Dirigeant : ${client.director ?? "inconnu"}`,
    `Collaborateurs : ${client.collaboratorsCount ?? "non précisé"}`,
    `Profils ciblés : ${
      client.teamTypology.length > 0
        ? client.teamTypology.join(", ")
        : "non précisé"
    }`,
  ].join("\n");
}

function formatSession(session: TrainingSessionViewModel | null): string {
  if (!session) return "Session : non chargée.";
  return [
    `Titre proposition : ${session.proposalTitle ?? "non précisé"}`,
    `Statut session : ${session.status}`,
    `Public cible : ${session.targetAudience ?? "non précisé"}`,
    `Format suggéré : ${session.suggestedFormat ?? "non précisé"}`,
    `Durée totale : ${
      session.totalDurationHours !== null
        ? `${session.totalDurationHours} h`
        : "non précisée"
    }`,
    `Participants attendus : ${session.participantCount ?? "non précisé"}`,
  ].join("\n");
}

function formatDiagnostic(diagnostic: DiagnosticRecord | null): string {
  if (!diagnostic) return "Diagnostic : non chargé.";
  return [
    `Mode : ${diagnostic.mode}`,
    `Statut : ${diagnostic.status}`,
    `Profils dans le scope : ${
      diagnostic.profilesInScope.length > 0
        ? diagnostic.profilesInScope.join(", ")
        : "non précisé"
    }`,
    `Objectif déclaré : ${diagnostic.declaredGoal ?? "non précisé"}`,
  ].join("\n");
}

function formatRecommendation(recommendation: Recommendation | null): string {
  if (!recommendation) return "Recommandation : non chargée.";
  const modules = recommendation.recommendedModules
    .map(
      (m, idx) =>
        `${idx + 1}. [${m.moduleId}] ${m.moduleName} — ${m.durationHours} h\n` +
        `   Raison : ${m.reason}\n` +
        (m.useCases.length > 0
          ? `   Cas d'usage : ${m.useCases.join(" | ")}\n`
          : "")
    )
    .join("\n");
  return [
    `Maturité outils : ${recommendation.toolMaturity}`,
    `Niveau métier : ${recommendation.skillLevel}`,
    `Prérequis socle : ${
      recommendation.requiredFoundations.join(", ") || "—"
    }`,
    `Besoins détectés : ${recommendation.detectedNeeds.join(" | ") || "—"}`,
    `Problèmes de performance : ${
      recommendation.performanceIssues.join(" | ") || "—"
    }`,
    `Synthèse client : ${recommendation.clientSummary}`,
    `\nModules validés :\n${modules}`,
  ].join("\n");
}

function formatProposal(proposal: Proposal | null): string {
  if (!proposal) return "Proposition : non disponible.";
  const objectives = proposal.trainingProgram.pedagogicalObjectives;
  return [
    `Titre proposition : ${proposal.proposalTitle}`,
    `Résumé exécutif : ${proposal.executiveSummary}`,
    `Public cible (proposition) : ${proposal.trainingProgram.targetAudience}`,
    `Objectifs pédagogiques : ${objectives.join(" | ") || "—"}`,
  ].join("\n");
}

function formatCoachBrainItem(item: CoachBrainItem, idx: number): string {
  // On privilégie le `summary` (court par construction) puis on tronque
  // `content` pour éviter de gonfler le prompt. Les autres champs sont
  // affichés seulement quand renseignés — la curation se fait côté
  // service, pas dans le builder.
  const lines: string[] = [
    `  ${idx + 1}. [${item.id}] ${item.title}`,
    `     priorité: ${item.priority}${
      item.confidenceScore !== null
        ? ` · confiance: ${item.confidenceScore.toFixed(2)}`
        : ""
    }`,
  ];
  if (item.moduleFamily || item.targetProfile) {
    const meta = [
      item.moduleFamily ? `famille: ${item.moduleFamily}` : null,
      item.targetProfile ? `profil: ${item.targetProfile}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`     ${meta}`);
  }
  if (item.relatedModuleIds.length > 0) {
    lines.push(
      `     modules liés: ${item.relatedModuleIds.slice(0, 4).join(", ")}`
    );
  }
  if (item.tags.length > 0) {
    lines.push(`     tags: ${item.tags.slice(0, 5).join(", ")}`);
  }
  const body = item.summary ?? item.content;
  const truncated = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  lines.push(`     contenu: ${truncated.replace(/\s+/g, " ").trim()}`);
  if (item.visualHint) {
    lines.push(`     visuel: ${item.visualHint}`);
  }
  if (item.usageGuidance) {
    lines.push(`     usage: ${item.usageGuidance}`);
  }
  return lines.join("\n");
}

function formatCoachBrainSection(
  ctx: CoachBrainContext | null | undefined
): string {
  // Retourne vide quand le contexte est vide → permet à `buildPrompt`
  // de NE PAS injecter de section. Comportement strict iso-actuel quand
  // Coach Brain est inerte (cf. consigne « comportement actuel inchangé
  // si coachBrainContext vide »).
  if (isCoachBrainContextEmpty(ctx) || !ctx) return "";

  const blocks: string[] = [];

  const groups: Array<{ label: string; items: CoachBrainItem[] }> = [
    { label: "Méthodes", items: ctx.methods },
    { label: "Scripts", items: ctx.scripts },
    { label: "Objections", items: ctx.objections },
    { label: "Exercices", items: ctx.exercises },
    { label: "Exemples terrain", items: ctx.examples },
    { label: "Prompts IA", items: ctx.prompts },
    { label: "Slides de référence", items: ctx.slideReferences },
  ];

  for (const g of groups) {
    if (g.items.length === 0) continue;
    blocks.push(
      `${g.label} (${g.items.length}) :\n${g.items
        .map((it, idx) => formatCoachBrainItem(it, idx))
        .join("\n")}`
    );
  }

  return blocks.join("\n\n");
}

function formatParticipants(participants: ParticipantRecord[]): string {
  if (participants.length === 0) {
    return "Participants collectés : aucun. AUCUN cas réel disponible — utiliser des exercices génériques métier.";
  }
  const lines = participants.map((p, idx) => {
    const tools = p.toolsUsed.length > 0 ? p.toolsUsed.join(", ") : "non précisé";
    return [
      `${idx + 1}. ${p.firstName} ${p.lastName} — ${p.role || "rôle non précisé"}`,
      `   Niveau estimé : ${p.estimatedLevel || "non précisé"}`,
      `   Outils utilisés : ${tools}`,
      `   Problématique : ${p.mainProblem || "non précisée"}`,
      `   Objectif personnel : ${p.personalGoal || "non précisé"}`,
      `   Cas concret à traiter : ${p.concreteCase || "AUCUN cas fourni"}`,
    ].join("\n");
  });
  return `Participants collectés (${participants.length}) :\n${lines.join("\n\n")}`;
}

const RESPONSE_SHAPE = `{
  "supportTitle": "string",
  "sessionSummary": "string — 3 à 5 phrases",
  "targetAudience": "string",
  "totalDurationHours": 0,
  "pedagogicalIntent": "string — ce que la formation doit changer",
  "modules": [
    {
      "moduleTitle": "string",
      "durationHours": 0,
      "problemStatement": "string — la douleur métier traitée",
      "awarenessSequence": "string — comment faire prendre conscience",
      "fundamentals": ["string", "string"],
      "aiAccelerator": {
        "objective": "string",
        "tools": ["string"],
        "examplePrompts": ["string"]
      },
      "concreteBusinessExercise": {
        "title": "string",
        "context": "string",
        "instructions": ["string", "string"],
        "expectedOutput": "string"
      },
      "realCasesToUse": ["string — repris des cas collectés uniquement"],
      "stepClosing": "string — comment refermer le module",
      "fieldAction": "string — 1 action terrain mesurable",
      "progressIndicator": "string — 1 indicateur observable"
    }
  ],
  "facilitatorNotes": ["string"],
  "participantPreparation": ["string"],
  "materialsNeeded": ["string"],
  "missingInformation": ["string"],
  "confidenceScore": 0
}`;

export interface TrainingSupportPromptInputs {
  client: ClientRecord | null;
  diagnostic: DiagnosticRecord | null;
  recommendation: Recommendation | null;
  proposal: Proposal | null;
  session: TrainingSessionViewModel | null;
  participants: ParticipantRecord[];
  /** Matière Coach Brain / COACHNXT. Optionnel — si vide ou absent, le
   *  prompt généré est strictement identique à la version sans Coach
   *  Brain (rétro-compatible). */
  coachBrainContext?: CoachBrainContext | null;
}

export interface BuiltTrainingSupportPrompt {
  system: string;
  user: string;
}

export function buildTrainingSupportPrompt(
  inputs: TrainingSupportPromptInputs
): BuiltTrainingSupportPrompt {
  const coachBrainBlock = formatCoachBrainSection(inputs.coachBrainContext);
  const coachBrainSection = coachBrainBlock
    ? `\n# Coach Brain / COACHNXT Context\n\n${coachBrainBlock}\n`
    : "";

  const user = `# Contexte client

${formatClient(inputs.client)}

# Session

${formatSession(inputs.session)}

# Diagnostic

${formatDiagnostic(inputs.diagnostic)}

# Recommandation validée

${formatRecommendation(inputs.recommendation)}

# Proposition commerciale

${formatProposal(inputs.proposal)}

# Collecte collaborateurs

${formatParticipants(inputs.participants)}
${coachBrainSection}
# Format de sortie attendu

Retourne strictement un JSON respectant ce schéma :

${RESPONSE_SHAPE}

Rappels :
- AUCUN cas réel collaborateur inventé. Tu n'utilises que les cas
  effectivement collectés ci-dessus.
- Chaque module suit exactement la structure imposée.
- Si une donnée manque, missingInformation.
- Retourne UNIQUEMENT le JSON, sans texte autour.`;

  return { system: SYSTEM_PROMPT, user };
}
