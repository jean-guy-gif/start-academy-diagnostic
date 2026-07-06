-- =============================================================================
-- Start Academy — RLS hardening Phase 2B (dossiers commerciaux)
--
-- Tables durcies :
--   - clients
--   - diagnostics
--   - diagnostic_answers
--   - transcripts
--   - diagnostic_participants
--
-- Pré-requis appliqués :
--   - Phase 1 + Phase 2 préparation + Phase 2A
--   - Helpers : public.is_internal_user(), public.is_admin()
--   - Triggers BEFORE INSERT `set_created_by_if_null()` actifs sur
--     clients, diagnostics, transcripts (cf. migration 20260603).
--   - Code applicatif refactorisé : aucune écriture browser-direct
--     sur ces tables. Toutes les opérations passent par les routes
--     internes `/api/diagnostics/*` qui utilisent service_role
--     (RLS bypass).
--
-- Garanties / ce qui continue de fonctionner :
--   - service_role bypasse RLS : routes serveur, cockpit, routes IA,
--     routes publiques tokenisées → inchangés.
--   - Pages publiques (`/public/session/[token]`,
--     `/public/trainer/[token]`) lisent via admin client → inchangées.
--   - getCurrentProfile lit `profiles` filtré par `id = auth.uid()`
--     → couvert par Phase 1.
--
-- Politique cible :
--   - admin : voit / écrit / supprime tout.
--   - commercial : voit / écrit ses propres clients & diagnostics
--     (via `created_by = auth.uid()`).
--   - trainer interne : couvert par `is_internal_user()` pour
--     INSERT/UPDATE conditionnel ; LECTURE limitée à ses propres
--     créations (pas d'accès trans-commercial par défaut). Le
--     trainer externe passe par token signé → service_role bypass.
--   - client_viewer / participant : aucun accès direct (aucune
--     policy ne les inclut, et `is_internal_user()` retourne false).
--   - anon : aucune policy `to anon` créée.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helpers SQL — accès par ownership joint au diagnostic
--
-- `can_access_diagnostic(p_id)` :
--   - admin → true (lecture/écriture systématique)
--   - sinon → vrai si `diagnostics.created_by = auth.uid()`
--
-- SECURITY DEFINER : la fonction lit `diagnostics` depuis une policy
-- posée sur d'autres tables (`diagnostic_answers`, `transcripts`,
-- `diagnostic_participants`). Sans definer, on aurait une cascade RLS
-- (la policy `diagnostic_answers` appelle la fonction → la fonction
-- SELECT diagnostics → la policy diagnostics s'applique). Le bypass
-- via SECURITY DEFINER coupe la chaîne et donne un résultat constant
-- (le rôle d'appel — ici `auth.uid()` — reste celui de l'utilisateur).
-- `search_path` figé par hygiène.
-- -----------------------------------------------------------------------------

create or replace function public.can_access_diagnostic(p_diagnostic_id uuid)
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
      from public.diagnostics
      where id = p_diagnostic_id
        and created_by = auth.uid()
    );
$$;

create or replace function public.can_access_client(p_client_id uuid)
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
      from public.clients
      where id = p_client_id
        and created_by = auth.uid()
    );
$$;

revoke all on function public.can_access_diagnostic(uuid) from public;
revoke all on function public.can_access_client(uuid) from public;
grant execute on function public.can_access_diagnostic(uuid) to authenticated;
grant execute on function public.can_access_client(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 1. clients
--   SELECT/UPDATE : created_by = auth.uid() OR admin
--   INSERT       : internal user, WITH CHECK created_by = auth.uid()
--                  OR admin (admin peut créer pour autrui ;
--                  commercial est forcé à lui-même — le trigger
--                  défaut `created_by = auth.uid()` est en filet).
--   DELETE       : admin
-- -----------------------------------------------------------------------------

drop policy if exists clients_authenticated_select on public.clients;
drop policy if exists clients_authenticated_insert on public.clients;
drop policy if exists clients_authenticated_update on public.clients;
drop policy if exists clients_authenticated_delete on public.clients;

create policy clients_owner_or_admin_select
  on public.clients
  for select to authenticated
  using (created_by = auth.uid() or public.is_admin());

create policy clients_internal_insert
  on public.clients
  for insert to authenticated
  with check (
    public.is_internal_user()
    and (created_by = auth.uid() or public.is_admin())
  );

create policy clients_owner_or_admin_update
  on public.clients
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy clients_admin_delete
  on public.clients
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. diagnostics
--   Même pattern que clients : ownership par `created_by`.
-- -----------------------------------------------------------------------------

drop policy if exists diagnostics_authenticated_select on public.diagnostics;
drop policy if exists diagnostics_authenticated_insert on public.diagnostics;
drop policy if exists diagnostics_authenticated_update on public.diagnostics;
drop policy if exists diagnostics_authenticated_delete on public.diagnostics;

create policy diagnostics_owner_or_admin_select
  on public.diagnostics
  for select to authenticated
  using (created_by = auth.uid() or public.is_admin());

create policy diagnostics_internal_insert
  on public.diagnostics
  for insert to authenticated
  with check (
    public.is_internal_user()
    and (created_by = auth.uid() or public.is_admin())
  );

create policy diagnostics_owner_or_admin_update
  on public.diagnostics
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy diagnostics_admin_delete
  on public.diagnostics
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. diagnostic_answers
--   Ownership joint via `diagnostic_id`. DELETE admin uniquement —
--   les réponses sont l'historique du questionnaire, on ne les
--   supprime pas en routine.
-- -----------------------------------------------------------------------------

drop policy if exists diagnostic_answers_authenticated_select on public.diagnostic_answers;
drop policy if exists diagnostic_answers_authenticated_insert on public.diagnostic_answers;
drop policy if exists diagnostic_answers_authenticated_update on public.diagnostic_answers;
drop policy if exists diagnostic_answers_authenticated_delete on public.diagnostic_answers;

create policy diagnostic_answers_accessible_select
  on public.diagnostic_answers
  for select to authenticated
  using (public.can_access_diagnostic(diagnostic_id));

create policy diagnostic_answers_accessible_insert
  on public.diagnostic_answers
  for insert to authenticated
  with check (public.can_access_diagnostic(diagnostic_id));

create policy diagnostic_answers_accessible_update
  on public.diagnostic_answers
  for update to authenticated
  using (public.can_access_diagnostic(diagnostic_id))
  with check (public.can_access_diagnostic(diagnostic_id));

create policy diagnostic_answers_admin_delete
  on public.diagnostic_answers
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. transcripts
--   Ownership joint via `diagnostic_id` ; on garde une porte de sortie
--   par `created_by` (cas niche : trainer ayant ajouté un transcript
--   à un diagnostic d'un autre commercial). DELETE admin uniquement.
-- -----------------------------------------------------------------------------

drop policy if exists transcripts_authenticated_select on public.transcripts;
drop policy if exists transcripts_authenticated_insert on public.transcripts;
drop policy if exists transcripts_authenticated_update on public.transcripts;
drop policy if exists transcripts_authenticated_delete on public.transcripts;

create policy transcripts_accessible_select
  on public.transcripts
  for select to authenticated
  using (
    public.can_access_diagnostic(diagnostic_id)
    or created_by = auth.uid()
  );

create policy transcripts_accessible_insert
  on public.transcripts
  for insert to authenticated
  with check (public.can_access_diagnostic(diagnostic_id));

create policy transcripts_accessible_update
  on public.transcripts
  for update to authenticated
  using (
    public.can_access_diagnostic(diagnostic_id)
    or created_by = auth.uid()
  )
  with check (
    public.can_access_diagnostic(diagnostic_id)
    or created_by = auth.uid()
  );

create policy transcripts_admin_delete
  on public.transcripts
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 5. diagnostic_participants
--   Pas de `created_by` sur cette table — ownership purement via
--   `diagnostic_id`. DELETE permis au propriétaire du diagnostic +
--   admin (cf. décision : commercial supprime via route interne s'il
--   est propriétaire ; admin supprime tout). `can_access_diagnostic`
--   couvre les deux cas.
-- -----------------------------------------------------------------------------

drop policy if exists diagnostic_participants_authenticated_select on public.diagnostic_participants;
drop policy if exists diagnostic_participants_authenticated_insert on public.diagnostic_participants;
drop policy if exists diagnostic_participants_authenticated_update on public.diagnostic_participants;
drop policy if exists diagnostic_participants_authenticated_delete on public.diagnostic_participants;

create policy diagnostic_participants_accessible_select
  on public.diagnostic_participants
  for select to authenticated
  using (public.can_access_diagnostic(diagnostic_id));

create policy diagnostic_participants_accessible_insert
  on public.diagnostic_participants
  for insert to authenticated
  with check (public.can_access_diagnostic(diagnostic_id));

create policy diagnostic_participants_accessible_update
  on public.diagnostic_participants
  for update to authenticated
  using (public.can_access_diagnostic(diagnostic_id))
  with check (public.can_access_diagnostic(diagnostic_id));

create policy diagnostic_participants_accessible_delete
  on public.diagnostic_participants
  for delete to authenticated
  using (public.can_access_diagnostic(diagnostic_id));

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Phase 2C (recommendations + recommendation_modules + training_sessions)
--   dans une migration séparée. Ne pas concaténer.
-- - Aucune policy `to anon` créée.
-- - Rollback : drop des nouvelles policies + recréer les
--   `authenticated using (true)` originales. Les fonctions helpers
--   `can_access_*` peuvent rester (idempotentes, utiles si re-durcissement).
