-- =============================================================================
-- Start Academy — MVP 1
-- Schéma initial : profils, clients, diagnostics, transcripts, modules,
-- recommandations, sessions, logs IA.
--
-- RLS : MVP, tout `authenticated` peut lire/écrire. Sera durci par rôle
-- (commercial, admin, formateur, client_viewer, participant) dans une
-- future migration alignée sur le PRD §15.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helper : updated_at trigger function
-- -----------------------------------------------------------------------------
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- profiles : prolonge auth.users avec un rôle métier Start Academy
-- =============================================================================
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'commercial'
              check (role in ('commercial', 'admin', 'formateur', 'client_viewer', 'participant')),
  full_name   text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- =============================================================================
-- clients : entreprises pour lesquelles on construit un parcours
-- =============================================================================
create table public.clients (
  id                   uuid primary key default gen_random_uuid(),
  company_name         text not null,
  sector               text,
  director             text,
  email                text,
  phone                text,
  collaborators_count  integer,
  team_typology        text[] not null default '{}',
  crm_used             text,
  ai_tools             text[] not null default '{}',
  maturity_global      text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index clients_created_by_idx   on public.clients (created_by);
create index clients_company_name_idx on public.clients (company_name);

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.update_updated_at();

-- =============================================================================
-- training_modules : catalogue importé depuis l'Excel officiel
-- (id = slug, identique à src/lib/data/module-catalog.ts)
-- =============================================================================
create table public.training_modules (
  id                    text primary key,
  name                  text not null,
  family                text not null,
  source_sheet          text not null
                        check (source_sheet in ('Conseiller', 'Manager', 'Assistantes')),
  target_profile        text not null
                        check (target_profile in ('conseiller', 'manager', 'assistant', 'direction')),
  duration_hours        numeric,
  level                 numeric,
  tools                 text,
  paying                boolean,
  platform              text,
  need_identification   text,
  is_foundation_module  boolean not null default false,
  diagnostic_signals    text[] not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index training_modules_family_idx          on public.training_modules (family);
create index training_modules_target_profile_idx  on public.training_modules (target_profile);
create index training_modules_foundation_idx      on public.training_modules (is_foundation_module);

create trigger training_modules_updated_at
  before update on public.training_modules
  for each row execute function public.update_updated_at();

-- =============================================================================
-- module_rules : règles de recommandation prioritaires (PRD §9)
-- =============================================================================
create table public.module_rules (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  trigger_signal    text not null,
  required_modules  text[] not null default '{}',  -- training_modules.id
  priority          integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index module_rules_is_active_idx on public.module_rules (is_active);
create index module_rules_priority_idx  on public.module_rules (priority);

create trigger module_rules_updated_at
  before update on public.module_rules
  for each row execute function public.update_updated_at();

-- =============================================================================
-- diagnostics : 1 rendez-vous commercial qualifié
-- =============================================================================
create table public.diagnostics (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.clients (id) on delete cascade,
  commercial_id         uuid references public.profiles (id) on delete set null,
  meeting_date          timestamptz,
  mode                  text not null default 'guided'
                        check (mode in ('guided', 'transcript', 'hybrid')),
  status                text not null default 'draft'
                        check (status in (
                          'draft', 'in_progress', 'transcript_uploaded',
                          'ai_analyzed', 'to_review', 'validated'
                        )),
  declared_goal         text,
  profiles_in_scope     text[] not null default '{}',
  expected_participants integer,
  notes                 text,
  ai_synthesis          text,
  ai_confidence         numeric,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index diagnostics_client_id_idx   on public.diagnostics (client_id);
create index diagnostics_status_idx      on public.diagnostics (status);
create index diagnostics_created_by_idx  on public.diagnostics (created_by);

create trigger diagnostics_updated_at
  before update on public.diagnostics
  for each row execute function public.update_updated_at();

-- =============================================================================
-- diagnostic_answers : réponses aux questions guidées
-- =============================================================================
create table public.diagnostic_answers (
  id              uuid primary key default gen_random_uuid(),
  diagnostic_id   uuid not null references public.diagnostics (id) on delete cascade,
  question_id     text not null,
  question_text   text,
  category        text
                  check (category in (
                    'tool_maturity', 'commercial_performance',
                    'business_skill', 'execution'
                  )),
  answer          text,
  note            text,
  is_weak_signal  boolean not null default false,
  is_skipped      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index diagnostic_answers_diagnostic_id_idx on public.diagnostic_answers (diagnostic_id);
create index diagnostic_answers_question_id_idx  on public.diagnostic_answers (question_id);

-- =============================================================================
-- transcripts : retranscription du RDV (mode transcript ou hybrid)
-- =============================================================================
create table public.transcripts (
  id                 uuid primary key default gen_random_uuid(),
  diagnostic_id      uuid not null references public.diagnostics (id) on delete cascade,
  content            text not null,
  source             text,                  -- 'pasted' | 'upload' | 'recording'
  extracted_payload  jsonb,                 -- placeholder pour l'extraction IA
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index transcripts_diagnostic_id_idx on public.transcripts (diagnostic_id);

create trigger transcripts_updated_at
  before update on public.transcripts
  for each row execute function public.update_updated_at();

-- =============================================================================
-- recommendations : sortie du moteur IA (PRD §16.2)
-- =============================================================================
create table public.recommendations (
  id                    uuid primary key default gen_random_uuid(),
  diagnostic_id         uuid not null references public.diagnostics (id) on delete cascade,
  status                text not null default 'generated'
                        check (status in (
                          'not_generated', 'generated', 'to_review', 'sent',
                          'opened', 'accepted', 'refused', 'to_rework'
                        )),
  client_summary        text,
  detected_needs        jsonb not null default '[]'::jsonb,
  performance_issues    jsonb not null default '[]'::jsonb,
  tool_maturity         text check (tool_maturity in ('low', 'medium', 'high')),
  skill_level           text check (skill_level in ('beginner', 'intermediate', 'advanced', 'mixed')),
  required_foundations  jsonb not null default '[]'::jsonb,
  total_duration_hours  numeric,
  cost_per_participant  numeric,
  confidence_score      numeric,
  missing_information   jsonb not null default '[]'::jsonb,
  commercial_explanation text,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index recommendations_diagnostic_id_idx on public.recommendations (diagnostic_id);
create index recommendations_status_idx        on public.recommendations (status);
create index recommendations_created_by_idx    on public.recommendations (created_by);

create trigger recommendations_updated_at
  before update on public.recommendations
  for each row execute function public.update_updated_at();

-- =============================================================================
-- recommendation_modules : modules retenus + ordre + justification
-- =============================================================================
create table public.recommendation_modules (
  id                       uuid primary key default gen_random_uuid(),
  recommendation_id        uuid not null references public.recommendations (id) on delete cascade,
  module_id                text not null references public.training_modules (id) on delete restrict,
  position                 integer not null default 0,
  reason                   text,
  duration_hours           numeric,
  business_ratio_targeted  text,
  use_cases                jsonb not null default '[]'::jsonb,
  created_at               timestamptz not null default now()
);

create index recommendation_modules_recommendation_id_idx
  on public.recommendation_modules (recommendation_id);
create index recommendation_modules_module_id_idx
  on public.recommendation_modules (module_id);

-- =============================================================================
-- training_sessions : fiche session formation côté CRM
-- =============================================================================
create table public.training_sessions (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients (id) on delete cascade,
  diagnostic_id          uuid references public.diagnostics (id) on delete set null,
  recommendation_id      uuid references public.recommendations (id) on delete set null,
  status                 text not null default 'created'
                         check (status in (
                           'created', 'awaiting_client_validation', 'dates_to_position',
                           'dates_validated', 'collection_open', 'data_collected',
                           'support_generating', 'support_ready', 'delivered', 'report_sent'
                         )),
  proposed_dates         timestamptz[] not null default '{}',
  validated_date         timestamptz,
  expected_participants  integer,
  notes                  text,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index training_sessions_client_id_idx       on public.training_sessions (client_id);
create index training_sessions_diagnostic_id_idx   on public.training_sessions (diagnostic_id);
create index training_sessions_recommendation_id_idx
  on public.training_sessions (recommendation_id);
create index training_sessions_status_idx          on public.training_sessions (status);
create index training_sessions_created_by_idx      on public.training_sessions (created_by);

create trigger training_sessions_updated_at
  before update on public.training_sessions
  for each row execute function public.update_updated_at();

-- =============================================================================
-- ai_generation_logs : traçabilité des appels LLM (PRD §16.1)
-- =============================================================================
create table public.ai_generation_logs (
  id                  uuid primary key default gen_random_uuid(),
  diagnostic_id       uuid references public.diagnostics (id) on delete set null,
  recommendation_id   uuid references public.recommendations (id) on delete set null,
  session_id          uuid references public.training_sessions (id) on delete set null,
  provider            text not null,                -- 'claude' | 'openai' | ...
  model               text,
  purpose             text,                          -- 'analyze' | 'generate_proposal' | ...
  prompt              jsonb,
  response            jsonb,
  duration_ms         integer,
  tokens_input        integer,
  tokens_output       integer,
  cost_estimate       numeric,
  status              text not null default 'success'
                      check (status in ('success', 'error', 'partial')),
  error               text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

create index ai_generation_logs_diagnostic_id_idx     on public.ai_generation_logs (diagnostic_id);
create index ai_generation_logs_recommendation_id_idx on public.ai_generation_logs (recommendation_id);
create index ai_generation_logs_session_id_idx        on public.ai_generation_logs (session_id);
create index ai_generation_logs_created_by_idx        on public.ai_generation_logs (created_by);
create index ai_generation_logs_status_idx            on public.ai_generation_logs (status);

-- =============================================================================
-- RLS — MVP : tout `authenticated` peut lire/écrire sur toutes les tables.
-- À durcir par rôle dans une migration future.
-- =============================================================================
alter table public.profiles               enable row level security;
alter table public.clients                enable row level security;
alter table public.training_modules       enable row level security;
alter table public.module_rules           enable row level security;
alter table public.diagnostics            enable row level security;
alter table public.diagnostic_answers     enable row level security;
alter table public.transcripts            enable row level security;
alter table public.recommendations        enable row level security;
alter table public.recommendation_modules enable row level security;
alter table public.training_sessions      enable row level security;
alter table public.ai_generation_logs     enable row level security;

do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'clients', 'training_modules', 'module_rules',
    'diagnostics', 'diagnostic_answers', 'transcripts',
    'recommendations', 'recommendation_modules',
    'training_sessions', 'ai_generation_logs'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t || '_authenticated_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true);',
      t || '_authenticated_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true);',
      t || '_authenticated_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (true);',
      t || '_authenticated_delete', t
    );
  end loop;
end;
$$;
