-- =============================================================================
-- funding_config — seeds AGEFICE présentiel millésime 2026.
--
-- Deux clés additives :
--   * FOLLOWUP_HOURS_MULTIPLIER = 1
--       heures_dossier = heures_formation * (1 + FOLLOWUP_HOURS_MULTIPLIER)
--   * AGEFICE_HOURLY_CAP_PRESENTIEL_2026 = 42
--       plafond = heures_dossier * AGEFICE_HOURLY_CAP_PRESENTIEL_2026
--
-- Invariant de cohérence avec le seed
-- `PRICE_PER_HOUR_PER_PARTICIPANT` (= 84, migration 20260717120000) :
--   PRICE_PER_HOUR_PER_PARTICIPANT * heures_formation
--     === AGEFICE_HOURLY_CAP_PRESENTIEL_2026 * heures_dossier
-- Un test unitaire verrouille l'égalité (fail-si-divergence).
--
-- Pattern identique aux 5 seeds existants : ligne unique active par
-- clé grâce à `funding_config_active_key_uidx` (index partiel UNIQUE
-- sur `key WHERE valid_to IS NULL`). Toute évolution future se fait
-- par rotation `valid_to = current_date` + nouveau INSERT.
-- =============================================================================

insert into public.funding_config (key, value_numeric, notes) values
  (
    'FOLLOWUP_HOURS_MULTIPLIER',
    1,
    'Ratio d''heures forfaitées ajoutées aux heures de formation pour construire heures_dossier (heures_dossier = heures_formation * (1 + FOLLOWUP_HOURS_MULTIPLIER)).'
  ),
  (
    'AGEFICE_HOURLY_CAP_PRESENTIEL_2026',
    42,
    'Plafond horaire AGEFICE présentiel appliqué aux heures_dossier — millésime 2026.'
  );
