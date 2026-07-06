-- =============================================================================
-- Start Academy — Étend `ai_generation_logs.status` pour accepter
-- `rate_limited`.
--
-- Permet au rate limiter (cf. `src/lib/ai/ai-rate-limit-service.ts`)
-- de tracer les refus 429 dans la même table que les générations
-- réussies / fallback / erreur, sans créer de table dédiée.
--
-- Le `source` reste autorisé à NULL pour les lignes `rate_limited`
-- (contrainte déjà permissive sur `source` depuis Phase monitoring).
-- =============================================================================

alter table public.ai_generation_logs
  drop constraint if exists ai_generation_logs_status_check;

alter table public.ai_generation_logs
  add constraint ai_generation_logs_status_check
  check (status in ('success', 'error', 'partial', 'fallback', 'rate_limited'));
