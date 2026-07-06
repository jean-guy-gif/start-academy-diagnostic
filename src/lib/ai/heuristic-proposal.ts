import type {
  ClientRecord,
  DiagnosticRecord,
} from "@/lib/diagnostics/diagnostic-service";
import type { Recommendation } from "./recommendation-schema";
import type {
  ExecutiveEmail,
  InternalCommunicationPack,
  NextStepsGuide,
  Pricing,
  Proposal,
  TrainingProgram,
} from "./proposal-schema";
import {
  buildPricingNote,
  calculateCostPerParticipant,
  calculateTotalTrainingBudget,
  formatPriceEuros,
} from "@/lib/pricing/training-pricing";

/**
 * Fallback heuristique pour la génération de proposition.
 * Aucune dépendance LLM. Tout se reconstruit depuis la
 * recommandation validée et le contexte client.
 */

interface HeuristicInputs {
  client: ClientRecord | null;
  diagnostic: DiagnosticRecord;
  recommendation: Recommendation;
}

const STEP_TEMPLATES: { title: string; description: string; actionRequired: string }[] = [
  {
    title: "Valider la formation",
    description:
      "Relire la proposition, ajuster modules ou durée si besoin, puis confirmer le lancement.",
    actionRequired: "Réponse écrite ou validation via le lien dédié.",
  },
  {
    title: "Positionner les dates",
    description:
      "Choisir les créneaux qui conviennent à l'équipe sur les semaines à venir.",
    actionRequired: "Proposer ou valider deux à trois créneaux.",
  },
  {
    title: "Transmettre le lien aux collaborateurs",
    description:
      "Diffuser le lien de collecte pour que chaque participant prépare la formation.",
    actionRequired: "Partager le lien à l'équipe ciblée.",
  },
  {
    title: "Collecter les documents",
    description:
      "Centraliser les supports, scripts, modèles et données métier que la formation va exploiter.",
    actionRequired: "Déposer les fichiers via le lien fourni.",
  },
  {
    title: "Préparer les cas concrets",
    description:
      "Chaque participant identifie un dossier réel à travailler pendant la formation.",
    actionRequired: "Sélectionner un cas vendeur ou acquéreur par participant.",
  },
];

function buildProgram(rec: Recommendation, diag: DiagnosticRecord): TrainingProgram {
  const modules = rec.recommendedModules.map((m) => ({
    title: m.moduleName,
    durationHours: m.durationHours,
    whyThisModule: m.reason,
    themes: m.useCases.slice(0, 3),
    businessUseCases: m.useCases,
    expectedOutcomes: m.businessRatioTargeted
      ? [`Améliorer le ratio : ${m.businessRatioTargeted}`]
      : [],
  }));

  const objectives = rec.detectedNeeds.length > 0
    ? rec.detectedNeeds.slice(0, 5)
    : ["Augmenter la performance commerciale", "Outiller l'équipe avec l'IA métier"];

  const totalDurationHours = modules.reduce((s, m) => s + m.durationHours, 0);

  const profiles = diag.profilesInScope;
  const targetAudience =
    profiles.length > 0
      ? `Profils ciblés : ${profiles.join(", ")}.`
      : "Équipe commerciale à préciser.";

  const suggestedFormat =
    totalDurationHours <= 7
      ? "Présentiel 1 journée"
      : totalDurationHours <= 14
        ? "Présentiel 2 jours (option blended : ½ distanciel)"
        : "Parcours mixte présentiel + distanciel sur 3 à 4 semaines";

  return {
    totalDurationHours,
    suggestedFormat,
    targetAudience,
    pedagogicalObjectives: objectives,
    modules,
  };
}

function buildPricing(
  rec: Recommendation,
  diag: DiagnosticRecord
): Pricing {
  // Règle tarifaire Start Academy : 1 h = 42 € / participant.
  // Calcul effectué par le code — JAMAIS par le LLM. La valeur que
  // `rec.costPerParticipant` aurait pu contenir est ignorée.
  // Note : ce chemin heuristique n'a pas accès aux diagnostic_participants
  // (côté serveur, async). Les champs funding restent null ici — la
  // route /api/generate-training-proposal applique l'estimation
  // complète quand elle utilise le LLM ou injecte côté serveur.
  const participantCount = diag.expectedParticipants ?? null;
  const costPerParticipant = calculateCostPerParticipant(rec.totalDurationHours);
  const totalEstimatedCost = calculateTotalTrainingBudget(
    rec.totalDurationHours,
    participantCount
  );
  const pricingNote = buildPricingNote({
    totalDurationHours: rec.totalDurationHours,
    participantCount,
  });
  return {
    costPerParticipant,
    participantCount,
    totalEstimatedCost,
    pricingNote: totalEstimatedCost !== null ? null : pricingNote,
    estimatedFundingTotal: null,
    estimatedRemainingCost: null,
    eligibleParticipantCount: null,
    fundingDisclaimer: null,
  };
}

function buildNextSteps(): NextStepsGuide {
  return { steps: STEP_TEMPLATES.map((s) => ({ ...s })) };
}

function buildExecutiveEmail(
  client: ClientRecord | null,
  rec: Recommendation,
  program: TrainingProgram,
  pricing: Pricing
): ExecutiveEmail {
  const companyName = client?.companyName ?? "votre équipe";
  const director = client?.director;
  const greeting = director ? `Bonjour ${director},` : "Bonjour,";

  const moduleLines = program.modules
    .slice(0, 6)
    .map((m, idx) => `${idx + 1}. ${m.title} (${m.durationHours} h) — ${m.whyThisModule}`)
    .join("\n");

  const pricingLine =
    pricing.costPerParticipant !== null
      ? pricing.participantCount !== null
        ? `Budget estimé : ${formatPriceEuros(pricing.totalEstimatedCost)} pour ${pricing.participantCount} participant(s) — ${formatPriceEuros(pricing.costPerParticipant)} par personne (1 h = 42 € / participant).`
        : `Budget : ${formatPriceEuros(pricing.costPerParticipant)} par participant (1 h = 42 €). Nombre exact de participants à confirmer.`
      : "Durée totale à finaliser — le budget sera calculé automatiquement (1 h = 42 € / participant).";

  const subject = `${rec.clientSummary.split(".")[0].trim() || "Proposition de formation"} — Start Academy`;

  const body = `${greeting}

Suite à notre échange, voici la proposition de formation pour ${companyName}.

Synthèse :
${rec.clientSummary}

Programme recommandé (${program.totalDurationHours} h, format : ${program.suggestedFormat}) :
${moduleLines}

Objectifs :
${program.pedagogicalObjectives.map((o) => `- ${o}`).join("\n")}

${pricingLine}

Prochaines étapes : valider la formation, positionner les dates, transmettre le lien aux collaborateurs, collecter les documents et préparer les cas concrets de votre équipe.

Je reste à votre disposition pour ajuster le programme si besoin.

Bien à vous,
L'équipe Start Academy`;

  return { subject, body };
}

function buildCommsPack(
  client: ClientRecord | null,
  program: TrainingProgram
): InternalCommunicationPack {
  const company = client?.companyName ?? "notre équipe";
  const moduleHighlights = program.modules
    .slice(0, 3)
    .map((m) => m.title)
    .join(", ");

  return {
    whatsappMessage: `Équipe ${company} — on lance une formation Start Academy sur ${program.totalDurationHours} h pour booster nos résultats commerciaux. Détails et dates à venir.`,
    internalEmail: `Bonjour à toutes et tous,\n\nNous lançons une formation Start Academy pour renforcer notre performance commerciale. Le programme couvre ${moduleHighlights} et s'appuiera sur des cas concrets de notre activité. Vous recevrez prochainement le lien pour préparer vos sujets et déposer vos documents.\n\nMerci d'avance pour votre engagement.`,
    teamMeetingPitch: `Sujet : montée en puissance commerciale.\nObjectif : ${program.pedagogicalObjectives[0] ?? "améliorer nos ratios commerciaux"}.\nFormat : ${program.suggestedFormat}.\nDurée : ${program.totalDurationHours} h.\nApproche : chaque module traite un cas concret de notre activité — pas de théorie déconnectée du terrain.`,
    linkedinPost: `Chez ${company}, nous investissons dans la performance de nos équipes commerciales avec Start Academy. Programme sur-mesure : ${moduleHighlights}. L'objectif est simple : plus d'impact terrain, plus de mandats, plus de transformations.`,
  };
}

export function buildHeuristicProposal(inputs: HeuristicInputs): Proposal {
  const program = buildProgram(inputs.recommendation, inputs.diagnostic);
  const pricing = buildPricing(inputs.recommendation, inputs.diagnostic);
  const nextStepsGuide = buildNextSteps();
  const executiveEmail = buildExecutiveEmail(
    inputs.client,
    inputs.recommendation,
    program,
    pricing
  );
  const internalCommunicationPack = buildCommsPack(inputs.client, program);

  const missingInformation: string[] = [];
  if (pricing.costPerParticipant === null) {
    missingInformation.push(
      "Règle tarifaire non disponible — coût par participant à valider en interne."
    );
  }
  if (pricing.participantCount === null) {
    missingInformation.push(
      "Nombre exact de participants à confirmer avec le client."
    );
  }
  if (!inputs.diagnostic.declaredGoal) {
    missingInformation.push(
      "Objectif dirigeant non renseigné — à reformuler avant envoi."
    );
  }

  const company = inputs.client?.companyName ?? "équipe à qualifier";
  const proposalTitle = `Parcours de formation Start Academy — ${company}`;

  const executiveSummary = `${inputs.recommendation.clientSummary} La proposition cible ${program.totalDurationHours} h de formation au format ${program.suggestedFormat.toLowerCase()}, structurée autour de ${program.modules.length} module(s). Elle adresse les besoins détectés en s'appuyant sur des cas réels de l'agence.`;

  // Confidence : entre 50 et 75 en fallback (PRD anti-survente).
  const informationGaps = missingInformation.length;
  const confidenceScore = Math.max(
    50,
    Math.min(
      75,
      Math.round(75 - informationGaps * 5 + inputs.recommendation.confidenceScore / 10)
    )
  );

  return {
    proposalTitle,
    executiveSummary,
    trainingProgram: program,
    pricing,
    nextStepsGuide,
    executiveEmail,
    internalCommunicationPack,
    missingInformation,
    confidenceScore,
  };
}
