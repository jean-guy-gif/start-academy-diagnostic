-- =============================================================================
-- Start Academy — Référentiel diagnostic v1.0 · Étape 3
--
-- Table `funding_config` : référentiel paramétrable et versionné des
-- règles de financement (AGEFICE, OPCO EP…). Correction validée :
-- une seule ligne active par `key` grâce à un index partiel unique
-- (contrainte : `valid_to IS NULL` = ligne active).
--
-- Historisation : quand un seuil change, on ne supprime pas — on
-- passe `valid_to` de l'ancienne ligne à `now()` (elle devient
-- historique), et on insère une nouvelle ligne avec `valid_from` =
-- `now()`.
--
-- Correction validée : seed d'une 4e clé OPCO_EP_ANNUAL_CAP en
-- placeholder ("valeur indicative à valider").
-- =============================================================================

create table public.funding_config (
  id                uuid primary key default gen_random_uuid(),
  key               text not null,
  value_numeric     numeric,
  value_text        text,
  valid_from        date not null default current_date,
  valid_to          date,
  notes             text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index funding_config_key_idx on public.funding_config (key);
create index funding_config_valid_from_idx on public.funding_config (valid_from);

-- Correction validée : une seule ligne active par `key`.
-- Un index UNIQUE PARTIEL (WHERE valid_to IS NULL) empêche d'avoir
-- deux versions "en cours" simultanément.
create unique index funding_config_active_key_uidx
  on public.funding_config (key)
  where valid_to is null;

create trigger funding_config_updated_at
  before update on public.funding_config
  for each row execute function public.update_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — lecture rôles internes, écriture admin
-- -----------------------------------------------------------------------------
alter table public.funding_config enable row level security;

create policy funding_config_internal_select
  on public.funding_config
  for select to authenticated
  using (public.is_internal_user());

create policy funding_config_admin_insert
  on public.funding_config
  for insert to authenticated
  with check (public.is_admin());

create policy funding_config_admin_update
  on public.funding_config
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy funding_config_admin_delete
  on public.funding_config
  for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Seed v1.0 (valeurs initiales, alignées avec les constantes du
-- module `training-funding.ts` pour rétro-compat parfaite)
-- -----------------------------------------------------------------------------
insert into public.funding_config (key, value_numeric, notes) values
  (
    'AGEFICE_THRESHOLD',
    7000,
    'Seuil CA N-1 pour éligibilité potentielle agent commercial indépendant (v1.0).'
  ),
  (
    'AGEFICE_ANNUAL_CAP',
    3000,
    'Plafond annuel indicatif de prise en charge par indé éligible (v1.0). À confirmer dossier par dossier.'
  ),
  (
    'CONSUMPTION_LEVER_PERCENT',
    30,
    'Sous ce % de consommation des droits 24 mois, activer le levier commercial "vos droits sont sous-utilisés" (v1.0).'
  ),
  (
    'OPCO_EP_ANNUAL_CAP',
    2500,
    'valeur indicative à valider — plafond annuel indicatif OPCO EP par salarié éligible (v1.0). À confirmer selon fonction / convention / temps de travail.'
  );

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Rotation de valeur : `update funding_config set valid_to = current_date
--     where key = 'AGEFICE_THRESHOLD' and valid_to is null;`
--   puis `insert into funding_config (key, value_numeric, notes) values (...);`
-- - Le service côté code lit la ligne active (`valid_to IS NULL`)
--   pour chaque `key` — voir `funding-config-service.ts` (Étape 3).
-- - Aucune valeur sensible : les 3 000 € / 7 000 € sont publics
--   (documents dirigeant, PRD, comm marketing). Pas d'exposition
--   critique côté sécurité, la RLS admin-write suffit.
