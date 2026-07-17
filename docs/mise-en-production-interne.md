# Mise en production interne — outil Start Academy

**Date de rédaction** : 2026-07-17 (remplace `docs/decision-pilote.md`
qui présumait à tort un pilote client)
**Contexte** : Start Academy Diagnostic est l'**outil interne** de Start
Academy — utilisé par Laurent et Jean-Guy pour piloter leur activité de
formation. Les cabinets et agences immobilières sont les **clientes**
traitées dans l'outil, **elles n'ont pas de compte** dans l'app. Elles
n'interagissent avec le système qu'à travers les **liens publics
tokenisés** (`/public/session/[token]`, `/public/collect/[token]`,
`/public/trainer/[token]`) émis pour la collecte de pièces, la
consultation dirigeant ou l'espace formateur.

Ce document acte le passage de l'outil en usage réel par les
utilisateurs internes, après la clôture du sprint stabilisation
(§4 à §9 du plan de stabilisation preprod).

---

## 1. État de préparation — ce qui a été prouvé

| # | Point prouvé | Preuve | Référence |
|---|---|---|---|
| P-1 | **Parcours end-to-end fonctionnel** — un utilisateur interne peut dérouler diagnostic → recommandation → session → collecte → support → formation → bilan sans SQL manuel | Smoke §4 complet joué 2026-07-08 (22 étapes), + T-8 résolu par PR #17 (transition UI de statut, incluant `→ delivered`) | `preprod-stabilization-plan.md §4` + §13.1.1 registre smoke + §11.2 T-8 |
| P-2 | **Sécurité cross-commercial étanche** — Commercial B ne voit ni ne modifie les dossiers de Commercial A | Smoke §5 : 29 ✅ / 0 ❌ / 9 n/a. 3 fuites majeures colmatées : T-9 (diagnostics/*), T-10c-BIS (`event_description` dans activity/recent), T-11 (cockpit non cloisonné) | `preprod-stabilization-plan.md §5 CLOS 2026-07-12` + §11.2 T-9/T-10c-BIS/T-11 + PR #9/#10/#11 |
| P-3 | **Doctrine `service_role` établie** — tout appel `createSupabaseAdminClient()` doit être accompagné d'un des trois garde-fous | Ajout §7 « Règle service_role » de `docs/rls-hardening-plan.md` + application sur toutes les routes durcies | `docs/rls-hardening-plan.md §7` + PR #12 |
| P-4 | **Backup préprod prouvé utile de bout en bout** — un document backupé est réellement restaurable, SHA-256 identique | Test restauration §7 joué 2026-07-12 sur projet Supabase test isolé : 33/33 critères verts, PDF téléchargé via signed URL SHA-256 identique au backup | `docs/restore-test-log.md` + `preprod-stabilization-plan.md §7 CLOS` |
| P-5 | **Cohérence Storage ↔ DB** — pas d'orphelin blob, pas de row sans blob | Audit §8.1 orphelins tranché à 0 sur 4 fichiers (1:1 parfait dans les 2 sens) | `preprod-stabilization-plan.md §8 CLOS 2026-07-12` |
| P-6 | **Bucket privé + policies fermées + signed URL 60s + whitelist MIME + taille max + `getPublicUrl` interdit** | Checklist §8.1 8/8 verts + 4/4 tests négatifs upload OK (`.exe` 400, > 10 Mo 400, sans token 400, token invalide 403) | `preprod-stabilization-plan.md §8` |
| P-7 | **Defense-in-depth Storage** — `file_size_limit` + `allowed_mime_types` posés au niveau bucket Supabase, alignés strict sur `document-types.ts`, test de contrat fail-si-divergence | Migration `20260712140000_extend_bucket_session_documents_limits.sql` + `mime-whitelist.contract.test.ts` | `preprod-stabilization-plan.md §11.2 T-15` + PR #15 |
| P-8 | **Canal RGPD droit à l'effacement documenté** — pas de route DELETE exposée (choix sûr), procédure manuelle admin dans le runbook | `operations-runbook.md §8` mis à jour avec encadré F-2 (ordre impératif blob AVANT ligne DB) | `preprod-stabilization-plan.md §11.2 T-16` + `operations-runbook.md §8` |
| P-9 | **Machine à états de statut session** — transitions autorisées verrouillées par contract test, garde `support_ready → delivered` exige support validé, T-8-BIS refuse bilan sur session en `created`, event distinct sur `report_sent` | Suite tests 104/104 verte dont 22 nouveaux (7 matrice + 6 route + 9 T-8-BIS), vérification manuelle 2026-07-12 | `preprod-stabilization-plan.md §11.2 T-8` + `docs/backlog-post-stabilisation.md §2.2` + PR #17 |
| P-10 | **CI Vercel Preview verte** — `force-dynamic` sur le layout `(app)/` empêche Next.js de tenter un prerender au build sans env vars serveur | PR #19 = première PR avec check Vercel VERT. Confirmé sur PR #20 à #24. | `docs/backlog-post-stabilisation.md §3.1 résolu` + PR #19 |
| P-11 | **Clé `SUPABASE_SERVICE_ROLE_KEY` rotée** — dernier geste avant ouverture. Ancienne clé révoquée par Supabase, nouvelle clé mise à jour dans `.env.local` **et** Vercel (post-provisionnement §3.3) | `docs/security-rotation-log.md` entrée 2026-07-12 | `docs/security-rotation-log.md` + `docs/backlog-post-stabilisation.md §3.2 résolu` |
| P-12 | **App opérationnelle en ligne** — 9 env vars provisionnées sur Vercel (Production, Preview, Development), redéploiement sans cache effectué | `docs/backlog-post-stabilisation.md §3.3 résolu 2026-07-12` | PR #24 |
| P-13 | **Liens publics stables** — un lien dirigeant généré pointe sur l'URL stable `https://start-academy-diagnostic.vercel.app/…`, jamais sur l'URL de déploiement instable Vercel, y compris quand la génération part depuis une URL de déploiement instable | `absoluteAppUrl()` côté serveur, `window.location.origin` supprimé côté client, tests unit + non-régression 9/9 | `docs/backlog-post-stabilisation.md §3.3` + PR #23 |
| P-14 | **Aucun bloquant restant au registre** | Tableau de synthèse `backlog-post-stabilisation.md` — 4 items P0/P1 tous rayés (§3.1 / §3.2 / §3.3 / T-8) | `docs/backlog-post-stabilisation.md` |

---

## 2. Périmètre — décisions actées

### 2.1 Utilisateurs — sans objet

L'outil est **interne**. Les seuls comptes internes sont ceux de
**Laurent** (rôle `commercial`, référent commercial) et **Jean-Guy**
(rôle `admin`, référent produit + admin technique). Les 4 comptes de la
DB préprod incluent aussi deux comptes de test :
- `jeanguyourmieres7@gmail.com` (commercial de test)
- `chatonleingnier@gmail.com` (commercial de test)

Le nettoyage des comptes de test est traité au §5 ci-dessous.

### 2.2 Cabinets clients — sans objet (dans l'app)

Les cabinets et agences immobilières traitées dans l'outil **n'ont
aucun compte**. Elles interagissent uniquement via les liens publics
tokenisés :
- **Dirigeant** : `client_session_view` → `/public/session/<token>` (lecture)
- **Participants** : `participant_collect` → `/public/collect/<token>` (upload de pièces + saisie de préparation)
- **Formateurs** : `trainer_session_view` → `/public/trainer/<token>` (lecture + saisie support)

Les jetons ont expiration courte, `max_uses` optionnel, sont révocables
(`is_active = false`), et **jamais** stockés en clair côté serveur
(seul `token_hash` persiste dans `public_access_tokens`). Le brut ne
réapparaît qu'une seule fois, au moment de la génération.

### 2.3 Périmètre fonctionnel — parcours complet

**Décision actée** : parcours complet diagnostic → recommandation →
session → collecte → support pédagogique → formation dispensée → bilan
post-formation, y compris la validation qualité pédagogique
(`support-quality-reviews`) et la review post-formation
(`post-training-reviews`).

Aucun tronçon du parcours n'est mis de côté — l'outil est utilisé de
bout en bout pour chaque dossier client réel.

---

## 3. Conditions techniques — actées

### 3.1 URL publique — fait

- **URL de production** : `https://start-academy-diagnostic.vercel.app`
- **9 env vars provisionnées** sur Vercel (Production, Preview,
  Development) : cf. `docs/backlog-post-stabilisation.md §3.3` pour
  l'inventaire nominatif.
- **Redéploiement sans cache** effectué 2026-07-12.
- **Vérification liens publics** : lien dirigeant généré depuis la prod
  pointe sur l'URL stable (`https://start-academy-diagnostic.vercel.app/public/session/…`),
  jamais sur l'URL de déploiement instable
  (`https://start-academy-diagnostic-<hash>-jean-guy-s-projects.vercel.app`).
  Preuve : PR #23 fix `absoluteAppUrl()` côté serveur + tests
  non-régression.

L'app est **pleinement opérationnelle en ligne**. Aucune démo
accompagnée locale nécessaire — Laurent et Jean-Guy accèdent
directement à l'URL stable.

### 3.2 Authentification interne

Auth Supabase classique — email + mot de passe, cookies SSR
`@supabase/ssr`. Le layout `(app)/layout.tsx` (`force-dynamic`, PR #19)
consomme `cookies()` via `requireRole(INTERNAL_APP_ROLES)` — redirige
vers `/login` sinon.

Les rôles internes autorisés : `admin`, `commercial`, `trainer`. Les
comptes de test peuvent être supprimés au §5 sans casser l'accès de
Laurent et Jean-Guy.

---

## 4. Ce qui est surveillé — mode « sur événement + budget IA »

### 4.1 Signaux surveillés

**Techniques** :

| Signal | Source | Seuil d'alerte |
|---|---|---|
| Erreurs serveur | `vercel logs` sur la prod | Toute erreur 500 sur route API, ou log `SUPABASE_SERVICE_ROLE_KEY manquante` |
| Budget IA consommé | `getAiMonthlyBudgetStatus()` visible dans le cockpit admin | > `AI_MONTHLY_WARNING_THRESHOLD_PERCENT` (80% par défaut) = alerte, 100% = arrêt IA (bascule fallback heuristique) |
| Cohérence Storage ↔ DB | Requête MCP ad hoc si suspicion | Toute divergence 1:1 |
| Erreurs de transition de statut | activity_logs `event_type=session_status_changed` refusées (409) | > 3 refus consécutifs sur le même statut source → retravailler la matrice |
| Bilans modifiés après envoi | activity_logs `event_type=post_training_review_modified_after_send` (T-8-BIS nuance 2) | Toute occurrence à investiguer (divergence potentielle avec version reçue par le client) |

**Métier** :

| Signal | Source | Seuil |
|---|---|---|
| Documents uploadés hors whitelist | Refus 400 côté route `/api/public/upload-document` + rejet bucket (defense-in-depth §8) | Toute occurrence — le participant est redirigé UI vers un format valide |
| Notes internes dérivantes | activity_logs `event_type=note_added` via journal détaillé session | Auto-audit par Laurent au fil de l'eau |
| Feedback qualitatif cabinet | Retours directs (téléphone, mail) | Discutés en point hebdomadaire Laurent ↔ Jean-Guy |

### 4.2 Cadence — sur événement + budget IA

**Décision actée** : le monitoring est **déclenché sur événement** —
Laurent ou Jean-Guy consulte les logs / activity_logs uniquement si un
utilisateur (interne ou externe via lien public) remonte une friction,
ou si un événement produit inhabituel apparaît (bilan modifié après
envoi, refus de transition récurrent).

**Exception permanente** : le **budget IA** est surveillé en continu
via le bloc « Budget IA » du cockpit admin (visible uniquement
`admin`, cf. PR #11 T-11). L'alerte à 80 % et l'arrêt automatique à
100 % sont déjà en place.

Aucun point de contrôle périodique planifié — l'app tourne, on
n'intervient que si un signal remonte.

---

## 5. Action restante avant premier usage réel — nettoyage des données de test

Avant que Laurent et Jean-Guy utilisent l'outil sur de vrais dossiers
clients, les données de test accumulées pendant le sprint stabilisation
(smoke §4, tests T-9/T-11, restore §7, audit §8) doivent être purgées.

### 5.1 Cabinets à supprimer

- **Pinpin immobilier** (identifié pendant l'incident T-11)
- **Marx** (idem)
- **Horizon Immo** (idem)
- **TEST** (client de test générique)

**Attention** : les noms exacts en base peuvent différer légèrement
(casse, accents, « immobilier » vs « immo »). Étape 1 ci-dessous
consolide les IDs par recherche fuzzy avant tout DELETE.

### 5.2 Cascade FK — tables impactées

Un `DELETE FROM public.clients WHERE id IN (...)` cascade
**automatiquement** sur toutes les tables ci-dessous grâce aux
contraintes `on delete cascade` définies dans les migrations initiales
et additionnelles :

| Table fille | FK vers | Comportement |
|---|---|---|
| `diagnostics` | `clients.id` | cascade |
| `diagnostic_answers` | `diagnostics.id` | cascade (via diagnostics) |
| `diagnostic_participants` | `diagnostics.id` | cascade (via diagnostics) |
| `recommendations` | `diagnostics.id` | cascade (via diagnostics) |
| `recommendation_modules` | `recommendations.id` | cascade (via recommendations) |
| `training_sessions` | `clients.id` | cascade |
| `session_participants` | `training_sessions.id` | cascade |
| `session_documents` | `training_sessions.id` | cascade (rows DB uniquement — cf. §5.4) |
| `session_date_options` | `training_sessions.id` | cascade |
| `training_supports` | `training_sessions.id` | cascade |
| `designed_training_supports` | `training_sessions.id` | cascade |
| `support_quality_reviews` | `training_sessions.id` | cascade |
| `post_training_reviews` | `training_sessions.id` | cascade |
| `public_access_tokens` | `training_sessions.id` | cascade |
| `activity_logs` | `clients.id` / `diagnostics.id` / `training_sessions.id` | cascade (les 3 FK cascade, la row est supprimée dès qu'une des 3 disparaît) |

**Exceptions à surveiller** :

- **`ai_generation_logs`** : FK `diagnostic_id`, `recommendation_id`,
  `session_id` en `on delete set null` (**pas** cascade). Les lignes
  d'audit IA persistent avec FK à null — c'est intentionnel (trace
  historique des coûts et prompts, indépendante du dossier client
  supprimé). À vérifier post-DELETE : les lignes historiques
  correspondant aux cabinets supprimés restent en base avec FK à null.

- **Blobs Storage `session-documents`** : le CASCADE supprime la row
  `session_documents` (métadonnée + `storage_path`), **PAS le blob
  binaire** dans le bucket. Documenté §4.3 du runbook et §8 audit
  Storage. Les 4 blobs connus (§6 inventaire) doivent être supprimés
  **explicitement** via l'API Storage. Voir §5.4.

### 5.3 Checklist — séquence exacte

```
0. PRÉREQUIS
   ├── Aucun utilisateur interne connecté (Laurent + Jean-Guy notifiés).
   ├── Aucun lien public tokenisé actif chez un participant réel
   │   (vérification manuelle des tokens actifs :
   │    select id, session_id, is_active, expires_at
   │      from public.public_access_tokens
   │     where is_active = true;
   │    → toutes les lignes doivent correspondre à des sessions de test).
   └── `.env.local` à jour, Vercel prod stable.

1. BACKUP PRÉALABLE (impératif, règle du sprint stabilisation)
   TS=$(date +%Y%m%d_%H%M)
   supabase db dump --linked --schema public --file backups/preprod_schema_${TS}.sql
   supabase db dump --linked --schema public --data-only --file backups/preprod_data_${TS}.sql
   supabase db dump --linked --schema auth --data-only --file backups/preprod_auth_data_${TS}.sql
   # Inventaire Storage (Python script §6) : liste + hash SHA-256 des 4 blobs.

2. INVENTAIRE PRÉ-DELETE — récupérer les IDs et les storage_paths
   (via MCP execute_sql ou dashboard SQL Editor) :

   -- 2a. Clients cibles (fuzzy pour couvrir casse et variantes)
   select id, company_name, created_at
     from public.clients
    where lower(company_name) similar to '%(pinpin|marx|horizon|test)%'
    order by created_at;

   -- 2b. Storage paths à supprimer (nécessaire AVANT delete cascade
   --     car session_documents va disparaître)
   select sd.storage_path
     from public.session_documents sd
     join public.training_sessions ts on ts.id = sd.session_id
     join public.clients c on c.id = ts.client_id
    where c.id in (<liste UUIDs de 2a>);
   -- → sauvegarder cette liste dans un fichier local (paths.txt).

3. SUPPRESSION EN BASE — cascade complète
   delete from public.clients
    where id in (<liste UUIDs de 2a>);
   -- Cascade sur diagnostics, training_sessions, et toutes leurs filles.
   -- ai_generation_logs.*_id passe à null (rows conservées).

4. SUPPRESSION EXPLICITE DES BLOBS STORAGE
   Pour chaque path dans paths.txt (récupéré en 2b) :
   curl -sS -X DELETE \
     "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/session-documents/<path>" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   # HTTP 200 attendu.

5. POST-CHECK — vérifier la cohérence 1:1
   -- Aucun client résiduel
   select count(*) from public.clients
    where lower(company_name) similar to '%(pinpin|marx|horizon|test)%';
   -- Attendu : 0.

   -- Aucun session_document résiduel qui pointerait sur un blob supprimé
   -- (les rows sont censées avoir cascade avec les sessions)
   -- + inventaire bucket doit être aligné 1:1 avec session_documents
   -- (procédure §8 audit Storage — script Python à rejouer).

   -- ai_generation_logs orphelins tracés
   select count(*) from public.ai_generation_logs
    where diagnostic_id is null and recommendation_id is null and session_id is null;
   -- Note l'augmentation vs pré-delete — normal, c'est l'effet du set null.

6. CONSIGNATION
   Créer une entrée dans docs/mise-en-production-interne.md §6
   ci-dessous : date exacte, IDs supprimés, nb blobs supprimés,
   comptes de test auth restants à supprimer si décision.
```

### 5.4 Traitement des comptes de test `auth.users`

Les 4 comptes préprod sont :
- `laurent@start-academy.fr` (**à conserver** — compte réel)
- `jean-guy@start-academy.fr` (**à conserver** — compte réel)
- `jeanguyourmieres7@gmail.com` (compte de test)
- `chatonleingnier@gmail.com` (compte de test)

Les 2 comptes de test peuvent être supprimés post-nettoyage clients
via le dashboard Supabase → Authentication → Users → Delete. Attention
à `profiles.id → auth.users.id` : la ligne `profiles` cascade
automatiquement (défini dans la migration `init_mvp1.sql`).

**Décision `[À TRANCHER]` par Laurent** : supprimer les 2 comptes de
test ou les laisser (utiles pour ré-exécuter un smoke §4 si besoin de
tester une régression sécu du cloisonnement) ? Recommandation : les
**laisser**, en documentant leur rôle dans ce log.

### 5.5 Après nettoyage — checklist d'usage réel

- [ ] Cabinets de test supprimés (5.3 étape 3)
- [ ] Blobs Storage supprimés (5.3 étape 4)
- [ ] Post-check cohérence Storage/DB à 0 orphelin (5.3 étape 5)
- [ ] Comptes de test conservés OU supprimés — décision consignée (5.4)
- [ ] Backup post-nettoyage horodaté dans `backups/`
- [ ] Entrée dans §6 « Journal des interventions » ci-dessous

---

## 6. Journal des interventions

Une entrée par intervention significative sur la préprod / prod
post-mise en production interne. À remplir immédiatement.

### 2026-07-17 — Décision de mise en production interne

- **Opérateur** : Laurent (validation), Jean-Guy (co-décision)
- **Événement** : bascule officielle de l'outil de « sprint
  stabilisation clos » à « usage interne opérationnel ».
- **Contexte** : 4 items P0/P1 résolus dans le backlog (§3.1 CI Vercel,
  §3.2 rotation clé, §3.3 env vars Vercel, T-8 machine à états), 6 PR
  consécutives 100 % vertes, app pleinement opérationnelle sur URL
  stable.
- **Prochaine action** : nettoyage des données de test §5 avant premier
  dossier client réel.

### `<DATE>` — Nettoyage des données de test §5

À remplir après exécution.

- **Opérateur** :
- **Backup pré-nettoyage** :
- **UUIDs supprimés** :
- **Storage paths supprimés** :
- **`ai_generation_logs` orphelins observés** :
- **Décision comptes de test auth** :

---

## 7. Références

- `docs/preprod-stabilization-plan.md` (plan de stabilisation preprod, §4-§9)
- `docs/backlog-post-stabilisation.md` (backlog consolidé, tableau de synthèse)
- `docs/operations-runbook.md` (procédures d'ops, §4 backup, §6 rotation, §8 suppression document)
- `docs/restore-test-log.md` (registre restauration §7)
- `docs/security-rotation-log.md` (registre rotation §9)
- `docs/proposition-commerciale-v2-prd.md` (PRD premier chantier post-mise en production interne)
- `docs/rls-hardening-plan.md` (doctrine RLS + règle service_role)
- `docs/activity-log-prd.md` (journal d'activité)
