import type { Pricing } from "@/lib/ai/proposal-schema";
import {
  estimateTrainingFunding,
  type ParticipantProfessionalStatus,
  type RuntimeFundingConfig,
} from "@/lib/pricing/training-funding";
import {
  buildPricingNote,
  calculateCostPerParticipant,
  calculateTotalTrainingBudget,
} from "@/lib/pricing/training-pricing";

/**
 * Applique la règle tarifaire Start Academy sur un objet `Pricing` :
 * cost/participant = totalDurationHours × pricePerHourPerParticipant,
 * total = cost × participantCount, note fallback si l'un des paramètres
 * manque.
 *
 * `participants` optionnel : si fourni ET costPerParticipant calculé,
 * délègue à `estimateTrainingFunding` (qui applique la branche indé
 * AGEFICE présentiel horaire quand `totalDurationHours` est fourni).
 * L'absence de propagation ferait retomber le champ
 * `ageficePresentielCoverage` sur `null` — c'est ce que le test de
 * contrat (i) refuse.
 *
 * Module pur, importable depuis les tests bout-à-bout.
 */
export function applyStartAcademyPricing(
  totalDurationHours: number | null,
  participantCount: number | null,
  pricePerHourPerParticipant: number,
  participants:
    | {
        professionalStatus: ParticipantProfessionalStatus | null;
        previousYearProduction: number | null;
        eligibleOpco?: boolean | null;
        ageficeAmountConsumedCurrentYear?: number | null;
      }[]
    | null = null,
  opcoEpAmountConsumedCurrentYear: number | null = null,
  /**
   * Config runtime chargée depuis `funding_config` (seuils AGEFICE,
   * plafonds OPCO EP, cap horaire présentiel…). Correctif 2 du lot
   * fiabilité : le chemin production DOIT passer la config lue en base
   * jusqu'au moteur — plus aucune constante en dur ne doit gouverner
   * les décisions de plafonnement / éligibilité côté route
   * `/api/generate-training-proposal`.
   *
   * `undefined` = comportement historique (défauts MVP). Réservé aux
   * tests unitaires qui isolent le module pur.
   */
  config?: RuntimeFundingConfig
): Pricing {
  const costPerParticipant = calculateCostPerParticipant(
    totalDurationHours,
    pricePerHourPerParticipant
  );
  const totalEstimatedCost = calculateTotalTrainingBudget(
    totalDurationHours,
    participantCount,
    pricePerHourPerParticipant
  );

  let estimatedFundingTotal: number | null = null;
  let estimatedRemainingCost: number | null = null;
  let eligibleParticipantCount: number | null = null;
  let fundingDisclaimer: string | null = null;
  let ageficePresentielCoverage: Pricing["ageficePresentielCoverage"] = null;
  let fundingNotes: string[] = [];
  if (participants && participants.length > 0 && costPerParticipant !== null) {
    const summary = estimateTrainingFunding({
      participants,
      costPerParticipant,
      totalBudget: totalEstimatedCost,
      opcoEpAmountConsumedCurrentYear,
      trainingHours: totalDurationHours,
      config,
    });
    estimatedFundingTotal = summary.estimatedFundingTotal;
    estimatedRemainingCost = summary.estimatedRemainingCost;
    eligibleParticipantCount = summary.eligibleParticipantCount;
    fundingDisclaimer = summary.disclaimer;
    ageficePresentielCoverage = summary.ageficePresentielCoverage;
    fundingNotes = summary.perParticipantNotes;
  }

  return {
    costPerParticipant,
    participantCount,
    totalEstimatedCost,
    pricingNote:
      totalEstimatedCost === null
        ? buildPricingNote({
            totalDurationHours,
            participantCount,
            pricePerHourPerParticipant,
          })
        : null,
    estimatedFundingTotal,
    estimatedRemainingCost,
    eligibleParticipantCount,
    fundingDisclaimer,
    ageficePresentielCoverage,
    fundingNotes,
  };
}
