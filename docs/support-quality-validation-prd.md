# Validation pédagogique des supports — PRD

## 1. Objectif

Avant d'utiliser un support brut ou designé en formation, Start
Academy doit pouvoir contrôler sa qualité pédagogique et sa
conformité à la méthode. Cette validation est **interne** et ne
remplace pas le statut technique (`draft` / `validated` /
`archived`) du support designé.

Pourquoi :
- L'IA génère parfois des modules incomplets ou mal calibrés
  (rythme, prompts vides, cas inventés).
- La diffusion d'un support non validé pédagogiquement engage la
  marque Start Academy auprès du client et du formateur.
- Une fois validé, on dispose d'une trace (score, critères, notes
  internes) consultable depuis le cockpit et l'historique.

## 2. Périmètre MVP

- **Une review par session** (table `support_quality_reviews`).
  Pattern UPSERT côté API : pas de versionning historique. Une
  évolution future ajoutera une colonne `version` si l'équipe
  veut tracer plusieurs passes.
- **Checklist figée** (16 critères, cf. §3) — côté code dans
  `src/lib/training-support/support-quality.types.ts`. Tout
  changement doit MAJ cette doc.
- **Validation interne uniquement** : aucune page publique
  (dirigeant / collaborateur / formateur externe) ne voit ces
  reviews. Garanti par RLS `can_access_session` + pas de policy
  `to anon`.
- **Pas de validation automatique** : `support_quality_validated`
  ne fait PAS basculer `designed_training_supports.status` à
  `validated`. C'est un acte distinct, qui doit rester un clic
  conscient (cf. §6).

## 3. Critères et notation

### 3.1 Critères (16)

| ID | Label | Description |
|---|---|---|
| `diagnostic_alignment` | Cohérence avec le diagnostic | Besoins, profils, contexte client repris. |
| `module_relevance` | Pertinence des modules | Couverture des attendus de la recommandation, ordre. |
| `pedagogical_pace` | Rythme pédagogique | Alternance théorie / pratique / IA. |
| `objective_clarity` | Clarté des objectifs | Objectif par module en compétence acquise. |
| `awareness_quality` | Qualité des prises de conscience | Déclic métier identifiable. |
| `fundamentals_quality` | Qualité des fondamentaux | Méthodologie réutilisable, actionnable. |
| `ai_accelerator_quality` | Qualité des accélérateurs IA | Objectif clair, outils nommés, intégration métier. |
| `exercise_quality` | Qualité des exercices | Cas concret, ≥ 2 instructions, output défini. |
| `participant_integration` | Intégration des cas collaborateurs | Cas réels collecte OU génériques argumentés. |
| `prompts_executable` | Prompts exploitables | ≥ 1 prompt par accélérateur avec outil. |
| `timing_realistic` | Timing réaliste | Durée déclarée ≈ charge réelle. |
| `design_readability` | Lisibilité du design | Slides aérées, hiérarchie claire (support designé). |
| `brand_compliance` | Conformité charte Start Academy | Couleurs, typo, ton de voix. |
| `no_invented_content` | Absence de contenu inventé | Aucun module / outil / chiffre fantôme. |
| `no_sensitive_data` | Absence de données sensibles | Pas de N-1 individuelle, CNI/RIB, email cité. |
| `trainer_exploitable` | Exploitabilité formateur | Utilisable tel quel le jour J. |

### 3.2 Notation

Échelle 0..3 par critère :

| Note | Sens |
|---|---|
| 0 | Non conforme — refus catégorique |
| 1 | À corriger — demande de revue avant validation |
| 2 | Acceptable — utilisable avec réserves |
| 3 | Validé — qualité Start Academy nominale |

### 3.3 Score

```
total = somme des notes posées
max   = nombre de critères notés × 3
% = total / max × 100 (deux décimales)
```

Les critères non notés ne pénalisent pas une review partielle
(`max` augmente proportionnellement aux critères évalués).

## 4. Workflow

États (`status`) :

| State | Sens |
|---|---|
| `draft` | Brouillon en cours — review pas finalisée. |
| `needs_revision` | Le reviewer demande une correction du support. |
| `validated` | Support validé pédagogiquement. |
| `rejected` | Support refusé — ne pas diffuser. |

Transitions possibles via les 3 boutons :
- **Enregistrer brouillon** → `draft`.
- **Marquer à corriger** → `needs_revision`.
- **Valider pédagogiquement** → `validated`.

La transition `rejected` n'a pas de bouton dédié en UI MVP (peu
fréquent en interne) — possible via UPDATE direct ou évolution
future.

## 5. Persistance

### 5.1 Table `support_quality_reviews`

Migration : `20260611100000_add_support_quality_reviews.sql`.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | gen_random_uuid |
| `session_id` | uuid NOT NULL FK | cascade delete |
| `training_support_id` | uuid NULL FK | set null on delete |
| `designed_support_id` | uuid NULL FK | set null on delete |
| `reviewer_id` | uuid NULL FK auth.users | set null on delete |
| `reviewer_name` | text | snapshot lisible |
| `status` | text NOT NULL | check : `draft`/`needs_revision`/`validated`/`rejected` |
| `score_total` / `score_max` / `score_percent` | int / int / numeric | recalculés côté serveur à chaque save |
| `checklist` | jsonb | `{ <criterion_id>: 0..3 }` |
| `notes` | text | jusqu'à 4000 chars |
| `created_at` / `updated_at` | timestamptz | trigger `update_updated_at` |

### 5.2 RLS

- SELECT : `can_access_session(session_id)`.
- INSERT / UPDATE : `is_internal_user() + can_access_session`.
- DELETE : `is_admin()`.
- Aucune policy `to anon` — vérifié.

### 5.3 Routes API

- `GET /api/sessions/[id]/support-quality` — auth interne +
  `assertCanAccessSession` → retourne la review courante ou null.
- `PUT /api/sessions/[id]/support-quality` — upsert.
  - Le **score est recalculé côté serveur** (`calculateSupportQualityScore`),
    empêche un client malveillant d'envoyer un score artificiel.
  - Journalise dans `activity_logs` un événement adapté :
    - `support_quality_review_created` (1ère écriture).
    - `support_quality_review_updated` (édition `draft` /
      `needs_revision`).
    - `support_quality_validated` (transition vers `validated`).
    - `support_quality_rejected` (transition vers `rejected`).
  - **Metadata loggée** : `status`, `scoreTotal`, `scoreMax`,
    `scorePercent`, `designedSupportId`, `trainingSupportId`.
  - **Notes texte non loggées** (politique de minimisation).

## 6. Lien avec le statut du support designé

- `designed_training_supports.status` reste contrôlé par le
  bloc existant `DesignReady` (boutons « Valider », « Archiver »).
- Quand `support_quality_reviews.status = validated`, la UI
  affiche un message :
  > « Validé pédagogiquement. Vous pouvez maintenant passer le
  >   support designé en `validated` dans le bloc au-dessus. »
- L'utilisateur doit cliquer manuellement — **pas de transition
  automatique**, par design (cf. §2).

## 7. UI

### 7.1 Bloc `SupportQualityValidation` (design-view)

Composant client `"use client"` au sein de
`src/app/(app)/sessions/[id]/support/design/`. Affiche :
- Liste des 16 critères avec 4 boutons radio par ligne (0..3).
- Score global recalculé à chaque clic.
- Champ « Notes internes » (textarea, 4000 chars max).
- Badge status + 3 actions (Enregistrer brouillon / Marquer à
  corriger / Valider pédagogiquement).
- Bandeau d'info si déjà `validated`.

### 7.2 Cockpit

Bloc « A. Vue synthèse » → nouvelle KPI :
- **« Supports à valider »** — compte des sessions avec un
  support designé mais aucune review `validated`. Accent ambre
  si > 0.

Bloc « C. Actions prioritaires » → nouvelle action :
- **`validate_support_quality`** — pour chaque session ayant un
  support designé sans review `validated` :
  > « Valider le support pédagogique » — `/sessions/<id>/support/design`.
- Insérée APRÈS `validate_designed_support` (étape 9.bis dans
  `computeNextActionForSession`) — donc une session avec
  `designedStatus = "draft"` voit d'abord « Valider le support
  designé » ; une session avec `designedStatus = "validated"`
  mais sans review valide voit « Valider le support pédagogique ».

## 8. Journal d'activité

4 nouveaux event_types dans `ACTIVITY_EVENT_TYPES` :
- `support_quality_review_created`
- `support_quality_review_updated`
- `support_quality_validated`
- `support_quality_rejected`

Labels par défaut (`buildActivityLabel`) :
- « Validation pédagogique démarrée »
- « Validation pédagogique mise à jour »
- « Support validé pédagogiquement »
- « Support rejeté par validation pédagogique »

Severities par défaut :
- `support_quality_validated` → `success`.
- `support_quality_rejected` → `warning`.
- Autres → `info`.

Le texte libre `notes` n'est **jamais** loggé — seulement le
statut + le score.

## 9. Limites MVP

- **Une seule review courante** par session — pas d'historique
  des passes successives. Une UPSERT côté API.
- **Pas de notification** vers le reviewer / responsable. Les
  notes restent visibles uniquement à l'ouverture manuelle.
- **Pas de signature électronique** — la valeur ajoutée du
  reviewer reste à dire-d'expert.
- **Coach Brain inerte** : aucune intégration. Les seuils de
  validation pédagogique ne sont pas (encore) alimentés par le
  pattern store NXT Performance.

## 10. Évolutions futures

| Étape | Quand | Effort |
|---|---|---|
| Versionning historique des reviews | si pilote distant complexe | moyen |
| Signature électronique du reviewer | obligation client réglementée | moyen |
| Notifications email auto vers le responsable pédagogique | équipe distribuée | moyen |
| Pondération par critère (poids variable) | si la mesure devient critique | faible |
| Branchement Coach Brain — détection automatique des critères défaillants à partir du pattern store NXT Performance | quand `coach_brain_patterns` est exposé en lecture pour Start Academy | moyen |
| Export PDF de la review | si demande commerciale | faible |
| Workflow multi-reviewer (review croisée) | équipe pédagogique grossit | moyen |

## 11. Tests

À dérouler après `supabase db push` de la migration
`20260611100000_add_support_quality_reviews.sql` :

1. **Création d'une review** :
   - Ouvrir `/sessions/<id>/support/design` (support designé
     existant).
   - Cocher 5 critères à des notes différentes.
   - Enregistrer brouillon → score calculé, badge `Brouillon`,
     ligne `activity_logs` `support_quality_review_created`.
2. **Modification de la checklist** :
   - Modifier 2 critères.
   - Marquer à corriger → status `needs_revision`, événement
     `support_quality_review_updated`.
3. **Validation pédagogique** :
   - Cliquer Valider → status `validated`, événement
     `support_quality_validated`, bandeau emerald « pouvez
     maintenant passer le support designé en `validated` ».
4. **Calcul score** : recalculer manuellement total / max /
   percent et comparer avec l'affichage.
5. **Cockpit** :
   - KPI « Supports à valider » diminue de 1 après validation.
   - Action prioritaire `validate_support_quality` disparaît
     pour la session validée.
6. **Sécurité non-propriétaire** :
   - Commercial B sur `/sessions/<sessionA>/support/design` →
     UI bloque, API renvoie 403 sur GET/PUT
     `/api/sessions/<sessionA>/support-quality`.
7. **Public** :
   - `/public/session/<token>` (dirigeant) / `/public/trainer/<token>`
     (formateur) → aucune mention de la review. Vérifier dans le
     rendu serveur.

## 12. Sécurité — récap

- ✅ Aucune policy `to anon`.
- ✅ Routes API gated par `requireApiRole(INTERNAL_APP_ROLES)` +
  `assertCanAccessSession(profile, sessionId)`.
- ✅ Service exclusivement server-only.
- ✅ Notes textuelles non loggées (journal d'activité).
- ✅ Score recalculé côté serveur (anti-spoofing).
- ✅ Pages publiques inchangées — aucune fuite cross-commercial.
