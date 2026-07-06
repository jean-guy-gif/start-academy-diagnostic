-- =============================================================================
-- Start Academy — Persistance collecte collaborateurs
--
-- Ajoute :
--   - session_participants : 1 ligne par collaborateur ayant rempli la
--     collecte (champs métier + contraintes unicité par session).
--   - session_documents    : fichiers déposés (placeholder upload — la
--     plateforme ne fait pas encore l'upload réel, mais le schéma est prêt).
--
-- RLS : MVP, tout `authenticated` peut lire/écrire. Pas de policies `anon`.
-- La page publique de collecte (sans session authentifiée) continue de
-- basculer en localStorage tant qu'un mécanisme de lien signé n'est pas
-- ajouté.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- session_participants
-- -----------------------------------------------------------------------------
create table public.session_participants (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.training_sessions (id) on delete cascade,
  first_name       text not null,
  last_name        text not null,
  role             text,
  email            text not null,
  estimated_level  text,
  personal_goal    text,
  main_problem     text,
  tools_used       jsonb not null default '[]'::jsonb,
  concrete_case    text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint session_participants_email_format
    check (position('@' in email) > 1),
  constraint session_participants_session_email_unique
    unique (session_id, email)
);

create index session_participants_session_id_idx
  on public.session_participants (session_id);
create index session_participants_email_idx
  on public.session_participants (email);

create trigger session_participants_updated_at
  before update on public.session_participants
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- session_documents
-- -----------------------------------------------------------------------------
create table public.session_documents (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.training_sessions (id) on delete cascade,
  participant_id      uuid references public.session_participants (id) on delete set null,
  file_name           text not null,
  file_type           text,
  file_size           bigint,
  storage_path        text not null,
  document_category   text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index session_documents_session_id_idx
  on public.session_documents (session_id);
create index session_documents_participant_id_idx
  on public.session_documents (participant_id);
create index session_documents_document_category_idx
  on public.session_documents (document_category);

create trigger session_documents_updated_at
  before update on public.session_documents
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — MVP : authenticated only.
-- -----------------------------------------------------------------------------
alter table public.session_participants enable row level security;
alter table public.session_documents    enable row level security;

do $$
declare
  t text;
  tables text[] := array['session_participants', 'session_documents'];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t || '_authenticated_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true);',
      t || '_authenticated_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true);',
      t || '_authenticated_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (true);',
      t || '_authenticated_delete', t
    );
  end loop;
end;
$$;
