-- =============================================================================
-- proposals — persistance serveur des propositions générées (LLM ou heuristic)
--
-- Origine : audit Q1 persistance 2026-07-18 (post refonte tarif). Le cache
-- localStorage historique empêchait Jean-Guy de voir les propositions
-- générées par Laurent depuis son navigateur — chaque commercial
-- re-générait en doublon (coût IA + risque de divergence de contenu).
-- Le cache ignorait aussi l'ownership → risque cross-user sur navigateur
-- partagé, incompatible avec la doctrine T-9/T-11 durcie au §5.
--
-- Modèle : « lecture partagée internes / écriture cloisonnée owner ou
-- admin, DELETE réservé admin » — pattern verbatim training_sessions
-- (migration 20260606100000_rls_hardening_phase_2c).
--
-- Contrainte fonctionnelle : 1 proposition active par diagnostic (index
-- unique). Le service utilise INSERT ... ON CONFLICT (diagnostic_id)
-- DO UPDATE pour l'upsert. L'historique des générations est déjà tracé
-- dans activity_logs (event_type 'proposal_generated' est dans la
-- whitelist ACTIVITY_EVENT_TYPES, cf. activity-event-types.ts).
-- =============================================================================

create table public.proposals (
  id                uuid primary key default gen_random_uuid(),
  diagnostic_id     uuid not null references public.diagnostics (id) on delete cascade,
  recommendation_id uuid references public.recommendations (id) on delete set null,
  proposal_json     jsonb not null,
  source            text not null check (source in ('llm', 'heuristic')),
  provider          text,                 -- 'openrouter' | null
  model             text,
  generated_at      timestamptz not null default now(),
  notes             text[] not null default '{}',
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 1 proposition MAX par diagnostic. L'upsert écrase la précédente.
create unique index proposals_diagnostic_id_uidx
  on public.proposals (diagnostic_id);

-- Indexes de lecture par ownership et par recommandation
create index proposals_created_by_idx        on public.proposals (created_by);
create index proposals_recommendation_id_idx on public.proposals (recommendation_id);

-- Trigger updated_at (fonction déjà posée par init MVP1)
create trigger proposals_updated_at
  before update on public.proposals
  for each row execute function public.update_updated_at();

-- =============================================================================
-- RLS — pattern verbatim training_sessions_* de la phase 2C
-- =============================================================================

alter table public.proposals enable row level security;

-- SELECT : lecture partagée owner OU admin
create policy proposals_accessible_select
  on public.proposals
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
  );

-- INSERT : réservé aux utilisateurs internes, et le created_by DOIT
-- correspondre à auth.uid() (ou l'appelant est admin).
-- Empêche un compte anonyme ou un rôle externe d'insérer avec un
-- created_by bricolé.
create policy proposals_internal_insert
  on public.proposals
  for insert to authenticated
  with check (
    public.is_internal_user()
    and (created_by = auth.uid() or public.is_admin())
  );

-- UPDATE : owner OU admin
create policy proposals_owner_or_admin_update
  on public.proposals
  for update to authenticated
  using      (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- DELETE : admin uniquement (pas d'auto-suppression owner —
-- doctrine « pas de perte silencieuse » §5).
create policy proposals_admin_delete
  on public.proposals
  for delete to authenticated
  using (public.is_admin());
