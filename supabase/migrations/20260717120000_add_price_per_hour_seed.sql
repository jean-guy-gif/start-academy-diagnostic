-- =============================================================================
-- funding_config — seed PRICE_PER_HOUR_PER_PARTICIPANT
--
-- Origine : refonte tarif Start Academy 2026-07-17.
--
-- Le tarif horaire par participant vivait en dur dans
-- `src/lib/pricing/training-pricing.ts` à 42 € (constante
-- `PRICE_PER_HOUR_PER_PARTICIPANT`). Cette valeur sous-évaluait toutes
-- les propositions générées d'un facteur 2 par rapport au tarif réel
-- Start Academy (84 €/h par participant, tout compris).
--
-- Cette migration porte le tarif dans le référentiel versionné
-- `funding_config`, pattern identique aux 4 seeds existants
-- (AGEFICE_THRESHOLD, AGEFICE_ANNUAL_CAP, OPCO_EP_ANNUAL_CAP,
-- CONSUMPTION_LEVER_PERCENT). Toute évolution future passera par une
-- rotation `valid_to = current_date` + nouveau INSERT, jamais par un
-- UPDATE en place.
--
-- ⚠️ SOURCE UNIQUE — La valeur ci-dessous DOIT rester alignée sur
-- `DEFAULT_FUNDING_CONFIG.pricePerHourPerParticipant` dans
-- `src/lib/pricing/funding-config-service.ts` (fallback si Supabase
-- indisponible). Un test de contrat verrouille l'invariant :
--   src/lib/pricing/pricing-config.contract.test.ts
-- (parse ce fichier de migration + compare à la constante JS, fail
-- si l'un des deux bords dérive — leçon T-3 / T-4 / F-1).
-- =============================================================================

insert into public.funding_config (key, value_numeric, notes) values
  (
    'PRICE_PER_HOUR_PER_PARTICIPANT',
    84,
    'Tarif horaire par participant — inclut ingénierie, montage administratif intégral, 2 formateurs, déplacement, outils, zéro avance de trésorerie.'
  );
