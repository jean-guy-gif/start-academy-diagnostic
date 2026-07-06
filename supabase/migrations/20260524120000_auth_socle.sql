-- =============================================================================
-- Start Academy — Socle Auth + Rôles
--
-- Objectifs :
--   1. Aligner le check de `profiles.role` sur la liste finale du PRD :
--      admin, commercial, trainer, client_viewer, participant.
--      `formateur` est renommé en `trainer` (cf. décision interne 2026-05-24).
--   2. Ajouter `organization` (rattachement entreprise pour les
--      `commercial` / `trainer`).
--   3. Auto-créer une ligne `profiles` lors d'un signup auth.users.
--
-- RLS : reste permissive pour authenticated (durcissement détaillé dans
-- docs/rls-hardening-plan.md, à appliquer en migrations séparées).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Migration des valeurs `formateur` -> `trainer`
-- -----------------------------------------------------------------------------
update public.profiles
set role = 'trainer'
where role = 'formateur';

-- -----------------------------------------------------------------------------
-- 2. Remplacement du check constraint sur `role`
-- -----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'commercial', 'trainer', 'client_viewer', 'participant'));

-- -----------------------------------------------------------------------------
-- 3. Ajout du champ `organization` (rattachement entreprise interne)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists organization text;

-- -----------------------------------------------------------------------------
-- 4. Trigger d'auto-création de profile au signup
--
-- Sécurité :
--   - SECURITY DEFINER nécessaire pour écrire dans public.profiles depuis
--     un trigger sur auth.users (qui s'exécute sous le rôle de
--     l'utilisateur appelant, sans permission sur public.profiles).
--   - Le owner de la fonction doit être un rôle privilégié (postgres /
--     supabase_admin) — c'est le cas par défaut côté Supabase.
--   - On force `search_path = public, pg_temp` pour éviter qu'un schéma
--     malveillant n'intercepte la résolution de la table.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta_role text;
  resolved_role text;
begin
  meta_role := nullif(coalesce(new.raw_user_meta_data ->> 'role', ''), '');

  -- Sécurité : on n'accepte que les rôles connus. Tout autre valeur (ou
  -- absence) tombe sur `commercial` — la valeur par défaut de l'app.
  if meta_role in ('admin', 'commercial', 'trainer', 'client_viewer', 'participant') then
    resolved_role := meta_role;
  else
    resolved_role := 'commercial';
  end if;

  insert into public.profiles (id, email, full_name, role, organization)
  values (
    new.id,
    new.email,
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', ''), ''),
    resolved_role,
    nullif(coalesce(new.raw_user_meta_data ->> 'organization', ''), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
