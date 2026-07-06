-- =============================================================================
-- Start Academy — Référentiel diagnostic v1.0 · Étape 2
--
-- Étend `diagnostic_participants` pour couvrir :
--   • Ch. 2.2 fiche agent indépendant (statut, projection année en
--     cours, souhaits, besoin prioritaire)
--   • Ch. 2.3 fiche salarié (fonction, contrat, convention,
--     éligibilité OPCO)
--   • Historique formation 24 mois (individuel — commun aux 2
--     statuts)
--
-- Discriminant retenu : `professional_status` (déjà présent, valeurs
-- `salarie` / `agent_commercial_independant` / `autre`). On NE
-- SCINDE PAS en 2 tables. Un salarié aura NULL sur les champs indé
-- (expert_level, ca_annee_en_cours) ; un indé aura NULL sur les
-- champs salarié (job_title, contract_type, convention_collective,
-- eligible_opco).
--
-- Aucun champ requis (règle transverse : ne bloque jamais).
-- =============================================================================

alter table public.diagnostic_participants
  add column if not exists last_name text,
  add column if not exists entry_date date,
  -- Champs agent indépendant
  add column if not exists expert_level text
    check (
      expert_level is null
      or expert_level in ('debutant', 'confirme', 'expert')
    ),
  add column if not exists ca_annee_en_cours numeric,
  add column if not exists wants_evolution boolean,
  add column if not exists wants_training boolean,
  add column if not exists priority_need text,
  -- Champs salarié
  add column if not exists job_title text,
  add column if not exists contract_type text
    check (
      contract_type is null
      or contract_type in ('temps_plein', 'temps_partiel')
    ),
  -- convention_collective : colonne nullable simple. Le pré-remplissage
  -- « Immobilier — IDCC 1527 » vit UNIQUEMENT côté UI (bascule salarié
  -- dans `diagnostic-participants-editor.tsx`) — pas de default SQL
  -- pour ne pas polluer les insertions administratives / import.
  add column if not exists convention_collective text,
  add column if not exists eligible_opco boolean,
  -- Historique formation 24 mois (individuel — commun aux 2 statuts)
  add column if not exists formations_24m_count integer,
  add column if not exists formations_24m_hours integer,
  add column if not exists formations_24m_amount numeric;

-- Index doux : le `priority_need` sera souvent un id catalogue,
-- on facilite le lookup côté cockpit / génération.
create index if not exists diagnostic_participants_priority_need_idx
  on public.diagnostic_participants (priority_need);

-- =============================================================================
-- Notes opérationnelles
-- =============================================================================
-- - `convention_collective` sans default SQL — le pré-remplissage
--   « Immobilier — IDCC 1527 » vit uniquement côté UI (bascule
--   salarié dans le composant `diagnostic-participants-editor`).
--   Motif : ne pas polluer les insertions faites via SQL / import.
-- - Aucun champ NOT NULL — les fiches partiellement remplies restent
--   valides, la couche alerte (Étape 5) surfacera les manques.
-- - Aucun champ n'est log dans `activity_logs` (politique existante :
--   pas de production individuelle en metadata).
-- - RLS : couverte par Phase 2B (can_access_diagnostic). Rien à
--   changer.
