-- =============================================================================
-- Start Academy — Réalignement `source` check_constraint sur
-- `training_supports` et `designed_training_supports`.
--
-- Contexte : le type applicatif est `TrainingSupportSource = 'llm' |
-- 'heuristic'` depuis la refonte OpenRouter (cf.
-- `src/lib/ai/training-support-schema.ts`). Les routes API
-- `generate-training-support` et `design-training-support` écrivent
-- littéralement `source: "llm"` ou `source: "heuristic"`. Les
-- migrations d'origine (20260523120000 et 20260523130000) contraignaient
-- pourtant `source in ('openrouter', 'heuristic')` — l'écart a été
-- masqué par un cast TypeScript mensonger côté services de
-- persistance (`as "openrouter" | "heuristic"`), et n'a été révélé
-- que lors du smoke §4 (ticket T-4).
--
-- Correctif : migration additive, non destructive.
--   • On CONSERVE `'openrouter'` — les migrations validées ne sont
--     jamais modifiées ; aucune ligne connue avec cette valeur ne
--     doit être invalidée si une base historique en contient.
--   • On AJOUTE `'llm'` — la valeur réellement émise par le code.
--
-- Cast TypeScript mensonger supprimé côté services dans la même PR
-- (branche `fix/smoke-round-1-blockers`).
-- =============================================================================

alter table public.training_supports
  drop constraint if exists training_supports_source_check;
alter table public.training_supports
  add constraint training_supports_source_check
  check (source in ('openrouter', 'heuristic', 'llm'));

alter table public.designed_training_supports
  drop constraint if exists designed_training_supports_source_check;
alter table public.designed_training_supports
  add constraint designed_training_supports_source_check
  check (source in ('openrouter', 'heuristic', 'llm'));

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Aucune migration de données requise : la table de préprod est
--   vide au moment de ce fix (cf. backup preprod_before_v1.0b du
--   2026-07-07, 0 INSERT/COPY sur ces tables).
-- - Pour toute future valeur `source`, mettre à jour :
--     1. Le check_constraint ici (nouvelle migration additive).
--     2. Le type `TrainingSupportSource` dans
--        `src/lib/ai/training-support-schema.ts`.
--     3. Le test de contrat `training-supports-source-contract.test.ts`
--        qui garantit l'alignement code ↔ base.
