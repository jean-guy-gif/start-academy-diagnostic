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
| `20260526120100_create_session_documents_bucket.sql` | bucket Storage | `select id, public from storage.buckets where id = 'session-documents';` → `public = false` |
| `20260527120000_add_session_date_options.sql` | `session_date_options` | — |
| `20260528120000_add_diagnostic_participants.sql` | `diagnostic_participants` | — |
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

**Acceptance critère §3** : les 22 migrations sont présentes dans
`supabase_migrations.schema_migrations`, le grep
`to anon` sur `supabase/migrations/` retourne 0 occurrence.

---

## 4. Smoke tests fonctionnels (1 admin + 2 commerciaux)

### 4.1 Préparation

Créer 3 comptes auth dans Supabase :

| Compte | Email | Rôle profile |
|---|---|---|
| Admin | admin@start-academy.test | `admin` |
| Commercial A | commerciala@start-academy.test | `commercial` |
| Commercial B | commercialb@start-academy.test | `commercial` |

Pour chaque compte créé, vérifier que `public.profiles` contient
bien la ligne avec le bon `role` (le trigger `handle_new_user`
défaute à `commercial` — éditer la ligne admin manuellement).

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
| 1 | 100 % des smoke fonctionnels §4.2 + §4.3 passent | ☐ |
| 2 | 100 % des smoke sécurité §5.1 → §5.5 passent (avec confirmation §5.2.14 résolue OU finding ouvert) | ☐ |
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

Après la livraison v1.0b, `npm run lint` retourne **8 erreurs
résiduelles**, toutes dans des fichiers **non touchés** par les
lots v1.0/v1.0b. Elles ne sont donc pas des régressions v1.0b.
Règle validée : **zéro nouvelle erreur lint dans les fichiers
touchés par v1.0/v1.0b** — les 4 erreurs qui l'étaient ont été
corrigées avant merge.

| # | Fichier | Ligne | Règle | Bloquant smoke test ? |
|---|---|---|---|---|
| 1 | `src/app/(app)/sessions/[id]/post-training-review.tsx` | 155 | `react-hooks/set-state-in-effect` | Non — data fetch on-mount classique |
| 2 | `src/app/(app)/sessions/[id]/session-activity-journal.tsx` | 149 | `react-hooks/set-state-in-effect` | Non |
| 3 | `src/app/(app)/sessions/[id]/session-date-options.tsx` | 108 | `react-hooks/set-state-in-effect` | Non |
| 4 | `src/app/(app)/sessions/[id]/session-documents.tsx` | 69 | `react-hooks/set-state-in-effect` | Non |
| 5 | `src/app/(app)/sessions/[id]/support/design/support-quality-validation.tsx` | 82 | `react-hooks/set-state-in-effect` | Non |
| 6 | `src/lib/ai/heuristic-designed-support.ts` | 462 | `@next/next/no-assign-module-variable` | **⚠️ Oui — à corriger avant smoke test** |
| 7 | `src/lib/ai/heuristic-training-support.ts` | 342 | `@next/next/no-assign-module-variable` | **⚠️ Oui — à corriger avant smoke test** |
| 8 | `src/lib/ai/select-relevant-modules-for-analysis.ts` | 273 | `prefer-const` | **⚠️ Oui — à corriger avant smoke test** |

**Motif du blocage smoke** : les 3 erreurs #6-8 concernent les
**heuristiques de fallback IA** — le code qui s'exécute quand
OpenRouter tombe ou dépasse budget. C'est précisément le chemin
qu'on veut voir fonctionner en mode dégradé pendant le smoke §4.
Une assignation à `module` (variable réservée Next.js) ou un
`selected` non-`const` peut passer inaperçu au happy path et
casser l'app quand la bascule heuristique se déclenche.

**Action** : corriger #6-8 dans un hotfix ciblé (branche
`chore/lint-heuristics-hotfix`) avant d'ouvrir le smoke test §4.
Les 5 erreurs #1-5 restent dette suivie ; elles pourront être
absorbées dans un lot de nettoyage lint transverse (post-pilote).

---

## 12. Contraintes

- **Ne pas modifier le code** pendant le sprint stabilisation
  (sauf correctif identifié dans §11.2 / §11.3, sous forme de
  hotfix ciblé).
- **Ne pas créer de migration** SQL nouvelle. Les 22 migrations
  listées §3 sont l'état figé.
- **Ne pas brancher** Gmail / Calendar / Drive — la valeur ajoutée
  passera par le pilote distant et la mesure d'usage avant
  intégrations externes.
- **Ne pas activer Coach Brain** — la posture downstream consumer
  only reste en place tant que NXT Performance n'a pas exposé
  d'endpoint d'ingestion.
- **Document uniquement** : aucune fonctionnalité applicative
  ajoutée dans ce sprint.

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
