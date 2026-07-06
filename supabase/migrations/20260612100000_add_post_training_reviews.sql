-- =============================================================================
-- Start Academy — Table `post_training_reviews`
--
-- Suivi post-formation interne d'une session. Collecte structurée
-- des feedbacks formateur / dirigeant / participants + actions de
-- suite. Une review par session côté MVP (UPSERT côté API), mais le
-- schéma autorise plusieurs lignes pour préparer un éventuel
-- versionning / multi-reviewer.
--
-- Politique :
--   - SELECT / INSERT / UPDATE : `can_access_session(session_id)`
--     + `is_internal_user()` pour les écritures.
--   - DELETE : admin uniquement.
--   - Pas de policy `to anon`. Pages publiques (dirigeant /
--     collaborateur / formateur externe) ne voient JAMAIS cette
--     table — pas de chemin produit pour MVP.
-- =============================================================================

create table public.post_training_reviews (
  id                              uuid primary key default gen_random_uuid(),
  session_id                      uuid not null
                                  references public.training_sessions (id)
                                  on delete cascade,
  reviewer_id                     uuid references auth.users (id) on delete set null,
  reviewer_name                   text,
  review_type                     text not null
                                  check (review_type in (
                                    'trainer',
                                    'director',
                                    'participant_summary',
                                    'internal'
                                  )),
  status                          text not null default 'draft'
                                  check (status in (
                                    'draft',
                                    'completed',
                                    'archived'
                                  )),
  satisfaction_score              integer
                                  check (
                                    satisfaction_score is null
                                    or (satisfaction_score between 0 and 10)
                                  ),
  perceived_value_score           integer
                                  check (
                                    perceived_value_score is null
                                    or (perceived_value_score between 0 and 10)
                                  ),
  content_relevance_score         integer
                                  check (
                                    content_relevance_score is null
                                    or (content_relevance_score between 0 and 10)
                                  ),
  actionability_score             integer
                                  check (
                                    actionability_score is null
                                    or (actionability_score between 0 and 10)
                                  ),
  key_successes                   jsonb not null default '[]'::jsonb,
  key_blockers                    jsonb not null default '[]'::jsonb,
  follow_up_actions               jsonb not null default '[]'::jsonb,
  trainer_notes                   text,
  director_feedback               text,
  participant_feedback_summary    text,
  next_commercial_opportunity     text,
  metadata                        jsonb not null default '{}'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index post_training_reviews_session_id_idx
  on public.post_training_reviews (session_id);
create index post_training_reviews_reviewer_id_idx
  on public.post_training_reviews (reviewer_id);
create index post_training_reviews_review_type_idx
  on public.post_training_reviews (review_type);
create index post_training_reviews_status_idx
  on public.post_training_reviews (status);

create trigger post_training_reviews_updated_at
  before update on public.post_training_reviews
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.post_training_reviews enable row level security;

create policy post_training_reviews_accessible_select
  on public.post_training_reviews
  for select to authenticated
  using (public.can_access_session(session_id));

create policy post_training_reviews_accessible_insert
  on public.post_training_reviews
  for insert to authenticated
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy post_training_reviews_accessible_update
  on public.post_training_reviews
  for update to authenticated
  using (
    public.is_internal_user()
    and public.can_access_session(session_id)
  )
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy post_training_reviews_admin_delete
  on public.post_training_reviews
  for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - `reviewer_id` posé explicitement par la route serveur (pattern
--   activity_logs.actor_id). Pas de trigger created_by.
-- - Pas de contrainte unique (session_id, review_type) : on garde la
--   possibilité d'avoir plusieurs angles (trainer + director +
--   participant_summary + internal) côté évolution. Le MVP gère
--   UPSERT par session.
-- - `metadata` jsonb libre pour annexer des indicateurs (NPS,
--   recommandation, etc.) sans casser le schéma quand on l'enrichit.
