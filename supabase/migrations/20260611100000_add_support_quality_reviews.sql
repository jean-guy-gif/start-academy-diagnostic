-- =============================================================================
-- Start Academy — Table `support_quality_reviews`
--
-- Validation pédagogique interne d'un support (brut ou designé)
-- avant utilisation en formation. Une review par session (unicité
-- recommandée mais non contrainte au niveau SQL — un même reviewer
-- peut éditer plusieurs versions, on garde le pattern UPSERT par
-- session côté service).
--
-- Politique :
--   - SELECT / INSERT / UPDATE : `can_access_session(session_id)`
--     (admin OU propriétaire du diagnostic / client / session).
--   - DELETE : admin uniquement (audit trail préservé).
--   - Pas de policy `to anon`. Les pages publiques (dirigeant /
--     collaborateur / formateur) ne voient JAMAIS ces reviews.
-- =============================================================================

create table public.support_quality_reviews (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null
                        references public.training_sessions (id) on delete cascade,
  training_support_id   uuid
                        references public.training_supports (id) on delete set null,
  designed_support_id   uuid
                        references public.designed_training_supports (id) on delete set null,
  reviewer_id           uuid references auth.users (id) on delete set null,
  reviewer_name         text,
  status                text not null default 'draft'
                        check (status in (
                          'draft',
                          'needs_revision',
                          'validated',
                          'rejected'
                        )),
  score_total           integer,
  score_max             integer,
  score_percent         numeric,
  checklist             jsonb not null default '{}'::jsonb,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index support_quality_reviews_session_id_idx
  on public.support_quality_reviews (session_id);
create index support_quality_reviews_training_support_id_idx
  on public.support_quality_reviews (training_support_id);
create index support_quality_reviews_designed_support_id_idx
  on public.support_quality_reviews (designed_support_id);
create index support_quality_reviews_reviewer_id_idx
  on public.support_quality_reviews (reviewer_id);
create index support_quality_reviews_status_idx
  on public.support_quality_reviews (status);

create trigger support_quality_reviews_updated_at
  before update on public.support_quality_reviews
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.support_quality_reviews enable row level security;

create policy support_quality_reviews_accessible_select
  on public.support_quality_reviews
  for select to authenticated
  using (public.can_access_session(session_id));

create policy support_quality_reviews_accessible_insert
  on public.support_quality_reviews
  for insert to authenticated
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy support_quality_reviews_accessible_update
  on public.support_quality_reviews
  for update to authenticated
  using (
    public.is_internal_user()
    and public.can_access_session(session_id)
  )
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy support_quality_reviews_admin_delete
  on public.support_quality_reviews
  for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Pas de trigger `set_created_by_if_null` : on utilise
--   `reviewer_id` posé explicitement par la route serveur (cohérence
--   avec activity_logs.actor_id qui suit le même pattern).
-- - Pas de contrainte unique (session_id, training_support_id) :
--   l'UPSERT côté service garantit qu'une seule review courante
--   existe par session. Si on souhaite plus tard un historique
--   versionné, créer une colonne `version` et lever cette contrainte.
