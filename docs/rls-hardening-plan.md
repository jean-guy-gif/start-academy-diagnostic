# Plan de durcissement RLS — Start Academy Diagnostic

> Statut :
> - **Phase 1 appliquée** (`20260602100000_rls_hardening_phase_1.sql`).
> - **Phase 2 préparation appliquée** : triggers `created_by` +
>   failfast `service_role` (`20260603100000_prepare_rls_phase_2_created_by.sql`,
>   2026-05-26).
> - **Phase 2A appliquée 2026-05-26**
>   (`20260604100000_rls_hardening_phase_2a.sql`) :
>   `training_modules`, `module_rules`, `session_date_options`.
> - **Phase 2B préparation code appliquée 2026-05-26** : routes API
>   internes `/api/diagnostics/*` créées, `diagnostic-service.ts`
>   refactorisé pour passer par l'API au lieu de
>   `createSupabaseBrowserClient`, fallback localStorage strictement
>   gated par `isLocalFallbackAllowed()`.
> - **Phase 2B migration RLS appliquée 2026-05-26**
>   (`20260605100000_rls_hardening_phase_2b.sql`) :
>   `clients`, `diagnostics`, `diagnostic_answers`, `transcripts`,
>   `diagnostic_participants` — ownership par `created_by` ou
>   jointure diagnostic.
> - **Phase 2C appliquée 2026-05-26**
>   (`20260606100000_rls_hardening_phase_2c.sql`) :
>   `recommendations`, `recommendation_modules`, `training_sessions` —
>   ownership par `created_by` ou jointure diagnostic / client.
>   Nouveaux helpers `can_access_recommendation(uuid)` et
>   `can_access_session(uuid)`.
> - **Phase 2D appliquée 2026-05-26**
>   (`20260607100000_rls_hardening_phase_2d.sql`) :
>   `session_participants`, `session_documents` — ownership via
>   `can_access_session`. Policies Storage non touchées.
>   Inclut les helpers « explicit user » (`can_user_access_session`,
>   `is_admin_for_user`, etc.) + correctif route
>   `/api/sessions/[id]/documents` (check ownership explicite avant
>   accès admin client — cf. audit §3.4.1).
> - **Phase 2E appliquée 2026-05-26**
>   (`20260608100000_rls_hardening_phase_2e.sql`) :
>   `training_supports`, `designed_training_supports` — ownership via
>   `can_access_session`. Helper côté code
>   `assertCanAccessSession(profile, sessionId)` appliqué aux 3
>   routes admin-client critiques (documents + 2 IA).
> - **Correctifs audit final appliqués 2026-05-26**
>   (`20260609100000_access_helpers_diagnostic_for_user.sql`) :
>   nouveau helper SQL `can_user_access_diagnostic` + helper code
>   `assertCanAccessDiagnostic` + 7 routes durcies (I-1 → I-5,
>   `/api/sessions/[id]/date-options/[optionId]` DELETE,
>   `/api/activity/log` POST). Audit
>   [security-final-audit-preprod.md](security-final-audit-preprod.md)
>   §3.
> - **Phase 2 complète + audit final clos.**
>
> Audit d'accès détaillé : [rls-phase-2-access-audit.md](rls-phase-2-access-audit.md).

---

## Pré-Phase 2 — décisions appliquées (2026-05-26)

1. **`SUPABASE_SERVICE_ROLE_KEY` obligatoire en preprod/prod.**
   `createSupabaseAdminClient()` lève désormais une erreur explicite
   (« SUPABASE_SERVICE_ROLE_KEY manquante en environnement non-local. »)
   quand on est en `APP_ENV=preprod` ou `production` (fallback
   `NODE_ENV=production`). En `APP_ENV=local` (ou non défini) le
   comportement reste tolérant — retour `null`, fallback inline /
   localStorage / server-anon possible.
   - Services best-effort (`createActivityLog`, `logAiGeneration`)
     encapsulent ce throw pour ne JAMAIS faire échouer l'action
     métier qui les déclenche.

2. **Triggers `created_by` défaut.** Migration
   `20260603100000_prepare_rls_phase_2_created_by.sql` :
   `public.set_created_by_if_null()` + 10 triggers BEFORE INSERT sur :
   - `clients`, `diagnostics`, `transcripts`, `recommendations`,
     `training_sessions`, `public_access_tokens`,
     `ai_generation_logs`, `training_supports`,
     `designed_training_supports`, `session_date_options`.
   - `activity_logs` exclue (utilise `actor_id` à la place).
   - Sans SECURITY DEFINER : non privilégié, soumis à RLS comme
     l'invocateur.
   - Si `created_by` est fourni explicitement (routes serveur), il est
     conservé. Sinon `auth.uid()` est utilisé. Route publique anon →
     `auth.uid()` NULL → `created_by` reste NULL (souhaité).

3. **Pas de colonne `assigned_trainer_id`** sur `training_sessions`
   pour le MVP. Le formateur passe par token signé
   (`trainer_session_view`) côté pages publiques en service_role.

4. **Ordre de durcissement retenu** :
   - Préparation : triggers `created_by` ✅
   - Phase 2A : `training_modules`, `module_rules`,
     `session_date_options`
   - Phase 2B : `clients`, `diagnostics`, `diagnostic_answers`,
     `transcripts`, `diagnostic_participants`
   - Phase 2C : `recommendations`, `recommendation_modules`,
     `training_sessions`
   - Phase 2D : `session_participants`, `session_documents`
   - Phase 2E : `training_supports`, `designed_training_supports`

---

## 0. Phase 1 appliquée — 2026-06-02

Tables durcies (lecture seule en interne, écriture interne/serveur) :

| Table | Avant | Après |
|---|---|---|
| `profiles` | `authenticated` (true) sur tout | SELECT self OR admin, UPDATE self (sans role) OR admin, DELETE admin, INSERT via trigger SECURITY DEFINER |
| `public_access_tokens` | `authenticated` (true) | SELECT/INSERT/UPDATE rôles internes, DELETE admin |
| `activity_logs` | `authenticated` (true) SELECT/INSERT | SELECT/INSERT rôles internes uniquement |
| `ai_generation_logs` | `authenticated` (true) sur tout | SELECT/INSERT rôles internes, UPDATE/DELETE bloqués (immutable) |

Helpers SQL ajoutés (SECURITY DEFINER, `search_path = public, pg_temp`) :

- `public.get_my_role()` — rôle de l'utilisateur courant
- `public.is_internal_user()` — `admin`/`commercial`/`trainer`
- `public.is_admin()` — `admin`

Le bypass via SECURITY DEFINER coupe la récursion (la policy SELECT
sur `profiles` appelle un helper qui ne re-déclenche pas la policy).

### Pourquoi c'était à faible risque

- Toutes les routes serveur sensibles (cockpit, activité, monitoring,
  tokens publics) lisent ces tables via `createSupabaseAdminClient()`
  qui utilise `service_role` → bypass RLS, aucune régression.
- `getCurrentProfile` lit `profiles` avec filtre `eq("id", user.id)` →
  matche la nouvelle policy `id = auth.uid()`.
- Le trigger `handle_new_user` (SECURITY DEFINER) crée la ligne
  `profiles` au signup — le bypass RLS continue.
- Aucun composant browser-side ne lit ces 4 tables directement
  (vérifié : pas de `.from("profiles")` / `.from("activity_logs")` /
  etc. dans les services `createSupabaseBrowserClient`).

### Tests fonctionnels attendus (smoke côté pilote)

- [ ] Un admin se connecte → `/cockpit` charge (KPI, pipeline, Usage
      IA, Activité récente).
- [ ] Non connecté sur `/cockpit` → redirigé.
- [ ] Une route publique tokenisée (`/public/session/<token>`) reste
      fonctionnelle (lecture via `service_role`).
- [ ] La création d'un lien public (`POST
      /api/sessions/:id/create-access-link`) fonctionne pour
      admin/commercial/trainer.
- [ ] Le bloc « Activité récente » du cockpit retourne des entrées.
- [ ] Le bloc « Usage IA » charge KPI + 5 derniers appels.
- [ ] Un user `client_viewer` ou `participant` (rare en interne) ne
      voit AUCUNE des 4 tables côté client cookie — vérifiable via
      requête Postgres directe.
- [ ] Un commercial ne peut PAS s'auto-promouvoir admin (UPDATE
      `profiles` avec un nouveau role refusé).

### Tables NON touchées (phase 1)

`clients`, `diagnostics`, `diagnostic_answers`, `transcripts`,
`recommendations`, `recommendation_modules`, `training_sessions`,
`session_participants`, `session_documents`, `training_supports`,
`designed_training_supports`, `training_modules`, `module_rules` —
restent en `authenticated` permissive jusqu'à la phase 2.

---

## 1. Politiques actuelles (post-MVP1, post-socle auth)

État des lieux RLS pour chaque table métier (cf.
[supabase/migrations/20260521120000_init_mvp1.sql](../supabase/migrations/20260521120000_init_mvp1.sql) §RLS) :

| Table | RLS | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `profiles` | ✅ | **self OR admin** | trigger SECURITY DEFINER | **self (sans role) OR admin** | **admin** |
| `public_access_tokens` | ✅ | **internal** | **internal** | **internal** | **admin** |
| `activity_logs` | ✅ | **internal** | **internal** | bloqué (immutable) | bloqué (immutable) |
| `ai_generation_logs` | ✅ | **internal** | **internal** | bloqué | bloqué |
| `training_modules` | ✅ | **internal** | **admin** | **admin** | **admin** |
| `module_rules` | ✅ | **internal** | **admin** | **admin** | **admin** |
| `session_date_options` | ✅ | **internal** | **internal** | **internal** | **admin** |
| `clients` | ✅ | **owner OR admin** | **internal + created_by self** | **owner OR admin** | **admin** |
| `diagnostics` | ✅ | **owner OR admin** | **internal + created_by self** | **owner OR admin** | **admin** |
| `diagnostic_answers` | ✅ | **`can_access_diagnostic`** | **`can_access_diagnostic`** | **`can_access_diagnostic`** | **admin** |
| `transcripts` | ✅ | **`can_access_diagnostic` OR created_by** | **`can_access_diagnostic`** | **`can_access_diagnostic` OR created_by** | **admin** |
| `diagnostic_participants` (M2) | ✅ | **`can_access_diagnostic`** | **`can_access_diagnostic`** | **`can_access_diagnostic`** | **`can_access_diagnostic`** |
| `recommendations` | ✅ | **owner OR admin OR `can_access_diagnostic`** | **internal + (owner OR admin OR `can_access_diagnostic`)** | **owner OR admin** | **admin** |
| `recommendation_modules` | ✅ | **`can_access_recommendation`** | **`can_access_recommendation`** | **`can_access_recommendation`** | **admin** |
| `training_sessions` | ✅ | **owner OR admin OR `can_access_diagnostic` OR `can_access_client`** | **internal + (owner OR admin)** | **owner OR admin** | **admin** |
| `training_supports` (M3) | ✅ | **`can_access_session`** | **internal + `can_access_session`** | **internal + `can_access_session`** | **admin** |
| `designed_training_supports` (M3) | ✅ | **`can_access_session`** | **internal + `can_access_session`** | **internal + `can_access_session`** | **admin** |
| `session_participants` (M2) | ✅ | **`can_access_session`** | **internal + `can_access_session`** | **internal + `can_access_session`** | **admin** |
| `session_documents` (M2) | ✅ | **`can_access_session`** | **internal + `can_access_session`** | **internal + `can_access_session`** | **admin** |

Légende :
- **internal** = `public.is_internal_user()` (admin / commercial / trainer)
- **admin** = `public.is_admin()`

**Lecture clé** : sur les 4 tables hardenées en phase 1, seuls les
rôles internes peuvent lire/écrire ; un user `client_viewer` ou
`participant` ne voit rien. Toutes les autres tables sont encore en
mode permissif `authenticated` (MVP1) — **inacceptable en production**.

**Fallback localStorage** : tant que Supabase n'est pas configuré
(`NEXT_PUBLIC_SUPABASE_URL` absent), les services côté navigateur
utilisent localStorage. Aucune sécurité — voir
[src/lib/storage/local-fallback.ts](../src/lib/storage/local-fallback.ts).
À couper en prod via `DISABLE_LOCAL_FALLBACK=true`.

---

## 2. Politiques cibles

L'objectif est d'aboutir, à terme, à des policies qui combinent :

- **Rôle utilisateur** : `admin` / `commercial` / `trainer` (rôles
  internes) versus `client_viewer` / `participant` (chemins publics
  signés, futur).
- **Appartenance organisationnelle** : un `commercial` Start Academy
  ne voit que les clients qu'il a saisis (ou ceux explicitement
  partagés).
- **Cycle de vie** : une recommandation `validated` est verrouillée
  en écriture ; un diagnostic `draft` reste éditable par son créateur.

### 2.1 Helper SQL prévu

```sql
-- Renvoie le rôle de l'utilisateur courant.
create or replace function public.current_role()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Renvoie true si l'utilisateur courant est admin Start Academy.
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
```

### 2.2 Politiques cibles par table

| Table | SELECT cible | INSERT cible | UPDATE cible | DELETE cible |
|---|---|---|---|---|
| `profiles` | self OR admin | admin uniquement (signup contrôlé via trigger) | self (limited fields) OR admin | admin uniquement |
| `clients` | rôle interne + `created_by = auth.uid()` OR admin | rôle interne | `created_by = auth.uid()` OR admin | admin |
| `training_modules` | tout authenticated | admin | admin | admin |
| `module_rules` | tout authenticated | admin | admin | admin |
| `diagnostics` | `created_by = auth.uid()` OR admin OR (trainer + session liée) | rôle interne | `created_by` OR admin (sauf si `validated`) | admin |
| `diagnostic_answers` | via `diagnostics.id` | idem | idem | idem |
| `transcripts` | via `diagnostics.id` | idem | idem | idem |
| `recommendations` | via `diagnostics.id` | rôle interne | `created_by` OR admin (sauf si `sent`/`accepted`) | admin |
| `recommendation_modules` | via `recommendations.id` | idem | idem | idem |
| `training_sessions` | commercial créateur OR trainer assigné OR admin | rôle interne | créateur OR trainer assigné OR admin | admin |
| `training_supports` | trainer assigné OR commercial créateur OR admin | rôle interne | idem | admin |
| `designed_training_supports` | idem `training_supports` | idem | idem | admin |
| `session_participants` | trainer + manager client (via lien signé) | trainer OR participant (lien signé) | self OR trainer | admin |
| `session_participant_documents` | trainer OR self | trainer OR self | self | admin |
| `ai_generation_logs` | admin only (audit) | service_role uniquement (côté routes) | jamais | admin |

---

## 3. Ordre de durcissement recommandé

Aller du moins risqué (lecture seule, peu de surface) au plus risqué
(écriture + données pédagogiques). Une migration par étape, avec un
test pilote entre chaque.

### Étape 1 — Catalogue en lecture seule pour tous

- **Tables** : `training_modules`, `module_rules`.
- **Risque** : très faible. Le catalogue est de la donnée Start Academy
  publique pour ses clients pilotes.
- **Migration** : remplacer le INSERT/UPDATE/DELETE `authenticated` par
  une policy admin uniquement. SELECT reste ouvert à `authenticated`.
- **Impact code** : les routes admin (`/settings/modules`) doivent
  utiliser une auth admin. Tout le reste continue de fonctionner.

### Étape 2 — Profils

- **Tables** : `profiles`.
- **Risque** : faible. Aucune route ne modifie en masse les profils.
- **Migration** : SELECT `auth.uid() = id` OR `is_admin()`. INSERT
  retiré (créé par le trigger `handle_new_user`). UPDATE limité aux
  champs `full_name`, `organization`. DELETE admin only.
- **Impact code** : aucun fonctionnel direct. La topbar (qui lit
  `profiles`) doit faire le get avec `id = auth.uid()` ce qui est
  déjà le cas via `getCurrentProfile`.

### Étape 3 — Logs IA

- **Tables** : `ai_generation_logs`.
- **Risque** : faible. Les routes API utilisent `createSupabaseAdminClient()`
  (service_role) qui contourne RLS — donc l'insertion continue de
  fonctionner. Seul le SELECT change.
- **Migration** : SELECT admin only. INSERT/UPDATE/DELETE bloqués pour
  `authenticated` (service_role uniquement via les routes).

### Étape 4 — Clients

- **Tables** : `clients`.
- **Risque** : moyen — c'est la première vraie ségrégation par
  `created_by`.
- **Migration** : SELECT `created_by = auth.uid()` OR `is_admin()`.
  INSERT `auth.uid() IS NOT NULL` AND `current_role() IN ('admin',
  'commercial', 'trainer')`. UPDATE / DELETE idem SELECT.
- **Impact code** : il faut vérifier que `clients.created_by` est bien
  rempli côté serveur (actuellement `null` autorisé). Ajouter un
  trigger BEFORE INSERT pour défauter `created_by = auth.uid()` si
  vide — sécurise contre les oublis.

### Étape 5 — Diagnostics + chaîne pédagogique

- **Tables** : `diagnostics`, `diagnostic_answers`, `transcripts`,
  `recommendations`, `recommendation_modules`, `training_sessions`,
  `training_supports`, `designed_training_supports`.
- **Risque** : élevé. C'est le cœur du produit ; toute erreur de
  policy casse un parcours commercial complet.
- **Migration** : à découper en plusieurs étapes (au moins une par
  bloc fonctionnel). Mêmes patterns que `clients` mais avec jointures
  via `diagnostic_id` / `session_id`. Utiliser des EXISTS sur les
  tables parentes — éviter les CTE qui ne sont pas indexables.
- **Impact code** : les services côté navigateur doivent retourner
  proprement une recommandation lorsqu'aucun droit n'est trouvé
  (afficher "non autorisé" plutôt que casser silencieusement).

### Étape 6 — Participants + documents

- **Tables** : `session_participants`, `session_participant_documents`.
- **Risque** : moyen. À traiter en même temps que la mise en place du
  lien public sécurisé (rôle `participant`, JWT signé), pas avant.
- **Migration** : SELECT/UPDATE basés sur `auth.uid()` matchant
  `participant_id` (pour participant), OR trainer assigné, OR admin.

---

## 4. Risques transverses

### 4.1 Service role abuse

Plusieurs routes (`/api/*-training-*`) utilisent
`createSupabaseAdminClient()` (service_role) pour bypasser RLS et
loguer dans `ai_generation_logs`. **Aucune validation d'identité
n'est faite avant le bypass**. Une fois auth en place, ces routes
doivent **valider l'utilisateur connecté avant de faire l'écriture
en service_role** (ex : vérifier que le user a bien droit à ce
diagnostic, AVANT de logger sous service_role).

### 4.2 Fallback localStorage

Tant qu'il existe, un client doit choisir : Supabase ou localStorage.
Mélanger les deux est dangereux. Recommandation : dès qu'un user se
connecte (Supabase actif), invalider le store localStorage pour ce
device — ou afficher un bandeau « données locales obsolètes » et
proposer une migration.

### 4.3 Triggers SECURITY DEFINER

`handle_new_user` est SECURITY DEFINER (cf. migration
[20260524120000_auth_socle.sql](../supabase/migrations/20260524120000_auth_socle.sql)).
À chaque ajout d'un trigger SECURITY DEFINER :
- forcer `search_path` (déjà fait),
- review obligatoire,
- documenter pourquoi il faut le bypass RLS.

### 4.4 Migration des données legacy

Les rows `profiles` existants avec `role = 'formateur'` sont migrés
vers `trainer` par la migration. Vérifier en pré-prod qu'aucun code
client (jamais commité ici, mais possiblement dans un dump partiel)
ne fait référence à `'formateur'` après cette bascule.

---

## 5. Tables impactées — checklist par migration

À recopier dans le commit message de chaque étape de durcissement :

```
Migration : <nom>
Tables touchées : <liste>
Tests :
  - [ ] Un commercial connecté lit ses propres clients
  - [ ] Un commercial connecté ne lit PAS les clients d'un autre
  - [ ] Un admin lit tout
  - [ ] Un participant ne lit RIEN côté app
  - [ ] La création via la route API fonctionne (created_by rempli)
  - [ ] La route /api/* loggue dans ai_generation_logs sans erreur
  - [ ] Le fallback localStorage continue de fonctionner (mode dev)
```

---

## 6. Décision

| Étape | Statut MVP | Statut pilote client | Statut prod |
|---|---|---|---|
| **Phase 1 (profils + tokens + activity_logs + ai_generation_logs)** | **appliquée** | obligatoire | obligatoire |
| **Phase 2 préparation (triggers created_by + failfast service_role)** | **appliquée** | obligatoire | obligatoire |
| **Phase 2A (catalogue + module_rules + session_date_options)** | **appliquée 2026-05-26** | obligatoire | obligatoire |
| **Phase 2B préparation code (routes API diagnostics)** | **appliquée 2026-05-26** | obligatoire avant durcissement | obligatoire avant durcissement |
| **Phase 2B migration RLS (clients + diagnostics + answers + transcripts + diagnostic_participants)** | **appliquée 2026-05-26** | obligatoire | obligatoire |
| **Phase 2C (recommendations + recommendation_modules + training_sessions)** | **appliquée 2026-05-26** | obligatoire | obligatoire |
| **Phase 2D (session_participants + session_documents)** | **appliquée 2026-05-26** | obligatoire | obligatoire |
| **Phase 2E (training_supports + designed_training_supports)** | **appliquée 2026-05-26** | obligatoire | obligatoire |

**Posture actuelle** : avant le premier pilote distant (hors démo
interne), exécuter au minimum étapes 1 + 2 + 3 (zero downside, gros
gain de robustesse). Étapes 4–6 dès que des données client réelles
sont saisies.
