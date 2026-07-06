-- =============================================================================
-- Start Academy — Référentiel diagnostic v1.0 · Étape 1
--
-- Correction validée : le référentiel v1.0 distingue :
--   • `clients` : identité STABLE (ne change pas d'un diagnostic à l'autre).
--   • `diagnostics` : photo temporelle à l'instant T. Un client aura
--     plusieurs diagnostics — chaque snapshot financier / effectif /
--     historique formation vit ICI, pas sur `clients`.
--
-- Colonnes ajoutées :
--   clients  → enseigne, siret, date_creation, adresse_principale,
--              site_internet, nombre_agences, secteurs_geographiques,
--              typologie_biens (identité STABLE uniquement)
--
--   diagnostics →
--     · Effectifs granulaires (Ch. 2.1) :
--         nb_salaries, nb_agents_indep, nb_assistants,
--         nb_managers, nb_dirigeants
--     · Photo temporelle (Ch. 1) :
--         ventes_n_moins_1, ca_global_n_moins_1,
--         objectif_ca_annee_en_cours, ambition_3_ans,
--         activite_repartition (jsonb : % transaction ancien / neuf /
--           location / gestion / syndic)
--     · Historique formation entreprise (Ch. 2.4) :
--         formations_24m_count, formations_24m_hours,
--         formations_24m_organizations text[],
--         formations_24m_topics text[],
--         formations_24m_satisfaction (1..5)
--     · Usage antérieur AGEFICE / OPCO (Ch. 2.4) :
--         agefice_used_before, opco_used_before,
--         knows_current_rights, past_refusals,
--         past_refusals_reason,
--         internal_training_budget,
--         internal_training_budget_amount
--
-- Migration additive, aucune valeur existante n'est invalidée.
-- Toutes les colonnes sont nullables (le diagnostic peut être
-- partiellement rempli, cf. règle transverse "aucune donnée
-- obligatoire ne bloque").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. clients : identité stable
-- -----------------------------------------------------------------------------
alter table public.clients
  add column if not exists enseigne text,
  add column if not exists siret text,
  add column if not exists date_creation date,
  add column if not exists adresse_principale text,
  add column if not exists site_internet text,
  add column if not exists nombre_agences integer,
  add column if not exists secteurs_geographiques text[],
  add column if not exists typologie_biens text[];

-- Index doux sur SIRET (non-unique volontairement — on ne bloque pas
-- la saisie sur un SIRET dupliqué au MVP, mais on facilite la
-- recherche cockpit).
create index if not exists clients_siret_idx on public.clients (siret);

-- -----------------------------------------------------------------------------
-- 2. diagnostics : effectifs granulaires + photo temporelle + historique
--    formation entreprise (Ch. 2.4)
-- -----------------------------------------------------------------------------

-- 2.1 Effectifs granulaires (Ch. 2.1)
alter table public.diagnostics
  add column if not exists nb_salaries integer,
  add column if not exists nb_agents_indep integer,
  add column if not exists nb_assistants integer,
  add column if not exists nb_managers integer,
  add column if not exists nb_dirigeants integer;

-- 2.2 Photo temporelle Ch. 1 (activité, ventes, CA, objectifs, ambition)
alter table public.diagnostics
  add column if not exists ventes_n_moins_1 integer,
  add column if not exists ca_global_n_moins_1 numeric,
  add column if not exists objectif_ca_annee_en_cours numeric,
  add column if not exists ambition_3_ans text,
  -- activite_repartition : {"transaction_ancien":60,"neuf":10,"location":15,
  --                        "gestion":10,"syndic":5}  (somme ≠ 100 tolérée
  -- au MVP, un check plus strict pourra être ajouté quand l'UI le garantit)
  add column if not exists activite_repartition jsonb;

-- 2.3 Historique formation entreprise (Ch. 2.4)
alter table public.diagnostics
  add column if not exists formations_24m_count integer,
  add column if not exists formations_24m_hours integer,
  add column if not exists formations_24m_organizations text[],
  add column if not exists formations_24m_topics text[],
  add column if not exists formations_24m_satisfaction integer
    check (
      formations_24m_satisfaction is null
      or (formations_24m_satisfaction between 1 and 5)
    );

-- 2.4 Usage antérieur AGEFICE / OPCO + budget interne (Ch. 2.4)
--   `oui / non / ne_sait_pas` reflète le référentiel qui autorise
--   l'indécision (le dirigeant ne sait pas toujours si l'entreprise
--   a déjà mobilisé ces droits).
alter table public.diagnostics
  add column if not exists agefice_used_before text
    check (
      agefice_used_before is null
      or agefice_used_before in ('oui', 'non', 'ne_sait_pas')
    ),
  add column if not exists opco_used_before text
    check (
      opco_used_before is null
      or opco_used_before in ('oui', 'non', 'ne_sait_pas')
    ),
  add column if not exists knows_current_rights boolean,
  add column if not exists past_refusals boolean,
  add column if not exists past_refusals_reason text,
  add column if not exists internal_training_budget boolean,
  add column if not exists internal_training_budget_amount numeric;

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - Aucune contrainte NOT NULL ajoutée : la règle transverse du
--   référentiel v1.0 dit qu'une donnée obligatoire manquante ne bloque
--   jamais le diagnostic, elle génère une alerte (cf. Étape 5).
-- - RLS inchangée : `clients` et `diagnostics` sont déjà couvertes par
--   Phase 2B (owner OR admin), aucune nouvelle policy à créer.
-- - Rollback : DROP COLUMN sur les colonnes ajoutées si régression.
--   Les triggers set_created_by_if_null restent OK.
