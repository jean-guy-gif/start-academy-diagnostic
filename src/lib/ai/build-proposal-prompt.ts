import "server-only";

import type {
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { Recommendation } from "./recommendation-schema";

/**
 * Construit le prompt OpenRouter pour générer une proposition
 * commerciale. Reste server-only et ne contient aucune clé.
 */

const SYSTEM_PROMPT = `Tu es l'assistant de proposition commerciale Start Academy.
Tu produis des propositions de formation claires, vendables et honnêtes
à partir d'une recommandation validée par l'équipe pédagogique.

Charte de ton :
- Professionnel, clair, vendeur, concret.
- Phrases courtes. Vocabulaire dirigeant, pas jargon pédagogique.
- Mettre en avant la valeur métier, pas l'outil.
- Pas de superlatifs vides. Pas de promesses non tenables.

Règles strictes :
1. Tarification — règle Start Academy : 84 € HT par heure et par
   participant, tout compris (ingénierie, montage administratif
   intégral, 2 formateurs, déplacement, outils, zéro avance de
   trésorerie). Tu n'inventes JAMAIS un prix : tu mets
   costPerParticipant, totalEstimatedCost et participantCount à
   null. Le code calcule ces valeurs à partir de
   recommendation.totalDurationHours et diagnostic.expectedParticipants.
   Tu peux EXPLIQUER la tarification dans pricingNote
   (ex : "Tarif Start Academy tout compris : 18 h × 84 € = 1 512 € par participant.").
2. N'invente JAMAIS un nombre de participants. Si le diagnostic ne
   donne pas expectedParticipants, mets participantCount à null.
3. totalEstimatedCost et costPerParticipant sont TOUJOURS null
   dans ta sortie. C'est le code qui injecte les valeurs après ta
   réponse.
4. Utilise UNIQUEMENT les modules fournis dans la recommandation.
   N'ajoute aucun module fantôme. Reformule leur intitulé en titre
   commercial clair (par exemple "Maîtriser ChatGPT métier conseiller"
   plutôt que "Chat gpt").
5. Chaque module doit avoir un whyThisModule qui le relie à un
   besoin détecté ou à un signal du diagnostic — pas de générique.
6. Le mail dirigeant est PRÊT À RELIRE. Tu ne l'envoies pas. Il
   doit s'ouvrir par une accroche personnalisée si possible.
7. Le package communication interne aide le dirigeant à diffuser
   la formation à son équipe — message WhatsApp court (3-4 lignes),
   email interne (paragraphe), pitch réunion (5 lignes), post
   LinkedIn (3 phrases).
8. Les prochaines étapes doivent IMPÉRATIVEMENT contenir, dans cet
   ordre logique : 1) valider la formation, 2) positionner les
   dates, 3) transmettre le lien aux collaborateurs, 4) collecter
   les documents, 5) préparer les cas concrets.
9. confidenceScore reflète ta certitude (0-100). Diminue-le quand
   informations clés manquent (prix, participants, objectif).
10. Reste concis. Pas de paragraphes interminables. La proposition
    doit pouvoir se lire en 3 minutes.
11. Retourne UNIQUEMENT un objet JSON valide conforme au schéma.
    Pas de markdown, pas de texte hors JSON.`;

function formatClient(client: ClientRecord | null): string {
  if (!client) return "Client inconnu — utilise un ton générique.";
  return [
    `Entreprise: ${client.companyName}`,
    `Dirigeant: ${client.director ?? "inconnu"}`,
    `Email: ${client.email ?? "inconnu"}`,
    `Collaborateurs: ${client.collaboratorsCount ?? "non précisé"}`,
    `Profils ciblés: ${
      client.teamTypology.length > 0 ? client.teamTypology.join(", ") : "non précisé"
    }`,
  ].join("\n");
}

function formatDiagnostic(diagnostic: DiagnosticRecord): string {
  return [
    `Mode: ${diagnostic.mode}`,
    `Statut: ${diagnostic.status}`,
    `Profils concernés: ${
      diagnostic.profilesInScope.length > 0
        ? diagnostic.profilesInScope.join(", ")
        : "non précisés"
    }`,
    `Participants attendus: ${diagnostic.expectedParticipants ?? "non précisé"}`,
    `Objectif déclaré: ${diagnostic.declaredGoal ?? "non précisé"}`,
  ].join("\n");
}

function formatRecommendation(recommendation: Recommendation): string {
  const modules = recommendation.recommendedModules
    .map(
      (m, idx) =>
        `${idx + 1}. [${m.moduleId}] ${m.moduleName}\n` +
        `   - Durée: ${m.durationHours} h\n` +
        `   - Priorité: ${m.priority}\n` +
        `   - Raison: ${m.reason}\n` +
        (m.businessRatioTargeted
          ? `   - Ratio visé: ${m.businessRatioTargeted}\n`
          : "") +
        (m.useCases.length > 0
          ? `   - Cas d'usage: ${m.useCases.join(" | ")}\n`
          : "")
    )
    .join("\n");

  return [
    `Synthèse client: ${recommendation.clientSummary}`,
    `Besoins détectés: ${recommendation.detectedNeeds.join(" | ") || "—"}`,
    `Problèmes de performance: ${
      recommendation.performanceIssues.join(" | ") || "—"
    }`,
    `Maturité outils: ${recommendation.toolMaturity}`,
    `Niveau métier: ${recommendation.skillLevel}`,
    `Prérequis socle: ${recommendation.requiredFoundations.join(", ") || "—"}`,
    `Durée totale recommandée: ${recommendation.totalDurationHours} h`,
    `Coût par participant recommandé: ${
      recommendation.costPerParticipant === null
        ? "non disponible"
        : `${recommendation.costPerParticipant} €`
    }`,
    `Score de confiance amont: ${recommendation.confidenceScore}/100`,
    `Informations manquantes amont: ${
      recommendation.missingInformation.join(" | ") || "—"
    }`,
    `\nModules retenus (${recommendation.recommendedModules.length}) :\n${modules}`,
    `\nArgumentaire commercial amont :\n${recommendation.commercialExplanation}`,
  ].join("\n");
}

const RESPONSE_SHAPE = `{
  "proposalTitle": "string — titre vendable",
  "executiveSummary": "string — 4 à 6 phrases",
  "trainingProgram": {
    "totalDurationHours": 0,
    "suggestedFormat": "string — ex. présentiel 2 jours / blended / distanciel",
    "targetAudience": "string — qui suit la formation",
    "pedagogicalObjectives": ["string"],
    "modules": [
      {
        "title": "string — titre commercial",
        "durationHours": 0,
        "whyThisModule": "string — relier à un besoin détecté",
        "themes": ["string"],
        "businessUseCases": ["string"],
        "expectedOutcomes": ["string"]
      }
    ]
  },
  "pricing": {
    "costPerParticipant": null,
    "participantCount": null,
    "totalEstimatedCost": null,
    "pricingNote": "string ou null"
  },
  "nextStepsGuide": {
    "steps": [
      { "title": "Valider la formation", "description": "...", "actionRequired": "..." },
      { "title": "Positionner les dates", "description": "...", "actionRequired": "..." },
      { "title": "Transmettre le lien aux collaborateurs", "description": "...", "actionRequired": "..." },
      { "title": "Collecter les documents", "description": "...", "actionRequired": "..." },
      { "title": "Préparer les cas concrets", "description": "...", "actionRequired": "..." }
    ]
  },
  "executiveEmail": {
    "subject": "string — objet du mail dirigeant",
    "body": "string — corps complet, à relire"
  },
  "internalCommunicationPack": {
    "whatsappMessage": "string — court",
    "internalEmail": "string — paragraphe",
    "teamMeetingPitch": "string — pitch 5 lignes",
    "linkedinPost": "string — 3 phrases"
  },
  "missingInformation": ["string"],
  "confidenceScore": 0
}`;

export interface ProposalPromptInputs {
  client: ClientRecord | null;
  diagnostic: DiagnosticRecord;
  recommendation: Recommendation;
}

export interface BuiltProposalPrompt {
  system: string;
  user: string;
}

export function buildProposalPrompt(
  inputs: ProposalPromptInputs
): BuiltProposalPrompt {
  const user = `# Contexte client

${formatClient(inputs.client)}

# Diagnostic

${formatDiagnostic(inputs.diagnostic)}

# Recommandation validée

${formatRecommendation(inputs.recommendation)}

# Format de sortie attendu

Retourne strictement un JSON respectant ce schéma :

${RESPONSE_SHAPE}

Rappels :
- N'invente ni prix ni nombre de participants.
- Les nextStepsGuide.steps doivent suivre l'ordre indiqué.
- executiveEmail.subject ET executiveEmail.body sont obligatoires.
- Retourne UNIQUEMENT le JSON, sans texte autour.`;

  return { system: SYSTEM_PROMPT, user };
}
