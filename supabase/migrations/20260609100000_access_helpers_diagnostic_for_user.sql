-- =============================================================================
-- Start Academy — Helper SQL ownership explicit-user pour diagnostics
--
-- Complète les helpers Phase 2D (`is_admin_for_user`,
-- `is_internal_user_for_user`, `can_user_access_session`) avec un
-- équivalent côté diagnostic. Permet aux routes serveur qui utilisent
-- `createSupabaseAdminClient()` (service_role → `auth.uid()` NULL)
-- de vérifier l'ownership avec un `p_user_id` explicite.
--
-- Usage : appelé via `supabase.rpc("can_user_access_diagnostic", ...)`
-- dans `src/lib/auth/assert-diagnostic-access.ts` (audit final §I-1 / I-2).
-- =============================================================================

create or replace function public.can_user_access_diagnostic(
  p_user_id uuid,
  p_diagnostic_id uuid
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
      from public.diagnostics d
      where d.id = p_diagnostic_id
        and (
          d.created_by = p_user_id
          or exists (
            select 1 from public.clients c
            where c.id = d.client_id and c.created_by = p_user_id
          )
        )
    );
$$;

revoke all on function public.can_user_access_diagnostic(uuid, uuid) from public;
grant execute on function public.can_user_access_diagnostic(uuid, uuid) to authenticated;
