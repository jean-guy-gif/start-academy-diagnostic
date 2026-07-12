# Plan de stabilisation préprod interne

> Document opérationnel. Une seule ambition : transformer l'état
> « ✅ pré-production interne prête » (cf.
> [prd-global-status-start-academy.md](prd-global-status-start-academy.md)
> §11.1) en environnement **réellement testé et exploitable** par
> l'équipe Start Academy.
>
> Aucune nouvelle fonctionnalité dans ce sprint. Tout est checklist
> + smoke + procédure.

---

## 1. Objectif

- **Sécuriser** l'environnement préprod (env vars, secrets, RLS).
- **Vérifier le flux complet** end-to-end, idéalement avec 2
  comptes commerciaux distincts pour valider la ségrégation.
- **Préparer un pilote distant contrôlé** (1–2 cabinets) :
  une fois ce plan exécuté, la décision §11 sera prise sur des
  faits, pas sur de l'intuition.
- **Éviter** d'ajouter du code applicatif pendant la fenêtre de
  stabilisation. Tout nouveau besoin est queue-é dans la roadmap
  produit (cf. PRD global §10).

---

## 2. Pré-requis techniques

### 2.1 Côté Supabase (projet preprod)

| Élément | État cible | Comment vérifier |
|---|---|---|
| Migrations toutes poussées | OK | `supabase db push` → no-op ; `select max(version) from supabase_migrations.schema_migrations;` |
| Bucket `session-documents` privé | OK | Dashboard → Storage → bucket → `public = false` |
| Catalogue `training_modules` seedé | OK | `select count(*) from public.training_modules;` ≥ 60 |
| Helpers SQL présents | OK | `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'is_%' or proname like 'can_%';` → liste 9 (cf. §3) |
| Trigger `handle_new_user` actif | OK | `select tgname from pg_trigger where tgname = 'on_auth_user_created';` |

### 2.2 Côté env applicatif

| Variable | Valeur attendue | Critique ? |
|---|---|---|
| `APP_ENV` | `preprod` | ✅ déclenche failfast `service_role` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL projet preprod | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key preprod | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role preprod | ✅ failfast si absente |
| `OPENROUTER_API_KEY` | clé valide avec solde | ⚠️ sinon IA en fallback heuristique |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4.5` | recommandé |
| `OPENROUTER_MAX_TOKENS` | `20000` | recommandé |
| `AI_MONTHLY_BUDGET_EUR` | ex. `50` | sinon KPI cockpit `Non configuré` |
| `AI_MONTHLY_WARNING_THRESHOLD_PERCENT` | `80` (défaut) | optionnel |
| `GMAIL_*` | vides | non branché MVP |

### 2.3 Côté repo / déploiement

- [ ] Aucun fichier `.env*` n'est commit (`git ls-files | grep '\.env'`).
- [ ] `git status` propre sur la branche de déploiement preprod.
- [ ] Build local OK : `npm run build` (sans erreur TS).
- [ ] `npx tsc --noEmit` → `EXIT 0`.

---

## 3. Checklist migrations à vérifier

Lister les fichiers présents dans `supabase/migrations/` et
confirmer qu'ils ont été appliqués sur preprod (via Supabase
dashboard → Database → Migrations OU via `select * from
supabase_migrations.schema_migrations order by version`).

| Migration | Apporte | Vérification SQL rapide |
|---|---|---|
| `20260521120000_init_mvp1.sql` | tables MVP1 | `select count(*) from public.diagnostics;` (≥ 0) |
| `20260522120000_add_session_participants_documents.sql` | `session_participants`, `session_documents` | `select count(*) from public.session_documents;` |
| `20260523120000_add_training_supports.sql` | `training_supports` | `\d public.training_supports` |
| `20260523130000_add_designed_training_supports.sql` | `designed_training_supports` | `\d public.designed_training_supports` |
| `20260524120000_auth_socle.sql` | rôles + trigger `handle_new_user` | `select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;` |
| `20260525120000_public_access_tokens.sql` | `public_access_tokens` | `\d public.public_access_tokens` |
| `20260526120000_add_participant_admin_fields.sql` | champs admin sur `session_participants` | — |
| `20260526120100_create_session_documents_bucket.sql` | bucket Storage | `select id, public from storage.buckets where id = 'session-documents';` → `public = false` |
| `20260527120000_add_session_date_options.sql` | `session_date_options` | — |
| `20260528120000_add_diagnostic_participants.sql` | `diagnostic_participants` | — |
| `20260528120100_add_recommendation_modules_priority_tier.sql` | `recommendation_modules.priority_tier` | — |
| `20260530120000_add_activity_logs.sql` | `activity_logs` | — |
| `20260601100000_extend_ai_generation_logs.sql` | `ai_generation_logs` étendu (`route`, `source`, `total_tokens`, status `fallback`) | `select column_name from information_schema.columns where table_name = 'ai_generation_logs';` |
| `20260602100000_rls_hardening_phase_1.sql` | RLS Phase 1 + helpers `is_admin`, `is_internal_user`, `get_my_role` | `select proname from pg_proc where proname in ('is_admin','is_internal_user','get_my_role');` |
| `20260603100000_prepare_rls_phase_2_created_by.sql` | trigger `set_created_by_if_null` × 10 tables | `select tgname from pg_trigger where tgname like '%_set_created_by';` (≥ 10) |
| `20260604100000_rls_hardening_phase_2a.sql` | RLS Phase 2A | — |
| `20260605100000_rls_hardening_phase_2b.sql` | RLS Phase 2B + helpers `can_access_diagnostic`, `can_access_client` | `select proname from pg_proc where proname like 'can_access_%';` |
| `20260606100000_rls_hardening_phase_2c.sql` | RLS Phase 2C + helpers `can_access_recommendation`, `can_access_session` | — |
| `20260607100000_rls_hardening_phase_2d.sql` | RLS Phase 2D + helpers `_for_user` (4) | `select proname from pg_proc where proname like '%_for_user';` (≥ 4) |
| `20260608100000_rls_hardening_phase_2e.sql` | RLS Phase 2E | — |
| `20260609100000_access_helpers_diagnostic_for_user.sql` | helper `can_user_access_diagnostic` | `select 'can_user_access_diagnostic' = any(array_agg(proname)) from pg_proc where pronamespace = 'public'::regnamespace;` |
| `20260610100000_ai_logs_status_rate_limited.sql` | status `rate_limited` autorisé | `select pg_get_constraintdef(oid) from pg_constraint where conname = 'ai_generation_logs_status_check';` contient `rate_limited` |
| `20260611100000_add_support_quality_reviews.sql` | `support_quality_reviews` | — |
| `20260612100000_add_post_training_reviews.sql` | `post_training_reviews` | — |
| `20260701100000_extend_clients_diagnostics_identity.sql` | Ch.1 identité stable clients + effectifs/temporel/Ch.2.4 sur `diagnostics` | `select column_name from information_schema.columns where table_name='diagnostics' and column_name='ratios_snapshot';` (pas encore là, mais colonnes v1.0 ajoutées) |
| `20260702100000_extend_diagnostic_participants.sql` | fiches indé/salarié + historique formation 24m (Ch.2.2/2.3) | `select column_name from information_schema.columns where table_name='diagnostic_participants' and column_name in ('expert_level','eligible_opco','formations_24m_count');` (3 lignes) |
| `20260703100000_add_funding_config.sql` | table `funding_config` versionnée + 4 seeds AGEFICE/OPCO | `select key, value_numeric from public.funding_config where valid_to is null order by key;` (4 lignes : `AGEFICE_ANNUAL_CAP=3000`, `AGEFICE_THRESHOLD=7000`, `CONSUMPTION_LEVER_PERCENT=30`, `OPCO_EP_ANNUAL_CAP=2500`) |
| `20260704100000_extend_diagnostic_answers_categories.sql` | check_constraint étendu à 16 valeurs (4 MVP1 + 12 v1.0 — Ch.2 dédoublé `team` effectifs + `funding` 2.4) | `select pg_get_constraintdef(oid) from pg_constraint where conname='diagnostic_answers_category_check';` contient `identity, team, funding, prospecting, seller_meeting, mandates, commercial_followup, buyers, visits_offers, db_reputation, tools_ai, management` |
| `20260705100000_add_diagnostic_snapshots.sql` | `diagnostics.ratios_snapshot`, `alerts_snapshot` jsonb | `select column_name from information_schema.columns where table_name='diagnostics' and column_name in ('ratios_snapshot','alerts_snapshot');` (2 lignes) |

**Acceptance critère §3** : les 29 migrations sont présentes dans
`supabase_migrations.schema_migrations`, le grep
`to anon` sur `supabase/migrations/` retourne 0 occurrence.

---

## 4. Smoke tests fonctionnels (1 admin + 2 commerciaux)

### 4.1 Préparation

**Contexte** : l'app n'expose **pas de page signup** — seul un
`signInWithPassword` sur `/login`. Toute création de compte passe
donc par le dashboard Supabase (Authentication → Users).

**Rôles reconnus** (check constraint `profiles_role_check` +
migration `20260524120000_auth_socle`) : `admin`, `commercial`,
`trainer`, `client_viewer`, `participant`.

**Sémantique des helpers RLS** (fonctions SECURITY DEFINER,
migration `20260602100000_rls_hardening_phase_1`) :

- `public.is_admin()` retourne `true` **si et seulement si**
  `profiles.role = 'admin'`.
- `public.is_internal_user()` retourne `true` si
  `profiles.role in ('admin', 'commercial', 'trainer')`. C'est le
  garde-fou de toutes les routes internes `INTERNAL_APP_ROLES`.
- `client_viewer` et `participant` ne comptent **pas** comme
  internes — ils voient les pages publiques via tokens, jamais le
  cockpit.

**Trigger d'auto-création `on_auth_user_created`** : à chaque INSERT
sur `auth.users`, la fonction `public.handle_new_user()` insère une
ligne dans `public.profiles` avec :

- `role` extrait de `raw_user_meta_data->>'role'` **s'il fait partie
  de la liste blanche** (`admin`, `commercial`, `trainer`,
  `client_viewer`, `participant`), sinon **défaut = `commercial`**.
- `full_name` extrait de `raw_user_meta_data->>'full_name'` (peut
  être null).
- `organization` extrait de `raw_user_meta_data->>'organization'`
  (peut être null).

**Trois comptes à créer** :

| Compte | Email | Rôle profile cible |
|---|---|---|
| Admin | `admin@start-academy.test` | `admin` |
| Commercial A | `commerciala@start-academy.test` | `commercial` |
| Commercial B | `commercialb@start-academy.test` | `commercial` |

#### Procédure — voie 1 (recommandée) : Dashboard Supabase → Add user

Dashboard preprod → Authentication → Users → **Add user** → *Create
new user*. Cocher **Auto Confirm User** (sinon compte inutilisable
avant confirmation email). Renseigner email + password provisoire.

**Impact du trigger** : la ligne `profiles` est créée automatiquement
avec `role = 'commercial'` (par défaut — le dashboard ne permet pas
de renseigner `raw_user_meta_data.role` au moment de la création
manuelle).

**Correction admin** : pour passer `admin@start-academy.test` en
`role = 'admin'`, exécuter dans SQL Editor **immédiatement après la
création** :

```sql
update public.profiles
set role = 'admin'
where email = 'admin@start-academy.test';

-- Vérification
select id, email, role, organization
from public.profiles
where email in (
  'admin@start-academy.test',
  'commerciala@start-academy.test',
  'commercialb@start-academy.test'
)
order by role, email;
```

**Résultat attendu** : 3 lignes, `admin` en `role = 'admin'`, les
deux commerciaux en `role = 'commercial'`, `organization = null`.

#### Procédure — voie 2 (alternative) : depuis SQL Editor avec metadata

Contourne l'étape « update après création » en passant le rôle dès
l'insert `auth.users`. Utile pour scripter la création :

```sql
-- À exécuter dans SQL Editor du dashboard (rôle service_role).
-- Répéter pour chaque compte en adaptant email / role / password.
select auth.admin_create_user(jsonb_build_object(
  'email',         'admin@start-academy.test',
  'password',      '<mot de passe fort>',
  'email_confirm', true,
  'user_metadata', jsonb_build_object(
    'role', 'admin',
    'full_name', 'Admin Test'
  )
));
```

Le trigger `handle_new_user` lit `user_metadata.role` et pose
directement `profiles.role = 'admin'` — aucun UPDATE nécessaire.

#### Voie non-recommandée : signup par l'app

Impossible en l'état — pas de page signup, `signInWithPassword`
uniquement. Ne pas activer de route signup dans le code applicatif
pour ce smoke : garder l'app cohérente avec sa cible produit
(comptes créés en interne, jamais par les commerciaux eux-mêmes).

### 4.2 Scénario complet (Commercial A)

| # | Action | Attendu |
|---|---|---|
| 1 | Login A → `/cockpit` | KPI cohérents, pas de session A pré-existante |
| 2 | `/diagnostics/new` : créer client + diagnostic (mode `guided`) | `clients.created_by = userA.id`, `diagnostics.created_by = userA.id` |
| 3 | Renseigner 5 réponses + 3 participants prévisionnels | `diagnostic_answers` × 5, `diagnostic_participants` × 3 |
| 4 | Statut diagnostic → `to_review` | `diagnostics.status = to_review`, journal `diagnostic_completed` |
| 5 | Recommandation IA via `/diagnostics/<id>/recommendation` | `recommendations` créée, `recommendation_modules` ≥ 1, journal `recommendation_generated`, ligne `ai_generation_logs` `status = success` (ou `fallback`) |
| 6 | Proposition via `/diagnostics/<id>/proposal` | journal `proposal_generated`, ligne `ai_generation_logs` |
| 7 | Créer session depuis la fiche diagnostic | `training_sessions.created_by = userA.id`, journal `session_created` |
| 8 | Créer lien dirigeant (access_type `client_session_view`) | `public_access_tokens` créée, URL affichée 1 fois, journal `access_link_created` |
| 9 | Ouvrir le lien dirigeant en navigation privée | Page rendue, agrégats funding affichés, **aucun N-1 individuel** |
| 10 | Créer 2 créneaux | `session_date_options` × 2, journal × 2 |
| 11 | Sélectionner un créneau depuis la page dirigeant | `selected_at` posé, autres en `proposed`, journal `date_option_selected` |
| 12 | Créer lien collaborateur (`participant_collect`) | OK |
| 13 | Soumettre un participant depuis la page collecte | `session_participants` créée, journal `participant_submitted` |
| 14 | Upload document (CNI fictive 1 Mo) | `session_documents` créée, blob dans Storage, journal `document_uploaded` |
| 15 | Génération support brut | `training_supports` créée, journal `training_support_generated`, ligne `ai_generation_logs` |
| 16 | Génération support designé | `designed_training_supports` créée, journal `designed_support_generated` |
| 17 | Validation pédagogique : noter 8 critères 0..3, valider | `support_quality_reviews.status = validated`, score calculé, journal `support_quality_validated` |
| 18 | Passer le support designé à `validated` (bouton DesignReady) | `designed_training_supports.status = validated` |
| 19 | Faire passer la session à `delivered` (via fiche session ou SQL admin) | `training_sessions.status = delivered` |
| 20 | Saisir suivi post-formation : 4 scores + 2 réussites + 1 blocage + 1 action | `post_training_reviews` créée, journal `post_training_review_created` |
| 21 | Marquer le suivi post-formation comme `completed` | `post_training_reviews.status = completed`, journal `post_training_review_completed` |
| 22 | Retour `/cockpit` | KPI à jour : « Supports à valider » −1, « Suivis post-formation à compléter » −1 |

### 4.3 Vérifications cockpit

- [ ] Bloc « Vue synthèse » : tous les KPIs cohérents avec le
      scénario.
- [ ] Bloc « Actions prioritaires » : pas de
      `validate_support_quality` ni `complete_post_training_review`
      pour la session de A après les étapes 17 et 21.
- [ ] Bloc « Pipeline formation » : la session de A est listée
      avec étape `delivered`.
- [ ] Bloc « Activité récente » : 10 derniers événements visibles.
- [ ] Bloc « Usage IA » :
  - Appels aujourd'hui ≥ 4 (analyze + proposal + support + design).
  - Coût estimé 7 jours non nul.
  - Taux fallback selon présence/absence d'`OPENROUTER_API_KEY`.
- [ ] Bloc « Budget IA mensuel » :
  - Status `ok` (ou `warning` si budget bas / dépense forte).
  - 3 KPIs renseignés, barre de progression visible.

### 4.4 Acceptance critère §4

100 % des 22 étapes du §4.2 passent ET les vérifications cockpit
§4.3 sont vertes.

---

## 5. Smoke tests sécurité

> **✅ §5 CLOS — 2026-07-12.** Script `security-smoke.mjs` : 29 ✅ / 0 ❌
> / 9 n/a. Laurent a validé les 4 vérifs UI manuelles (5.3.5, 5.4.2,
> 5.4.3, 5.5.2). Les 5 n/a restants (5.1.4, 5.2.9, 5.3.2, 5.3.3, 5.4.1)
> sont hors périmètre préprod (ressources non créées) — à couvrir avant
> ouverture pilote si les rôles/tokens concernés sont activés. Trois
> findings ouverts et résolus pendant l'exécution : **T-9** (fuite
> cross-commercial `/api/diagnostics/*` → PR #9), **T-10c-BIS**
> (`event_description` exposé dans `activity/recent` → PR #10),
> **T-11** (cockpit non cloisonné exposant noms clients + PII dirigeant
> + CA N-1 + budgets → PR #11). Règle doctrinale service_role formalisée
> §7 de `rls-hardening-plan.md` (PR #12) ; test de garde `service-role`
> proposé en §7.3 reste **dette proactive avant pilote**. Détails
> ligne à ligne dans le registre §13.1.2.

À dérouler en parallèle du §4 avec Commercial B.

### 5.1 Auth

| # | Test | Attendu |
|---|---|---|
| 5.1.1 | Navigateur anon → `/cockpit` | Redirection login |
| 5.1.2 | Navigateur anon → `/diagnostics` | Redirection login |
| 5.1.3 | Navigateur anon → `/api/diagnostics` | 401 `{ ok: false, code: "unauthenticated" }` |
| 5.1.4 | Login client_viewer (compte test) → `/cockpit` | 403 (rôle insuffisant) |

### 5.2 Cross-commercial (Commercial B sur ressources A)

Lister UUID `sessionA` et `diagA` depuis le §4.2 (admin SQL).

| # | Test | Attendu |
|---|---|---|
| 5.2.1 | B : `/sessions` | Aucune session de A visible |
| 5.2.2 | B : `/diagnostics` | Aucun diagnostic de A visible |
| 5.2.3 | B : GET `/api/sessions/<sessionA>/documents` | 403 `{ ok: false, code: "forbidden" }` |
| 5.2.4 | B : POST `/api/generate-training-support { sessionId: <sessionA> }` | 403, **aucun appel OpenRouter** déclenché (vérifier `ai_generation_logs`) |
| 5.2.5 | B : POST `/api/design-training-support { sessionId: <sessionA> }` | 403 idem |
| 5.2.6 | B : POST `/api/sessions/<sessionA>/create-access-link` | 403 |
| 5.2.7 | B : GET `/api/sessions/<sessionA>/date-options` | 403 |
| 5.2.8 | B : POST `/api/sessions/<sessionA>/date-options` | 403 |
| 5.2.9 | B : DELETE `/api/sessions/<sessionA>/date-options/<optionId>` | 403 |
| 5.2.10 | B : GET `/api/sessions/<sessionA>/activity` | 403 |
| 5.2.11 | B : POST `/api/activity/log { sessionId: <sessionA>, eventType: "note_added" }` | 403 |
| 5.2.12 | B : POST `/api/analyze-training-need { diagnosticId: <diagA> }` | 403, **aucun OpenRouter** |
| 5.2.13 | B : POST `/api/generate-training-proposal { diagnosticId: <diagA> }` | 403, **aucun OpenRouter** |
| 5.2.14 | B : GET `/api/diagnostics/<diagA>/summary` | 200 ? — vérifier — actuellement la route filtre par `assertCanAccessSession` non, par RLS oui via service_role bypass ; **à confirmer** |
| 5.2.15 | B : GET `/api/sessions/<sessionA>/post-training-review` | 403 |
| 5.2.16 | B : PUT `/api/sessions/<sessionA>/post-training-review` | 403 |
| 5.2.17 | B : GET `/api/sessions/<sessionA>/support-quality` | 403 |
| 5.2.18 | B : PUT `/api/sessions/<sessionA>/support-quality` | 403 |

**Note 5.2.14** : si la route diagnostics summary retourne 200 sur
le diagnostic d'A, le finding est à remonter et corriger (manque
un `assertCanAccessDiagnostic` côté handler). Le risque est limité
car la table est durcie en Phase 2B (`created_by = auth.uid()` OR
admin), mais l'API admin client bypasse RLS.

### 5.3 Tokens publics

| # | Test | Attendu |
|---|---|---|
| 5.3.1 | GET `/public/session/<token_invalide>` | Page erreur propre |
| 5.3.2 | GET `/public/session/<token_expiré>` | Page erreur propre |
| 5.3.3 | GET `/public/session/<token_désactivé>` (`is_active = false`) | Page erreur propre |
| 5.3.4 | GET `/api/public/validate-token { token: <fake> }` | `{ valid: false, reason: "..." }` |
| 5.3.5 | Inspecter le HTML de `/public/session/<valid_token>` | Aucune occurrence de `token_hash`, aucune URL Supabase Storage brute |

### 5.4 Storage

| # | Test | Attendu |
|---|---|---|
| 5.4.1 | curl direct `https://<project>.supabase.co/storage/v1/object/session-documents/<path>` sans auth | 400/401 |
| 5.4.2 | Inspecter le HTML de la fiche session interne | `storage_path` jamais visible — seulement `downloadUrl` signée |
| 5.4.3 | Signed URL générée par `/api/sessions/<id>/documents` | Expire ≤ 60 s |

### 5.5 RLS / policies anon

| # | Test | Attendu |
|---|---|---|
| 5.5.1 | `grep -rn "to anon" supabase/migrations/` | 0 occurrence en policy active |
| 5.5.2 | `select polname from pg_policies where polroles::text like '%anon%';` | 0 ligne |
| 5.5.3 | Lecture anon via REST PostgREST sur une table durcie : `curl https://<project>.supabase.co/rest/v1/training_sessions -H "apikey: <ANON_KEY>"` | `[]` (vide ou erreur RLS) |

### 5.6 Acceptance critère §5

100 % des 30+ tests passent. **Tout 403 manquant est bloquant**.

---

## 6. Backup minimal

### 6.1 Procédure manuelle (avant chaque grosse démo)

Documenté dans `operations-runbook.md` §4 — récap rapide :

> **⚠️ Note dump schéma vs données** : `supabase db dump --linked
> --schema public` (CLI 2.101+) produit un dump **schéma seul par
> défaut** (tables + indexes + policies + fonctions + triggers, aucun
> `INSERT`/`COPY`). Tant que la base préprod est vide, c'est suffisant
> pour reconstruire (re-apply migrations + seed). **Dès qu'elle
> contiendra des données de smoke ou de pilote, ajouter un second
> dump `--data-only`** :
> `supabase db dump --linked --schema public --data-only --file backup_data_$(date +%Y%m%d_%H%M).sql`.
> Les deux fichiers sont à archiver ensemble.

```bash
# 1. Dump SQL (15-30 secondes)
pg_dump "postgresql://postgres:[PWD]@db.[PROJECT].supabase.co:5432/postgres" \
  --schema=public --no-owner --no-privileges \
  -f start_academy_preprod_$(date +%Y%m%d_%H%M).sql

# 2. Vérifier que le fichier est lisible
head -50 start_academy_preprod_*.sql
grep "CREATE TABLE public.diagnostics" start_academy_preprod_*.sql

# 3. Dump Storage (objets du bucket privé)
mkdir -p storage_backup_$(date +%Y%m%d)
# Pour chaque objet listé via /storage/v1/object/list/session-documents,
# télécharger avec curl + SUPABASE_SERVICE_ROLE_KEY.

# 4. Archiver + chiffrer
tar czf preprod_backup_$(date +%Y%m%d_%H%M).tar.gz \
  start_academy_preprod_*.sql storage_backup_*/
gpg --symmetric --cipher-algo AES256 preprod_backup_*.tar.gz

# 5. Déposer dans le coffre interne (jamais Git, jamais Drive public)
```

### 6.2 Acceptance critère §6

- [ ] Au moins un backup `pg_dump` réalisé.
- [ ] Au moins un objet Storage exporté.
- [ ] Fichier `.sql` lisible et contient `CREATE TABLE public.diagnostics`.
- [ ] Archive chiffrée stockée hors repo.

---

## 7. Test restauration minimal

### 7.1 Procédure

1. **Créer un projet Supabase de test** (gratuit OK) ou utiliser
   un schéma `restore_quarantine` sur preprod.
2. Importer le dump : `psql <TEST_DB> -f start_academy_preprod_*.sql`.
3. Vérifier 3 tables critiques :
   ```sql
   select count(*) from public.diagnostics;
   select count(*) from public.training_sessions;
   select count(*) from public.session_documents;
   ```
   Comparer aux counts source.
4. Vérifier que RLS reste activée :
   ```sql
   select tablename from pg_tables
   where schemaname = 'public' and rowsecurity = false;
   ```
   → **vide** attendu (toutes les tables ont RLS).
5. Vérifier qu'au moins un objet Storage peut être réuploadé
   manuellement et que le `storage_path` matche.

### 7.2 Acceptance critère §7

- [ ] Restauration SQL OK (counts cohérents).
- [ ] Pas de table avec RLS désactivée.
- [ ] Au moins 1 objet Storage restauré et vérifié.
- [ ] Procédure documentée dans le registre interne (date,
      opérateur, durée totale).

---

## 8. Audit Storage formel

### 8.1 Checklist

| # | Vérification | Comment | Attendu |
|---|---|---|---|
| 8.1 | Bucket privé | `select public from storage.buckets where id = 'session-documents';` | `false` |
| 8.2 | Policies `storage.objects` | `select * from pg_policies where tablename = 'objects' and schemaname = 'storage';` | 0 ligne (ou uniquement les policies par défaut Supabase qui ne donnent aucun accès anon/authenticated) |
| 8.3 | Signed URLs 60 s | Lire `src/lib/documents/document-service.ts` `createSignedDownloadUrl(path, 60)` | OK |
| 8.4 | Pas de public URL | grep `getPublicUrl` dans le code | 0 occurrence sur le bucket `session-documents` |
| 8.5 | MIME whitelist | `src/lib/documents/document-types.ts` `validateFileUpload` | Whitelist visible (PDF, JPEG, PNG…) |
| 8.6 | Taille max | idem | 10 Mo |
| 8.7 | `storage_path` non exposé | grep dans le rendu HTML public/private | 0 occurrence côté pages publiques + route documents |
| 8.8 | Suppression document sensible | `operations-runbook.md` §8 | Procédure documentée |

### 8.2 Test négatif

- Tenter d'uploader un `.exe` : refusé par MIME whitelist.
- Tenter d'uploader un fichier > 10 Mo : refusé par taille.
- Tenter d'uploader sans token public valide : 403.

### 8.3 Acceptance critère §8

- [ ] 8.1 → 8.8 tous OK.
- [ ] Au moins 1 test négatif passé.

---

## 9. Test rotation `SUPABASE_SERVICE_ROLE_KEY`

### 9.1 Procédure

1. Idéalement : utiliser un **projet Supabase secondaire de test**
   pour ne pas perturber preprod.
2. Supabase dashboard → **Settings → API → Service role → Roll**.
3. Récupérer la nouvelle clé.
4. Mettre à jour `.env` côté serveur preprod.
5. Redémarrer (ou redéployer).
6. Tester :
   - [ ] `/cockpit` charge.
   - [ ] Routes publiques tokenisées OK (`/public/session/<token>`).
   - [ ] Routes IA OK (`/api/analyze-training-need`).
   - [ ] Route documents OK (`/api/sessions/<id>/documents`).
   - [ ] Aucun message d'erreur
     `SUPABASE_SERVICE_ROLE_KEY manquante` dans les logs serveur.
7. Documenter dans le registre interne : date, opérateur,
   environnement, raison (test rotation préventive).

### 9.2 Si non testable

Si l'équipe préfère reporter la rotation (par exemple pour ne pas
casser preprod pendant le sprint), documenter la **décision de
report** dans le registre interne, avec une date cible pour le
test ultérieur. Ce report devient un point bloquant avant
production publique (cf. dette §B-4 du PRD global §9.2).

### 9.3 Acceptance critère §9

- [ ] Rotation testée OU décision de report documentée.

---

## 10. Critères « préprod validée »

Tous OUI = pré-prod validée pour pilote distant contrôlé.

| # | Critère | Statut |
|---|---|---|
| 1 | 100 % des smoke fonctionnels §4.2 + §4.3 passent | ✅ (2026-07-08, cf. §13.1.1) |
| 2 | 100 % des smoke sécurité §5.1 → §5.5 passent (avec confirmation §5.2.14 résolue OU finding ouvert) | ✅ (2026-07-12, cf. §13.1.2 — findings T-9/T-10c-BIS/T-11 résolus PR #9/#10/#11) |
| 3 | Backup §6 réalisé et stocké en coffre chiffré | ☐ |
| 4 | Restauration §7 testée au moins partiellement (3 tables + 1 objet Storage) | ☐ |
| 5 | Audit Storage §8 OK (8.1 → 8.8) | ☐ |
| 6 | Cockpit Usage IA + Budget IA visibles et cohérents | ☐ |
| 7 | Aucun secret commit dans git (`git log --all -p | grep -E "SERVICE_ROLE_KEY|OPENROUTER_API_KEY" \| head`) | ☐ |
| 8 | Rotation `service_role` testée OU report documenté §9 | ☐ |
| 9 | Aucune policy `to anon` active (5.5.1 + 5.5.2) | ☐ |
| 10 | `grep -rn "to anon" supabase/migrations/` = 0 | ☐ |
| 11 | `tsc --noEmit` → EXIT 0 sur la branche déployée | ☐ |
| 12 | Build prod (`npm run build`) sans erreur | ☐ |

---

## 11. Décision post-stabilisation

### 11.1 ✅ OK pilote distant

Si **les 12 critères §10 sont verts** :
- Communiquer la disponibilité préprod à l'équipe.
- Identifier 1–2 cabinets pilotes.
- Préparer onboarding : compte admin Start Academy + 1 commercial
  + briefing rôles internes.
- Programmer la **première démo client distant** sous 2 semaines.

### 11.2 ⚠️ Itération sécurité courte

Si **au moins 1 critère est rouge mais réversible en < 1 semaine** :
- Ouvrir un ticket par anomalie avec owner + deadline.
- Tenir un point quotidien jusqu'à fermeture.
- Re-dérouler le scénario §4 + §5 quand tous fermés.
- Pas de pilote distant tant que ce n'est pas vert.

Exemples de cas :
- 5.2.14 (route summary sans `assertCanAccessDiagnostic`) →
  ajouter le helper côté handler.
- Budget IA `Non configuré` parce que `AI_MONTHLY_BUDGET_EUR`
  oublié → ajouter en env.
- Test rotation reporté mais date cible non actée → fixer une
  date.

**Registre tickets ouverts / clos — Smoke round 1 (2026-07-08)** :

| Ticket | Diagnostic | Statut | Owner | Fix |
|---|---|---|---|---|
| T-3 | POST `/api/diagnostics/[id]/answers` (et `analyze-training-need`) : `BodySchema.category` restait à `z.enum([tool_maturity, commercial_performance, business_skill, execution])` (4 valeurs MVP1) alors que le code émet 16 valeurs v1.0 depuis Lot 3 (4 MVP1 + 12 v1.0 avec Ch.2 dédoublé `team`/`funding`). Dès la 1ʳᵉ question v1.0 (catégorie `identity` Ch.1), Zod rejette 400 `Payload invalide` → `<FallbackBanner error="…"/>` s'affiche dans le flow diagnostic. Fallback **PAS légitime** — vrai bug. | ✅ Fixé (PR #6) | Claude | Source unique `export const ANSWER_CATEGORIES = [...] as const` dans `src/types/index.ts`, `type AnswerCategory = (typeof ANSWER_CATEGORIES)[number]`, importée par les 2 routes Zod. Test de contrat `ANSWER_CATEGORIES ⊆ check_constraint DB` (migration 20260704). |
| T-4 | `training_supports.source` et `designed_training_supports.source` avaient un check_constraint `('openrouter', 'heuristic')` (migrations 20260523), tandis que le code émet `('llm', 'heuristic')` depuis la refonte OpenRouter. Écart masqué par un cast TS mensonger `as "openrouter" \| "heuristic"` dans les services de persistance. INSERT rejeté avec `23514 check_violation` → catch silencieux → fallback local. Sur `ai_generation_logs` aucun écart (déjà à jour). | ✅ Fixé (PR #6) | Claude | Migration additive `20260708100000_extend_supports_source_check.sql` (drop + recreate constraint avec `('openrouter', 'heuristic', 'llm')` sur les 2 tables). Cast TS retiré, `database.types.ts` mis à jour. Test de contrat par type source (`training-support/source-contract.test.ts`). |
| T-5 | POST `/api/sessions/[id]/support-quality` → 500 `save_failed`. Cascade de T-4 : le support brut n'est jamais persisté en DB (check_violation étape 15) → `saveLocally` génère un `randomId()` non-persisté → étape 17 tente FK `training_support_id` vers cet UUID → **23503 foreign_key_violation** → catch silencieux → route 500. | ✅ Résolu par T-4 (aucun code applicatif) | Claude | Cascade résolue par la migration T-4 seule. À revalider au round 2 smoke. |
| T-6 | `generate-training-proposal/route.ts:397` — mapping `fundingParticipants` oubliait `eligibleOpco`. La branche salarié OPCO EP dans `estimateParticipantFunding` ne se déclenchait jamais → 0 € au lieu de N × 2 500 € par salarié éligible. Manque à gagner commercial visible : un cabinet avec 2 indés éligibles + 2 salariés OPCO affichait 6 000 € au lieu de 11 000 €. | ✅ Fixé (PR #6) | Claude | Ajout de `eligibleOpco: p.eligibleOpco ?? null` au mapping. Test non-optionnel (mix 2 indés + 2 salariés OPCO → total 11 000 €). `estimateOpcoBudget` (helper agrégat entreprise) reste inutilisé en prod — ticket usage futur. |
| T-7 | Les services de persistance (`support-quality-service.ts:139-141`, à auditer aussi `training-support-service.ts`, `designed-support-service.ts` etc.) avalent silencieusement les erreurs Supabase avec `catch { return null; }`. Le code Postgres (23514, 23503, 23505…) n'est pas remonté dans les logs, rendant les cascades de type T-4→T-5 très longues à diagnostiquer sans la trace SQL. | ⏳ Dette non-bloquante | à assigner | Ajouter `console.warn("[<service>] <op> failed", { code: error?.code, message: error?.message })` sans logger les données sensibles (pas de payload utilisateur, pas de contenu texte libre). Audit systématique sur tous les services de persistance. |
| **T-9** | **CRITIQUE — fuite cross-commercial sur `/api/diagnostics/*`.** Les 5 routes du sous-arbre (`GET /api/diagnostics` racine, `GET/[id]/summary`, `POST/[id]/answers`, `PATCH/[id]/status`, `GET/PUT/[id]/participants`) utilisaient `createSupabaseAdminClient` (service_role → bypass RLS) sans appel à `assertCanAccessDiagnostic`. Toute commercial voyait ET pouvait modifier les diagnostics des autres. Fuite PII dirigeant + notes internes + BI. **Bloquant pilote.** Découvert via §5.2.14 (smoke sécurité) puis audit d'accès complet (2026-07-09). | ✅ Fixé (PR #9) | Claude | Ajout de `assertCanAccessDiagnostic(auth.profile, diagnosticId)` après `requireApiRole` sur les 4 routes `[id]/*`. Liste racine `/api/diagnostics` basculée sur `createSupabaseRouteHandlerClient` (RLS-aware, filtre nativement par policy `diagnostics_owner_or_admin_select`). Tests unit d'ownership (owner-mismatch → 403 + service_role JAMAIS appelé). Extension `security-smoke.mjs` avec 5 tests d'écriture manquants (5.2.19 liste racine, 5.2.20 POST answers, 5.2.21 PATCH status, 5.2.22 GET participants, 5.2.23 PUT participants). |
| **T-10a** | `POST /api/diagnostics/create` : le `clientId` fourni au payload n'était pas vérifié. Un commercial pouvait créer un diagnostic sur le client d'un collègue → pollution cockpit + rapports (pas de fuite lecture des données de A, mais création parasite). | ✅ Fixé (PR #9) | Claude | Création du helper `assertCanAccessClient` (miroir de `assertCanAccess{Diagnostic,Session}`, lit directement `clients.created_by` — aligné sur la policy `clients_owner_or_admin_select`, pas de migration SQL requise). Appel en amont de l'insert. Test unit d'ownership. |
| **T-10b** | `POST /api/email/create-draft` : `sessionId` et `accessLinkId` optionnels acceptés sans vérification. Un commercial pouvait créer un draft Gmail rattaché à la session d'un collègue (pas de fuite lecture — draft dans le Gmail personnel de l'appelant — mais incohérence de posture). | ✅ Fixé (PR #9) | Claude | Assertion conditionnelle : si `sessionId` fourni → `assertCanAccessSession` direct. Si `accessLinkId` fourni sans sessionId → résolution `public_access_tokens.session_id` puis assertion. Aucun ID → autorisé (draft libre). Test unit couvrant les deux branches (mismatch + no-id). |
| **T-10c** | ~~Décision produit : cockpit partagé.~~ **INVALIDÉ 2026-07-09 par T-11**. La posture « cockpit partagé sur les métadonnées » ne tenait pas face au contenu réellement exposé (noms clients, PII dirigeant, budgets, CA N-1 nominatif, emails commerciaux). T-10c-BIS reste valable dans son mécanisme (retrait `event_description`), mais son cadre « cockpit partagé sur les métadonnées » est révisé — c'est désormais **cloisonnement strict par owner, admin voit tout**. | ⚠️ Invalidé et remplacé par T-11 | Claude | Voir T-11 pour le fix appliqué. |
| **T-10c-BIS** | **Finding sécurité (2026-07-09)** — la décision « cockpit partagé » de T-10c reposait sur l'hypothèse « pas de données sensibles dans `activity_logs` ». Vérification pendant PR #9 : la table contient un champ `event_description` (texte libre 500 chars) alimenté par `POST /api/activity/log` avec `eventType: "note_added"` (cf. `session-activity-journal.tsx:165`). Ce champ **contenait des notes internes sensibles** et remontait tel quel dans `activity/recent` — le composant cockpit ne l'affichait pas mais le champ transitait dans le payload, exploitable via DevTools Network ou curl. | ✅ **Résolu (PR #10)** | Claude | **Décision produit tranchée** : cockpit reste partagé sur les métadonnées d'événement (type, acteur, label whitelist, timestamps, entité, chiffres) mais **jamais sur le contenu libre**. Motif : les métadonnées suffisent au pilotage inter-commercial (entraide, reprise de dossier) ; le texte libre expose des notes internes qui n'ont rien à faire dans un flux inter-commercial. Fix : `listRecentActivity` (`activity-log-service.ts`) retire `event_description` du SELECT et force `eventDescription: null` post-mapping. Le journal détaillé d'une session (`/api/sessions/[id]/activity`, protégé par `assertCanAccessSession`) conserve `event_description` — seul qui a accès à la session voit les notes. Test de contrat verrouille l'invariant côté SELECT et côté mapping (double garde-fou). Commentaire d'en-tête de la route mis à jour avec la règle définitive. Audit `buildActivityLabel` : n'interpole jamais de contenu libre ni PII — 3 enrichissements metadata, tous par whitelist fermée. |
| **T-11** | **CRITIQUE — cockpit non cloisonné (2026-07-09).** Connecté en Commercial B (aucun dossier propre), `/cockpit` affichait les KPIs, le pipeline et l'activité de Commercial A : noms de clients (Pinpin immobilier, Marx, Horizon Immo), noms de dirigeants, budgets (4 368 €), restes à charge (2 184 €), effectifs, prochaines actions, et l'email de A dans l'activité récente. Second symptôme : les liens « Ouvrir » du cockpit menaient à des ressources que B ne pouvait pas ouvrir (« Session introuvable » — pages détail sur `createSupabaseBrowserClient`, RLS bloque). Cause : `cockpit-service.ts`, `activity-log-service.ts` et 2 services `count*` utilisaient `createSupabaseAdminClient()` sans filtrer par `created_by`. Audit exhaustif des pages `(app)/**` : seule `cockpit/page.tsx` était fautive (14 usages) ; `settings/modules/page.tsx` reste légitime (catalogue global) ; les 12 autres pages délèguent au client browser (RLS applique). | ✅ **Résolu (PR #11)** | Claude | **Décision de conception** : cockpit cloisonné par commercial (`created_by = auth.uid()`) et global pour `is_admin()`. Un commercial voit son pipeline, ses actions, ses diagnostics. L'admin voit tout Start Academy. Fix appliqué : (a) `getCockpitData(profile)` filtre `training_sessions` + `diagnostics` par owner, puis les 10 tables filles suivent par jointure `.in(...)` sur les IDs retenus (pas de lecture globale de `clients` ni `diagnostic_participants`). (b) `listRecentActivity(profile)` : `.or(session_id.in.(...), diagnostic_id.in.(...), actor_id.eq.profile.id)` pour non-admin, aucun filtre pour admin. `event_description` reste exclu du SELECT (T-10c-BIS). (c) `countSupportsAwaitingQualityReview(profile)` et `countSessionsAwaitingPostTrainingReview(profile)` : préfiltre par `.eq(created_by, profile.id)` sur `training_sessions`. (d) `getAiUsageSummary`, `getAiMonthlyBudgetStatus`, `getRecentAiGenerations` → **admin-only** : blocs « Usage IA » / « Budget IA » / « Générations récentes » masqués dans `cockpit/page.tsx` pour non-admin (services jamais appelés). Motif : budget IA = indicateur d'entreprise Start Academy ; `getRecentAiGenerations` exposerait les IDs de dossiers tiers. (e) `/api/activity/recent` passe `auth.profile` à `listRecentActivity`. Tests d'ownership (9 nouveaux) prouvant : non-admin → filtre appliqué + tables filles skippées si pas de dossier ; admin → aucun filtre. Symptôme UI « portes fermées » : résolu par cascade — un cockpit filtré n'affiche plus les liens vers des ressources non-accessibles. **Aucune migration.** UX bonus : les 3 comptes de test ont `full_name = null` (créés via dashboard), d'où l'email affiché. Un `UPDATE profiles SET full_name = '…' WHERE email IN (…)` d'une ligne évite d'afficher des emails partout — hors scope PR mais recommandé. |

**Exception migration tracée** : la migration `20260708100000_extend_supports_source_check.sql` a été **appliquée sur préprod le 2026-07-08 AVANT merge sur `main`** (backup pré-push `preprod_before_T4_20260708_1438.sql`, 84 kB schéma seul, base sans données). Motif : nécessaire pour valider en environnement réel que T-5 est bien une cascade de T-4 avant de coder les fixes T-3/T-6. **Règle réaffirmée** : hors exception opérationnelle explicite comme celle-ci, une migration ne doit être poussée en préprod qu'APRÈS merge sur `main`. Toute exception future doit être tracée dans ce registre (ticket + motif + backup).

### 11.3 ❌ Stop intégration / correction bloquante

Si **un critère révèle un risque produit majeur** :
- Halt sur tout déploiement / démo externe.
- Réunir l'équipe (commercial / pédagogique / tech).
- Décider : (a) corriger côté code, (b) accepter le risque avec
  garde-fou opérationnel, (c) repousser le pilote.
- Documenter la décision dans le registre incidents
  (cf. `operations-runbook.md` §13).

Exemples de cas :
- Fuite N-1 individuelle visible côté dirigeant (régression du
  `public/session/[token]/page.tsx`).
- Policy `to anon` accidentellement présente sur une table métier.
- Bucket Storage devenu public.
- `token_hash` exposé dans une réponse API.

### 11.4 Dette lint tracée (issue de v1.0b, clôturée 2026-07-06)

Après la livraison v1.0b, `npm run lint` retournait 8 erreurs
résiduelles. Les 3 des **heuristiques de fallback IA** ont été
corrigées dans la PR #2 (`fix/lint-heuristic-fallbacks`) car
elles se déclenchent quand OpenRouter tombe / dépasse le budget —
chemin critique du smoke §4. Reste 5 erreurs `set-state-in-effect`
en dette suivie (sous-système `sessions/[id]/*`, non touché par
v1.0/v1.0b, non bloquantes pour le smoke).

Règle validée : **zéro nouvelle erreur lint dans les fichiers
touchés par v1.0/v1.0b**.

| # | Fichier | Ligne | Règle | Statut |
|---|---|---|---|---|
| 1 | `src/app/(app)/sessions/[id]/post-training-review.tsx` | 155 | `react-hooks/set-state-in-effect` | Dette suivie — non bloquant |
| 2 | `src/app/(app)/sessions/[id]/session-activity-journal.tsx` | 149 | `react-hooks/set-state-in-effect` | Dette suivie — non bloquant |
| 3 | `src/app/(app)/sessions/[id]/session-date-options.tsx` | 108 | `react-hooks/set-state-in-effect` | Dette suivie — non bloquant |
| 4 | `src/app/(app)/sessions/[id]/session-documents.tsx` | 69 | `react-hooks/set-state-in-effect` | Dette suivie — non bloquant |
| 5 | `src/app/(app)/sessions/[id]/support/design/support-quality-validation.tsx` | 82 | `react-hooks/set-state-in-effect` | Dette suivie — non bloquant |
| 6 | `src/lib/ai/heuristic-designed-support.ts` | 462 | `@next/next/no-assign-module-variable` | ✅ **Corrigée (PR #2)** — rename `module` → `catalogModule` |
| 7 | `src/lib/ai/heuristic-training-support.ts` | 342 | `@next/next/no-assign-module-variable` | ✅ **Corrigée (PR #2)** — rename `module` → `catalogModule` |
| 8 | `src/lib/ai/select-relevant-modules-for-analysis.ts` | 273 | `prefer-const` | ✅ **Corrigée (PR #2)** — `let` → `const` |

**Motif du fix #6-8** : ces erreurs concernaient les heuristiques
de fallback IA — le code qui s'exécute quand OpenRouter tombe ou
dépasse budget. C'est précisément le chemin qu'on veut voir
fonctionner en mode dégradé pendant le smoke §4. Une assignation
à `module` (variable réservée Next.js) ou un `selected` non-`const`
pouvait passer inaperçu au happy path et casser l'app à la bascule
heuristique.

Les 5 erreurs #1-5 restent dette suivie ; elles pourront être
absorbées dans un lot de nettoyage lint transverse (post-pilote).

---

## 12. Contraintes

- **Ne pas modifier le code** pendant le sprint stabilisation
  (sauf correctif identifié dans §11.2 / §11.3, sous forme de
  hotfix ciblé).
- **Ne pas créer de migration** SQL nouvelle. Les 29 migrations
  listées §3 sont l'état figé.
- **Ne pas brancher** Gmail / Calendar / Drive — la valeur ajoutée
  passera par le pilote distant et la mesure d'usage avant
  intégrations externes.
- **Ne pas activer Coach Brain** — la posture downstream consumer
  only reste en place tant que NXT Performance n'a pas exposé
  d'endpoint d'ingestion.
- **Document uniquement** : aucune fonctionnalité applicative
  ajoutée dans ce sprint.
- **Protection branche serveur non active (Free tier)** — hook
  client `.githooks/pre-push` + discipline PR en vigueur, payload
  de protection prêt pour activation Pro (cf. README, section
  Workflow Git).

---

## 13. Annexes — registre de stabilisation

Template à recopier dans le doc interne (Notion, Google Docs,
peu importe — pas dans Git).

```
Sprint stabilisation préprod
Démarrage : YYYY-MM-DD
Owner : <responsable tech>

Pré-requis techniques §2 :    [ ] OK / [ ] anomalies
Checklist migrations §3 :     [ ] OK / [ ] migrations manquantes
Smoke fonctionnels §4 :       [ ] OK / [ ] step n° échec
Smoke sécurité §5 :           [ ] OK / [ ] test n° échec
Backup §6 :                   [ ] OK / [ ] coffre : <localisation>
Restauration §7 :             [ ] OK / [ ] reportée (raison)
Audit Storage §8 :            [ ] OK / [ ] anomalies
Rotation service_role §9 :    [ ] testée / [ ] reportée (date cible)

Décision §11 :
  [ ] OK pilote distant
  [ ] Itération sécurité courte (deadline : YYYY-MM-DD)
  [ ] Stop / correction bloquante

Tickets ouverts :
  - T-1 : <description> — owner : <X> — deadline : <date>
  - T-2 : ...

Décisions de report documentées :
  - <sujet> — raison : <texte> — date cible : <YYYY-MM-DD>
```

### 13.1 Sprint courant — instance vivante (2026-07-07 →)

Ce bloc est **le seul instance-log** de sprint tenu directement dans
git. Il est complété au fur et à mesure et servira de source de
vérité tant qu'aucun outil externe (Notion / Google Docs) n'est mis
en place. À archiver et remettre à zéro au démarrage d'un sprint
distinct.

**Registre §2 → §11**

- Pré-requis techniques §2 : ⏳ non consolidé (env vars à vérifier)
- Checklist migrations §3 : ✅ **OK — 29/29 migrations appliquées**
  - Push effectué **2026-07-07** via `supabase db push`
  - **Delta appliqué : 6 migrations (`20260612100000` → `20260705100000`)** — la `20260612` (`add_post_training_reviews`) était restée sur le quai en MVP1, elle est passée dans le même lot que les 5 v1.0
  - **Backup pré-push** : `backups/preprod_before_v1.0b_20260707_1800.sql` — **75 kB, schéma seul** (base sans données, cohérent avec `table-stats` 0 row partout au moment du dump)
  - **Vérifications post-push PostgREST** ✅ vertes :
    - `funding_config` : 4 seeds actifs (`AGEFICE_ANNUAL_CAP=3000`, `AGEFICE_THRESHOLD=7000`, `CONSUMPTION_LEVER_PERCENT=30`, `OPCO_EP_ANNUAL_CAP=2500`)
    - `diagnostics.ratios_snapshot`, `alerts_snapshot` : HTTP 200 sur select ciblé
    - `diagnostic_participants` v1.0 (`expert_level`, `eligible_opco`, `formations_24m_count`) : HTTP 200
    - `post_training_reviews` : présente (48 kB, 0 row, RLS à confirmer par check SQL brut)
  - **4 checks SQL bruts** ✅ **conformes, vérifiés via SQL Editor dashboard, revue validée 2026-07-07** :
    - ✅ `pg_class.relrowsecurity` sur `post_training_reviews` = **true**
    - ✅ `pg_tables where rowsecurity = false` sur schema public = **0 ligne** (toutes les 21 tables ont RLS active)
    - ✅ `pg_policies where 'anon' = any(roles)` = **0 ligne** (aucun accès anon non-délibéré)
    - ✅ `pg_get_constraintdef(diagnostic_answers_category_check)` contient les **16 valeurs exactes** (4 MVP1 + 12 v1.0 — Ch.2 dédoublé `team`/`funding`) avec `IS NULL` toléré. Correction 2026-07-08 : le décompte annoncé « 15 valeurs / 11 chapitres » depuis la clôture push v1.0b était erroné ; la source de vérité est la migration `20260704`, 16 valeurs.
  - **Item « push migrations préprod » désormais intégralement clos.**
- Smoke fonctionnels §4 : ⏳ non lancé
- Smoke sécurité §5 : ⏳ non lancé
- Backup §6 : ✅ artefact schéma-seul créé, `--data-only` à ajouter dès que la base contient des données (cf. §6.1 note)
- Restauration §7 : ⏳ non testée
- Audit Storage §8 : ⏳ non fait (bucket `session-documents` = 2 objets de test dev, pas de contenu métier à ce jour)
- Rotation service_role §9 : ⏳ non faite

**Tickets ouverts**

- (aucun — T-1 clos 2026-07-07 : 4 checks SQL bruts conformes, item « push migrations préprod » intégralement validé)

**Décisions de report documentées**

- Protection branche serveur GitHub : reportée à activation Pro (cf. §11.4 + README « Workflow Git »). Garde-fou en place : hook client `.githooks/pre-push` + CI verrou logique.

### 13.1.1 Registre de smoke §4 — à cocher pendant l'exécution

Registre vivant à cocher au fur et à mesure. Colonne **Verdict** :
`✅` OK, `❌` échec, `⚠️` OK avec réserve. Chaque `❌` ou `⚠️` doit
générer un ticket §11.2 dans les **Tickets ouverts** ci-dessus.

**§4.2 Scénario complet Commercial A** (source unique : §4.2 du même
document ; les IDs de compte ci-dessous supposent que §4.1 a été
suivi)

| # | Étape | Compte utilisé | Verdict | Note |
|---|---|---|---|---|
| 1 | Login A → `/cockpit` : KPIs cohérents, pas de session A pré-existante | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 2 | `/diagnostics/new` : créer client + diagnostic mode `guided` → `clients.created_by = userA.id`, `diagnostics.created_by = userA.id` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 3 | Renseigner 5 réponses + 3 participants prévisionnels → `diagnostic_answers × 5`, `diagnostic_participants × 3` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 4 | Statut diagnostic → `to_review` → journal `diagnostic_completed` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 5 | Recommandation IA via `/diagnostics/<id>/recommendation` → `recommendations` créée, `recommendation_modules ≥ 1`, journal `recommendation_generated`, `ai_generation_logs.status = success` (ou `fallback`) | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 6 | Proposition via `/diagnostics/<id>/proposal` → journal `proposal_generated`, ligne `ai_generation_logs` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 7 | Créer session depuis la fiche diagnostic → `training_sessions.created_by = userA.id`, journal `session_created` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 8 | Créer lien dirigeant `client_session_view` → `public_access_tokens` créée, URL affichée 1 fois, journal `access_link_created` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 9 | Ouvrir le lien dirigeant en navigation privée : page rendue, agrégats funding affichés, **aucun N-1 individuel** | Dirigeant (anon) | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent (visuel OK) |
| 10 | Créer 2 créneaux → `session_date_options × 2`, journal × 2 | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 11 | Sélectionner un créneau depuis la page dirigeant → `selected_at` posé, autres en `proposed`, journal `date_option_selected` | Dirigeant (anon) | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 12 | Créer lien collaborateur `participant_collect` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 13 | Soumettre un participant depuis la page collecte → `session_participants` créée, journal `participant_submitted` | Collab (anon) | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 14 | Upload document CNI fictive 1 Mo → `session_documents` créée, blob dans Storage, journal `document_uploaded` | Collab (anon) | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 15 | Génération support brut → `training_supports` créée, journal `training_support_generated`, ligne `ai_generation_logs` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 16 | Génération support designé → `designed_training_supports` créée, journal `designed_support_generated` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 17 | Validation pédagogique : noter 8 critères 0..3, valider → `support_quality_reviews.status = validated`, score calculé, journal `support_quality_validated` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 18 | Passer le support designé à `validated` via bouton DesignReady → `designed_training_supports.status = validated` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 19 | Faire passer la session à `delivered` (fiche session ou SQL admin) → `training_sessions.status = delivered` | Commercial A ou Admin | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 20 | Suivi post-formation : 4 scores + 2 réussites + 1 blocage + 1 action → `post_training_reviews` créée, journal `post_training_review_created` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent (table v1.0b OK) |
| 21 | Marquer le suivi post-formation `completed` → `post_training_reviews.status = completed`, journal `post_training_review_completed` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| 22 | Retour `/cockpit` → KPI à jour : « Supports à valider » −1, « Suivis post-formation à compléter » −1 | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |

**§4.3 Vérifications cockpit** (fin de scénario)

| # | Étape | Compte utilisé | Verdict | Note |
|---|---|---|---|---|
| C1 | Bloc « Vue synthèse » : tous les KPIs cohérents avec le scénario | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| C2 | Bloc « Actions prioritaires » : pas de `validate_support_quality` ni `complete_post_training_review` pour la session A après étapes 17 et 21 | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| C3 | Bloc « Pipeline formation » : session A listée avec étape `delivered` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| C4 | Bloc « Activité récente » : 10 derniers événements visibles | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| C5 | Bloc « Usage IA » : appels aujourd'hui ≥ 4, coût 7 j non nul, taux fallback cohérent avec présence/absence `OPENROUTER_API_KEY` | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| C6 | Bloc « Budget IA mensuel » : status `ok`/`warning`, 3 KPIs renseignés, barre progression visible | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |

**Vérifications v1.0b** (nouvelles capacités poussées 2026-07-07 —
ces 3 lignes n'existent pas dans §4.2/§4.3 historiques)

| # | Étape | Compte utilisé | Verdict | Note |
|---|---|---|---|---|
| v1.0b-1 | Après complétion du diagnostic (étape 4), `diagnostics.ratios_snapshot` et `alerts_snapshot` sont **non-null** sur la ligne concernée — preuve que `refreshDiagnosticSnapshots` écrit bien best-effort via le client route handler cookie (jamais service_role). Requête SQL à coller dans le dashboard : <br>`select id, status, ratios_snapshot is not null as has_ratios, alerts_snapshot is not null as has_alerts, jsonb_array_length(coalesce(alerts_snapshot->'alerts','[]'::jsonb)) as alerts_count from public.diagnostics where created_by = (select id from public.profiles where email = 'commerciala@start-academy.test') order by created_at desc limit 1;` <br>Attendu : `has_ratios = true`, `has_alerts = true`, `alerts_count ≥ 0`. | Commercial A + SQL admin | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent |
| v1.0b-2 | Pendant la saisie du diagnostic (étape 3), les 2 synthèses intermédiaires s'affichent au bon moment : **« Potentiel de financement »** après la dernière question du Chapitre 2 (bloc budget mobilisable + taux de consommation `environ X %` + alertes financement) et **« Pipeline de transformation »** après la dernière question du Chapitre 8 (funnel 5 étapes vs benchmarks + 2 étapes les plus faibles surlignées). Boutons `Passer` et `Continuer` disponibles — jamais bloquants. | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent (les 2 synthèses affichées + non-bloquantes) |
| v1.0b-3 | La recommandation IA générée à l'étape 5 cite **au moins un ratio en alerte** dans ses `performanceIssues` ou son `commercialExplanation` — preuve que les 3 blocs autoritaires (ratios / alertes / financement) sont consommés par le LLM (règles 12-14 du SYSTEM_PROMPT). Croiser avec le contenu de `alerts_snapshot` (v1.0b-1). Si l'IA a acknowledgé des alertes, `alertsAcknowledged` non-vide dans la réponse. | Commercial A | ✅ | 2026-07-08 — rejoué post-PR #6, confirmé par Laurent (LLM opérationnel — cas fallback heuristique reste à revalider si `OPENROUTER_API_KEY` bascule) |

**Acceptance §13.1.1** : 31 lignes en `✅`. Toute ligne en `❌` ou
`⚠️` génère un ticket §11.2 dans **Tickets ouverts** ci-dessus, avec
description + owner + deadline.

### 13.1.2 Registre de smoke §5 — sécurité

Répartition d'exécution : le script `scripts/security-smoke.ts`
couvre les 26 tests d'API / PostgREST / storage / grep automatisables ;
les 7 restants (contrôles visuels HTML, checks SQL brut sur
`pg_policies` déjà validés au clôturé push v1.0b 2026-07-07) restent
à faire côté dashboard / navigateur par Laurent.

Le script s'exécute avec `npm run smoke:security` (à ajouter) ou
directement `npx tsx scripts/security-smoke.ts`. Les identifiants
Commercial B + client_viewer + IDs des ressources de A sont passés
par variables d'env, **jamais commités** — le script vérifie leur
présence et refuse de démarrer si l'une manque.

**§5.1 Auth**

| # | Test | Attendu | Exécution | Verdict | Note |
|---|---|---|---|---|---|
| 5.1.1 | Navigateur anon → `/cockpit` | Redirection login | Script (curl `-I`, check 302 / Location) | ✅ | 2026-07-12 — script
| 5.1.2 | Navigateur anon → `/diagnostics` | Redirection login | Script | ✅ | 2026-07-12 — script
| 5.1.3 | Navigateur anon → `/api/diagnostics` | 401 `{ code: "unauthenticated" }` | Script | ✅ | 2026-07-12 — script
| 5.1.4 | Login `client_viewer` → `/cockpit` | 403 (rôle insuffisant) | Script (nécessite compte client_viewer préalable) | n/a | non testé — hors périmètre préprod, ressources non créées ; à couvrir avant ouverture pilote si les rôles/tokens concernés sont activés |

**§5.2 Cross-commercial (Commercial B sur ressources A)**

Le script obtient un JWT Commercial B via `POST /auth/v1/token`, puis
enchaîne les 18 tests avec ce token comme `Authorization: Bearer`.
Aucune écriture, seulement des tentatives d'accès qui **doivent** être
refusées.

| # | Test | Attendu | Exécution | Verdict | Note |
|---|---|---|---|---|---|
| 5.2.1 | B : `/sessions` | Aucune session de A visible | Script (PostgREST `training_sessions?select=id` avec JWT B → 0 ligne A) | ✅ | 2026-07-12 — script |
| 5.2.2 | B : `/diagnostics` | Aucun diagnostic de A visible | Script (idem sur `diagnostics`) | ✅ | 2026-07-12 — script |
| 5.2.3 | B : GET `/api/sessions/<sessionA>/documents` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.4 | B : POST `/api/generate-training-support { sessionId: <sessionA> }` | 403, aucun OpenRouter | Script + double-check `ai_generation_logs` count | ✅ | 2026-07-12 — script |
| 5.2.5 | B : POST `/api/design-training-support` | 403 idem | Script | ✅ | 2026-07-12 — script |
| 5.2.6 | B : POST `/api/sessions/<sessionA>/create-access-link` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.7 | B : GET `/api/sessions/<sessionA>/date-options` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.8 | B : POST `/api/sessions/<sessionA>/date-options` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.9 | B : DELETE `/api/sessions/<sessionA>/date-options/<optionId>` | 403 | Script (nécessite un optionId de A en env — sinon marque n/a) | n/a | non testé — hors périmètre préprod, ressources non créées ; à couvrir avant ouverture pilote si les rôles/tokens concernés sont activés |
| 5.2.10 | B : GET `/api/sessions/<sessionA>/activity` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.11 | B : POST `/api/activity/log { sessionId: <sessionA> }` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.12 | B : POST `/api/analyze-training-need { diagnosticId: <diagA> }` | 403, aucun OpenRouter | Script | ✅ | 2026-07-12 — script |
| 5.2.13 | B : POST `/api/generate-training-proposal { diagnosticId: <diagA> }` | 403, aucun OpenRouter | Script | ✅ | 2026-07-12 — script |
| 5.2.14 | B : GET `/api/diagnostics/<diagA>/summary` | 403 (après T-9 fix PR #9) | Script | ✅ | 2026-07-12 — script (avant PR #9 = FINDING 200) |
| 5.2.15 | B : GET `/api/sessions/<sessionA>/post-training-review` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.16 | B : PUT `/api/sessions/<sessionA>/post-training-review` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.17 | B : GET `/api/sessions/<sessionA>/support-quality` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.18 | B : PUT `/api/sessions/<sessionA>/support-quality` | 403 | Script | ✅ | 2026-07-12 — script |
| 5.2.19 | B : GET `/api/diagnostics` (racine) avec cookie B | HTTP 200 + items ne contient PAS diagnostic A | Script (T-9 #1 — extension 2026-07-09) | ✅ | 2026-07-12 — script |
| 5.2.20 | B : POST `/api/diagnostics/<diagA>/answers` | 403 | Script (T-9 #3 — extension 2026-07-09) | ✅ | 2026-07-12 — script |
| 5.2.21 | B : PATCH `/api/diagnostics/<diagA>/status` | 403 | Script (T-9 #4 — extension 2026-07-09) | ✅ | 2026-07-12 — script |
| 5.2.22 | B : GET `/api/diagnostics/<diagA>/participants` | 403 | Script (T-9 #5 read — extension 2026-07-09) | ✅ | 2026-07-12 — script |
| 5.2.23 | B : PUT `/api/diagnostics/<diagA>/participants` | 403 | Script (T-9 #5 write — extension 2026-07-09) | ✅ | 2026-07-12 — script |

**§5.3 Tokens publics**

| # | Test | Attendu | Exécution | Verdict | Note |
|---|---|---|---|---|---|
| 5.3.1 | GET `/public/session/<token_invalide>` | Page erreur propre | Script (GET, check body OU `X-Robots-Tag` etc. — rapporte statut + fragment de réponse) | ✅ | 2026-07-12 — script |
| 5.3.2 | GET `/public/session/<token_expiré>` | Page erreur propre | Script (nécessite un token expiré en env — sinon Laurent en crée un avec expiry passé) | n/a | non testé — hors périmètre préprod, ressources non créées ; à couvrir avant ouverture pilote si les rôles/tokens concernés sont activés |
| 5.3.3 | GET `/public/session/<token_désactivé>` | Page erreur propre | Script (nécessite un token `is_active=false` en env) | n/a | non testé — hors périmètre préprod, ressources non créées ; à couvrir avant ouverture pilote si les rôles/tokens concernés sont activés |
| 5.3.4 | POST `/api/public/validate-token { token: <fake> }` | `{ valid: false, reason: ... }` | Script | ✅ | 2026-07-12 — script |
| 5.3.5 | Inspection HTML de `/public/session/<valid_token>` : aucun `token_hash` ni URL Storage brute | UI Laurent (grep manuel sur la page rendue, ou DevTools Network) | ✅ | 2026-07-12 — UI Laurent |

**§5.4 Storage**

| # | Test | Attendu | Exécution | Verdict | Note |
|---|---|---|---|---|---|
| 5.4.1 | curl direct `/storage/v1/object/session-documents/<path>` sans auth | 400/401 | Script (nécessite un `path` réel en env — sinon utilise le premier objet listé par service_role au démarrage) | n/a | non testé — hors périmètre préprod, ressources non créées ; à couvrir avant ouverture pilote si les rôles/tokens concernés sont activés |
| 5.4.2 | Inspection HTML fiche session interne : `storage_path` jamais visible | UI Laurent (DevTools view source sur `/sessions/[id]`) | ✅ | 2026-07-12 — UI Laurent |
| 5.4.3 | Signed URL générée par `/api/sessions/<id>/documents` expire ≤ 60 s | Script (extrait `downloadUrl` de la réponse, GET après 65s → 401) | ✅ | 2026-07-12 — UI Laurent |

**§5.5 RLS / policies anon**

| # | Test | Attendu | Exécution | Verdict | Note |
|---|---|---|---|---|---|
| 5.5.1 | `grep -rn "to anon" supabase/migrations/` | 0 occurrence en policy active | Script (spawn grep local) | ✅ | 2026-07-12 — script |
| 5.5.2 | `select polname from pg_policies where polroles::text like '%anon%';` | 0 ligne | UI Laurent (SQL Editor dashboard) — déjà validé 2026-07-07 lors du clôturé push v1.0b, à revérifier post-migration 20260708 | ✅ | 2026-07-12 — UI Laurent |
| 5.5.3 | curl anon PostgREST sur table durcie (`/rest/v1/training_sessions?apikey=<ANON>`) | `[]` (RLS bloque) | Script | ✅ | 2026-07-12 — script |

**Acceptance §13.1.2** — CLOS 2026-07-12.

Bilan final :
- **29 ✅ script** (5.1.1-3 + 5.2.1-8, 5.2.10-23 + 5.3.1, 5.3.4 + 5.5.1, 5.5.3). 5.2.14 est passé du statut « finding historique 200 attendu » à **✅ 403 attendu** après T-9 (PR #9) — le check reste dans le registre comme témoin de la régression corrigée.
- **4 ✅ UI Laurent** (5.3.5 page publique HTML sans `token_hash`/service_role/`storage/v1` ; 5.4.2 fiche session sans `storage_path` ; 5.4.3 signed URL morte après ~65 s ; 5.5.2 `pg_policies where 'anon' = any(roles)` = 0 ligne).
- **5 n/a** (5.1.4 client_viewer ; 5.2.9 DATE_OPTION_A_ID ; 5.3.2 token expiré ; 5.3.3 token désactivé ; 5.4.1 STORAGE_OBJECT_PATH) : **hors périmètre préprod, ressources non créées ; à couvrir avant ouverture pilote si les rôles/tokens concernés sont activés**.

Findings résolus pendant l'exécution :
- **T-9** — fuite cross-commercial `/api/diagnostics/*` (service_role sans ownership). Détecté via 5.2.14 puis audit exhaustif → **PR #9** (5 routes durcies).
- **T-10c-BIS** — `event_description` (notes internes commerciales) exposé silencieusement dans `activity/recent`. Détecté pendant PR #9 → **PR #10** (retrait SELECT + double garde-fou runtime).
- **T-11** — cockpit non cloisonné exposant noms clients, PII dirigeant, CA N-1 nominatif, budgets, email commerciaux. Détecté après rejeu §5 par Laurent → **PR #11** (cloisonnement par owner + blocs IA admin-only). Décision produit invalide T-10c.

Garde-fou doctrinal issu de ces 3 findings : **règle service_role** formalisée §7 de `rls-hardening-plan.md` — tout appel `createSupabaseAdminClient()` DOIT être accompagné d'une assertion d'ownership, d'un filtre `created_by`/`in()`, ou d'un commentaire canonique `// service_role justifié : <motif>`. **PR #12** (doc).

Dette proactive avant pilote :
- **Test de garde §7.3** (`rls-hardening-plan.md`) — grep exhaustif des usages `createSupabaseAdminClient` + détection ±20 lignes des 3 garde-fous + exit non-nul si oubli. À implémenter dans une PR dédiée AVANT ouverture pilote, comme filet CI attrapant le prochain oubli sans review humain.
- **Balise canonique** `// service_role justifié : <motif>` à poser sur les cas §7.4 (catalogue, helpers d'assertion, best-effort logging, routes publiques) une fois le test de garde en place.

---

## 14. Documents de référence

- [`prd-global-status-start-academy.md`](prd-global-status-start-academy.md)
  — état des lieux global.
- [`operations-runbook.md`](operations-runbook.md) — backup,
  restauration, rotation clés, incidents.
- [`security-final-audit-preprod.md`](security-final-audit-preprod.md)
  — audit sécurité + correctifs.
- [`rls-hardening-plan.md`](rls-hardening-plan.md) — RLS phases 1
  → 2E.
- [`rls-phase-2-access-audit.md`](rls-phase-2-access-audit.md) —
  audit d'accès table par table.
- [`activity-log-prd.md`](activity-log-prd.md) — journal interne.
- [`ai-monitoring-prd.md`](ai-monitoring-prd.md) — monitoring IA.
- [`ai-rate-limiting-prd.md`](ai-rate-limiting-prd.md) — rate
  limiting.
- [`ai-budget-prd.md`](ai-budget-prd.md) — budget IA mensuel.
- [`support-quality-validation-prd.md`](support-quality-validation-prd.md)
  — validation pédagogique.
- [`post-training-follow-up-prd.md`](post-training-follow-up-prd.md)
  — suivi post-formation.
