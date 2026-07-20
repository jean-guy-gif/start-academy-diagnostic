import type { Pricing } from "@/lib/ai/proposal-schema";
import {
  estimateTrainingFunding,
  type ParticipantProfessionalStatus,
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
  opcoEpAmountConsumedCurrentYear: number | null = null
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
  if (participants && participants.length > 0 && costPerParticipant !== null) {
    const summary = estimateTrainingFunding({
      participants,
      costPerParticipant,
      totalBudget: totalEstimatedCost,
      opcoEpAmountConsumedCurrentYear,
      trainingHours: totalDurationHours,
    });
    estimatedFundingTotal = summary.estimatedFundingTotal;
    estimatedRemainingCost = summary.estimatedRemainingCost;
    eligibleParticipantCount = summary.eligibleParticipantCount;
    fundingDisclaimer = summary.disclaimer;
    ageficePresentielCoverage = summary.ageficePresentielCoverage;
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
  };
}
