# RLS Phase 2 — audit des accès tables métier

> Statut :
> - **Audit d'accès** : terminé.
> - **Préparation Phase 2 appliquée 2026-05-26** : triggers
>   `created_by` (migration
>   `20260603100000_prepare_rls_phase_2_created_by.sql`) + failfast
>   `SUPABASE_SERVICE_ROLE_KEY` côté `createSupabaseAdminClient`.
> - **Phase 2A appliquée 2026-05-26**
>   (`20260604100000_rls_hardening_phase_2a.sql`) : `training_modules`,
>   `module_rules`, `session_date_options` — cf. §3.1.
> - **Phase 2B préparation code appliquée 2026-05-26** : routes API
>   internes `/api/diagnostics/*` créées, `diagnostic-service.ts`
>   refactorisé — cf. §3.2.
> - **Phase 2B migration RLS appliquée 2026-05-26**
>   (`20260605100000_rls_hardening_phase_2b.sql`) — cf. §3.2.
> - **Phase 2C appliquée 2026-05-26**
>   (`20260606100000_rls_hardening_phase_2c.sql`) — cf. §3.3.
> - **Phase 2D appliquée 2026-05-26**
>   (`20260607100000_rls_hardening_phase_2d.sql`) — cf. §3.4.
> - **Phase 2E appliquée 2026-05-26**
>   (`20260608100000_rls_hardening_phase_2e.sql`) — cf. §3.5.
> - **Phase 2 complète.**
>
> Périmètre : 12 tables métier listées dans la roadmap. Phase 1
> (`profiles`, `public_access_tokens`, `activity_logs`,
> `ai_generation_logs`) est déjà durcie — cf.
> [rls-hardening-plan.md](rls-hardening-plan.md).

---

## 0. Lecture rapide — 3 modes d'accès Supabase utilisés

| Client | Source clé | RLS appliquée ? | Rôle vu par Postgres |
|---|---|---|---|
| `createSupabaseAdminClient()` | `SUPABASE_SERVICE_ROLE_KEY` (server-only) | **bypass** | service_role |
| `createSupabaseRouteHandlerClient()` | cookies SSR + `ANON_KEY` | **oui** | authenticated (JWT user) |
| `createSupabaseServerClient()` | `ANON_KEY` stateless (server) | **oui** | anon |
| `createSupabaseBrowserClient()` | cookies + `ANON_KEY` côté navigateur | **oui** | authenticated (JWT user) si logué, sinon anon |

Implications directes pour Phase 2 :
- Les modules `createSupabaseAdminClient()` continueront à fonctionner
  quoi qu'on fasse côté policy → **0 risque** sur ces chemins.
- Les modules `createSupabaseBrowserClient()` deviendront soumis à RLS
  par rôle réel → **risque élevé** si la nouvelle policy ne couvre pas
  le pattern d'accès.
- `createSupabaseServerClient()` n'est utilisé qu'en *fallback* (`??`
  derrière l'admin client). Il s'exécute en `anon` ; en Phase 2 il
  faudra **soit le retirer**, soit accepter qu'il ne fonctionne que
  pour les tables avec une policy `to anon` (aucune prévue).

---

## 1. Cartographie par table

Notation :
- **A** = `createSupabaseAdminClient()` (service_role, bypass RLS)
- **B** = `createSupabaseBrowserClient()` (browser, authenticated)
- **S** = `createSupabaseServerClient()` (server anon, fallback)
- **R/W** = read / write
- *Rôle attendu* = celui qui devra avoir accès une fois RLS durcie

### 1.1 `clients`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/diagnostics/diagnostic-service.ts:281,293,513` | **B** | R+W | commercial créateur OR admin |
| `src/lib/sessions/session-service.ts:187` | **B** | R | commercial créateur OR admin |
| `src/lib/cockpit/cockpit-service.ts:158` | A | R | (bypass — admin internal) |
| `src/app/api/analyze-training-need/route.ts:127` | A (fallback S) | R | (bypass — déjà gated par `requireApiRole`) |
| `src/app/api/generate-training-proposal/route.ts:173` | A (fallback S) | R | (bypass) |
| `src/app/api/generate-training-support/route.ts:174` | A (fallback S) | R | (bypass) |
| `src/app/api/design-training-support/route.ts:101` | A (fallback S) | R | (bypass) |
| `src/lib/public-access/public-token-service.ts:211` | A | R | (bypass — chemin public) |
| `src/app/public/session/[token]/page.tsx:314` | A | R | (bypass — chemin public dirigeant) |

**Risque Phase 2 sur `clients`** : élevé. Le service navigateur
(`diagnostic-service.ts`, `session-service.ts`) lit/écrit en direct
via `B`. Toute policy `created_by = auth.uid()` qui ne permettrait
pas la lecture d'un client par un trainer assigné casserait des
parcours.

Localstorage fallback : `diagnostic-service.ts` bascule sur
localStorage si Supabase est absent — désactivable via
`DISABLE_LOCAL_FALLBACK=true` (cf. rls-hardening-plan §4.2).

### 1.2 `diagnostics`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/diagnostics/diagnostic-service.ts:342,406,453,506,520,574` | **B** | R+W (INSERT + UPDATE status) | commercial créateur OR admin |
| `src/lib/cockpit/cockpit-service.ts:154` | A | R | (bypass) |
| `src/app/api/analyze-training-need/route.ts:120,240` | A (fallback S) | R + UPDATE `status` | (bypass) |
| `src/app/api/generate-training-proposal/route.ts:166` | A (fallback S) | R | (bypass) |
| `src/app/api/generate-training-support/route.ts:180` | A (fallback S) | R | (bypass) |
| `src/app/public/trainer/[token]/page.tsx:76` | A | R | (bypass — token formateur) |

**Risque** : élevé. Le browser client INSERT (createDiagnostic) et
UPDATE status. Si la policy INSERT n'inclut pas le rôle interne,
toute création depuis le navigateur casse.

### 1.3 `diagnostic_answers`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/diagnostics/diagnostic-service.ts:406,520` | **B** | R+W (INSERT par question) | commercial créateur du diagnostic OR admin |
| `src/app/api/analyze-training-need/route.ts:133` | A (fallback S) | R | (bypass) |

**Risque** : élevé. Chaque réponse au questionnaire diagnostic est
écrite en direct depuis le navigateur. Les policies cibles devront
joindre via `diagnostic_id → diagnostics.created_by`.

### 1.4 `transcripts`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| (aucun) | — | — | — |

**Risque** : nul. Pas d'accès actif. La table existe en migration
MVP1 mais aucun code ne l'écrit / lit aujourd'hui. **Action Phase 2**
: durcir au moins en `internal` (pas de fragilité fonctionnelle), ou
laisser tel quel jusqu'à activation de la feature transcript.

### 1.5 `recommendations`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/recommendations/recommendation-service.ts:189` | **B** | R (par diagnostic_id) | commercial créateur OR admin |
| `src/lib/cockpit/cockpit-service.ts:160` | A | R | (bypass) |
| `src/app/api/analyze-training-need/route.ts:197` | A | INSERT | (bypass) |
| `src/app/api/generate-training-proposal/route.ts:179,188` | A (fallback S) | R | (bypass) |
| `src/app/api/generate-training-support/route.ts:286,301` | A (fallback S) | R | (bypass) |
| `src/app/public/session/[token]/page.tsx:339,350` | A | R | (bypass — dirigeant via token) |
| `src/app/public/trainer/[token]/page.tsx:91` | A | R | (bypass — formateur via token) |

**Risque** : moyen. INSERT/UPDATE sont uniquement côté API (admin
client). Seule la lecture browser-side existe — policy SELECT par
`diagnostic_id → diagnostics.created_by` suffira.

### 1.6 `recommendation_modules`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/app/api/analyze-training-need/route.ts:233` | A | INSERT | (bypass) |
| `src/app/public/session/[token]/page.tsx:370` | A | R | (bypass) |

**Risque** : faible. **Aucun accès browser-direct**. Tout passe par
admin client. Policy SELECT/INSERT `internal` suffira.

### 1.7 `training_sessions`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/sessions/session-service.ts:224,288,329,377,431,459` | **B** | R+W (INSERT + UPDATE status, dates, notes) | commercial créateur OR trainer via token OR admin |
| `src/lib/cockpit/cockpit-service.ts:147` | A | R | (bypass) |
| `src/lib/public-access/public-token-service.ts:201` | A | R | (bypass) |
| `src/app/api/design-training-support/route.ts:93` | A (fallback S) | R | (bypass) |
| `src/app/api/generate-training-support/route.ts:165` | A (fallback S) | R | (bypass) |
| `src/app/public/session/[token]/page.tsx:300` | A | R | (bypass — dirigeant) |
| `src/app/public/trainer/[token]/page.tsx:67` | A | R | (bypass — formateur) |

**Risque** : élevé. `session-service.ts` est l'endroit le plus
exposé du browser-side. INSERT, UPDATE status (`created` →
`dates_to_position` → `delivered`), update notes, etc.

### 1.8 `session_participants`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/sessions/session-service.ts:624,704` | **B** | R+W (liste / suppression) | commercial créateur OR trainer assigné OR admin |
| `src/lib/documents/document-service.ts:75` | A | R | (bypass) |
| `src/lib/cockpit/cockpit-service.ts:162` | A | R | (bypass) |
| `src/app/api/public/submit-participant/route.ts:103` | A | UPSERT | (bypass — chemin public anon) |
| `src/app/api/public/upload-document/route.ts:125` | A | R | (bypass) |
| `src/app/api/generate-training-support/route.ts:186` | A (fallback S) | R | (bypass) |
| `src/app/public/trainer/[token]/page.tsx:116` | A | R | (bypass) |

**Risque** : moyen. Le browser-side lit la liste des participants
d'une session côté écran formation. L'écriture publique (formulaire
collaborateur) passe TOUJOURS par la route serveur en service_role.

### 1.9 `session_documents`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/documents/document-service.ts:56` | A | R+W | (bypass) |
| `src/app/api/public/upload-document/route.ts:158` | A | INSERT | (bypass — chemin public anon) |

**Risque** : nul côté browser. Toute opération passe par service_role
(le bucket Storage est privé, les inserts SQL aussi). **Sensible** :
documents CNI / RIB / production N-1 — la policy devra interdire toute
lecture hors rôle interne.

### 1.10 `training_supports`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/training-support/training-support-service.ts:194,256,302` | **B** | R+W (upsert par session) | commercial créateur OR trainer OR admin |
| `src/lib/cockpit/cockpit-service.ts:172` | A | R | (bypass) |
| `src/lib/public-access/public-token-service.ts:230` | A | R | (bypass) |
| `src/app/api/design-training-support/route.ts:79` | A (fallback S) | R | (bypass) |
| `src/app/public/session/[token]/page.tsx:402` | A | R | (bypass — dirigeant via token) |
| `src/app/public/trainer/[token]/page.tsx:104` | A | R | (bypass — formateur via token) |

**Risque** : élevé côté browser-side. Le support est écrit via
upsert directement depuis le navigateur. Policy UPSERT cible :
`internal user` + ownership session.

### 1.11 `designed_training_supports`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/training-support/designed-support-service.ts:198,259,305` | **B** | R+W | commercial créateur OR trainer OR admin |
| `src/lib/cockpit/cockpit-service.ts:173` | A | R | (bypass) |
| `src/lib/public-access/public-token-service.ts:222` | A | R | (bypass) |
| `src/app/public/trainer/[token]/page.tsx:110` | A | R | (bypass) |

**Risque** : identique à `training_supports`.

### 1.12 `session_date_options`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/sessions/session-date-options-service.ts:102,131,159,189,207,215` | **B** | R+W | internal (création / cancel) ; client_viewer (sélection — mais passe par route publique) |
| `src/lib/sessions/session-date-options-server.ts:84,98,106,135` | A | R+W | (bypass — utilisé par routes publiques + internes) |
| `src/lib/cockpit/cockpit-service.ts:168` | A | R | (bypass) |
| `src/app/api/sessions/[id]/date-options/route.ts:75,135` | A | R+W | (bypass — route internal gated par `requireApiRole`) |
| `src/app/api/sessions/[id]/date-options/[optionId]/route.ts:46` | A | UPDATE | (bypass) |

**Risque** : moyen. Browser-side fait des reads (liste) et probablement
des writes (création option). Le chemin public dirigeant passe par
`server.ts` en admin → bypass. La sélection publique passe via
`/api/public/select-date-option` (admin) → bypass.

### 1.13 `diagnostic_participants` (hors scope explicite mais lié)

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/diagnostics/diagnostic-participants-service.ts:91,116,131` | A | R+W | (bypass) |
| `src/lib/cockpit/cockpit-service.ts:164` | A | R | (bypass) |

**Risque** : nul côté browser. Tout passe par service_role.
**Note** : à traiter avec 2B (rattachement diagnostic).

### 1.14 `training_modules` / `module_rules`

| Endroit | Client | R/W | Rôle attendu |
|---|---|---|---|
| `src/lib/modules/get-training-modules.ts:63` | A (fallback S) | R | (bypass) |
| `src/lib/cockpit/cockpit-service.ts:175` | A | R count | (bypass) |
| `src/app/public/session/[token]/page.tsx:380` | A | R | (bypass — dirigeant) |

**Risque** : nul. Aucun accès `B` détecté. Le catalogue est lu en
admin partout. `module_rules` n'est pas accédé en runtime (lu
uniquement par les heuristiques côté code statique).

---

## 2. Risques transverses identifiés

### 2.1 Lectures browser-direct qui casseront si RLS durcie

Liste exhaustive des services `B` qui devront matcher exactement la
policy cible (et donc être testés rigoureusement) :

- `diagnostic-service.ts` — `clients`, `diagnostics`,
  `diagnostic_answers`
- `session-service.ts` — `clients`, `training_sessions`,
  `session_participants`
- `recommendation-service.ts` — `recommendations`
- `training-support-service.ts` — `training_supports`
- `designed-support-service.ts` — `designed_training_supports`
- `session-date-options-service.ts` — `session_date_options`

Tous ces services ont déjà un *fallback localStorage* qui
*masque* les échecs RLS — un read refusé tombe sur le fallback sans
erreur visible. **Conséquence** : il sera très facile d'avoir une
régression silencieuse en pilote. Mitigation : passer
`DISABLE_LOCAL_FALLBACK=true` en pré-prod pour transformer les
échecs RLS en erreurs explicites.

### 2.2 Écritures browser-direct

Les opérations INSERT/UPDATE depuis le browser exposent au plus haut
risque (pas de fallback équivalent côté écriture — tombe juste sur
localStorage non-Supabase) :

- `createDiagnostic` → `diagnostics`
- `saveDiagnosticAnswer` → `diagnostic_answers`
- `updateDiagnosticStatus` → `diagnostics`
- `createClient` → `clients`
- `createTrainingSession` + `update*` (status / notes / dates) →
  `training_sessions`
- `upsertTrainingSupport` → `training_supports`
- `upsertDesignedSupport` → `designed_training_supports`
- `createDateOption` / `updateDateOption` / `cancelDateOption` →
  `session_date_options`

Toutes ces opérations doivent avoir une policy `WITH CHECK` qui
accepte : `current_user_role IN ('admin','commercial','trainer')` ET
ownership cohérente (`created_by = auth.uid()` ou jointure session).

### 2.3 Routes publiques qui DOIVENT rester service_role only

Aucune policy `anon` ne doit être ajoutée à ces tables. Tout accès
public passe par une route serveur qui :
1. valide un token public (`public-token-service.validatePublicToken`)
2. utilise ensuite `createSupabaseAdminClient()` pour
   lire/écrire les tables métier

Routes concernées :
- `/api/public/submit-participant` → écrit `session_participants`
- `/api/public/upload-document` → écrit `session_documents`,
  `storage.session-documents`
- `/api/public/select-date-option` → met à jour `session_date_options`
- `/api/public/validate-token` → lit `public_access_tokens` (déjà
  durcie Phase 1) + `training_sessions`
- Pages SSR `/public/session/[token]` et `/public/trainer/[token]` →
  toutes les lectures via admin client

**Garde-fou contractuel** : un `grep` qui ne trouve aucune policy
`to anon` sur ces tables doit faire partie de la checklist de chaque
migration Phase 2.

### 2.4 Pages dirigeant / collaborateur / formateur

Aucune dépendance RLS anon. Elles ne s'exécutent jamais en contexte
`anon` directement : tout est server-rendered avec admin client.
**Pas de risque Phase 2** sur ces pages — sauf si quelqu'un introduit
un nouveau composant client qui ferait un fetch direct avec
`createSupabaseBrowserClient()` (à interdire).

### 2.5 Documents sensibles

`session_documents` contient les chemins Storage des CNI, RIB,
production N-1, etc. Le bucket Storage est privé (signé via
service_role). La table SQL ne contient pas le contenu mais
référence le `storage_path`. **Policy cible obligatoire** : SELECT
`internal` uniquement ; aucun rôle externe via RLS.

L'accès aux *fichiers* dans Storage est géré par les policies du
bucket lui-même (hors scope de cet audit — à auditer dans une note
dédiée).

### 2.6 Supports — accès formateur

Le formateur n'est pas un user `trainer` connecté à l'app dans la
plupart des pilotes : il accède via un *token signé*
(`trainer_session_view`) → toute lecture passe par admin client →
RLS bypass. Donc pas de policy `trainer` nécessaire sur
`training_supports` / `designed_training_supports` pour ce parcours.

Si un trainer interne se connecte (rôle `trainer` dans `profiles`),
il rentre dans `is_internal_user()` → policy `internal` couvre.

---

## 3. Phasage proposé

### Phase 2A — faible risque (tables référentielles + dates) — ✅ APPLIQUÉE 2026-05-26

Migration : `20260604100000_rls_hardening_phase_2a.sql`.

| Tables | Policy SELECT | Policy INSERT | Policy UPDATE | Policy DELETE |
|---|---|---|---|---|
| `training_modules` | `is_internal_user()` | `is_admin()` | `is_admin()` | `is_admin()` |
| `module_rules` | `is_internal_user()` | `is_admin()` | `is_admin()` | `is_admin()` |
| `session_date_options` | `is_internal_user()` | `is_internal_user()` | `is_internal_user()` | `is_admin()` |

**Vérifications code effectuées avant migration** :
- Aucune écriture browser sur `training_modules` / `module_rules`
  (grep `from("training_modules")` ⇒ uniquement admin client +
  fallback local catalog dans `get-training-modules.ts`).
- `session_date_options` browser-side : `createDateOption` /
  `listDateOptions` / `cancelDateOption` / `selectDateOption` via
  `createSupabaseBrowserClient` → couverts par `is_internal_user()`.
- `/api/sessions/:id/date-options[/:optionId]` → admin client →
  bypass RLS.
- `/api/public/select-date-option` + page `/public/session/[token]`
  → admin client → bypass RLS.
- `/settings/modules` lit via `getTrainingModules()` qui utilise
  admin client + fallback catalogue local sur erreur → admin OK,
  jamais bloqué en preprod/prod.
- Cockpit lit `session_date_options` et `training_modules` (count)
  via admin client → bypass.

**Tests smoke à dérouler après push** :

1. admin connecté → `/settings/modules` affiche la liste catalogue
   (source `supabase`, pas `local`).
2. admin connecté → cockpit charge (KPI, pipeline, Usage IA,
   Activité récente).
3. commercial connecté → page session, création créneau OK.
4. commercial connecté → annulation créneau (UPDATE
   status='cancelled') OK.
5. lien dirigeant `/public/session/<token>` → liste des créneaux
   visible, sélection passe.
6. lien formateur `/public/trainer/<token>` → OK.
7. non connecté sur la page interne → redirigé.
8. user `client_viewer` (rare en interne) : ne voit ni catalogue,
   ni créneaux côté browser direct (vérif via requête Postgres
   directe).
9. `grep "to anon"` sur les migrations → 0 occurrence.

**Rollback** : drop des nouvelles policies + recréer les
`authenticated (true)` originales. Migration de rollback prête sur
demande, pas committée par défaut.

### Phase 2B — dossiers commerciaux

#### Phase 2B préparation code — ✅ APPLIQUÉE 2026-05-26

Migration RLS pas encore créée. Le code a été refactorisé pour ne
plus dépendre de `createSupabaseBrowserClient` sur les tables qui
seront durcies en 2B.

**Routes API internes créées** (toutes `requireApiRole(INTERNAL_APP_ROLES)`,
écriture via `createSupabaseAdminClient()` avec `created_by` explicite) :

| Route | Méthode | Rôle |
|---|---|---|
| `/api/diagnostics/create-client` | POST | Crée une fiche client |
| `/api/diagnostics/create` | POST | Crée un diagnostic |
| `/api/diagnostics/[id]/answers` | POST | Enregistre une réponse |
| `/api/diagnostics/[id]/status` | PATCH | Met à jour le statut |
| `/api/diagnostics/[id]/summary` | GET | Diagnostic + client + réponses + stats |
| `/api/diagnostics` | GET | Liste paginée (100 par défaut, max 500) |
| `/api/diagnostics/[id]/participants` | GET/PUT | (existant) participants prévisionnels |

**Côté `src/lib/diagnostics/diagnostic-service.ts`** :

- Ne fait plus AUCUN appel direct à `createSupabaseBrowserClient`.
- Toutes les opérations passent par `fetch("/api/diagnostics/...")`
  avec `credentials: "same-origin"`.
- En cas d'échec API :
  - si `isLocalFallbackAllowed()` (mode dev / démo) → fallback
    localStorage avec `mode: "local"` ;
  - sinon (preprod/prod) → renvoie `{ data: null, mode: "unavailable",
    error: <message API> }`. L'UI doit afficher l'erreur et
    NE PAS continuer le flow.
- Nouveau mode `"unavailable"` ajouté à `ServiceMode`.
- `isLocalFallbackAllowed()` étendu pour reconnaître `APP_ENV` /
  `NEXT_PUBLIC_APP_ENV` (`local` → toléré, `preprod`/`production`
  → interdit).

**UI mise à jour** :

- `new-diagnostic-flow.tsx` : early-return avec message d'erreur si
  `clientResult.data` ou `diagnosticResult.data` est null.
- `diagnostics-list.tsx` : `setItems(result.data ?? [])` pour gérer
  le cas unavailable.
- `proposal-view.tsx`, services `recommendation` / `training-support` /
  `designed-support` : déjà compatibles (data nullable géré).

**Politique de données conservée** :

- `created_by` posé serveur-side sur INSERT (cf. routes + triggers
  Phase 2 préparation).
- Aucune écriture browser-direct sur `clients` / `diagnostics` /
  `diagnostic_answers`.
- Activité `diagnostic_created` / `diagnostic_completed` logguée
  côté serveur (route /create, route /status) ; un second log
  côté client est conservé pour compatibilité dashboards en cours
  de migration (idempotence garantie côté service activity-log).

#### Phase 2B migration RLS — ✅ APPLIQUÉE 2026-05-26

Migration : `20260605100000_rls_hardening_phase_2b.sql`.

Nouveaux helpers SQL (SECURITY DEFINER, `search_path = public, pg_temp`,
EXECUTE accordé à `authenticated`) :

- `public.can_access_diagnostic(p_diagnostic_id uuid)` — true si admin
  OU si `diagnostics.created_by = auth.uid()`.
- `public.can_access_client(p_client_id uuid)` — true si admin
  OU si `clients.created_by = auth.uid()`. (Pas utilisé directement par
  les policies 2B, exposé pour la phase 2D/2E à venir.)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `clients` | owner OR admin | internal + (`created_by = auth.uid()` OR admin) | owner OR admin (USING + WITH CHECK) | admin |
| `diagnostics` | owner OR admin | internal + (`created_by = auth.uid()` OR admin) | owner OR admin (USING + WITH CHECK) | admin |
| `diagnostic_answers` | `can_access_diagnostic(diagnostic_id)` | idem | idem (USING + WITH CHECK) | admin |
| `transcripts` | `can_access_diagnostic` OR `created_by = auth.uid()` | `can_access_diagnostic` | `can_access_diagnostic` OR `created_by` (USING + WITH CHECK) | admin |
| `diagnostic_participants` | `can_access_diagnostic` | `can_access_diagnostic` | `can_access_diagnostic` (USING + WITH CHECK) | `can_access_diagnostic` (admin + owner — pas de `created_by` sur cette table) |

**Risques résiduels** :

- Les routes serveur utilisent `service_role` → RLS bypass. La
  policy sert de double garde-fou côté requêtes JWT user direct
  (qui n'arriveront plus depuis le code refactorisé).
- Si un nouvel écran browser direct est introduit dans le futur,
  il faudra le faire passer par l'API ou ajouter sa propre policy.

**Tests smoke à dérouler après migration RLS** :

1. Commercial A : création client → OK, `created_by` rempli en DB.
2. Commercial A : création diagnostic + 5 réponses → OK.
3. Commercial A : passage statut `to_review` puis `ai_analyzed` → OK.
4. Commercial A : `listDiagnostics()` retourne ses dossiers via
   `/api/diagnostics`.
5. Commercial B (autre user) : `listDiagnostics()` ne retourne
   AUCUN dossier de A → confirmé par requête Postgres directe
   sur `diagnostics where created_by = <userA>`.
6. Admin : `listDiagnostics()` retourne tout.
7. `client_viewer` / `participant` : `listDiagnostics()` retourne
   vide via le browser direct (gardé par les policies).
8. Routes IA (`/api/analyze-training-need`, etc.) : OK — elles
   utilisent `service_role` → bypass.
9. Routes publiques tokenisées : OK (idem).
10. Cockpit interne : OK (admin client).
11. `grep "to anon"` sur les migrations → 0 occurrence.

**Rollback** : drop des nouvelles policies + restore
`authenticated (true)`. Triggers `created_by` restent (idempotents).

### Phase 2C — recommandations / propositions / sessions — ✅ APPLIQUÉE 2026-05-26

Migration : `20260606100000_rls_hardening_phase_2c.sql`.

Nouveaux helpers SQL (SECURITY DEFINER, `search_path = public, pg_temp`,
EXECUTE accordé à `authenticated`) :

- `public.can_access_recommendation(p_id uuid)` — admin OR
  `recommendations.created_by = auth.uid()` OR
  `can_access_diagnostic(recommendations.diagnostic_id)`.
- `public.can_access_session(p_id uuid)` — admin OR
  `training_sessions.created_by = auth.uid()` OR
  `can_access_diagnostic(s.diagnostic_id)` OR
  `can_access_client(s.client_id)`. (Exposé pour Phase 2D/2E.)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `recommendations` | owner OR admin OR `can_access_diagnostic(diagnostic_id)` | internal + (owner OR admin OR `can_access_diagnostic`) | owner OR admin | admin |
| `recommendation_modules` | `can_access_recommendation(recommendation_id)` | idem | idem | admin |
| `training_sessions` | owner OR admin OR `can_access_diagnostic(diagnostic_id)` OR `can_access_client(client_id)` | internal + (owner OR admin) | owner OR admin | admin |

**Vérifications code effectuées avant migration** :

- `recommendation-service.ts:189` (browser SELECT recommendations
  par `diagnostic_id`) : couvert par `can_access_diagnostic`.
- `session-service.ts` browser INSERT/UPDATE/SELECT/list :
  - INSERT → trigger `set_created_by_if_null` défaut
    `created_by = auth.uid()` → satisfait `is_internal_user()
    + (created_by self OR admin)`.
  - SELECT/list → policy `owner OR admin OR
    can_access_diagnostic OR can_access_client` couvre les sessions
    créées par d'autres (admin) sur des diagnostics du commercial.
  - UPDATE → owner OR admin (strict).
- Routes IA (`/api/analyze-training-need` INSERT recommendations +
  recommendation_modules) : admin client → bypass RLS.
- Route `/api/generate-training-proposal` / `/api/generate-training-support`
  / `/api/design-training-support` lectures : admin client → bypass.
- Cockpit (`cockpit-service.ts`) : admin client → bypass.
- Pages publiques (`/public/session/[token]`, `/public/trainer/[token]`)
  : admin client → bypass.

**Particularité `recommendations.created_by`** : les recommandations
sont insérées par les routes IA en admin client (service_role) →
`auth.uid()` est NULL → trigger ne pose pas `created_by`. La lecture
commerciale passe donc systématiquement par
`can_access_diagnostic(diagnostic_id)`. Acceptable car la
recommandation appartient logiquement au commercial propriétaire
du diagnostic.

**Tests smoke à dérouler après push** :

1. Admin : génération recommandation (analyze) → OK ;
   proposition / support / design → OK ; création session → OK ;
   liste / détail session → OK ; cockpit → OK.
2. Commercial A :
   - Crée diagnostic → recommandation IA générée → la voit dans
     `/diagnostics/<id>/recommendation`.
   - Crée session depuis sa recommandation → visible dans
     `/sessions`.
   - `listTrainingSessions()` retourne ses sessions uniquement.
   - Update status / dates session → OK sur ses propres sessions,
     refusé sur sessions d'un autre commercial.
3. Commercial B (autre user) :
   - `getRecommendationByDiagnosticId(<diag de A>)` retourne NULL.
   - `listTrainingSessions()` ne retourne aucune session de A.
   - Vérifiable par requête Postgres directe (cookie B, anon key).
4. Trainer interne :
   - Pas d'accès direct aux sessions d'autres commerciaux (pas de
     `assigned_trainer_id` SQL). Accès via token formateur signé
     → admin client → bypass.
5. Routes publiques tokenisées : OK (admin client).
6. Routes IA : OK (admin client).
7. Liens dirigeant / formateur : OK (admin client).
8. `grep "to anon" supabase/migrations/` → 0 occurrence.

**Rollback** : drop des nouvelles policies + recréer les
`authenticated using (true)` originales. Helpers `can_access_*`
peuvent rester (idempotents, utiles pour Phase 2D/2E).

### Phase 2D — collecte / documents — ✅ APPLIQUÉE 2026-05-26

Migration : `20260607100000_rls_hardening_phase_2d.sql`.

**Nouveaux helpers SQL « explicit user »** (SECURITY DEFINER,
`search_path = public, pg_temp`, EXECUTE accordé à `authenticated`) :

- `public.get_role_for_user(p_user_id uuid)` — rôle d'un user
  arbitraire.
- `public.is_admin_for_user(p_user_id uuid)` — admin check
  explicite.
- `public.is_internal_user_for_user(p_user_id uuid)` — rôles
  internes explicites.
- `public.can_user_access_session(p_user_id uuid, p_session_id uuid)`
  — admin OR session créateur OR diagnostic créateur OR client
  créateur.

Ces helpers prennent `p_user_id` explicitement, là où les helpers
`auth.uid()`-based deviennent NULL en contexte service_role. Cas
d'usage : §3.4.1 ci-dessous.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `session_participants` | `can_access_session(session_id)` | `is_internal_user() + can_access_session` | `is_internal_user() + can_access_session` | admin |
| `session_documents` | `can_access_session(session_id)` | `is_internal_user() + can_access_session` | `is_internal_user() + can_access_session` | admin |

**Vérifications code effectuées avant migration** :

- `saveParticipant` browser-side (`collect-view.tsx` interne pour
  saisie manuelle commercial) → INSERT couvert par `is_internal_user
  + can_access_session`.
- `listParticipantsBySession` browser-side (`session-detail-view.tsx`)
  → SELECT couvert par `can_access_session`.
- `/api/public/submit-participant` (anon) → admin client → bypass RLS.
- `/api/public/upload-document` (anon) → admin client → bypass RLS.
- `/api/sessions/[id]/documents` (auth internal) → admin client →
  bypass RLS, génère signed URLs (durée 60 s, `storage_path` jamais
  exposé au client).
- `document-service.ts` (server-only) → admin client → bypass.

**Risques résiduels** :

- Storage : aucune policy bucket modifiée ici. Le bucket
  `session-documents` reste privé (vérifier dans
  `supabase/migrations/*` si pertinent — hors scope de cette
  migration RLS table).
- Suppression de document : reste un acte admin uniquement (DELETE
  policy `is_admin()`). Une suppression vide la ligne SQL ; le blob
  Storage n'est pas automatiquement nettoyé — à orchestrer côté
  route admin si on l'expose un jour (hors scope MVP).

**Tests smoke à dérouler après push** :

1. Admin : `/sessions/[id]` charge la liste des participants et
   documents, génère signed URLs → OK.
2. Commercial A :
   - Ses participants visibles dans la fiche session.
   - Documents visibles via `/api/sessions/[id]/documents` (signed
     URL 60 s) sur ses propres sessions.
   - Saisie manuelle d'un participant via collect-view interne → OK.
3. Commercial B (autre user) :
   - `listParticipantsBySession(<sessionA>)` retourne rien (RLS).
   - GET `/api/sessions/<sessionA>/documents` retourne **HTTP 403
     `{ ok: false, code: "forbidden", error: "Accès session
     refusé." }`** — la route vérifie désormais explicitement
     l'ownership via `can_user_access_session(profile.id,
     sessionId)` AVANT toute lecture admin client (cf. §3.4.1).
4. Public : soumission participant + upload document via token →
   OK (admin client bypass).
5. Sécurité :
   - Bucket Storage `session-documents` reste privé.
   - Signed URLs : 60 s.
   - `storage_path` non exposé côté client (vérifié dans la route).
   - `grep "to anon" supabase/migrations/` → 0 occurrence.

**Rollback** : drop policies + restore `authenticated (true)`. Le
helper `can_access_session` peut rester (idempotent, utile pour
Phase 2E).

#### 3.4.1 Correctif route `/api/sessions/[id]/documents` — ownership explicite

Identifié AVANT push de Phase 2D : la route interne
`/api/sessions/[id]/documents` utilise `createSupabaseAdminClient()`
pour générer les signed URLs des documents. Comme service_role
bypasse RLS, **un commercial qui connaîtrait l'UUID d'une session
d'un collègue pouvait lister ses documents** via cette route. Risque
limité (UUID non prédictible, pas de listing global) mais réel sur
les pièces sensibles (CNI, RIB, production N-1).

**Correctif appliqué** :

1. Migration `20260607100000_rls_hardening_phase_2d.sql` enrichie
   avec les helpers `_for_user` (cf. ci-dessus).
2. Route `src/app/api/sessions/[id]/documents/route.ts` mise à jour :
   - Switch `getCurrentProfile() + hasRole(...)` → `requireApiRole(
     INTERNAL_APP_ROLES)` (pattern standard du projet).
   - AVANT toute lecture admin client :
     ```ts
     if (auth.profile.role !== "admin") {
       const { data: allowed } = await supabase.rpc(
         "can_user_access_session",
         { p_user_id: auth.profile.id, p_session_id: sessionId }
       );
       if (allowed !== true) return 403 forbidden;
     }
     ```
   - Admin → bypass direct, conserve la performance.
   - Signed URLs ne sont jamais générées si accès refusé.
3. `database.types.ts` enrichi avec la signature `Functions` pour
   les 4 nouveaux helpers `_for_user`.

**Tests smoke à dérouler après push** :

- Admin → `GET /api/sessions/<x>/documents` → 200 (liste + signed
  URLs).
- Commercial propriétaire de la session → 200.
- Commercial NON propriétaire → 403
  `{ ok: false, code: "forbidden" }`.
- Non connecté → 401 (via `requireApiRole`).
- Route publique `/api/public/upload-document` inchangée (continue
  via admin client + validation token public).

### Phase 2E — supports — ✅ APPLIQUÉE 2026-05-26

Migration : `20260608100000_rls_hardening_phase_2e.sql`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `training_supports` | `can_access_session(session_id)` | `is_internal_user() + can_access_session` | `is_internal_user() + can_access_session` | admin |
| `designed_training_supports` | `can_access_session(session_id)` | `is_internal_user() + can_access_session` | `is_internal_user() + can_access_session` | admin |

**Vérifications code effectuées avant migration** :

- `training-support-service.ts` browser-direct (upsert + update
  status + select par `session_id`) → couvert par
  `is_internal_user() + can_access_session`.
- `designed-support-service.ts` browser-direct (idem) → idem.
- Routes IA `/api/generate-training-support` et
  `/api/design-training-support` → utilisent admin client + désormais
  appellent `assertCanAccessSession(auth.profile, sessionId)` en
  amont (cf. §3.5.1). Bypass RLS conservé, mais ownership vérifiée
  côté handler.
- Pages publiques `/public/session/[token]` et
  `/public/trainer/[token]` → admin client → bypass RLS.
- `public-token-service.ts` → admin client → bypass.
- Cockpit → admin client → bypass.

**Tests smoke à dérouler après push** :

1. Admin :
   - Génère support brut (`/api/generate-training-support`) → OK.
   - Génère support designé (`/api/design-training-support`) → OK.
   - Valide / archive support (UPDATE status browser) → OK.
   - Export PDF (page print interne) → OK.
2. Commercial A (propriétaire) :
   - Lit / génère / modifie ses supports → OK.
3. Commercial B (autre) :
   - `getTrainingSupportBySession(<sessionA>)` retourne null (RLS).
   - POST `/api/generate-training-support { sessionId: <sessionA> }`
     → 403 `{ ok: false, code: "forbidden" }` (helper bloque
     avant LLM call).
   - POST `/api/design-training-support { sessionId: <sessionA> }`
     → 403 idem.
4. Public :
   - Page formateur tokenisée (`/public/trainer/<token>`) → OK
     (admin client bypass).
   - Page dirigeant (`/public/session/<token>`) → OK, contenu
     gated par `access_type` côté `public-token-service`.
   - Print public → OK.
5. Sécurité :
   - Aucune policy `to anon` créée.
   - Token / hash jamais exposé côté UI.
   - Supports non accessibles sans route protégée ou token signé.

#### 3.5.1 Helper partagé `assertCanAccessSession`

Création de `src/lib/auth/assert-session-access.ts` qui factorise
le pattern « admin bypass + `can_user_access_session` rpc + 403 si
refus ». Réutilisé dans :

- `/api/sessions/[id]/documents` (refactor du fix Phase 2D).
- `/api/generate-training-support` (nouveau, évite la consommation
  OpenRouter sur sessions non autorisées).
- `/api/design-training-support` (idem).

À utiliser pour toute nouvelle route serveur qui :
1. Utilise `createSupabaseAdminClient()` (bypass RLS).
2. Reçoit un `sessionId` (URL ou body).
3. Doit empêcher un internal user d'agir sur les sessions d'un
   collègue.

**Rollback** : drop des nouvelles policies + restore
`authenticated (true)`. Le helper code peut rester (idempotent).

---

## 4. Pré-requis transverses à dérouler AVANT Phase 2B

Sans ces préalables, les phases ownership-based vont produire des
résultats incohérents ou bloquer des opérations légitimes.

### 4.1 Triggers BEFORE INSERT pour `created_by` — ✅ APPLIQUÉ 2026-05-26

Migration : `20260603100000_prepare_rls_phase_2_created_by.sql`.

- Fonction unique `public.set_created_by_if_null()` (pas de
  SECURITY DEFINER — non privilégié).
- 10 triggers BEFORE INSERT sur : `clients`, `diagnostics`,
  `transcripts`, `recommendations`, `training_sessions`,
  `public_access_tokens`, `ai_generation_logs`, `training_supports`,
  `designed_training_supports`, `session_date_options`.
- `activity_logs` exclue (utilise `actor_id`).
- Comportement :
  - Browser auth → `created_by = auth.uid()` si non posé.
  - service_role → `auth.uid()` NULL → `created_by` conservé
    (NULL ou valeur explicite passée par la route).

### 4.2 Failfast `SUPABASE_SERVICE_ROLE_KEY` en preprod/prod — ✅ APPLIQUÉ 2026-05-26

Modifié dans `src/lib/supabase/server.ts` :
`createSupabaseAdminClient()` lève désormais
`Error("SUPABASE_SERVICE_ROLE_KEY manquante en environnement
non-local.")` quand `APP_ENV=preprod` ou `APP_ENV=production`
(fallback `NODE_ENV=production`).

- En `APP_ENV=local` (ou non défini sans `NODE_ENV=production`) :
  retour `null` toléré → fallbacks possibles.
- Services best-effort (`createActivityLog`, `logAiGeneration`)
  encapsulent le throw pour ne jamais faire échouer la génération
  ou l'écriture métier qui les déclenche.
- `.env.example` documente `APP_ENV`.

Le `??` `createSupabaseServerClient()` dans les routes IA n'a pas
été retiré : en preprod/prod, `createSupabaseAdminClient` throw
AVANT que `??` n'évalue le fallback → comportement souhaité (échec
explicite, pas de bascule silencieuse anon).

### 4.3 Désactivation du localStorage fallback en pré-prod

Sans `DISABLE_LOCAL_FALLBACK=true`, un read refusé par RLS retombe
silencieusement sur localStorage et masque les régressions. À forcer
en pré-prod et prod **avant** Phase 2B.

### 4.4 Vérification policies `anon` (audit grep)

Avant chaque migration 2x, vérifier :

```bash
grep -rn "to anon" supabase/migrations/
# Doit renvoyer 0 occurrence en dehors des helpers de test.
```

---

## 5. Synthèse risque par phase

| Phase | Tables | Browser writes ? | Browser reads ? | Risque rollback | Statut |
|---|---|---|---|---|---|
| **2A** | training_modules, module_rules, session_date_options | N (catalog), N (rules), O (date_options) | N, N, O | facile | ✅ appliquée 2026-05-26 |
| **2B** | clients, diagnostics, diagnostic_answers, transcripts, diagnostic_participants | OUI (massif, désormais via API) | OUI (désormais via API) | moyen (created_by — triggers OK) | ✅ appliquée 2026-05-26 |
| **2C** | recommendations, recommendation_modules, training_sessions | OUI (sessions, browser-direct conservé) | OUI | moyen | ✅ appliquée 2026-05-26 |
| **2D** | session_participants, session_documents | N (publiques via admin) ; OUI (collect-view interne) | OUI partiel | facile | ✅ appliquée 2026-05-26 |
| **2E** | training_supports, designed_training_supports | OUI (upsert browser, + IA routes en admin client avec garde côté handler) | OUI | moyen | ✅ appliquée 2026-05-26 |

---

## 6. Checklist de migration Phase 2 (à recopier dans chaque commit)

```text
Phase : 2X
Tables touchées : <liste>
Pré-requis :
  - [ ] Phase 2(X-1) appliquée et validée en pilote
  - [ ] Triggers BEFORE INSERT created_by présents si nécessaire
  - [ ] DISABLE_LOCAL_FALLBACK=true en pré-prod
Tests avant :
  - [ ] Snapshot des lignes existantes (count par table)
  - [ ] Smoke browser-side OK
  - [ ] Routes publiques OK
  - [ ] Cockpit OK
Tests après :
  - [ ] Smoke browser-side OK (avec localStorage désactivé)
  - [ ] Commercial A ne voit RIEN de B
  - [ ] Admin voit tout
  - [ ] client_viewer / participant ne voient RIEN côté browser direct
  - [ ] Routes publiques tokenisées continuent de fonctionner
  - [ ] Cockpit charge sans erreur
  - [ ] Aucune policy `to anon` créée
Rollback :
  - [ ] Migration de rollback préparée (drop policies + restore
    authenticated (true))
  - [ ] Décision documentée (qui, quand, quel pilote bloqué)
```

---

## 7. Hors scope — à auditer séparément

- **Storage policies** sur le bucket `session-documents` (privé,
  service_role uniquement aujourd'hui).
- **`coach_brain_patterns`** : table NXT Performance, downstream
  consumer only. Pas de RLS Start Academy à modifier.
- **Tables Coach Brain Start Academy** : aucune table métier locale
  Coach Brain n'est créée — pas de RLS à durcir.
- **`ai_generation_logs.prompt` / `response`** : colonnes jsonb
  désormais vides (cf. ai-monitoring-prd §3). Peuvent être droppées
  dans une migration de nettoyage post-Phase 2 si besoin.
