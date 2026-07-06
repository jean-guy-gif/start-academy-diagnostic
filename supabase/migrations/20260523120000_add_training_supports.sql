-- =============================================================================
-- Start Academy — Persistance des supports de formation
--
-- Ajoute la table `training_supports` qui stocke le JSON du support
-- généré pour chaque session. Une seule entrée par session pour le MVP
-- (`unique(session_id)`) : la versioning viendra plus tard.
--
-- RLS : MVP, `authenticated` uniquement. Pas de policies `anon`.
-- =============================================================================

create table public.training_supports (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.training_sessions (id) on delete cascade,
  diagnostic_id      uuid references public.diagnostics (id) on delete set null,
  recommendation_id  uuid references public.recommendations (id) on delete set null,
  title              text not null,
  support_json       jsonb not null,
  source             text not null
                     check (source in ('openrouter', 'heuristic')),
  model              text,
  confidence_score   integer
                     check (
                       confidence_score is null
                       or (confidence_score >= 0 and confidence_score <= 100)
                     ),
  status             text not null default 'draft'
                     check (status in ('draft', 'validated', 'archived')),
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint training_supports_session_unique unique (session_id)
);

create index training_supports_session_id_idx
  on public.training_supports (session_id);
create index training_supports_diagnostic_id_idx
  on public.training_supports (diagnostic_id);
create index training_supports_recommendation_id_idx
  on public.training_supports (recommendation_id);
create index training_supports_status_idx
  on public.training_supports (status);
create index training_supports_source_idx
  on public.training_supports (source);
create index training_supports_created_by_idx
  on public.training_supports (created_by);

create trigger training_supports_updated_at
  before update on public.training_supports
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — MVP : authenticated only.
-- -----------------------------------------------------------------------------
alter table public.training_supports enable row level security;

create policy training_supports_authenticated_select
  on public.training_supports
  for select to authenticated using (true);

create policy training_supports_authenticated_insert
  on public.training_supports
  for insert to authenticated with check (true);

create policy training_supports_authenticated_update
  on public.training_supports
  for update to authenticated using (true) with check (true);

create policy training_supports_authenticated_delete
  on public.training_supports
  for delete to authenticated using (true);
