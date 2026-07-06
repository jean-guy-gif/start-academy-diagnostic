-- =============================================================================
-- Start Academy — RLS hardening Phase 2A (faible risque)
--
-- Tables durcies :
--   - training_modules           (catalogue référence)
--   - module_rules               (règles d'affectation, jamais lu en runtime)
--   - session_date_options       (créneaux proposés / sélectionnés)
--
-- Pré-requis appliqués :
--   - Phase 1 RLS (profils + tokens + activity_logs + ai_generation_logs)
--   - Helpers SQL : public.is_internal_user(), public.is_admin()
--   - Migration created_by triggers (Phase 2 préparation)
--   - Failfast SUPABASE_SERVICE_ROLE_KEY en preprod/prod (côté code)
--
-- Garanties :
--   - Aucune policy `to anon` — vérifié dans le commit.
--   - Toutes les routes publiques (dirigeant, formateur, participant,
--     date-option-select) passent par service_role → bypass RLS.
--   - Le cockpit, /settings/modules et l'API /api/sessions/:id/date-options
--     passent par service_role → bypass RLS.
--   - Le browser client lit session_date_options : couvert par la
--     policy SELECT `is_internal_user()`.
--   - Le browser client INSERT (createDateOption), UPDATE (cancel,
--     select) : couverts par les policies INSERT/UPDATE
--     `is_internal_user()`.
--   - Aucune écriture browser sur training_modules / module_rules
--     (vérifié : pas de createSupabaseBrowserClient pour ces tables).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. training_modules
--
--   Catalogue Start Academy interne. SELECT pour tout user interne.
--   INSERT/UPDATE/DELETE admin uniquement (le catalogue est posé par
--   migration / script admin, jamais par une UI commercial).
-- -----------------------------------------------------------------------------

drop policy if exists training_modules_authenticated_select on public.training_modules;
drop policy if exists training_modules_authenticated_insert on public.training_modules;
drop policy if exists training_modules_authenticated_update on public.training_modules;
drop policy if exists training_modules_authenticated_delete on public.training_modules;

create policy training_modules_internal_select
  on public.training_modules
  for select to authenticated
  using (public.is_internal_user());

create policy training_modules_admin_insert
  on public.training_modules
  for insert to authenticated
  with check (public.is_admin());

create policy training_modules_admin_update
  on public.training_modules
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy training_modules_admin_delete
  on public.training_modules
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. module_rules
--
--   Métadonnées de règles d'affectation, posées exclusivement par
--   migrations / scripts admin. Aucun accès runtime en code (vérifié).
--   Même pattern que training_modules.
-- -----------------------------------------------------------------------------

drop policy if exists module_rules_authenticated_select on public.module_rules;
drop policy if exists module_rules_authenticated_insert on public.module_rules;
drop policy if exists module_rules_authenticated_update on public.module_rules;
drop policy if exists module_rules_authenticated_delete on public.module_rules;

create policy module_rules_internal_select
  on public.module_rules
  for select to authenticated
  using (public.is_internal_user());

create policy module_rules_admin_insert
  on public.module_rules
  for insert to authenticated
  with check (public.is_admin());

create policy module_rules_admin_update
  on public.module_rules
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy module_rules_admin_delete
  on public.module_rules
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. session_date_options
--
--   Créneaux proposés / sélectionnés / annulés. Accès :
--   - browser client (commercial) → CREATE / LIST / UPDATE (cancel,
--     selection interne). Policies internal couvrent.
--   - route serveur internal (/api/sessions/:id/date-options et
--     /api/sessions/:id/date-options/:optionId) → admin client →
--     bypass RLS.
--   - chemin public dirigeant (/api/public/select-date-option,
--     page /public/session/[token]) → admin client → bypass RLS.
--   - DELETE : admin uniquement. Le code applicatif ne fait pas de
--     DELETE (cancel est un UPDATE status='cancelled') ; on garde
--     une policy DELETE admin pour les opérations de purge manuelle.
-- -----------------------------------------------------------------------------

drop policy if exists session_date_options_authenticated_select on public.session_date_options;
drop policy if exists session_date_options_authenticated_insert on public.session_date_options;
drop policy if exists session_date_options_authenticated_update on public.session_date_options;
drop policy if exists session_date_options_authenticated_delete on public.session_date_options;

create policy session_date_options_internal_select
  on public.session_date_options
  for select to authenticated
  using (public.is_internal_user());

create policy session_date_options_internal_insert
  on public.session_date_options
  for insert to authenticated
  with check (public.is_internal_user());

create policy session_date_options_internal_update
  on public.session_date_options
  for update to authenticated
  using (public.is_internal_user())
  with check (public.is_internal_user());

create policy session_date_options_admin_delete
  on public.session_date_options
  for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Phase 2B (clients / diagnostics / diagnostic_answers / transcripts /
--   diagnostic_participants) à exécuter dans une migration séparée
--   APRÈS validation pilote de Phase 2A. Ne pas concaténer.
-- - Rollback : migration de rollback prête sur demande
--   (drop policies internes + recréation des `authenticated using (true)`).
