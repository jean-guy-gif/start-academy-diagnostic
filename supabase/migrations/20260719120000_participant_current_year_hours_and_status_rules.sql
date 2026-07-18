-- =============================================================================
-- Chantier C1 — Unification du modèle participant.
--
-- Origine : correctif produit C1 (validé 2026-07-18). Décisions produit :
--   * Indé : conserve `previous_year_production` (CA N-1, obligatoire pour
--     l'estimation AGEFICE) + `ca_annee_en_cours` (facultatif, projection).
--     Ajoute `formations_current_year_hours` (heures formation utilisées
--     cette année civile) — collecté pour le refactor chantier B.
--     `agefice_amount_consumed_current_year` existe déjà (chantier A).
--   * Salarié : ne DOIT PLUS avoir de CA N-1. Ajoute
--     `opco_ep_amount_consumed_current_year` (montant OPCO EP pris en
--     charge pour ce salarié cette année civile) — collecté seulement,
--     pas utilisé dans le calcul en C1 (même dette que le champ
--     entreprise du chantier A ; refonte prévue chantier B).
--     Ajoute `formations_current_year_hours` (idem indé).
--
-- Ordre STRICT :
--   1. ADD COLUMN (additif, NULLABLE, no-op sur les lignes existantes).
--   2. UPDATE purge `previous_year_production` sur les salariés existants
--      — les 4 250 valeurs actuelles côté salarié (audit préproduction)
--      sont dead data historique. Sans purge, le CHECK constraint ci-
--      dessous échouerait.
--   3. ALTER TABLE ADD CONSTRAINT — interdit désormais tout N-1 pour un
--      salarié (les futures insertions sont bloquées à la source).
--
-- Ce qu'on NE FAIT PAS ici (validé) :
--   * PAS de drop des colonnes `formations_24m_*` sur diagnostic_participants
--     — cleanup séparé après la bascule complète (les ratios les ignorent
--     déjà en C1, la route et l'éditeur cessent d'écrire, la lecture reste
--     techniquement possible pour éviter tout blast radius sur les
--     sélecteurs SELECT existants).
--   * PAS de bascule de la logique de calcul funding OPCO EP côté serveur
--     (voir chantier B — enveloppe entreprise + retranchement unique).
-- =============================================================================

-- Étape 1 — colonnes additives (idempotent). Les deux nullable, les 2
-- statuts (indé + salarié) peuvent renseigner les heures ; seul le
-- salarié renseigne le montant OPCO EP pris en charge (le champ est
-- présent en base mais n'a de sens que pour la branche salarié —
-- validation côté Zod).
alter table public.diagnostic_participants
  add column if not exists formations_current_year_hours numeric;

alter table public.diagnostic_participants
  add column if not exists opco_ep_amount_consumed_current_year numeric;

-- Étape 2 — purge des CA N-1 saisis pour des salariés (dead data). Sans
-- cette purge la contrainte ci-dessous ferait échouer la migration sur
-- les données existantes. `updated_at` volontairement non touché : le
-- backfill n'est pas un événement métier.
update public.diagnostic_participants
   set previous_year_production = null
 where professional_status = 'salarie'
   and previous_year_production is not null;

-- Étape 3 — CHECK constraint bloquant tout N-1 pour un salarié. Nom
-- explicite pour retrouver la contrainte via `\d+ diagnostic_participants`.
-- `drop … if exists` en tête pour rendre la migration idempotente en cas
-- de re-run local.
alter table public.diagnostic_participants
  drop constraint if exists diagnostic_participants_no_n1_for_salarie;
alter table public.diagnostic_participants
  add constraint diagnostic_participants_no_n1_for_salarie
  check (
    professional_status is null
    or professional_status <> 'salarie'
    or previous_year_production is null
  );
