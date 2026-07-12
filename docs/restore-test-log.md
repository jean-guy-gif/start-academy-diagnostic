# Registre — Tests de restauration §7

Journal daté des exécutions du test de restauration décrit dans
`docs/preprod-stabilization-plan.md` §7 et `docs/operations-runbook.md` §4.

- Le **runbook** décrit *comment* restaurer (procédure de référence).
- Le **plan de stabilisation** définit *quels critères* valident un test.
- Ce **log** enregistre *quand, par qui, avec quel résultat* chaque test a été
  effectivement joué. Il sert de preuve datée pour la décision d'ouverture pilote.

---

## 2026-07-12 — Test initial post-§6 (avec données smoke §4)

- **Opérateur** : Laurent
- **Backup source** :
  - `backups/preprod_schema_20260712_1205.sql` (86 104 B)
  - `backups/preprod_data_20260712_1205.sql` (390 880 B)
  - `backups/preprod_auth_data_20260712_1205.sql` (8 653 B)
  - `backups/storage_20260712_1205/` (4 fichiers, MANIFEST.json présent)
- **Projet Supabase test** : `start-academy-restore-test-20260712` (ref `xyotsupfgvmyhmrnxvln`)
  - Région : eu-west-3
  - Connexion : Session pooler (IPv4) — la connexion directe échoue en IPv6 depuis Docker
  - Supprimé le : 2026-07-12 (post-validation)
- **Doc test** : `sessions/74a97a81-.../participants/jean-guy_at_start-academy.fr/1783524815182-Dossier_Tactique_Suivi_IA_A4_1_2_.pdf` (79 812 B)

### Résultats

| Critère | Attendu | Observé | ✅ / ❌ |
|---|---|---|---|
| Garde (A) — host ≠ `shhcefbojixjhgefcbyn` | ok | host = aws-0-eu-west-3.pooler | ✅ |
| Garde (B) — `public.tables` count avant restore | 0 | 0 | ✅ |
| Restore SCHEMA — exit 0 | ok | ok | ✅ |
| Restore AUTH DATA — exit 0 | ok | ok | ✅ |
| Restore PUBLIC DATA — exit 0 | ok | ok | ✅ |
| `session_replication_role` post-restore | `origin` | origin | ✅ |
| `auth.users` count | 4 | 4 | ✅ |
| `diagnostics` | 4 | 4 | ✅ |
| `training_sessions` | 8 | 8 | ✅ |
| `diagnostic_participants` | 4 | 4 | ✅ |
| `diagnostic_answers` | 87 | 87 | ✅ |
| `post_training_reviews` | 1 | 1 | ✅ |
| `clients` | 4 | 4 | ✅ |
| `recommendations` | 5 | 5 | ✅ |
| `profiles` | 4 | 4 | ✅ |
| `session_participants` | 4 | 4 | ✅ |
| `session_documents` | 4 | 4 | ✅ |
| `session_date_options` | 4 | 4 | ✅ |
| `support_quality_reviews` | 1 | 1 | ✅ |
| `designed_training_supports` | 1 | 1 | ✅ |
| `training_supports` | 1 | 1 | ✅ |
| `recommendation_modules` | 20 | 20 | ✅ |
| `training_modules` | 79 | 79 | ✅ |
| `public_access_tokens` | 11 | 11 | ✅ |
| `funding_config` | 4 | 4 | ✅ |
| `activity_logs` | 24 | 24 | ✅ |
| `ai_generation_logs` | 10 | 10 | ✅ |
| `pg_tables` public sans RLS | 0 | 0 | ✅ |
| Bucket `session-documents` `public` | `f` | f | ✅ |
| Upload doc test HTTP | 200 | 200 | ✅ |
| Signed URL générée | non vide | ok | ✅ |
| Download signed URL HTTP | 200 | 200 | ✅ |
| **SHA-256 backup == SHA-256 download** | **match** | `9d3be332…93a6` == `9d3be332…93a6` | ✅ |
| Navigabilité diag → session → doc | 1 ligne | 1 ligne | ✅ |

### Notes / incidents

Aucun échec de fond. Frictions techniques résolues en cours de run, toutes sans
impact sur la validité du backup :
- Mot de passe DB avec caractères spéciaux (`@`, `!`) cassait l'URI → réinitialisé en alphanumérique.
- Bug `psql_test` : `$PGURL` expansé côté hôte sous `set -u` → corrigé (passage direct de `$RESTORE_DB_URL`).
- Connexion directe IPv6 injoignable depuis Docker → bascule sur Session pooler (IPv4).
- Service_role key initiale invalide (`JWS Protected Header is invalid`) → remplacée par la bonne clé du projet test.
- Relances après échec : nettoyage manuel requis (`truncate auth.users cascade` + `drop/create schema public`) car la garde B refuse une base non vierge.

Amélioration future (non bloquante) : intégrer ce nettoyage en préambule du script
pour le rendre rejouable d'un seul coup. Compromis connu : mot de passe visible dans
`ps` pendant `docker run` — acceptable pour un test local jetable.

### Décision pilote

- [x] ✅ Restauration validée — §7 clôturé, backup préprod prouvé utile de bout en bout.
- [ ] ⚠️ Restauration partielle — décrire l'écart et le suivi à mener avant reclôture.
- [ ] ❌ Restauration échouée — bloquant pour l'ouverture pilote, plan d'action à définir.

### Post-actions

- [x] Restauration validée (SHA-256 match, counts conformes, navigabilité OK)
- [ ] Projet Supabase test **supprimé** (dashboard → Settings → Delete project)
- [ ] Fichier `.env.restore-test` **supprimé** du poste
- [ ] Fichiers temporaires `/tmp/restore-check.pdf`, `/tmp/upload-resp.json` supprimés (le script le fait)
- [ ] §7 marqué CLOS dans `docs/preprod-stabilization-plan.md`