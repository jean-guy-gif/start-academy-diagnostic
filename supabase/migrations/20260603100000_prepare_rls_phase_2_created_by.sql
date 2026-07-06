-- =============================================================================
-- Start Academy — RLS Phase 2 preparation : created_by defaults
--
-- Objectif :
--   Garantir que `created_by` est renseigné automatiquement à
--   `auth.uid()` quand un user authentifié insère une ligne et
--   n'a pas explicitement précisé `created_by`.
--
-- Pourquoi maintenant :
--   Avant la Phase 2B (durcissement par ownership), il faut être sûr
--   que toutes les lignes existantes ET FUTURES ont un `created_by`
--   exploitable par les policies. Sans cela, le commercial qui crée
--   un client perdrait l'accès à sa propre ligne (created_by null →
--   policy `created_by = auth.uid()` refuse).
--
-- Comportement :
--   - Browser-side (cookie auth) : `auth.uid()` renvoie l'utilisateur,
--     le trigger défaute `created_by`.
--   - service_role (routes serveur) : `auth.uid()` renvoie NULL ; le
--     trigger n'écrase rien. Si la route passe un `created_by`
--     explicite (cf. routes IA, create-access-link, etc.), il est
--     conservé.
--   - Routes publiques anon (submit-participant, upload-document,
--     select-date-option) : `auth.uid()` NULL — `created_by` reste
--     NULL, ce qui est le comportement souhaité (l'écriture vient
--     d'un participant non authentifié).
--
-- Sécurité :
--   - Pas de SECURITY DEFINER : le trigger lit uniquement `NEW` et
--     `auth.uid()`, opération non privilégiée. Le runner est
--     l'invocateur, donc soumis à RLS — pas de fuite.
--   - `search_path` n'est pas critique ici (pas d'écriture
--     cross-schema) mais on le force par hygiène.
-- =============================================================================

create or replace function public.set_created_by_if_null()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers BEFORE INSERT.
--
-- Liste des tables qui possèdent une colonne `created_by` (vérifié
-- dans les migrations existantes). `activity_logs` n'est pas dans la
-- liste : elle a `actor_id` à la place et son écriture passe
-- exclusivement par `createActivityLog` côté serveur, qui pose
-- `actor_id` explicitement.
-- -----------------------------------------------------------------------------

drop trigger if exists clients_set_created_by                  on public.clients;
drop trigger if exists diagnostics_set_created_by              on public.diagnostics;
drop trigger if exists transcripts_set_created_by              on public.transcripts;
drop trigger if exists recommendations_set_created_by          on public.recommendations;
drop trigger if exists training_sessions_set_created_by        on public.training_sessions;
drop trigger if exists public_access_tokens_set_created_by     on public.public_access_tokens;
drop trigger if exists ai_generation_logs_set_created_by       on public.ai_generation_logs;
drop trigger if exists training_supports_set_created_by        on public.training_supports;
drop trigger if exists designed_training_supports_set_created_by
  on public.designed_training_supports;
drop trigger if exists session_date_options_set_created_by     on public.session_date_options;

create trigger clients_set_created_by
  before insert on public.clients
  for each row execute function public.set_created_by_if_null();

create trigger diagnostics_set_created_by
  before insert on public.diagnostics
  for each row execute function public.set_created_by_if_null();

create trigger transcripts_set_created_by
  before insert on public.transcripts
  for each row execute function public.set_created_by_if_null();

create trigger recommendations_set_created_by
  before insert on public.recommendations
  for each row execute function public.set_created_by_if_null();

create trigger training_sessions_set_created_by
  before insert on public.training_sessions
  for each row execute function public.set_created_by_if_null();

create trigger public_access_tokens_set_created_by
  before insert on public.public_access_tokens
  for each row execute function public.set_created_by_if_null();

create trigger ai_generation_logs_set_created_by
  before insert on public.ai_generation_logs
  for each row execute function public.set_created_by_if_null();

create trigger training_supports_set_created_by
  before insert on public.training_supports
  for each row execute function public.set_created_by_if_null();

create trigger designed_training_supports_set_created_by
  before insert on public.designed_training_supports
  for each row execute function public.set_created_by_if_null();

create trigger session_date_options_set_created_by
  before insert on public.session_date_options
  for each row execute function public.set_created_by_if_null();

-- =============================================================================
-- Notes :
--   - Idempotent : recréer les triggers ne casse rien.
--   - Aucune policy modifiée par cette migration — Phase 2A à venir.
-- =============================================================================
