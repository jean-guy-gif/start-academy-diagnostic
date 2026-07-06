-- =============================================================================
-- Start Academy — Persistance des supports designés (slides 16:9).
--
-- Ajoute la table `designed_training_supports` qui stocke le JSON des
-- slides produites par la couche design. Le support pédagogique brut
-- reste dans `training_supports` — les deux artefacts coexistent.
--
-- MVP : un seul support designé par session (`unique(session_id)`). Le
-- versioning viendra plus tard.
--
-- RLS : MVP, `authenticated` uniquement. Pas de policies `anon`.
-- =============================================================================

create table public.designed_training_supports (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references public.training_sessions (id) on delete cascade,
  training_support_id   uuid references public.training_supports (id) on delete set null,
  title                 text not null,
  subtitle              text,
  visual_intent         text,
  designed_json         jsonb not null,
  source                text not null
                        check (source in ('openrouter', 'heuristic')),
  model                 text,
  confidence_score      integer
                        check (
                          confidence_score is null
                          or (confidence_score >= 0 and confidence_score <= 100)
                        ),
  status                text not null default 'draft'
                        check (status in ('draft', 'validated', 'archived')),
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint designed_training_supports_session_unique unique (session_id)
);

create index designed_training_supports_session_id_idx
  on public.designed_training_supports (session_id);
create index designed_training_supports_training_support_id_idx
  on public.designed_training_supports (training_support_id);
create index designed_training_supports_status_idx
  on public.designed_training_supports (status);
create index designed_training_supports_source_idx
  on public.designed_training_supports (source);
create index designed_training_supports_created_by_idx
  on public.designed_training_supports (created_by);

create trigger designed_training_supports_updated_at
  before update on public.designed_training_supports
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — MVP : authenticated only.
-- -----------------------------------------------------------------------------
alter table public.designed_training_supports enable row level security;

create policy designed_training_supports_authenticated_select
  on public.designed_training_supports
  for select to authenticated using (true);

create policy designed_training_supports_authenticated_insert
  on public.designed_training_supports
  for insert to authenticated with check (true);

create policy designed_training_supports_authenticated_update
  on public.designed_training_supports
  for update to authenticated using (true) with check (true);

create policy designed_training_supports_authenticated_delete
  on public.designed_training_supports
  for delete to authenticated using (true);
