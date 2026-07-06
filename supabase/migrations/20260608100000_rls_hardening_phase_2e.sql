-- =============================================================================
-- Start Academy — RLS hardening Phase 2E (supports de formation)
--
-- Tables durcies :
--   - training_supports
--   - designed_training_supports
--
-- Pré-requis appliqués :
--   - Phase 1 + Phase 2 préparation + Phase 2A + 2B + 2C + 2D
--   - Helpers : public.is_internal_user(), public.is_admin(),
--               public.can_access_session(uuid),
--               public.can_user_access_session(uuid, uuid).
--
-- Garanties / ce qui continue de fonctionner :
--   - service_role bypasse RLS → routes IA (`/api/generate-training-support`,
--     `/api/design-training-support`) qui écrivent les supports en
--     admin client → bypass. Désormais ces routes valident en
--     amont `can_user_access_session(profile.id, sessionId)` pour
--     empêcher un internal user d'écrire/déclencher LLM sur la
--     session d'un collègue (cf. assert-session-access.ts).
--   - Cockpit / pages publiques tokenisées (dirigeant + formateur)
--     lisent en admin client → bypass.
--   - Browser-direct : `training-support-service.ts` et
--     `designed-support-service.ts` font upsert + update status +
--     select (filtrés par `session_id`). Désormais soumis à
--     `is_internal_user + can_access_session` côté policies.
--
-- Politique cible :
--   - admin : voit / écrit / supprime tout (couvert par is_admin
--     inclus dans can_access_session).
--   - commercial / trainer interne : voit / écrit pour les
--     sessions auxquelles il a accès (own session OR via
--     diagnostic / client).
--   - client_viewer / participant : aucun accès direct.
--   - anon : aucune policy `to anon`. Les pages publiques (dirigeant /
--     formateur) accèdent UNIQUEMENT via token signé + service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. training_supports
--   SELECT  : can_access_session(session_id).
--   INSERT  : is_internal_user + can_access_session.
--   UPDATE  : is_internal_user + can_access_session. Couvre les
--             transitions de statut (validation / archivage) faites
--             côté browser via `updateSupportStatus`.
--   DELETE  : admin uniquement. Suppression d'un support pédago
--             reste un acte rare et contrôlé.
-- -----------------------------------------------------------------------------

drop policy if exists training_supports_authenticated_select on public.training_supports;
drop policy if exists training_supports_authenticated_insert on public.training_supports;
drop policy if exists training_supports_authenticated_update on public.training_supports;
drop policy if exists training_supports_authenticated_delete on public.training_supports;

create policy training_supports_accessible_select
  on public.training_supports
  for select to authenticated
  using (public.can_access_session(session_id));

create policy training_supports_internal_insert
  on public.training_supports
  for insert to authenticated
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy training_supports_internal_update
  on public.training_supports
  for update to authenticated
  using (
    public.is_internal_user()
    and public.can_access_session(session_id)
  )
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy training_supports_admin_delete
  on public.training_supports
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. designed_training_supports
--   Même pattern que training_supports.
-- -----------------------------------------------------------------------------

drop policy if exists designed_training_supports_authenticated_select on public.designed_training_supports;
drop policy if exists designed_training_supports_authenticated_insert on public.designed_training_supports;
drop policy if exists designed_training_supports_authenticated_update on public.designed_training_supports;
drop policy if exists designed_training_supports_authenticated_delete on public.designed_training_supports;

create policy designed_training_supports_accessible_select
  on public.designed_training_supports
  for select to authenticated
  using (public.can_access_session(session_id));

create policy designed_training_supports_internal_insert
  on public.designed_training_supports
  for insert to authenticated
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy designed_training_supports_internal_update
  on public.designed_training_supports
  for update to authenticated
  using (
    public.is_internal_user()
    and public.can_access_session(session_id)
  )
  with check (
    public.is_internal_user()
    and public.can_access_session(session_id)
  );

create policy designed_training_supports_admin_delete
  on public.designed_training_supports
  for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Phase 2 entièrement appliquée à l'issue de cette migration.
-- - Aucune policy `to anon`. Les chemins publics (dirigeant /
--   formateur) passent par token signé + admin client.
-- - Rollback : drop des nouvelles policies + recréer les
--   `authenticated using (true)` originales. Les helpers
--   `can_access_session` / `can_user_access_session` restent
--   (idempotents).
