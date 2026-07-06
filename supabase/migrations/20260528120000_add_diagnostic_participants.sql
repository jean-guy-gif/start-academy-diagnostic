-- =============================================================================
-- Start Academy — Participants prévisionnels (saisis dès le diagnostic)
--
-- À ne PAS confondre avec `session_participants` (collecte côté
-- collaborateur via lien public). Ici on enregistre les estimations
-- que le commercial saisit en début de diagnostic : prénom, statut
-- pro, production N-1, estimation prise en charge.
--
-- Sert à dimensionner le pricing et estimer la prise en charge avant
-- toute saisie collaborateur. Quand la session sera créée et la
-- collecte ouverte, on pourra (futur) mapper ces lignes vers
-- session_participants par prénom/email saisi côté collaborateur.
-- =============================================================================

create table public.diagnostic_participants (
  id                            uuid primary key default gen_random_uuid(),
  diagnostic_id                 uuid not null references public.diagnostics (id) on delete cascade,
  first_name                    text,
  professional_status           text
                                check (
                                  professional_status is null
                                  or professional_status in (
                                    'salarie',
                                    'agent_commercial_independant',
                                    'autre'
                                  )
                                ),
  previous_year_production      numeric,
  funding_eligibility           text not null default 'unknown'
                                check (funding_eligibility in (
                                  'potentially_eligible',
                                  'not_eligible',
                                  'unknown'
                                )),
  estimated_funding_amount      numeric,
  estimated_remaining_cost      numeric,
  notes                         text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index diagnostic_participants_diagnostic_id_idx
  on public.diagnostic_participants (diagnostic_id);
create index diagnostic_participants_professional_status_idx
  on public.diagnostic_participants (professional_status);
create index diagnostic_participants_funding_eligibility_idx
  on public.diagnostic_participants (funding_eligibility);

create trigger diagnostic_participants_updated_at
  before update on public.diagnostic_participants
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — MVP : authenticated uniquement.
--
-- Pas d'anon : ces données sont saisies par le commercial Start Academy
-- en interne. La collecte collaborateur (lien public) écrit dans
-- `session_participants`, pas ici.
-- -----------------------------------------------------------------------------
alter table public.diagnostic_participants enable row level security;

create policy diagnostic_participants_authenticated_select
  on public.diagnostic_participants
  for select to authenticated using (true);

create policy diagnostic_participants_authenticated_insert
  on public.diagnostic_participants
  for insert to authenticated with check (true);

create policy diagnostic_participants_authenticated_update
  on public.diagnostic_participants
  for update to authenticated using (true) with check (true);

create policy diagnostic_participants_authenticated_delete
  on public.diagnostic_participants
  for delete to authenticated using (true);
