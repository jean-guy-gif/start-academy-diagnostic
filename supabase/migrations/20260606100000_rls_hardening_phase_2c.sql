-- =============================================================================
-- Start Academy — RLS hardening Phase 2C (recommandations & sessions)
--
-- Tables durcies :
--   - recommendations
--   - recommendation_modules
--   - training_sessions
--
-- Pré-requis appliqués :
--   - Phase 1 + Phase 2 préparation + Phase 2A + Phase 2B
--   - Helpers : public.is_internal_user(), public.is_admin(),
--               public.can_access_diagnostic(uuid),
--               public.can_access_client(uuid)
--   - Triggers `set_created_by_if_null()` actifs sur recommendations
--     ET training_sessions (Phase 2 préparation).
--
-- Garanties / ce qui continue de fonctionner :
--   - service_role bypasse RLS → routes IA, cockpit, pages publiques
--     tokenisées, routes API internes utilisant `createSupabaseAdminClient`
--     restent inchangées.
--   - `recommendations` est INSERT côté serveur (route `/api/analyze-training-need`)
--     en admin client → bypass. `created_by` reste NULL pour ces lignes ;
--     l'accès lecture du commercial se fait via `can_access_diagnostic`.
--   - `training_sessions` est INSERT côté browser dans
--     `session-service.ts` ; le trigger défaut `created_by = auth.uid()`
--     satisfait la policy INSERT.
--   - `recommendation_modules` n'est jamais lu/écrit en browser direct
--     (uniquement IA route + page publique admin client).
--
-- Politique cible :
--   - admin : voit / écrit / supprime tout.
--   - commercial : voit ses recommandations et sessions (created_by
--     OU diagnostic/client accessible). UPDATE/DELETE strict
--     (created_by uniquement, ou admin).
--   - trainer interne : pas d'accès direct global ; l'accès se fait
--     via token formateur signé (service_role bypass) tant que
--     `assigned_trainer_id` n'existe pas.
--   - client_viewer / participant : aucun accès direct.
--   - anon : aucune policy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helpers SQL supplémentaires (SECURITY DEFINER + search_path figé).
--
-- `can_access_recommendation(p_id)` :
--   - admin → true
--   - sinon → true si created_by self, OU si diagnostic parent
--     accessible (cf. `can_access_diagnostic`).
--
-- `can_access_session(p_id)` :
--   - admin → true
--   - sinon → true si created_by self, OU si diagnostic parent
--     accessible, OU si client parent accessible.
--   Exposé pour Phase 2D/2E (session_participants, supports) qui
--   joindront via `session_id`.
-- -----------------------------------------------------------------------------

create or replace function public.can_access_recommendation(p_recommendation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_admin() or
    exists (
      select 1
      from public.recommendations r
      where r.id = p_recommendation_id
        and (
          r.created_by = auth.uid()
          or public.can_access_diagnostic(r.diagnostic_id)
        )
    );
$$;

create or replace function public.can_access_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_admin() or
    exists (
      select 1
      from public.training_sessions s
      where s.id = p_session_id
        and (
          s.created_by = auth.uid()
          or public.can_access_diagnostic(s.diagnostic_id)
          or public.can_access_client(s.client_id)
        )
    );
$$;

revoke all on function public.can_access_recommendation(uuid) from public;
revoke all on function public.can_access_session(uuid) from public;
grant execute on function public.can_access_recommendation(uuid) to authenticated;
grant execute on function public.can_access_session(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 1. recommendations
--   SELECT : created_by self OR admin OR can_access_diagnostic(diagnostic_id)
--            (les recommandations IA-générées ont created_by=NULL ; on
--             passe via le diagnostic propriétaire pour autoriser le
--             commercial à voir sa recommandation).
--   INSERT : is_internal_user + (created_by self OR admin OR
--            can_access_diagnostic). Service_role bypasse de toute
--            façon — cette policy ne protège que les écritures
--            authentifiées hypothétiques.
--   UPDATE : created_by self OR admin (strict).
--   DELETE : admin uniquement.
-- -----------------------------------------------------------------------------

drop policy if exists recommendations_authenticated_select on public.recommendations;
drop policy if exists recommendations_authenticated_insert on public.recommendations;
drop policy if exists recommendations_authenticated_update on public.recommendations;
drop policy if exists recommendations_authenticated_delete on public.recommendations;

create policy recommendations_accessible_select
  on public.recommendations
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.can_access_diagnostic(diagnostic_id)
  );

create policy recommendations_internal_insert
  on public.recommendations
  for insert to authenticated
  with check (
    public.is_internal_user()
    and (
      created_by = auth.uid()
      or public.is_admin()
      or public.can_access_diagnostic(diagnostic_id)
    )
  );

create policy recommendations_owner_or_admin_update
  on public.recommendations
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy recommendations_admin_delete
  on public.recommendations
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. recommendation_modules
--   Pas d'écriture / lecture browser-direct (vérifié grep). Toutes
--   les opérations passent par admin client (route IA INSERT, page
--   publique SELECT). Policy = `can_access_recommendation` pour
--   couvrir un futur usage browser et bloquer client_viewer.
--   DELETE admin uniquement.
-- -----------------------------------------------------------------------------

drop policy if exists recommendation_modules_authenticated_select on public.recommendation_modules;
drop policy if exists recommendation_modules_authenticated_insert on public.recommendation_modules;
drop policy if exists recommendation_modules_authenticated_update on public.recommendation_modules;
drop policy if exists recommendation_modules_authenticated_delete on public.recommendation_modules;

create policy recommendation_modules_accessible_select
  on public.recommendation_modules
  for select to authenticated
  using (public.can_access_recommendation(recommendation_id));

create policy recommendation_modules_accessible_insert
  on public.recommendation_modules
  for insert to authenticated
  with check (public.can_access_recommendation(recommendation_id));

create policy recommendation_modules_accessible_update
  on public.recommendation_modules
  for update to authenticated
  using (public.can_access_recommendation(recommendation_id))
  with check (public.can_access_recommendation(recommendation_id));

create policy recommendation_modules_admin_delete
  on public.recommendation_modules
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. training_sessions
--   SELECT : created_by self OR admin OR
--            can_access_diagnostic(diagnostic_id) OR
--            can_access_client(client_id)
--            (cas où un admin crée une session pour un commercial,
--             ou session lié à un client/diagnostic du commercial).
--   INSERT : is_internal_user + (created_by self OR admin).
--   UPDATE : created_by self OR admin (strict).
--   DELETE : admin uniquement.
-- -----------------------------------------------------------------------------

drop policy if exists training_sessions_authenticated_select on public.training_sessions;
drop policy if exists training_sessions_authenticated_insert on public.training_sessions;
drop policy if exists training_sessions_authenticated_update on public.training_sessions;
drop policy if exists training_sessions_authenticated_delete on public.training_sessions;

create policy training_sessions_accessible_select
  on public.training_sessions
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.can_access_diagnostic(diagnostic_id)
    or public.can_access_client(client_id)
  );

create policy training_sessions_internal_insert
  on public.training_sessions
  for insert to authenticated
  with check (
    public.is_internal_user()
    and (created_by = auth.uid() or public.is_admin())
  );

create policy training_sessions_owner_or_admin_update
  on public.training_sessions
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy training_sessions_admin_delete
  on public.training_sessions
  for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Phase 2D (session_participants, session_documents) et Phase 2E
--   (training_supports, designed_training_supports) à durcir dans des
--   migrations séparées. `can_access_session(uuid)` est exposé ici
--   pour servir de socle aux policies suivantes.
-- - Aucune policy `to anon` créée.
-- - Rollback : drop des nouvelles policies + recréer les
--   `authenticated using (true)` originales. Les helpers
--   `can_access_recommendation` / `can_access_session` peuvent
--   rester (idempotents, utiles pour les phases suivantes).
