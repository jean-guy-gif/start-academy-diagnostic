-- =============================================================================
-- Start Academy — Référentiel diagnostic v1.0 · Étape 4
--
-- Élargit le check constraint `diagnostic_answers.category` pour
-- accepter les 11 catégories chapitres du référentiel v1.0, en
-- conservant les 4 valeurs MVP1 (pas de migration destructive des
-- réponses existantes).
--
-- Valeurs conservées :
--   tool_maturity, commercial_performance, business_skill, execution
--
-- Nouvelles valeurs v1.0 (une par chapitre) :
--   identity, team, funding, prospecting, seller_meeting, mandates,
--   commercial_followup, buyers, visits_offers, db_reputation,
--   tools_ai, management
-- =============================================================================

alter table public.diagnostic_answers
  drop constraint if exists diagnostic_answers_category_check;

alter table public.diagnostic_answers
  add constraint diagnostic_answers_category_check
  check (
    category is null
    or category in (
      -- MVP1 (conservées, ne pas retirer)
      'tool_maturity',
      'commercial_performance',
      'business_skill',
      'execution',
      -- v1.0 (une par chapitre)
      'identity',
      'team',
      'funding',
      'prospecting',
      'seller_meeting',
      'mandates',
      'commercial_followup',
      'buyers',
      'visits_offers',
      'db_reputation',
      'tools_ai',
      'management'
    )
  );

-- Note : `database.types.ts` doit refléter cette union — cf. Étape 4
-- côté code (union `AnswerCategory` dans `src/types/index.ts`).
