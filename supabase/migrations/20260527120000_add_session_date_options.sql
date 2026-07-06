-- =============================================================================
-- Start Academy — Créneaux proposés (sans Google Calendar)
--
-- Le commercial propose plusieurs créneaux depuis la fiche session
-- interne. Le dirigeant en choisit un depuis son espace public sécurisé
-- (lien `client_session_view`). La sélection se fait via une route
-- serveur qui passe le token de validation avant d'utiliser
-- service_role — aucun anon insert / anon update n'est ouvert.
--
-- Google Calendar n'est PAS branché — la couche est volontairement
-- découplée d'un fournisseur externe. Voir docs/session-date-options.md.
-- =============================================================================

create table public.session_date_options (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.training_sessions (id) on delete cascade,
  title                text,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  location             text,
  format               text
                       check (format is null or format in ('presentiel', 'visio', 'hybride')),
  status               text not null default 'proposed'
                       check (status in ('proposed', 'selected', 'rejected', 'cancelled')),
  selected_by_email    text,
  selected_at          timestamptz,
  metadata             jsonb not null default '{}'::jsonb,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint session_date_options_end_after_start check (end_at > start_at)
);

create index session_date_options_session_id_idx
  on public.session_date_options (session_id);
create index session_date_options_status_idx
  on public.session_date_options (status);
create index session_date_options_start_at_idx
  on public.session_date_options (start_at);
create index session_date_options_created_by_idx
  on public.session_date_options (created_by);

create trigger session_date_options_updated_at
  before update on public.session_date_options
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — MVP : authenticated uniquement. Aucune policy anon.
--
-- La sélection publique (dirigeant via lien sécurisé) passe par
-- `/api/public/select-date-option` qui utilise service_role côté
-- serveur APRÈS validation du token. Le bucket anon ne touche jamais
-- cette table.
-- -----------------------------------------------------------------------------
alter table public.session_date_options enable row level security;

create policy session_date_options_authenticated_select
  on public.session_date_options
  for select to authenticated using (true);

create policy session_date_options_authenticated_insert
  on public.session_date_options
  for insert to authenticated with check (true);

create policy session_date_options_authenticated_update
  on public.session_date_options
  for update to authenticated using (true) with check (true);

create policy session_date_options_authenticated_delete
  on public.session_date_options
  for delete to authenticated using (true);
