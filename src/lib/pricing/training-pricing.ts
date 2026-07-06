/**
 * Tarification Start Academy — règle unique et centralisée.
 *
 * Règle métier :
 *   1 heure de formation = 42 € HT par participant.
 *
 * - `costPerParticipant` = totalDurationHours × 42
 * - `totalBudget`        = totalDurationHours × 42 × participantCount
 *
 * Cette règle est appliquée par le code, jamais par le LLM. Les prompts
 * de recommandation et de proposition demandent explicitement à
 * Claude de NE PAS inventer de prix — il peut expliquer la tarification,
 * pas la décider.
 *
 * Module pur (pas de Supabase, pas de secret) — importable côté
 * client comme serveur.
 */

export const PRICE_PER_HOUR_PER_PARTICIPANT = 42;

/**
 * Coût d'une formation par participant.
 * Renvoie `null` si la durée totale est manquante ou non valide.
 */
export function calculateCostPerParticipant(
  totalDurationHours: number | null | undefined
): number | null {
  if (
    typeof totalDurationHours !== "number" ||
    !Number.isFinite(totalDurationHours) ||
    totalDurationHours <= 0
  ) {
    return null;
  }
  return Math.round(totalDurationHours * PRICE_PER_HOUR_PER_PARTICIPANT * 100) /
    100;
}

/**
 * Budget total = durée × prix horaire × nombre de participants.
 * Renvoie `null` si une donnée manque — JAMAIS un total faux.
 */
export function calculateTotalTrainingBudget(
  totalDurationHours: number | null | undefined,
  participantCount: number | null | undefined
): number | null {
  if (
    typeof participantCount !== "number" ||
    !Number.isFinite(participantCount) ||
    participantCount <= 0
  ) {
    return null;
  }
  const perPerson = calculateCostPerParticipant(totalDurationHours);
  if (perPerson === null) return null;
  return Math.round(perPerson * participantCount * 100) / 100;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Formatage français pour affichage UI :
 *   42 → "42 €"
 *   1234.5 → "1 235 €"  (arrondi entier — les centimes ne s'affichent
 *                       jamais à l'écran).
 */
export function formatPriceEuros(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return CURRENCY_FORMATTER.format(amount);
}

/**
 * Construit une note explicative à afficher quand le budget ne peut
 * pas être calculé. Centralisée pour cohérence entre proposition,
 * recommandation et fiche session.
 */
export function buildPricingNote(params: {
  totalDurationHours: number | null;
  participantCount: number | null;
}): string {
  if (
    params.totalDurationHours === null ||
    params.totalDurationHours <= 0
  ) {
    return "Durée totale à finaliser — le budget sera calculé automatiquement (1 h = 42 € / participant) dès que la durée sera fixée.";
  }
  if (params.participantCount === null || params.participantCount <= 0) {
    return `Budget par participant : ${formatPriceEuros(
      calculateCostPerParticipant(params.totalDurationHours)
    )}. Budget total dès confirmation du nombre de participants.`;
  }
  return `Budget : 1 h = 42 € / participant × ${params.totalDurationHours} h × ${params.participantCount} participants.`;
}
