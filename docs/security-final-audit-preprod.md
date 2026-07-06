# Audit sécurité final — pré-production interne

> Périmètre : revue à plat après application complète des Phases 1
> + 2A → 2E du durcissement RLS, instrumentation IA, journal
> d'activité, failfast service_role, helpers explicit-user et garde
> `assertCanAccessSession`.
>
> Méthode : revue statique (grep + lecture ciblée) sans rejouer
> l'application en preprod. Tous les tests fonctionnels listés sont
> à exécuter par un opérateur après `supabase db push` + déploiement.

---

## 1. Tableau récapitulatif des vérifications

Légende : ✅ OK, ⚠️ point d'attention, ❌ bloquant.

### 1.1 Auth & rôles

| # | Vérification | Résultat | Source |
|---|---|---|---|
| 1.1 | `INTERNAL_APP_ROLES` = `["admin", "commercial", "trainer"]` | ✅ | `src/lib/auth/roles.ts` |
| 1.2 | `getCurrentProfile` lit cookie SSR, filtré `id = auth.uid()` | ✅ | `src/lib/auth/get-current-user.ts` |
| 1.3 | `requireApiRole` retourne 401/403 standardisés | ✅ | `src/lib/auth/require-api-role.ts` |
| 1.4 | Toutes les routes /api internes utilisent `requireApiRole` ou équivalent `getCurrentProfile + hasRole` | ✅ | grep |
| 1.5 | Phase 1 RLS sur `profiles` (self OR admin) appliquée | ✅ | migration 20260602 |
| 1.6 | `client_viewer` / `participant` n'ont aucun chemin produit qui les mène aux tables internes | ✅ | rôles + routes |

### 1.2 Routes IA — auth + ownership

| # | Vérification | Résultat |
|---|---|---|
| 1.2.1 | `/api/analyze-training-need` exige rôle interne (401 sinon) | ✅ |
| 1.2.2 | `/api/analyze-training-need` vérifie ownership `diagnosticId` AVANT appel OpenRouter | ✅ corrigé (I-1) |
| 1.2.3 | `/api/generate-training-proposal` exige rôle interne | ✅ |
| 1.2.4 | `/api/generate-training-proposal` vérifie ownership `diagnosticId` | ✅ corrigé (I-2) |
| 1.2.5 | `/api/generate-training-support` exige rôle interne + `assertCanAccessSession(sessionId)` | ✅ |
| 1.2.6 | `/api/design-training-support` exige rôle interne + `assertCanAccessSession(sessionId)` | ✅ |
| 1.2.7 | Crédits OpenRouter jamais consommés avant validation rôle | ✅ |
| 1.2.8 | Crédits OpenRouter jamais consommés avant validation ownership | ✅ (4 routes IA gated) |

### 1.3 Routes publiques tokenisées

| # | Vérification | Résultat | Source |
|---|---|---|---|
| 1.3.1 | `/api/public/submit-participant` valide token avant écriture | ✅ | route |
| 1.3.2 | `/api/public/upload-document` valide token avant écriture | ✅ | route |
| 1.3.3 | `/api/public/select-date-option` valide token avant update | ✅ | route |
| 1.3.4 | `/api/public/validate-token` ne renvoie ni `token_hash` ni champ sensible | ✅ | route |
| 1.3.5 | `public_access_tokens` : `token_hash` SHA-256 stocké, brut jamais persisté | ✅ | `public-token-service.ts` |
| 1.3.6 | Phase 1 RLS : aucune policy `to anon` sur `public_access_tokens` | ✅ | migration 20260602 |
| 1.3.7 | Token brut renvoyé une seule fois (route `create-access-link`), jamais relisible | ✅ | route |

### 1.4 Documents

| # | Vérification | Résultat | Source |
|---|---|---|---|
| 1.4.1 | Bucket `session-documents` privé (`public = false`) | ✅ | migration 20260526120100 |
| 1.4.2 | Aucune policy `storage.objects` ajoutée → service_role uniquement | ✅ | idem |
| 1.4.3 | Upload public via token (validation amont) → admin client | ✅ | route |
| 1.4.4 | `/api/sessions/[id]/documents` interne : `requireApiRole + assertCanAccessSession` | ✅ | route Phase 2D |
| 1.4.5 | Signed URLs : durée 60 s, jamais cachées côté client | ✅ | route |
| 1.4.6 | `storage_path` jamais renvoyé au client | ✅ | route |
| 1.4.7 | Validation MIME / taille AVANT validation token (économie network) puis token AVANT écriture | ✅ | route |
| 1.4.8 | DELETE bucket admin uniquement (policy SQL `is_admin()`) | ✅ | Phase 2D |

### 1.5 RLS — hygiène générale

| # | Vérification | Résultat |
|---|---|---|
| 1.5.1 | `grep "to anon"` dans les policies actives → 0 occurrence | ✅ |
| 1.5.2 | Policies permissives `authenticated using (true)` supprimées sur tables durcies | ✅ (drop dans chaque phase) |
| 1.5.3 | `service_role` utilisé uniquement côté serveur (jamais `NEXT_PUBLIC_`) | ✅ |
| 1.5.4 | Tous les helpers SECURITY DEFINER ont `set search_path = public, pg_temp` | ✅ |
| 1.5.5 | Helpers SECURITY DEFINER : EXECUTE accordé uniquement à `authenticated` | ✅ |
| 1.5.6 | `createSupabaseAdminClient()` failfast en preprod/prod (cf. `server.ts`) | ✅ |
| 1.5.7 | Triggers `created_by` actifs sur 10 tables (Phase 2 préparation) | ✅ |

### 1.6 Données sensibles

| # | Vérification | Résultat |
|---|---|---|
| 1.6.1 | Production N-1 individuelle non exposée à la page dirigeant — uniquement agrégats | ✅ (`public/session/[token]/page.tsx:447-477`) |
| 1.6.2 | CNI/RIB jamais exposés publiquement (bucket privé + signed URL courte) | ✅ |
| 1.6.3 | `ai_generation_logs.prompt` / `response` désormais `null` (cf. monitoring service) | ✅ (`ai-monitoring-service.ts:156-157`) |
| 1.6.4 | `activity_logs` ne contient ni `token` brut ni `token_hash` (politique service) | ✅ (policy doc + service) |
| 1.6.5 | Email exact d'un participant non remonté en metadata cross-commercial | ✅ (activity-log-service §politique) |

### 1.7 Fallback localStorage

| # | Vérification | Résultat |
|---|---|---|
| 1.7.1 | `isLocalFallbackAllowed()` retourne false en `APP_ENV=preprod / production` | ✅ |
| 1.7.2 | `diagnostic-service.ts` gate fallback par `isLocalFallbackAllowed()` | ✅ |
| 1.7.3 | Mode `unavailable` retourné en preprod si API down (data: null + error explicite) | ✅ |
| 1.7.4 | Aucun fallback silencieux pour les écritures critiques (clients/diagnostics/answers) | ✅ |
| 1.7.5 | Autres services (`session-service`, `recommendation-service`, `training-support-service`) utilisent encore `createSupabaseBrowserClient` → soumis à RLS via JWT user | ✅ |

### 1.8 Cockpit & instrumentation

| # | Vérification | Résultat |
|---|---|---|
| 1.8.1 | `getCockpitData()` utilise `createSupabaseAdminClient()` → bypass RLS | ✅ |
| 1.8.2 | Bloc « Activité récente » → `listRecentActivity` admin → bypass | ✅ |
| 1.8.3 | Bloc « Usage IA » → `getAiUsageSummary` admin → bypass | ✅ |
| 1.8.4 | Page cockpit gated par `requireRole(INTERNAL_APP_ROLES)` | ✅ |
| 1.8.5 | Failfast preprod/prod si `SUPABASE_SERVICE_ROLE_KEY` manquante → cockpit retourne 500 explicite (acceptable) | ✅ |

---

## 2. Anomalies bloquantes

**Aucune anomalie bloquante détectée.**

---

## 3. Anomalies importantes — ✅ TOUTES CORRIGÉES 2026-05-26

Migration : `20260609100000_access_helpers_diagnostic_for_user.sql`.

Nouveaux artefacts :

- **SQL** : `public.can_user_access_diagnostic(p_user_id uuid,
  p_diagnostic_id uuid)` — SECURITY DEFINER, EXECUTE accordé à
  `authenticated`. Logique : admin OR `diagnostics.created_by =
  p_user_id` OR `clients.created_by = p_user_id` (via diagnostic
  parent).
- **Types** : `database.types.ts` enrichi avec la signature
  `can_user_access_diagnostic` dans `Functions`.
- **Code helper** : `src/lib/auth/assert-diagnostic-access.ts`
  (`assertCanAccessDiagnostic(profile, diagnosticId)`) — pattern
  identique à `assertCanAccessSession` :
  - admin → bypass direct ;
  - autres rôles internes → RPC `can_user_access_diagnostic` ;
  - refus → 403 `{ ok: false, code: "forbidden", error: "Accès
    diagnostic refusé." }` ;
  - erreur RPC → 500 explicite ; admin client absent → 503.

### I-1. `/api/analyze-training-need` — ✅ corrigé

`assertCanAccessDiagnostic(auth.profile, parsed.data.diagnosticId)`
appelé immédiatement après validation du payload Zod, AVANT tout
chargement Supabase et AVANT tout appel OpenRouter. Refus → 403 sans
consommation IA.

### I-2. `/api/generate-training-proposal` — ✅ corrigé

`assertCanAccessDiagnostic(auth.profile, parsed.data.diagnosticId)`
posé au même endroit que I-1, AVANT `loadFromSupabase` et AVANT
l'appel LLM. Refus → 403 sans consommation IA.

(Note : `recommendationId` est optionnel dans le schéma actuel mais
le diagnostic est requis — on protège donc via le diagnosticId.
Si le schéma évolue pour accepter `recommendationId` seul, ajouter
le lookup via admin client + `assertCanAccessDiagnostic(p,
recommendation.diagnostic_id)`.)

### I-3. `/api/sessions/[id]/create-access-link` — ✅ corrigé

Route refactorisée :
- `getCurrentProfile + hasRole` → `requireApiRole(INTERNAL_APP_ROLES)`
  (pattern standard).
- `assertCanAccessSession(auth.profile, sessionId)` AVANT
  `generatePublicToken(...)`.
- Aucun token n'est généré si l'accès est refusé.
- Aucune ligne `public_access_tokens` n'est créée.
- Réponse standardisée `{ ok: false, code: "forbidden",
  error: "Accès session refusé." }`.

### I-4. `/api/sessions/[id]/date-options` (GET + POST) + `[optionId]` (DELETE) — ✅ corrigé

Les 2 routes refactorisées :
- Auth via `requireApiRole(INTERNAL_APP_ROLES)`.
- `assertCanAccessSession(auth.profile, sessionId)` AVANT toute
  opération.
- DELETE `[optionId]` : filtre `eq("session_id", sessionId)`
  conservé en ceinture de sécurité supplémentaire.

### I-5. `/api/sessions/[id]/activity` (GET) + `/api/activity/log` (POST) — ✅ corrigé

- `GET /api/sessions/[id]/activity` : `assertCanAccessSession`
  AVANT `listActivityLogsBySession`.
- `POST /api/activity/log` : si `sessionId` ou `diagnosticId`
  fournis dans le payload, on appelle respectivement
  `assertCanAccessSession` / `assertCanAccessDiagnostic` AVANT
  insert. Couvre `note_added` et tout autre `event_type` ciblant
  une ressource d'un collègue.

---

## 4. Risques acceptés (pour pré-prod interne)

| # | Risque | Justification |
|---|---|---|
| R-1 | Helper `assertCanAccessSession` requiert un round-trip Supabase à chaque appel non-admin | Acceptable : RPC SQL léger, indexé sur `id`. Optimisable plus tard via cache mémoire ou JWT claims enrichis. |
| R-2 | Fallback localStorage encore présent dans plusieurs services (sessions, recommendation, supports) | Acceptable en pré-prod interne : utile pour dev offline. À évaluer pour prod large. |
| R-3 | `recommendations.created_by` reste NULL pour les IA-générées (admin client) | Acceptable : l'accès se fait via `can_access_diagnostic(diagnostic_id)`. Documenté Phase 2C. |
| R-4 | Aucune policy `storage.objects` SQL — bucket privé par défaut + service_role | Acceptable. Audit dédié storage à prévoir si on ouvre le bucket à un rôle authentifié. |
| R-5 | `client_viewer` / `participant` n'ont aucun produit ; les policies ne les autorisent pas mais c'est aussi parce qu'aucune UI n'existe | Acceptable. Si un jour ces rôles sont activés, refaire un audit RLS dédié. |
| R-6 | Aucun rate limiting sur les routes IA (consommation OpenRouter) | Acceptable interne ; obligatoire avant exposition externe. |
| R-7 | Pas de `assigned_trainer_id` sur `training_sessions` — le trainer interne n'a pas d'accès direct par défaut, uniquement via token signé | Décision produit (cf. RLS audit §0). |

---

## 5. Recommandations avant production large

1. **Corriger I-1 à I-5** en créant un helper code symétrique
   `assertCanAccessDiagnostic(profile, diagnosticId)` + en ajoutant
   `assertCanAccessSession` aux 3 routes session-keyed restantes.
   Migration SQL associée si nécessaire (ajout
   `can_user_access_diagnostic(uuid, uuid)`).
2. **Smoke tests pilote** : dérouler le scénario §6 dans un projet
   Supabase pré-prod réel avec 2 comptes commerciaux distincts
   pour valider la ségrégation.
3. **Storage policies bucket** : auditer formellement
   `storage.objects` (aujourd'hui aucune policy → seul service_role
   peut lire, ce qui correspond à l'intention mais mérite un test
   explicite).
4. **APP_ENV=preprod** : vérifier en environnement de staging que
   `createSupabaseAdminClient()` lève bien si la clé est manquante
   ; vérifier que `isLocalFallbackAllowed()` retourne false ;
   vérifier que le mode `unavailable` est correctement géré par
   l'UI new-diagnostic-flow.
5. **Rate limiting OpenRouter** : capper le nombre de générations
   par user / minute. Hors scope MVP, **obligatoire** avant prod
   externe.
6. **Audit Coach Brain / NXT Performance read-only path** : la
   downstream consumer ne lit aujourd'hui rien ; sécuriser le pont
   quand il sera activé (hors scope, cf. CLAUDE.md).
7. **Rotation `SUPABASE_SERVICE_ROLE_KEY`** : prévoir la procédure
   (impact = redéploiement, pas downtime fonctionnel si fait en
   séquence).
8. **Backups Supabase activés** + restauration testée au moins
   une fois avant pilote distant.

---

## 6. Flux métier complet — scénario smoke à exécuter

À dérouler manuellement après `supabase db push` :

1. **Connexion admin Start Academy** → `/cockpit` charge (KPI,
   pipeline, alertes, activité récente, usage IA).
2. **Connexion commercial A** → `/cockpit` montre uniquement ses
   dossiers (vérification visuelle : pas de fuite cross-commercial).
3. **Création diagnostic** depuis A :
   - `/diagnostics/new` → fiche client + diagnostic créés via
     routes API → `created_by = userA`.
   - 5 réponses au questionnaire enregistrées.
   - Participants prévisionnels saisis.
4. **Recommandation** : `/diagnostics/<id>/recommendation` →
   `/api/analyze-training-need` → OK, recommendation + modules
   persistés.
5. **Proposition** : `/diagnostics/<id>/proposal` →
   `/api/generate-training-proposal` → OK.
6. **Création session** : `/sessions` → `createTrainingSession` →
   visible dans la liste du commercial A.
7. **Lien dirigeant** : `/sessions/<id>` → "Créer lien dirigeant" →
   `/api/sessions/<id>/create-access-link` (`access_type =
   client_session_view`) → URL générée, token brut visible une
   seule fois.
8. **Page dirigeant** : ouvrir le lien dans un navigateur anon →
   page rendue server-side avec admin client + agrégats anonymisés
   (pas de N-1 individuelle).
9. **Création créneaux** : `/sessions/<id>` → 2 créneaux créés.
10. **Sélection dirigeant** : depuis page dirigeant → choix d'un
    créneau → `/api/public/select-date-option` → OK.
11. **Lien participant_collect** : créer + ouvrir →
    `/api/public/submit-participant` POST → OK.
12. **Upload document** : depuis la page publique →
    `/api/public/upload-document` → OK, bucket privé.
13. **Liste documents (interne)** : `/api/sessions/<id>/documents`
    avec cookie commercial A → 200 + signed URLs 60 s.
14. **Génération support** : `/api/generate-training-support` →
    OK ; assertion ownership passe.
15. **Génération designed** : `/api/design-training-support` → OK.
16. **Export PDF** : page print interne → OK.
17. **Tentative cross-commercial (commercial B)** — toutes les routes
    doivent renvoyer 403 `{ ok: false, code: "forbidden", ... }` :
    - `/sessions` → ne voit pas la session de A.
    - GET `/api/sessions/<sessionA>/documents` → 403.
    - POST `/api/generate-training-support { sessionId: sessionA }`
      → 403 AVANT appel OpenRouter.
    - POST `/api/design-training-support { sessionId: sessionA }`
      → 403 idem.
    - POST `/api/sessions/<sessionA>/create-access-link` → 403
      (I-3 corrigé).
    - GET / POST `/api/sessions/<sessionA>/date-options` → 403
      (I-4 corrigé).
    - DELETE `/api/sessions/<sessionA>/date-options/<x>` → 403.
    - GET `/api/sessions/<sessionA>/activity` → 403 (I-5).
    - POST `/api/activity/log { sessionId: <sessionA>, eventType:
      "note_added" }` → 403.
    - POST `/api/analyze-training-need { diagnosticId: <diagA> }`
      → 403 AVANT OpenRouter (I-1).
    - POST `/api/generate-training-proposal { diagnosticId: <diagA> }`
      → 403 AVANT OpenRouter (I-2).
    - Vérifier dans les logs serveur : aucun `[ai-monitoring]` /
      `[openrouter]` ne doit apparaître pour ces tentatives.

---

## 7. Décision finale

### Pré-production interne (équipe Start Academy uniquement)

**✅ PRÊT.**

### Pilote client distant (un cabinet pilote unique)

**✅ PRÊT** après push de la migration
`20260609100000_access_helpers_diagnostic_for_user.sql`.

Les 5 anomalies I-1 → I-5 sont corrigées :
- helpers SQL + code en place ;
- 5 routes (+ /api/activity/log) bloquent désormais l'accès
  cross-commercial avec une réponse 403 standardisée ;
- aucun appel OpenRouter n'est déclenché avant validation
  d'ownership.

### Production publique (commercialisation)

**⚠️ CONDITIONNEL** — encore à dérouler :
- rate limiting OpenRouter,
- audit storage policies formel,
- procédure de rotation `SUPABASE_SERVICE_ROLE_KEY`,
- restauration backup testée.

---

## 8. Annexes — checklist d'exécution

```text
Avant push pre-prod :
  - [ ] supabase db push (toutes migrations Phase 1 → 2E + helpers)
  - [ ] APP_ENV=preprod en env de déploiement
  - [ ] SUPABASE_SERVICE_ROLE_KEY déclarée côté server
  - [ ] OPENROUTER_API_KEY déclarée
  - [ ] DISABLE_LOCAL_FALLBACK pas nécessaire (APP_ENV suffit)
  - [ ] grep "to anon" sur supabase/migrations → 0 occurrence
  - [ ] tsc --noEmit → EXIT 0

Après push pre-prod :
  - [ ] Smoke §6 déroulé end-to-end par admin
  - [ ] Smoke §6 déroulé par commercial A
  - [ ] Vérification cross-commercial B (anomalies I-1 à I-5
    reproductibles pour traçabilité avant correctif)
  - [ ] Connexion non authentifiée → 401 sur toutes les routes
    /api internes
  - [ ] Connexion `client_viewer` (si profile manuel injecté) →
    403 sur routes internes, 200 sur ses chemins publics signés

Avant pilote distant :
  - [x] Correction I-3 (create-access-link) — appliquée 2026-05-26
  - [x] Correction I-4 (date-options + cancel) — appliquée 2026-05-26
  - [x] Correction I-5 (activity GET + /api/activity/log) — appliquée 2026-05-26
  - [x] Correction I-1 (analyze-training-need) — appliquée 2026-05-26
  - [x] Correction I-2 (generate-training-proposal) — appliquée 2026-05-26
  - [ ] supabase db push (migration `20260609100000_access_helpers_diagnostic_for_user.sql`)
  - [ ] Smoke cross-commercial post-correctifs (cf. §6 ligne 17)
```
