/**
 * Calcul AGEFICE présentiel — millésime 2026.
 *
 * Module pur (pas de Supabase, pas de secret) — importable côté
 * client comme serveur.
 */

// Ratio heures forfaitées / heures de formation. Additif au dossier
// (heures_dossier = heures_formation × (1 + FOLLOWUP_HOURS_MULTIPLIER)).
export const FOLLOWUP_HOURS_MULTIPLIER = 1;

// Plafond horaire AGEFICE présentiel, millésime 2026. Appliqué aux
// heures_dossier.
export const AGEFICE_HOURLY_CAP_PRESENTIEL_2026 = 42;

// Prix facturé par heure et par participant. Réutilise le fallback
// existant de `funding-config-service.ts` (source de vérité DB :
// seed `PRICE_PER_HOUR_PER_PARTICIPANT` migration `20260717120000`).
// Ré-exporté ici uniquement pour l'invariant de cohérence testé.
export const PRICE_PER_HOUR_PER_PARTICIPANT = 84;

export interface AgeficePresentielFundingInput {
  trainingHours: number;
  /**
   * Montant AGEFICE encore disponible pour ce participant sur l'année
   * civile en cours (plafond annuel − consommé). `null` = enveloppe
   * inconnue → l'estimation remonte une alerte, sans montant.
   */
  envelopeRemaining: number | null;
  followupHoursMultiplier?: number;
  hourlyCap?: number;
  pricePerHour?: number;
}

export interface AgeficePresentielFundingResult {
  facture: number;
  heuresDossier: number;
  plafond: number;
  priseEnCharge: number;
  resteACharge: number;
  envelopeRemaining: number | null;
  isFullyCovered: boolean;
  alert: string | null;
}

const ALERT_ENVELOPE_UNKNOWN = "droits à vérifier";

/**
 * heures_dossier = heures_formation × (1 + FOLLOWUP_HOURS_MULTIPLIER)
 * plafond        = heures_dossier × AGEFICE_HOURLY_CAP_PRESENTIEL_2026
 * facture        = heures_formation × PRICE_PER_HOUR_PER_PARTICIPANT
 * prise_en_charge = min(facture, plafond, envelopeRemaining)
 * reste_a_charge  = facture − prise_en_charge
 *
 * `envelopeRemaining === null` → priseEnCharge=0, resteACharge=facture,
 * `alert = "droits à vérifier"`, `isFullyCovered=false`.
 */
export function computeAgeficePresentielFunding(
  input: AgeficePresentielFundingInput
): AgeficePresentielFundingResult {
  const followupMultiplier =
    input.followupHoursMultiplier ?? FOLLOWUP_HOURS_MULTIPLIER;
  const hourlyCap = input.hourlyCap ?? AGEFICE_HOURLY_CAP_PRESENTIEL_2026;
  const pricePerHour = input.pricePerHour ?? PRICE_PER_HOUR_PER_PARTICIPANT;

  const heuresDossier = input.trainingHours * (1 + followupMultiplier);
  const plafond = heuresDossier * hourlyCap;
  const facture = input.trainingHours * pricePerHour;

  if (input.envelopeRemaining === null) {
    return {
      facture,
      heuresDossier,
      plafond,
      priseEnCharge: 0,
      resteACharge: facture,
      envelopeRemaining: null,
      isFullyCovered: false,
      alert: ALERT_ENVELOPE_UNKNOWN,
    };
  }

  const priseEnCharge = Math.min(
    facture,
    plafond,
    input.envelopeRemaining
  );
  const resteACharge = facture - priseEnCharge;
  const isFullyCovered = resteACharge === 0;

  return {
    facture,
    heuresDossier,
    plafond,
    priseEnCharge,
    resteACharge,
    envelopeRemaining: input.envelopeRemaining,
    isFullyCovered,
    alert: null,
  };
}
