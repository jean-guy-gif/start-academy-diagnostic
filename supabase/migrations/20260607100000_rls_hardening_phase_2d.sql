-- =============================================================================
-- Start Academy — RLS hardening Phase 2D (collecte collaborateurs)
--
-- Tables durcies :
--   - session_participants
--   - session_documents
--
-- Pré-requis appliqués :
--   - Phase 1 + Phase 2 préparation + Phase 2A + Phase 2B + Phase 2C
--   - Helpers : public.is_internal_user(), public.is_admin(),
--               public.can_access_session(uuid).
--
-- Garanties / ce qui continue de fonctionner :
--   - service_role bypasse RLS → routes publiques continuent de
--     soumettre/uploader sans toucher RLS :
--       /api/public/submit-participant   → INSERT session_participants
--       /api/public/upload-document      → INSERT session_documents
--   - Cockpit + route interne `/api/sessions/[id]/documents` utilisent
--     admin client → bypass RLS, génération signed URLs inchangée.
--   - Browser-direct côté commercial :
--       * `saveParticipant` (collect-view interne)   → INSERT couvert
--         par is_internal_user + can_access_session.
--       * `listParticipantsBySession` (session-detail) → SELECT couvert
--         par can_access_session.
--
-- Politique cible :
--   - admin : voit / écrit / supprime tout (couvert par is_admin
--     inclus dans can_access_session).
--   - commercial / trainer interne : voit / écrit pour les sessions
--     auxquelles il a accès (own session OR via diagnostic / client).
--   - client_viewer / participant : aucun accès direct.
--   - anon : aucune policy `to anon` créée. Toute écriture publique
--     anon passe par les routes serveur en service_role.
--
-- Sensibilité documents :
--   - Le bucket Storage `session-documents` reste privé. Aucune policy
--     Storage modifiée ici — audit séparé hors scope (cf. §7 de
--     `rls-phase-2-access-audit.md`).
--   - Les signed URLs sont créées par `/api/sessions/[id]/documents`
--     (auth interne + admin client). Durée 60 s.
--   - `storage_path` n'est jamais renvoyé au client : seules les
--     signed URLs sortent côté UI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helpers SQL « explicit user » (SECURITY DEFINER + search_path figé)
--
-- Les helpers Phase 1/2A-2C s'appuient sur `auth.uid()`. Or, certaines
-- routes serveur utilisent `createSupabaseAdminClient()` (service_role)
-- — auquel cas `auth.uid()` retourne NULL, ce qui désactive les checks
-- de propriété même quand l'utilisateur courant est connu (récupéré
-- via cookie SSR + `getCurrentProfile`).
--
-- Ces helpers prennent `p_user_id` explicitement, ce qui permet à la
-- couche route d'effectuer une vérification d'ownership APRÈS auth
-- cookie + AVANT lecture via admin client. Cas d'usage : la route
-- /api/sessions/[id]/documents — admin client lit le bucket privé,
-- mais la route doit vérifier que le profile authentifié a bien
-- accès à la session.
--
-- Sécurité :
--   - SECURITY DEFINER pour bypasser RLS sur les tables internes
--     (training_sessions, diagnostics, clients, profiles).
--   - `search_path = public, pg_temp` figé.
--   - EXECUTE accordé à `authenticated` UNIQUEMENT — anon n'a pas
--     accès. La route handler en service_role peut tout de même
--     appeler (service_role peut exécuter toutes les fonctions).
-- -----------------------------------------------------------------------------

create or replace function public.get_role_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.profiles
  where id = p_user_id;
$$;

create or replace function public.is_admin_for_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and role = 'admin'
  );
$$;

create or replace function public.is_internal_user_for_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and role in ('admin', 'commercial', 'trainer')
  );
$$;

create or replace function public.can_user_access_session(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_admin_for_user(p_user_id) or
    exists (
      select 1
      from public.training_sessions s
      where s.id = p_session_id
        and (
          s.created_by = p_user_id
          or exists (
            select 1 from public.diagnostics d
            where d.id = s.diagnostic_id and d.created_by = p_user_id
          )
          or exists (
            select 1 from public.clients c
            where c.id = s.client_id and c.created_by = p_user_id
          )
        )
    );
$$;

revoke all on function public.get_role_for_user(uuid) from public;
revoke all on function public.is_admin_for_user(uuid) from public;
revoke all on function public.is_internal_user_for_user(uuid) from public;
revoke all on function public.can_user_access_session(uuid, uuid) from public;
grant execute on function public.get_role_for_user(uuid) to authenticated;
grant execute on function public.is_admin_for_user(uuid) to authenticated;
grant execute on function public.is_internal_user_for_user(uuid) to authenticated;
grant execute on function public.can_user_access_session(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 1. session_participants
--   SELECT  : can_access_session(session_id) — admin OR session
--             créateur OR diagnostic/client accessible.
--   INSERT  : is_internal_user + can_access_session. Routes publiques
--             utilisent service_role → bypass.
--   UPDATE  : idem INSERT (strict : seul le propriétaire interne
--             peut modifier les données collectées).
--   DELETE  : admin uniquement. Le code applicatif ne supprime
--             jamais un participant en routine ; les soumissions
--             dupliquées sont gérées par UPSERT côté route publique
--             ou conflict 23505 côté browser.
-- -----------------------------------------------------------------------------

drop policy if exists session_participants_authenticated_select on public.session_participants;
drop policy if exists session_participants_authenticated_insert on public.session_participants;
drop policy if exists session_participants_authenticated_update on public.session_participants;
drop policy if exists session_participants_authenticated_delete on public.session_participants;

create policy session_participants_accessible_select
  on public.session_participants
  for select to authenticated
  using (public.can_access_session(session_id));

create policy session_participants_internal_insert
  on public.session_participants
  for insert to authenticated
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy session_participants_internal_update
  on public.session_participants
  for update to authenticated
  using (
    public.is_internal_user()
    and public.can_access_session(session_id)
  )
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy session_participants_admin_delete
  on public.session_participants
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. session_documents
--   Sensible (CNI / RIB / production N-1).
--   SELECT  : can_access_session(session_id).
--   INSERT  : is_internal_user + can_access_session. L'upload public
--             passe par /api/public/upload-document en service_role.
--   UPDATE  : is_internal_user + can_access_session (rare — ré-upload
--             d'un nouveau blob = INSERT + DELETE bucket côté code).
--   DELETE  : admin uniquement. Une suppression de document est
--             une action sensible (effacement de pièce probatoire) ;
--             elle reste un acte admin.
-- -----------------------------------------------------------------------------

drop policy if exists session_documents_authenticated_select on public.session_documents;
drop policy if exists session_documents_authenticated_insert on public.session_documents;
drop policy if exists session_documents_authenticated_update on public.session_documents;
drop policy if exists session_documents_authenticated_delete on public.session_documents;

create policy session_documents_accessible_select
  on public.session_documents
  for select to authenticated
  using (public.can_access_session(session_id));

create policy session_documents_internal_insert
  on public.session_documents
  for insert to authenticated
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy session_documents_internal_update
  on public.session_documents
  for update to authenticated
  using (
    public.is_internal_user()
    and public.can_access_session(session_id)
  )
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy session_documents_admin_delete
  on public.session_documents
  for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Phase 2E (training_supports, designed_training_supports) à durcir
--   dans une migration séparée. `can_access_session` couvre déjà le
--   pattern attendu.
-- - Aucune policy `to anon` créée. Tout accès anonyme passe par les
--   routes serveur tokenisées.
-- - Storage : aucune modification de policy bucket dans cette
--   migration. Audit dédié à prévoir si on durcit le bucket
--   `session-documents` (cf. doc).
-- - Rollback : drop des nouvelles policies + recréer les
--   `authenticated using (true)` originales.
