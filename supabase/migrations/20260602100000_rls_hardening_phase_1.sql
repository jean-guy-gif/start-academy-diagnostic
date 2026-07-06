-- =============================================================================
-- Start Academy — RLS hardening phase 1
--
-- Périmètre : 4 tables peu risquées, sans ségrégation par ownership
-- complexe :
--   - profiles
--   - public_access_tokens
--   - activity_logs
--   - ai_generation_logs
--
-- On NE TOUCHE PAS aux tables métier (clients, diagnostics,
-- recommendations, training_sessions, session_participants,
-- session_documents, supports) — phase 2+ planifiée dans
-- docs/rls-hardening-plan.md.
--
-- Toutes les routes serveur sensibles utilisent déjà `service_role`
-- via `createSupabaseAdminClient()` qui contourne RLS. Cette migration
-- les laisse fonctionner.
--
-- Pas de policy `anon` : les chemins publics (validate-token,
-- submit-participant, upload-document, select-date-option) passent
-- par les routes serveur en `service_role`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helpers SQL (SECURITY DEFINER) — anti récursion sur profiles.
--
-- Pourquoi SECURITY DEFINER : ces fonctions lisent `profiles.role`
-- depuis une policy POSÉE SUR `profiles`. Sans definer, on aurait une
-- récursion (la policy SELECT appelle la fonction qui SELECT profiles
-- qui ré-évalue la policy ...). Le bypass via SECURITY DEFINER coupe
-- la boucle. Le `search_path` est figé pour empêcher tout shadowing.
-- -----------------------------------------------------------------------------

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'commercial', 'trainer')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Pas de droit EXECUTE pour anon. Les helpers ne servent que côté
-- policies (qui s'exécutent indépendamment de l'EXECUTE caller).
revoke all on function public.get_my_role()    from public;
revoke all on function public.is_internal_user() from public;
revoke all on function public.is_admin()       from public;
grant execute on function public.get_my_role()    to authenticated;
grant execute on function public.is_internal_user() to authenticated;
grant execute on function public.is_admin()       to authenticated;

-- -----------------------------------------------------------------------------
-- 2. profiles
--   SELECT : self OR admin
--   INSERT : trigger handle_new_user (SECURITY DEFINER) — donc on
--            BLOQUE l'INSERT via policy (le trigger bypasse RLS).
--   UPDATE : self mais SANS toucher `role` (cf. WITH CHECK) OR admin
--   DELETE : admin uniquement
-- -----------------------------------------------------------------------------

drop policy if exists profiles_authenticated_select on public.profiles;
drop policy if exists profiles_authenticated_insert on public.profiles;
drop policy if exists profiles_authenticated_update on public.profiles;
drop policy if exists profiles_authenticated_delete on public.profiles;

create policy profiles_select_self_or_admin
  on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Aucun INSERT depuis authenticated : la création passe par le trigger
-- `handle_new_user` (SECURITY DEFINER) au signup, qui s'exécute
-- AVANT que RLS soit appliqué côté trigger.
-- => On omet volontairement la policy INSERT.

-- UPDATE self : `id` reste constant, `role` reste constant (anti
-- escalade privilège). full_name / organization / email restent
-- modifiables par self (email peut être synchronisé depuis auth.users).
create policy profiles_update_self_limited
  on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
  );

-- UPDATE admin : peut tout modifier sur tout profil, y compris le rôle.
create policy profiles_update_admin
  on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_delete_admin
  on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. public_access_tokens
--   SELECT / INSERT / UPDATE / DELETE : rôles internes uniquement.
--   Les pages publiques passent par les routes serveur en service_role
--   (qui bypasse toutes les policies).
-- -----------------------------------------------------------------------------

drop policy if exists public_access_tokens_authenticated_select on public.public_access_tokens;
drop policy if exists public_access_tokens_authenticated_insert on public.public_access_tokens;
drop policy if exists public_access_tokens_authenticated_update on public.public_access_tokens;
drop policy if exists public_access_tokens_authenticated_delete on public.public_access_tokens;

create policy public_access_tokens_internal_select
  on public.public_access_tokens
  for select to authenticated
  using (public.is_internal_user());

create policy public_access_tokens_internal_insert
  on public.public_access_tokens
  for insert to authenticated
  with check (public.is_internal_user());

create policy public_access_tokens_internal_update
  on public.public_access_tokens
  for update to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

create policy public_access_tokens_admin_delete
  on public.public_access_tokens
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. activity_logs
--   SELECT : rôles internes uniquement.
--   INSERT : rôles internes (les routes serveur peuvent aussi écrire
--            via service_role pour les events anon — submit-participant,
--            upload-document, select-date-option).
--   Pas d'UPDATE / DELETE — table immuable (déjà acté MVP).
-- -----------------------------------------------------------------------------

drop policy if exists activity_logs_authenticated_select on public.activity_logs;
drop policy if exists activity_logs_authenticated_insert on public.activity_logs;

create policy activity_logs_internal_select
  on public.activity_logs
  for select to authenticated
  using (public.is_internal_user());

create policy activity_logs_internal_insert
  on public.activity_logs
  for insert to authenticated
  with check (public.is_internal_user());

-- -----------------------------------------------------------------------------
-- 5. ai_generation_logs
--   SELECT : rôles internes uniquement (audit).
--   INSERT : rôles internes ; les routes serveur passent par service_role
--            qui bypasse RLS — donc l'instrumentation IA continue
--            de fonctionner.
--   Pas d'UPDATE / DELETE depuis authenticated — historique immuable.
-- -----------------------------------------------------------------------------

drop policy if exists ai_generation_logs_authenticated_select on public.ai_generation_logs;
drop policy if exists ai_generation_logs_authenticated_insert on public.ai_generation_logs;
drop policy if exists ai_generation_logs_authenticated_update on public.ai_generation_logs;
drop policy if exists ai_generation_logs_authenticated_delete on public.ai_generation_logs;

create policy ai_generation_logs_internal_select
  on public.ai_generation_logs
  for select to authenticated
  using (public.is_internal_user());

create policy ai_generation_logs_internal_insert
  on public.ai_generation_logs
  for insert to authenticated
  with check (public.is_internal_user());

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - service_role bypasse RLS : toutes les routes serveur qui utilisent
--   `createSupabaseAdminClient()` continuent d'écrire sans contrainte.
-- - anon n'a aucune policy ici : si une route est appelée sans cookie,
--   elle est refusée avant RLS (par requireApiRole côté Next.js).
-- - Les profils `client_viewer` / `participant` ne peuvent plus voir
--   les 4 tables ci-dessus côté app (ils n'ont jamais eu de chemin
--   produit qui les y mène — donc impact code attendu : nul).
