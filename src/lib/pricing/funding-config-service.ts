import "server-only";

import {
  AGEFICE_HOURLY_CAP_PRESENTIEL_2026,
  FOLLOWUP_HOURS_MULTIPLIER,
} from "./agefice-presentiel-funding";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Service de lecture du référentiel `funding_config`.
 *
 * Best-effort — ne jette JAMAIS. Si Supabase est indisponible ou si
 * une clé est absente en base, on retombe sur les valeurs par défaut
 * exportées par `training-funding.ts` (rétro-compat MVP).
 */

export interface FundingConfig {
  ageficeThreshold: number;
  ageficeAnnualCap: number;
  opcoEpAnnualCap: number;
  consumptionLeverPercent: number;
  /**
   * Tarif horaire par participant, tout compris (ingénierie, montage
   * administratif intégral, 2 formateurs, déplacement, outils, zéro
   * avance de trésorerie). Seedé par la migration
   * `20260717120000_add_price_per_hour_seed.sql`.
   */
  pricePerHourPerParticipant: number;
  /**
   * Ratio d'heures forfaitées ajoutées aux heures de formation pour
   * construire heures_dossier
   * (heures_dossier = heures_formation * (1 + followupHoursMultiplier)).
   * Seedé par `20260720120000_add_agefice_presentiel_2026_seeds.sql`.
   */
  followupHoursMultiplier: number;
  /**
   * Plafond horaire AGEFICE présentiel millésime 2026 appliqué aux
   * heures_dossier (plafond = heures_dossier * ageficeHourlyCapPresentiel2026).
   * Seedé par `20260720120000_add_agefice_presentiel_2026_seeds.sql`.
   */
  ageficeHourlyCapPresentiel2026: number;
}

/**
 * Défauts alignés avec les constantes de `training-funding.ts` (v1.0
 * du référentiel). Utilisés en fallback lorsque `funding_config` est
 * inaccessible OU quand la clé n'a pas de ligne active.
 *
 * ⚠️ `pricePerHourPerParticipant` DOIT rester aligné sur la valeur du
 * seed `PRICE_PER_HOUR_PER_PARTICIPANT` de la migration
 * `20260717120000_add_price_per_hour_seed.sql`. Un test de contrat
 * verrouille l'invariant (fail-si-divergence, pattern F-1).
 */
export const DEFAULT_FUNDING_CONFIG: FundingConfig = {
  ageficeThreshold: 7000,
  ageficeAnnualCap: 3000,
  opcoEpAnnualCap: 2500,
  consumptionLeverPercent: 30,
  pricePerHourPerParticipant: 84,
  followupHoursMultiplier: FOLLOWUP_HOURS_MULTIPLIER,
  ageficeHourlyCapPresentiel2026: AGEFICE_HOURLY_CAP_PRESENTIEL_2026,
};

type ConfigRow = {
  key: string;
  value_numeric: number | string | null;
};

function toNumberOrNull(
  raw: number | string | null | undefined
): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Charge la config active (`valid_to IS NULL` — cf. index unique
 * partiel `funding_config_active_key_uidx`). Toute clé absente
 * retombe silencieusement sur son défaut.
 */
export async function getActiveFundingConfig(): Promise<FundingConfig> {
  const client = createSupabaseAdminClient();
  if (!client) return { ...DEFAULT_FUNDING_CONFIG };
  try {
    const { data, error } = await client
      .from("funding_config")
      .select("key, value_numeric")
      .is("valid_to", null);
    if (error || !data) return { ...DEFAULT_FUNDING_CONFIG };

    const byKey = new Map<string, number>();
    for (const row of data as ConfigRow[]) {
      const n = toNumberOrNull(row.value_numeric);
      if (n !== null) byKey.set(row.key, n);
    }

    return {
      ageficeThreshold:
        byKey.get("AGEFICE_THRESHOLD") ?? DEFAULT_FUNDING_CONFIG.ageficeThreshold,
      ageficeAnnualCap:
        byKey.get("AGEFICE_ANNUAL_CAP") ??
        DEFAULT_FUNDING_CONFIG.ageficeAnnualCap,
      opcoEpAnnualCap:
        byKey.get("OPCO_EP_ANNUAL_CAP") ??
        DEFAULT_FUNDING_CONFIG.opcoEpAnnualCap,
      consumptionLeverPercent:
        byKey.get("CONSUMPTION_LEVER_PERCENT") ??
        DEFAULT_FUNDING_CONFIG.consumptionLeverPercent,
      pricePerHourPerParticipant:
        byKey.get("PRICE_PER_HOUR_PER_PARTICIPANT") ??
        DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant,
      followupHoursMultiplier:
        byKey.get("FOLLOWUP_HOURS_MULTIPLIER") ??
        DEFAULT_FUNDING_CONFIG.followupHoursMultiplier,
      ageficeHourlyCapPresentiel2026:
        byKey.get("AGEFICE_HOURLY_CAP_PRESENTIEL_2026") ??
        DEFAULT_FUNDING_CONFIG.ageficeHourlyCapPresentiel2026,
    };
  } catch {
    return { ...DEFAULT_FUNDING_CONFIG };
  }
}
