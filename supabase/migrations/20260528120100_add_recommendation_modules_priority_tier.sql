-- =============================================================================
-- Start Academy — Phasage des modules recommandés (priority_tier)
--
-- Ajoute un champ qualitatif aux modules recommandés en plus de
-- `position` (ordre numérique préservé pour le tri historique).
--
-- Tiers :
--   - essential    : Parcours prioritaire — modules à programmer en premier
--   - recommended  : Modules à intégrer dans le parcours principal
--   - optional     : Modules complémentaires si budget / temps disponibles
--   - later        : À planifier dans une phase 2/3 ultérieure
--
-- Backward-compat : null acceptée. Les recommandations historiques
-- restent affichables (UI traite null comme "recommended").
-- =============================================================================

alter table public.recommendation_modules
  add column if not exists priority_tier text;

alter table public.recommendation_modules
  drop constraint if exists recommendation_modules_priority_tier_check;

alter table public.recommendation_modules
  add constraint recommendation_modules_priority_tier_check
  check (
    priority_tier is null
    or priority_tier in ('essential', 'recommended', 'optional', 'later')
  );

create index if not exists recommendation_modules_priority_tier_idx
  on public.recommendation_modules (priority_tier);
