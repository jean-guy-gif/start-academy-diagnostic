-- =============================================================================
-- Start Academy — public_access_tokens
--
-- Mécanisme de lien signé pour accès post-proposition :
--   - client_session_view    : dirigeant consulte sa proposition / session
--   - participant_collect    : collaborateur remplit sa préparation
--   - trainer_session_view   : formateur consulte la session
--
-- Hypothèses de sécurité (cf. docs/public-access-flow.md) :
--   - Le token BRUT n'est JAMAIS stocké en base — seulement son hash
--     SHA-256 (cf. src/lib/public-access/public-token-service.ts).
--   - Les pages publiques (anon) ne LISENT PAS cette table directement :
--     elles passent par une route serveur qui utilise service_role.
--     Aucune policy anon ouverte ci-dessous.
--   - Les routes serveurs publiques (validate-token, submit-participant)
--     valident le token AVANT d'utiliser service_role.
--
-- RLS : permissive pour `authenticated` (admin/commercial/trainer
-- créent et listent les tokens de leurs sessions). Durcissement par
-- rôle / par session prévu dans docs/rls-hardening-plan.md.
-- =============================================================================

create table public.public_access_tokens (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         text not null unique,
  session_id         uuid not null references public.training_sessions (id) on delete cascade,
  access_type        text not null
                     check (access_type in (
                       'client_session_view',
                       'participant_collect',
                       'trainer_session_view'
                     )),
  recipient_email    text,
  recipient_name     text,
  expires_at         timestamptz,
  max_uses           integer,
  used_count         integer not null default 0,
  is_active          boolean not null default true,
  metadata           jsonb not null default '{}'::jsonb,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index public_access_tokens_session_id_idx
  on public.public_access_tokens (session_id);
create index public_access_tokens_token_hash_idx
  on public.public_access_tokens (token_hash);
create index public_access_tokens_access_type_idx
  on public.public_access_tokens (access_type);
create index public_access_tokens_recipient_email_idx
  on public.public_access_tokens (recipient_email);
create index public_access_tokens_is_active_idx
  on public.public_access_tokens (is_active);
create index public_access_tokens_expires_at_idx
  on public.public_access_tokens (expires_at);

create trigger public_access_tokens_updated_at
  before update on public.public_access_tokens
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — MVP : authenticated uniquement. Pas de policy anon.
--
-- L'accès anon (depuis les pages publiques) passe TOUJOURS par
-- service_role côté serveur, qui contourne RLS. La route serveur
-- est responsable de valider le token AVANT toute lecture / écriture.
-- -----------------------------------------------------------------------------
alter table public.public_access_tokens enable row level security;

create policy public_access_tokens_authenticated_select
  on public.public_access_tokens
  for select to authenticated using (true);

create policy public_access_tokens_authenticated_insert
  on public.public_access_tokens
  for insert to authenticated with check (true);

create policy public_access_tokens_authenticated_update
  on public.public_access_tokens
  for update to authenticated using (true) with check (true);

create policy public_access_tokens_authenticated_delete
  on public.public_access_tokens
  for delete to authenticated using (true);
