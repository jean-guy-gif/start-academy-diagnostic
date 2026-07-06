-- =============================================================================
-- Start Academy — Journal d'activité interne (activity_logs)
--
-- Trace immuable des événements métier d'un dossier formation.
-- Lecture : équipe interne Start Academy (rôles admin/commercial/trainer)
-- Écriture : routes serveur uniquement (via service_role), jamais anon.
--
-- Ne JAMAIS logger :
--   - token brut / token_hash
--   - contenu d'une CNI / RIB
--   - production N-1 individuelle
--   - contenu complet d'un diagnostic ou d'un support
--
-- Métadonnées légères seulement (cf. docs/activity-log-prd.md).
-- =============================================================================

create table public.activity_logs (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references public.training_sessions (id) on delete cascade,
  diagnostic_id       uuid references public.diagnostics (id) on delete cascade,
  client_id           uuid references public.clients (id) on delete cascade,
  actor_id            uuid references auth.users (id) on delete set null,
  actor_name          text,
  actor_role          text,
  event_type          text not null,
  event_label         text not null,
  event_description   text,
  entity_type         text,
  entity_id           text,
  severity            text not null default 'info'
                      check (severity in ('info', 'success', 'warning', 'error')),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index activity_logs_session_id_idx
  on public.activity_logs (session_id);
create index activity_logs_diagnostic_id_idx
  on public.activity_logs (diagnostic_id);
create index activity_logs_client_id_idx
  on public.activity_logs (client_id);
create index activity_logs_actor_id_idx
  on public.activity_logs (actor_id);
create index activity_logs_event_type_idx
  on public.activity_logs (event_type);
create index activity_logs_created_at_idx
  on public.activity_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- RLS — MVP : authenticated uniquement. Aucune policy anon.
--
-- L'écriture depuis les routes publiques (submit-participant,
-- upload-document, select-date-option) passe par service_role côté
-- serveur, qui contourne RLS. Le journal n'est jamais exposé
-- publiquement.
-- -----------------------------------------------------------------------------
alter table public.activity_logs enable row level security;

create policy activity_logs_authenticated_select
  on public.activity_logs
  for select to authenticated using (true);

create policy activity_logs_authenticated_insert
  on public.activity_logs
  for insert to authenticated with check (true);

-- Pas d'UPDATE ni de DELETE — le log est immuable.
-- Si une purge devient nécessaire, prévoir une migration dédiée.
