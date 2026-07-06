-- =============================================================================
-- Extend ai_generation_logs : monitoring IA / coûts OpenRouter
-- =============================================================================
-- Complète la table existante avec les champs de suivi consommation
-- IA décrits dans `docs/ai-monitoring-prd.md` :
--   - `route`           : route API qui a généré l'appel
--   - `source`          : 'llm' ou 'heuristic' (fallback détecté)
--   - `total_tokens`    : tokens_input + tokens_output, redondant mais
--                         pratique pour les agrégations
--   - status            : ajout de la valeur 'fallback' pour distinguer
--                         un succès LLM d'un succès via heuristique
-- Le coût estimé reste sur la colonne `cost_estimate` existante (euros).
-- =============================================================================

alter table public.ai_generation_logs
  add column if not exists route        text,
  add column if not exists source       text,
  add column if not exists total_tokens integer;

-- Source : enum applicatif libre, null toléré pour les anciennes lignes.
alter table public.ai_generation_logs
  drop constraint if exists ai_generation_logs_source_check;
alter table public.ai_generation_logs
  add constraint ai_generation_logs_source_check
  check (source is null or source in ('llm', 'heuristic'));

-- Status : autorise désormais 'fallback' en plus de
-- success / error / partial (la valeur 'partial' existait déjà MVP1).
alter table public.ai_generation_logs
  drop constraint if exists ai_generation_logs_status_check;
alter table public.ai_generation_logs
  add constraint ai_generation_logs_status_check
  check (status in ('success', 'error', 'partial', 'fallback'));

create index if not exists ai_generation_logs_route_idx
  on public.ai_generation_logs (route);
create index if not exists ai_generation_logs_source_idx
  on public.ai_generation_logs (source);
create index if not exists ai_generation_logs_created_at_idx
  on public.ai_generation_logs (created_at desc);
