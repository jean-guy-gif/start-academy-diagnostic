-- =============================================================================
-- Chantier A du PRD funding-opco-ep — consommation déjà entamée cette année
-- (année civile) à retrancher des enveloppes AGEFICE / OPCO EP avant
-- plafonnement du reste à charge.
--
-- Origine : docs/funding-opco-ep-prd.md §9 (Consommation déjà entamée cette
-- année). Deux champs seulement (option β validée) — on ne duplique pas les
-- 5 champs formations_24m_* de la table `diagnostics` qui sont morts en
-- pratique (aucune UI ne les remplit ; cleanup à faire dans une PR séparée
-- post-chantier A).
--
-- Sémantique — À NE PAS CONFONDRE avec les champs 24m existants sur
-- `diagnostic_participants` :
--   * `formations_24m_amount` (existant) = montant total de formations
--     passées 24 mois, TOUS financements confondus. Utilisé UNIQUEMENT
--     pour la maturité formation (ratios-service, indicateur « levier
--     disponible ≤ 30 % »).
--   * `agefice_amount_consumed_current_year` (nouveau) = montant AGEFICE
--     spécifiquement déjà consommé PAR CE COLLABORATEUR DEPUIS JANVIER
--     de l'année civile en cours. Utilisé pour retrancher son plafond
--     annuel AGEFICE avant calcul du reste à charge.
--   * `opco_ep_amount_consumed_current_year` sur `diagnostics` (nouveau) =
--     montant OPCO EP déjà utilisé par l'ENTREPRISE depuis janvier de
--     l'année civile en cours, tous salariés confondus. Utilisé pour
--     retrancher l'enveloppe entreprise avant calcul du reste à charge.
--
-- Les deux champs sont NULLABLE (le dirigeant / participant peut ne pas
-- connaître le montant). Le code doit afficher une alerte « estimation à
-- valider » quand le champ est NULL — jamais calculer sur 0 silencieusement
-- (cf. PRD §9.3).
-- =============================================================================

alter table public.diagnostics
  add column if not exists opco_ep_amount_consumed_current_year numeric;

alter table public.diagnostic_participants
  add column if not exists agefice_amount_consumed_current_year numeric;
