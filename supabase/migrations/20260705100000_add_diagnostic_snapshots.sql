-- =============================================================================
-- Start Academy — Référentiel diagnostic v1.0 · Étape 5
--
-- Colonnes jsonb `ratios_snapshot` et `alerts_snapshot` sur
-- `diagnostics`. Elles matérialisent les résultats du moteur
-- `computeRatiosAndAlerts` (module pur côté code) pour :
--   • Le cockpit (lecture rapide sans recalcul).
--   • Le prompt IA (autoritaire — cf. Étape 6).
--
-- Alimentation : best-effort côté route serveur après chaque
-- INSERT / UPDATE significatif sur `diagnostic_answers`,
-- `diagnostic_participants` ou sur les colonnes de `diagnostics`
-- ajoutées en Étape 1. Un snapshot manquant est acceptable — le
-- moteur peut être ré-invoqué à la volée avant génération IA.
-- =============================================================================

alter table public.diagnostics
  add column if not exists ratios_snapshot jsonb,
  add column if not exists alerts_snapshot jsonb;

-- =============================================================================
-- Notes
-- =============================================================================
-- - Pas d'index nécessaire au MVP : ces colonnes sont lues
--   « par diagnostic » (via clé primaire), pas requêtées.
-- - Politique de minimisation activity_logs (inchangée) : on ne
--   logge JAMAIS le contenu des snapshots dans `activity_logs`.
-- - RLS : couverte par les policies existantes de `diagnostics`
--   (Phase 2B). Rien à changer.
