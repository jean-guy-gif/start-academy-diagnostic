# Start Academy Diagnostic — État des lieux PRD global

> Document de référence consolidé. À tenir à jour à chaque étape
> majeure (durcissement, intégration, refonte). Statut au
> 2026-05-26, après la mise en place du suivi post-formation
> interne.

---

## 1. Vision produit actuelle

**Outil interne Start Academy** — pas un SaaS public.

L'objectif est triple :

- **Efficacité commerciale** : qualifier vite (diagnostic guidé /
  transcription), proposer juste (recommandation IA + tarif
  centralisé 42 €/h/personne), envoyer dans la foulée (lien
  dirigeant signé).
- **Efficacité pédagogique** : transformer la recommandation en
  support brut puis designé, validés en interne avant utilisation
  formateur.
- **Efficacité opérationnelle** : pilotage cockpit, traçabilité
  via journal d'activité, suivi des coûts IA, RLS strict par
  ownership.

Posture **NXT Performance** : Start Academy est *downstream
consumer only* de COACHNXT. Coach Brain reste inerte ici (pas de
vector DB, pas de pattern store local).

---

## 2. Flux métier complet

```
┌──────────────────────────────────────────────────────────────────┐
│ 1.  Commercial saisit un diagnostic (guided / transcript)        │
│ 2.  Participants prévisionnels (statut pro, N-1)                 │
│ 3.  Estimation financement (agent indé > 7 k€ → éligible)        │
│ 4.  Recommandation IA via OpenRouter + persistance Supabase      │
│ 5.  Proposition commerciale (titre, programme, pricing, pack)    │
│ 6.  Création session (training_sessions)                         │
│ 7.  Lien dirigeant signé (client_session_view)                   │
│ 8.  Validation dates / créneaux                                  │
│ 9.  Lien collecte signé (participant_collect)                    │
│ 10. Collecte collaborateurs (formulaire public)                  │
│ 11. Upload documents privés (CNI, RIB, CFP)                      │
│ 12. Génération support brut (training_supports)                  │
│ 13. Génération support designé (designed_training_supports)      │
│ 14. Validation pédagogique interne (16 critères 0..3)            │
│ 15. Lien formateur signé (trainer_session_view)                  │
│ 16. Formation réalisée (delivered)                               │
│ 17. Suivi post-formation interne (scores + actions)              │
│ 18. Bilan client envoyé (report_sent)                            │
└──────────────────────────────────────────────────────────────────┘
       Cockpit interne — visibilité agrégée à toutes les étapes
       Journal d'activité — traçabilité ligne à ligne
       Monitoring IA + budget mensuel + rate limit
```

Toute l'app est conçue autour de cette chaîne. Chaque étape a une
table dédiée, une route serveur protégée, et une ligne dans
`activity_logs` (sauf chemins publics anon qui logguent côté admin
client).

---

## 3. Modules terminés

| Fonctionnalité | Statut | Fichiers principaux | Dépendances | Limites connues |
|---|---|---|---|---|
| **Diagnostic guidé / transcript** | ✅ | `src/lib/diagnostics/diagnostic-service.ts`, `src/app/(app)/diagnostics/new/`, routes `/api/diagnostics/*` | Auth, Phase 2B | Aucune édition d'une réponse après création (INSERT only). |
| **Participants prévisionnels** | ✅ | `src/lib/diagnostics/diagnostic-participants-service.ts`, `/api/diagnostics/[id]/participants` | RLS Phase 2B | Pas d'historique : UPSERT par diagnostic. |
| **Estimation financement** | ✅ | `src/lib/pricing/training-funding.ts` | — | Règle fixée (agent indé + N-1 > 7 k€, plafond 3 k€/pers). Plafond non paramétrable. |
| **Recommandation IA** | ✅ | `/api/analyze-training-need`, `src/lib/ai/heuristic-recommendation.ts` | OpenRouter, Phase 2B/2C | Fallback heuristique systématique si LLM indispo. |
| **Proposition commerciale** | ✅ | `/api/generate-training-proposal`, `src/lib/ai/heuristic-proposal.ts` | idem | Pas de versionning : nouvelle proposition écrase l'ancienne en cache localStorage. |
| **Pricing centralisé 42 €/h/pers** | ✅ | `src/lib/pricing/training-pricing.ts` | — | Hardcodé. |
| **Sessions + statuts** | ✅ | `src/lib/sessions/session-service.ts`, RLS Phase 2C | — | Pas d'`assigned_trainer_id` (cf. §8). |
| **Liens publics tokenisés** | ✅ | `src/lib/public-access/public-token-service.ts`, `/api/sessions/[id]/create-access-link`, `/api/public/validate-token` | RLS Phase 1 | Hash SHA-256, brut jamais persisté. |
| **Page dirigeant publique** | ✅ | `src/app/public/session/[token]/page.tsx` | service_role | Synthèse agrégée — pas de N-1 individuel. |
| **Collecte collaborateurs** | ✅ | `src/app/public/collect/[token]/page.tsx`, `/api/public/submit-participant` | service_role | Upsert sur (session_id, email). |
| **Upload documents privés** | ✅ | `/api/public/upload-document`, bucket `session-documents` (privé) | service_role | DELETE bucket = manuel admin. |
| **Création / sélection créneaux** | ✅ | `/api/sessions/[id]/date-options`, `/api/public/select-date-option` | RLS Phase 2A | Pas de RPC atomique pour la sélection unique (race tolérée). |
| **Support brut** | ✅ | `/api/generate-training-support`, `src/lib/training-support/training-support-service.ts` | OpenRouter, RLS Phase 2E | Filtre `essential` + `recommended` automatique. |
| **Support designé** | ✅ | `/api/design-training-support`, `src/lib/training-support/designed-support-service.ts` | idem | Renumérotation slides systématique côté code. |
| **Page formateur publique** | ✅ | `src/app/public/trainer/[token]/page.tsx` | service_role | — |
| **Validation pédagogique interne** | ✅ | `src/app/(app)/sessions/[id]/support/design/support-quality-validation.tsx`, table `support_quality_reviews` | RLS Phase 2D-like (helpers session) | 16 critères figés ; pas de transition auto vers `designed_training_supports.status`. |
| **Suivi post-formation interne** | ✅ | `src/app/(app)/sessions/[id]/post-training-review.tsx`, table `post_training_reviews` | idem | Une review courante par session ; pas de formulaire public. |
| **Cockpit interne** | ✅ | `src/app/(app)/cockpit/page.tsx`, `src/lib/cockpit/cockpit-service.ts` | service_role | Stateless, pas de cache. |
| **Journal d'activité** | ✅ | `src/lib/activity/activity-log-service.ts`, `/api/activity/log`, `/api/sessions/[id]/activity` | RLS Phase 1 | 18 event_types figés, métadonnées sûres uniquement. |
| **Monitoring IA / coûts** | ✅ | `src/lib/ai/ai-monitoring-service.ts` | `ai_generation_logs` | Tarifs codés à la main, à actualiser périodiquement. |
| **Rate limiting IA** | ✅ | `src/lib/ai/ai-rate-limit-service.ts` | `ai_generation_logs` | Fenêtre glissante simple, pas de Redis (cf. §9). |
| **Budget IA mensuel + alerte cockpit** | ✅ | helpers `readAiBudgetConfig` / `getAiMonthlyBudgetStatus` | env `AI_MONTHLY_BUDGET_EUR` | Pas de blocage automatique. |
| **Auth + rôles** | ✅ | `src/lib/auth/*` | Supabase Auth | 5 rôles déclarés ; seuls `admin` / `commercial` / `trainer` ont des chemins produit côté MVP. |
| **RLS Phase 1 → 2E** | ✅ | `supabase/migrations/2026060[2-8]100000_*.sql` | helpers SQL | Aucune policy `to anon` ; cf. §4. |
| **Failfast `service_role` preprod/prod** | ✅ | `src/lib/supabase/server.ts` (`isNonLocalEnv`) | env `APP_ENV` | — |
| **Helpers `assertCanAccessSession` / `assertCanAccessDiagnostic`** | ✅ | `src/lib/auth/assert-*.ts` | helpers SQL `can_user_access_*` | Round-trip Supabase par appel non-admin. |

---

## 4. Sécurité

### 4.1 Auth & rôles

- Cookie SSR via `@supabase/ssr` → `getCurrentProfile()`.
- 5 rôles : `admin`, `commercial`, `trainer`, `client_viewer`,
  `participant`. Seuls les 3 premiers (`INTERNAL_APP_ROLES`) ont
  des chemins produit. Les 2 derniers existent dans le check
  constraint mais n'ont pas d'UI.
- Helpers SQL : `is_admin()`, `is_internal_user()`,
  `get_my_role()`, et leurs variantes `_for_user(p_user_id)` pour
  les routes serveur en service_role qui doivent valider
  l'ownership.

### 4.2 RLS — Phase 1 + Phase 2 complètes

| Tables | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | self OR admin | trigger `handle_new_user` | self (sans `role`) OR admin | admin |
| `public_access_tokens` | internal | internal | internal | admin |
| `activity_logs` | internal | internal | bloqué (immutable) | bloqué |
| `ai_generation_logs` | internal | internal | bloqué | bloqué |
| `training_modules` / `module_rules` | internal | admin | admin | admin |
| `session_date_options` | internal | internal | internal | admin |
| `clients` | owner OR admin | internal + (`created_by = uid` OR admin) | owner OR admin | admin |
| `diagnostics` | idem | idem | idem | admin |
| `diagnostic_answers` | `can_access_diagnostic` | idem | idem | admin |
| `transcripts` | `can_access_diagnostic` OR `created_by` | `can_access_diagnostic` | idem | admin |
| `diagnostic_participants` | `can_access_diagnostic` | idem | idem | `can_access_diagnostic` |
| `recommendations` | owner OR admin OR `can_access_diagnostic` | internal + idem | owner OR admin | admin |
| `recommendation_modules` | `can_access_recommendation` | idem | idem | admin |
| `training_sessions` | owner OR admin OR `can_access_diagnostic` OR `can_access_client` | internal + (owner OR admin) | owner OR admin | admin |
| `session_participants` | `can_access_session` | internal + idem | internal + idem | admin |
| `session_documents` | `can_access_session` | internal + idem | internal + idem | admin |
| `training_supports` | `can_access_session` | internal + idem | internal + idem | admin |
| `designed_training_supports` | idem | idem | idem | admin |
| `support_quality_reviews` | `can_access_session` | internal + idem | internal + idem | admin |
| `post_training_reviews` | `can_access_session` | internal + idem | internal + idem | admin |

### 4.3 Tokens publics

- Hash SHA-256 (`token_hash`) en base, **brut JAMAIS persisté**.
- Brut exposé une seule fois à la création (route
  `/api/sessions/[id]/create-access-link`).
- 3 access_types : `client_session_view`, `participant_collect`,
  `trainer_session_view`.
- Validation `validatePublicToken` côté serveur AVANT toute
  écriture publique (anon).

### 4.4 service_role

- Uniquement server-only, jamais `NEXT_PUBLIC_*`.
- `createSupabaseAdminClient()` **failfast** (`Error`) en
  `APP_ENV=preprod|production` si la clé est absente.
- Best-effort services (`createActivityLog`, `logAiGeneration`)
  encapsulent le throw pour ne jamais bloquer la génération
  métier.

### 4.5 Ownership checks côté handler

Helpers code parallèles aux helpers SQL `_for_user` :

- `assertCanAccessSession(profile, sessionId)` — appliqué aux 7
  routes session-keyed sensibles (documents, support-quality,
  generate-training-support, design-training-support,
  create-access-link, date-options [parent + optionId],
  activity, post-training-review).
- `assertCanAccessDiagnostic(profile, diagnosticId)` — appliqué
  aux 2 routes IA diagnostic-keyed (analyze-training-need,
  generate-training-proposal).
- Admin bypass direct ; autres rôles internes → RPC
  `can_user_access_*(p_user_id, p_target_id)`.
- Refus → HTTP 403 `{ ok: false, code: "forbidden", error: "..." }`.

### 4.6 Storage privé

- Bucket `session-documents` créé en `public = false`.
- **Aucune policy `storage.objects`** ajoutée → service_role
  uniquement.
- Signed URLs durée 60 s, générées par
  `/api/sessions/[id]/documents` (interne, gated par
  `assertCanAccessSession`).
- `storage_path` jamais exposé côté client.

### 4.7 Logs

- `activity_logs` : journal métier interne, immutable. Politique
  de minimisation des metadata (jamais de token brut / hash,
  jamais de contenu CNI/RIB, jamais de production N-1
  individuelle, jamais de prompt LLM complet).
- `ai_generation_logs` : monitoring IA avec route, model, source,
  status, duration_ms, tokens, cost_estimate. `prompt` / `response`
  jsonb laissés en colonnes mais écrites à `null` par
  `logAiGeneration` (politique de minimisation).

### 4.8 Limites restantes

| Sujet | Limite |
|---|---|
| Storage policies bucket | Pas d'audit RLS `storage.objects` formel — repose entièrement sur le bucket privé + service_role. |
| `ai_generation_logs.prompt/response` | Colonnes vides mais non droppées (compat MVP1). Migration nettoyage possible. |
| Failclose vs failopen rate-limit | Failopen sur panne Supabase (préfère sur-coût ponctuel à blocage prod). |
| Rotation `SUPABASE_SERVICE_ROLE_KEY` | Procédure documentée (`docs/operations-runbook.md` §6) mais pas automatisée. |
| `client_viewer` / `participant` | Rôles déclarés mais sans UI ni policy active — surface d'attaque nulle aujourd'hui, à reauditer si on les active. |

---

## 5. IA

### 5.1 Architecture

- **OpenRouter** est la passerelle unique
  (`src/lib/ai/llm-client.ts`). Variable `OPENROUTER_API_KEY`.
- Modèle par défaut : `anthropic/claude-sonnet-4.5` (surchargeable
  via `OPENROUTER_MODEL`).
- `max_tokens` clampé `[1024, 20000]`.
- Toutes les sorties LLM passent par Zod (`*Schema.parse`) avant
  affichage / persistance — anti-hallucination structurelle.

### 5.2 Fallback heuristique

Chaque route IA a un moteur heuristique de secours :

- `heuristic-recommendation.ts` (modules basés sur règles
  catalogue).
- `heuristic-proposal.ts` (programme + pricing centralisé).
- `heuristic-training-support.ts` (structure pédagogique
  obligatoire reconstituée).
- `heuristic-designed-support.ts` (slides standards Start Academy).

Déclenchement : pas de clé OpenRouter, exception réseau, ou
réponse rejetée par Zod.

### 5.3 Monitoring (`ai_generation_logs`)

Champs persistés par appel :
- `route` (URL), `provider` (`openrouter` / `internal-heuristic` /
  `rate-limiter`), `model`, `source` (`llm` / `heuristic` / null),
  `status` (`success` / `fallback` / `error` / `partial` /
  `rate_limited`), `duration_ms`, `tokens_input`, `tokens_output`,
  `total_tokens`, `cost_estimate`, `created_by`.
- Politique stricte : ni prompt complet ni réponse complète
  (`prompt` / `response` à `null`).

### 5.4 Rate limiting (`ai-rate-limit-service.ts`)

Fenêtre glissante 60 min par user + route :

| Route | Limite |
|---|---|
| `/api/analyze-training-need` | 20 / h |
| `/api/generate-training-proposal` | 15 / h |
| `/api/generate-training-support` | 8 / h |
| `/api/design-training-support` | 6 / h |

Ordre obligatoire : `requireApiRole` → ownership check
(`assertCanAccessDiagnostic` / `assertCanAccessSession`) →
`checkAiRateLimit` → OpenRouter. Refus rate-limit loggé en
`status = rate_limited`.

### 5.5 Budget mensuel

- `AI_MONTHLY_BUDGET_EUR` (env), `AI_MONTHLY_WARNING_THRESHOLD_PERCENT`
  (défaut 80).
- Calcul = somme `cost_estimate` depuis le 1er du mois.
- Statuts : `ok` / `warning` / `exceeded` / `not_configured`.
- **Pas de blocage automatique** — purement observable cockpit.

### 5.6 Supports

- Support brut : `training_supports` (structure pédagogique :
  problématique → prise de conscience → fondamentaux →
  accélérateur IA → exercice → cas → clôture → action terrain →
  indicateur).
- Support designé : `designed_training_supports` (slides 16:9
  conformes charte Start Academy, renumérotation systématique
  côté React).

### 5.7 Limites restantes

| Sujet | Limite |
|---|---|
| Tarifs IA | Codés à la main (`MODEL_PRICING_USD_PER_MTOK`). À actualiser périodiquement. |
| `resetAt` rate-limit | Approximation conservatrice (`now + window`). Pas exposé au client. |
| Budget hard-stop | Non implémenté — alerte seulement. |
| Coach Brain | Inerte. La table `coach_brain_patterns` est dans la roadmap NXT Performance, pas locale. |
| Vraie facture OpenRouter | Pas remontée — on garde l'estimate. À comparer manuellement avec la facture mensuelle OpenRouter. |

---

## 6. Données sensibles

### 6.1 Catégorie

| Donnée | Niveau | Stockage |
|---|---|---|
| Pièces collaborateur (CNI / RIB / CFP / URSSAF) | **élevée** | bucket Storage privé `session-documents` + ligne `session_documents` |
| Production N-1 individuelle | **élevée** | `diagnostic_participants.previous_year_production` |
| Email participant | **moyenne** | `session_participants.email` |
| Notes internes (activity_logs, support_quality, post_training) | **moyenne** | texte libre — JAMAIS loggé dans activity_logs |
| Token brut public | **élevée** | jamais persisté ; hash SHA-256 seul stocké |
| Prompts / réponses LLM | **moyenne** | non stockés (colonnes vides) |

### 6.2 Affichage

- **Page dirigeant** (`/public/session/[token]`) : synthèse
  **agrégée** uniquement (eligibleParticipantCount, totalBudget,
  estimatedFundingTotal, disclaimer). Aucune donnée individuelle
  (pas de prénom, pas de statut, pas de N-1 par personne).
- **Page formateur** (`/public/trainer/[token]`) : voir le
  support, pas les pièces administratives ni les N-1.
- **Page collaborateur** (`/public/collect/[token]`) : ne voit
  rien — uniquement le formulaire de soumission.
- **Interne** : tout visible aux internes ayant accès à la
  session via les helpers `can_access_*`.

### 6.3 Politique de minimisation

Codifiée dans `docs/activity-log-prd.md` §6 :

- ❌ token brut / hash dans metadata
- ❌ contenu CNI / RIB
- ❌ production N-1 individuelle
- ❌ contenu complet diagnostic / support
- ❌ prompts / réponses LLM
- ❌ email exact d'un participant en metadata cross-commercial
- ❌ notes texte libre (validation pédagogique, post-formation)

**Toutes les violations à cette politique sont à traiter comme
bug bloquant.**

---

## 7. Cockpit interne

URL `/cockpit`. Gated par `requireRole(INTERNAL_APP_ROLES)`. Une
seule page server-rendered avec admin client (bypass RLS).

### 7.1 KPIs (9 cards)

- Diagnostics en cours
- Propositions à finaliser
- En attente validation client
- Dates à positionner
- Collectes incomplètes
- Supports à générer
- **Supports à valider** (ambre si > 0)
- **Suivis post-formation à compléter** (ambre si > 0)
- Formations prêtes / réalisées (emerald)
- Total dossiers actifs

### 7.2 Alertes

Bandeau d'alerte si `data.alerts` non vide (calculé par
`getCockpitData`).

### 7.3 Actions prioritaires

Liste des prochaines actions par dossier — une seule action par
session, déterminée par `computeNextActionForSession` (chaîne de
13 conditions). Codes :

`generate_recommendation`, `generate_proposal`, `create_session`,
`generate_client_link`, `propose_dates`, `await_client_choice`,
`send_collection_link`, `remind_collaborators`,
`generate_support`, `generate_designed_support`,
`validate_designed_support`, **`validate_support_quality`**,
**`complete_post_training_review`**, `sync_calendar`,
`post_training_followup`, `none`.

### 7.4 Bloc Usage IA

- KPIs : appels aujourd'hui, 7 jours, coût estimé 7 jours, taux
  fallback (+ rate-limited 7j).
- Bandeau dernière erreur si présent.
- **Budget mensuel** : 3 KPIs (budget / dépensé / reste) + barre
  de progression + status badge + bandeau ambre/rouge en
  `warning`/`exceeded`.
- 5 derniers appels IA (status, route, source, modèle, durée,
  tokens, coût).

### 7.5 Activité récente

10 derniers événements `activity_logs` (tous dossiers
confondus) — badge sévérité + lien direct vers la session /
diagnostic.

### 7.6 Pipeline formation

Table de tous les dossiers actifs avec : client, participants,
durée, budget, reste à charge, étape, prochaine action,
dernière maj.

---

## 8. Points non branchés volontairement

| Sujet | Statut | Pourquoi |
|---|---|---|
| **Gmail réel** | non branché | MVP : le commercial copie / colle le contenu mail proposé. Brouillon Gmail prévu mais désactivé (cf. `docs/gmail-draft-integration.md`). |
| **Google Calendar réel** | non branché | Création d'événement non implémentée. Le créneau validé est purement informatif côté app. |
| **Google Drive réel** | non branché | Pas d'export Drive ; les supports restent dans Supabase + PDF print interne. |
| **Coach Brain actif** | inerte | NXT Performance owns COACHNXT + `coach_brain_patterns`. Start Academy est downstream consumer only. |
| **Formulaire public post-formation** | non branché | Saisie 100 % interne pour MVP. Voir `docs/post-training-follow-up-prd.md` §10. |
| **Production publique large** | non ouverte | Audit final `docs/security-final-audit-preprod.md` § décision : prêt pour pilote distant uniquement après corrections, cf. §11. |
| **`assigned_trainer_id`** | non ajouté | Le formateur accède via token signé. Pas de chemin produit pour un trainer connecté à l'app aujourd'hui. |
| **Rate limit Redis / Upstash** | non branché | Fenêtre glissante via `ai_generation_logs` suffit en MVP. |
| **Alertes email auto** | non branchées | Cockpit suffit en heures de bureau. |
| **Monitoring externe (uptime / Sentry)** | non branché | À ajouter avant prod. |
| **Backup automatisé Supabase + Storage** | non branché | Procédure manuelle hebdo documentée (`operations-runbook.md` §4). |

---

## 9. Dette / risques restants

### 9.1 Bloquants (à corriger avant pilote distant)

Aucun. Les 5 anomalies de l'audit final (I-1 à I-5) ont été
corrigées (migration `20260609100000_access_helpers_diagnostic_for_user.sql`
+ `assertCanAccessDiagnostic` + routes durcies).

### 9.2 Importants (à corriger avant production publique)

| # | Risque | Effort estimé |
|---|---|---|
| B-1 | Backup Supabase + Storage non automatisé — perte > 7 jours si plan Free / pas de coffre externe. | 1–2 j |
| B-2 | Restauration jamais testée end-to-end. | 0,5 j |
| B-3 | Audit Storage policies bucket formel manquant. | 0,5 j |
| B-4 | Rotation `SUPABASE_SERVICE_ROLE_KEY` non testée. | 0,5 j |
| B-5 | Monitoring externe absent (uptime, latence, erreurs 5xx). | 1 j |
| B-6 | Alertes email automatiques (budget IA, erreur récurrente, OpenRouter quota). | 1–2 j |
| B-7 | Procédure RGPD complète + registre Article 30 non rédigés. | 2 j |
| B-8 | Rate limit Redis / sub-seconde — protection burst manquante. | 1–2 j |
| B-9 | Budget IA hard-stop manquant (alerte uniquement aujourd'hui). | 0,5 j |
| B-10 | Vraie facture OpenRouter non rapprochée de l'estimate. | 0,5 j |

### 9.3 Confort (post-MVP, valeur produit)

| # | Risque | Effort estimé |
|---|---|---|
| C-1 | Versionning des reviews qualité / post-formation (historique). | moyen |
| C-2 | Formulaire dirigeant public (post-formation, NPS). | moyen |
| C-3 | Formulaire participants public (NPS). | moyen |
| C-4 | Export PDF bilan post-formation client. | faible |
| C-5 | Coach Brain actif : pousser scores qualité + post-training vers `coach_brain_patterns` (boucle d'apprentissage). | moyen |
| C-6 | Branchement Gmail / Calendar / Drive réel. | moyen × 3 |
| C-7 | `assigned_trainer_id` + UI trainer connecté. | moyen |
| C-8 | Test de charge (10 commerciaux × 5 diagnostics simultanés). | 1 j |
| C-9 | Bug bounty / pentest externe léger. | budget externe |
| C-10 | Historique mensuel coûts IA (graphique). | faible |

---

## 10. Roadmap recommandée

### 10.1 Court terme — stabilisation préprod interne

Cycle : 2–3 semaines. Cible : équipe Start Academy uniquement.

1. Pousser **toutes les migrations RLS + helpers** sur le projet
   preprod (`supabase db push`).
2. Configurer `APP_ENV=preprod` côté hébergement.
3. Confirmer `SUPABASE_SERVICE_ROLE_KEY` + `OPENROUTER_API_KEY`
   + `AI_MONTHLY_BUDGET_EUR` côté env preprod.
4. Dérouler **scénario smoke complet** (cf. `operations-runbook.md`
   §6 et `security-final-audit-preprod.md` §6).
5. Activer la **checklist quotidienne / hebdo** (cf. runbook §3).
6. Tester restauration backup sur projet jetable.
7. Documenter le **registre incidents** (template dans runbook).

### 10.2 Moyen terme — pilote distant contrôlé

Cycle : 4–6 semaines. Cible : 1–2 cabinets pilotes.

1. **Backup automatisé** quotidien (S3 chiffré).
2. **Monitoring externe** (Better Stack / Sentry / Datadog).
3. **Alertes email auto** sur budget IA `exceeded` et erreurs 5xx
   récurrentes.
4. **Audit Storage policies formel** + test d'accès non autorisé.
5. **Rate limit Redis** (Upstash) — protection burst.
6. **Budget hard-stop** quand `exceeded` (helper côté rate-limit).
7. **Procédure RGPD** complète + registre Article 30.
8. **Branchement Gmail réel** (brouillons OK) ou alternative
   (Resend pour les emails transactionnels internes).
9. **Versionning** des reviews qualité / post-formation.
10. **Export PDF bilan post-formation**.

### 10.3 Long terme — Coach Brain actif + analytics pédagogiques

Cycle : 2–3 mois. Cible : commercialisation / production publique.

1. **Branchement Coach Brain en lecture** : enrichir la
   génération support brut avec les patterns NXT Performance
   (`selectCoachBrainContentForSupport` existant côté code mais
   inerte aujourd'hui).
2. **Branchement Coach Brain en écriture** : pousser
   `support_quality_reviews` + `post_training_reviews` scores
   vers `coach_brain_patterns` pour fermer la boucle.
3. **Formulaire dirigeant public post-formation** (NPS,
   commentaires).
4. **Formulaire participants public** (satisfaction par module).
5. **Analytics pédagogiques** : cohortes, moyennes par formateur,
   évolution scores dans le temps.
6. **`assigned_trainer_id`** + UI trainer connecté (au-delà du
   token signé).
7. **Calendar / Drive** branchés si besoin commercial.
8. **Pentest externe** + bug bounty.

---

## 11. Décision produit

### 11.1 Pré-production interne (équipe Start Academy uniquement)

**✅ PRÊT.**

- Phase 2 RLS complète.
- 5 anomalies de l'audit final corrigées.
- Helpers SQL et code parallèles en place.
- Failfast `service_role` actif en preprod.
- Monitoring + budget + rate limit IA fonctionnels.
- Cockpit, journal, validation qualité, suivi post-formation
  opérationnels.

Prochain pas : déployer en preprod et dérouler le scénario smoke
(`operations-runbook.md` §6).

### 11.2 Pilote distant contrôlé (1–2 cabinets externes)

**⚠️ CONDITIONNEL.**

Prérequis :
- Push migration `20260609100000_access_helpers_diagnostic_for_user.sql`
  et toutes les migrations Phase 2 + supports / post-training.
- Smoke cross-commercial validé (vérifier 403 sur les 10 vecteurs
  documentés dans `security-final-audit-preprod.md` §6).
- Backup automatisé en place (B-1).
- Monitoring externe (B-5).
- Procédure RGPD documentée (B-7).

### 11.3 Production publique (commercialisation)

**❌ PAS PRÊT.**

Tout B-1 → B-10 (cf. §9.2) doit être traité. Plus particulièrement :
- Backup automatisé + restauration testée.
- Audit Storage formel.
- Alertes email auto.
- Rate limit Redis.
- Budget hard-stop.
- Procédure RGPD complète + registre.
- Test de charge.
- Pentest externe léger.

---

## 12. Annexes

### 12.1 Documents de référence

| Doc | Périmètre |
|---|---|
| [`rls-hardening-plan.md`](rls-hardening-plan.md) | Plan global RLS, statut Phases 1 → 2E |
| [`rls-phase-2-access-audit.md`](rls-phase-2-access-audit.md) | Audit d'accès table par table, Phase 2 |
| [`security-final-audit-preprod.md`](security-final-audit-preprod.md) | Audit sécurité final pré-prod + correctifs |
| [`operations-runbook.md`](operations-runbook.md) | Backup, restauration, rotation clés, incidents |
| [`activity-log-prd.md`](activity-log-prd.md) | Journal d'activité interne |
| [`ai-monitoring-prd.md`](ai-monitoring-prd.md) | Monitoring IA / `ai_generation_logs` |
| [`ai-rate-limiting-prd.md`](ai-rate-limiting-prd.md) | Rate limiting OpenRouter |
| [`ai-budget-prd.md`](ai-budget-prd.md) | Budget IA mensuel |
| [`support-quality-validation-prd.md`](support-quality-validation-prd.md) | Validation pédagogique interne |
| [`post-training-follow-up-prd.md`](post-training-follow-up-prd.md) | Suivi post-formation interne |
| [`public-access-flow.md`](public-access-flow.md) | Tokens publics signés |
| [`session-documents-upload.md`](session-documents-upload.md) | Bucket Storage privé |
| [`internal-cockpit-prd.md`](internal-cockpit-prd.md) | Cockpit interne |
| [`coach-brain-integration-plan.md`](coach-brain-integration-plan.md) | Coach Brain (inerte aujourd'hui) |
| [`gmail-draft-integration.md`](gmail-draft-integration.md) | Brouillon Gmail (non branché) |
| [`rls-hardening-plan.md`](rls-hardening-plan.md) | Plan global RLS |

### 12.2 Tables Supabase (récap)

```
profiles, clients,
training_modules, module_rules,
diagnostics, diagnostic_answers, transcripts, diagnostic_participants,
recommendations, recommendation_modules,
training_sessions, session_date_options, public_access_tokens,
session_participants, session_documents,
training_supports, designed_training_supports,
support_quality_reviews, post_training_reviews,
activity_logs, ai_generation_logs
```

### 12.3 Variables d'environnement (récap)

```
APP_ENV=local|preprod|production
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # obligatoire preprod/prod
OPENROUTER_API_KEY=                 # sinon heuristique
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_MAX_TOKENS=20000
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=
AI_MONTHLY_BUDGET_EUR=50
AI_MONTHLY_WARNING_THRESHOLD_PERCENT=80
GMAIL_*                             # non branché
```

### 12.4 Glossaire

- **service_role** : clé Supabase qui bypasse RLS. Strictement
  serveur.
- **anon key** : clé Supabase publique, soumise à RLS.
- **JWT user** : cookie auth posé par `@supabase/ssr`.
- **RLS** : Row Level Security Postgres.
- **failopen / failclose** : politique en cas de panne d'un
  sous-système.
- **token brut / token_hash** : pour `public_access_tokens` —
  brut exposé une fois, hash persisté.
- **Coach Brain / COACHNXT** : pattern store NXT Performance ;
  Start Academy est downstream consumer only.
- **`can_access_*` / `can_user_access_*`** : helpers SQL
  ownership ; les `_for_user` prennent `p_user_id` explicite pour
  les chemins service_role.
- **`assertCanAccessSession` / `assertCanAccessDiagnostic`** :
  helpers code (NextResponse 403) à appliquer dans les routes
  serveur qui utilisent admin client avec un sessionId /
  diagnosticId reçu en URL ou body.
