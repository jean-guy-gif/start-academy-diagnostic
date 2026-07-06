# Suivi post-formation — PRD

## 1. Objectif

Capitaliser sur ce qui s'est passé pendant et juste après chaque
formation Start Academy :

- mesurer la satisfaction et la valeur perçue,
- collecter les retours formateur / dirigeant / participants,
- formaliser les actions terrain à mener,
- identifier les opportunités commerciales de suite (renouvellement,
  session manager, accompagnement individuel),
- alimenter à terme Coach Brain / NXT Performance pour boucler la
  boucle d'apprentissage (cf. §10).

Ce suivi est **strictement interne**. Aucun formulaire public
côté MVP — la saisie se fait par l'équipe Start Academy (commercial
créateur, formateur, admin).

## 2. Périmètre MVP

- **Une review courante** par session (UPSERT côté API). La table
  autorise plusieurs lignes pour un éventuel multi-angle
  (`trainer` / `director` / `participant_summary` / `internal`) ou
  un futur versionning.
- **Pas de formulaire dirigeant / collaborateur public.** Le retour
  dirigeant et la synthèse participants sont saisis manuellement
  dans l'interface interne.
- **Pas de transition automatique** du statut session. La
  validation de la review n'enclenche pas `report_sent` — c'est un
  acte commercial distinct.
- **Coach Brain non branché**, conformément à la posture downstream
  consumer only.

## 3. Données collectées

### 3.1 Métadonnées

| Champ | Type | Source |
|---|---|---|
| `review_type` | `trainer` / `director` / `participant_summary` / `internal` | choisi à la saisie (défaut `internal`) |
| `status` | `draft` / `completed` / `archived` | géré par les boutons UI |
| `reviewer_id` / `reviewer_name` | snapshot user interne | route serveur |

### 3.2 Scores 0..10 (entiers)

- `satisfaction_score` — perception globale formation.
- `perceived_value_score` — valeur perçue par participants /
  dirigeant.
- `content_relevance_score` — pertinence par rapport au besoin
  formulé.
- `actionability_score` — capacité des participants à mettre en
  œuvre après la formation.

Moyenne affichée côté UI sur les scores réellement renseignés
(les scores absents ne pénalisent pas).

### 3.3 Champs structurés

- `key_successes` (string[]) — réussites clés.
- `key_blockers` (string[]) — points de blocage rencontrés.
- `follow_up_actions` (`{ label, owner?, dueDate?, status? }[]`) —
  actions terrain à mener. MVP : saisie une ligne par action, le
  parsing avancé (owner / dueDate / status) arrivera dans une
  itération future.

### 3.4 Texte libre

- `trainer_notes` — synthèse formateur.
- `director_feedback` — retour dirigeant (verbatim ou synthèse).
- `participant_feedback_summary` — synthèse retours participants.
- `next_commercial_opportunity` — opportunité commerciale suivante.
- `metadata` (jsonb libre) — réserve pour NPS, score recommandation,
  etc. (non utilisé en MVP).

## 4. Persistance

Migration : `20260612100000_add_post_training_reviews.sql`.

Table `post_training_reviews` :

- FK `session_id` → `training_sessions` (ON DELETE CASCADE).
- Check constraints sur `review_type` et `status`.
- Scores `0..10` ou NULL.
- 3 jsonb default `'[]'` + 1 metadata jsonb default `'{}'`.
- Trigger `update_updated_at` via `before update`.
- 4 index (`session_id`, `reviewer_id`, `review_type`, `status`).

## 5. RLS

- SELECT : `can_access_session(session_id)`.
- INSERT / UPDATE : `is_internal_user() + can_access_session`.
- DELETE : `is_admin()`.
- **Aucune policy `to anon`** — vérifié.

## 6. Routes API

`/api/sessions/[id]/post-training-review` — server-only, gated par
`requireApiRole(INTERNAL_APP_ROLES)` + `assertCanAccessSession`.

- **GET** : retourne la review courante ou `null`.
- **PUT** : upsert via le service.
  - Statut transition `completed` → événement
    `post_training_review_completed`.
  - Sinon : `post_training_review_created` (nouvelle) ou
    `post_training_review_updated`.
  - Metadata loggée : `status`, `reviewType`, `averageScore`,
    `scoresCount`, `followUpActionsCount`,
    `hasCommercialOpportunity`.
  - **Notes libres NON loggées** — politique de minimisation
    (PRD §G), cf. `activity-log-prd.md`.

## 7. UI

### 7.1 Fiche session interne

Composant `PostTrainingReviewBlock` (client) ajouté dans
`session-detail-view.tsx`. Affiche :

- Selecteur `review_type`.
- 4 scores 0..10 + moyenne live.
- 2 listes (réussites, points de blocage) — 1 par ligne.
- Liste actions de suivi — 1 par ligne (parsing label uniquement).
- 4 textareas : notes formateur, retour dirigeant, synthèse
  participants, opportunité commerciale.
- 2 boutons : « Enregistrer brouillon » (status `draft`) et
  « Marquer comme complété » (status `completed`).
- Badge status, bandeau de confirmation quand `completed`.

### 7.2 Cockpit

Bloc « A. Vue synthèse » :

- **KPI « Suivis post-formation à compléter »** (icône `TrendingUp`,
  accent ambre si > 0). Compte les sessions avec
  `status = "delivered"` sans review en `completed`.

Bloc « C. Actions prioritaires » :

- **Action `complete_post_training_review`** — « Compléter le suivi
  post-formation » — déclenchée pour chaque session `delivered`
  sans review courante en `completed`. Remplace la précédente
  action `post_training_followup` qui devient un statut de fin
  (`later`, plus discret).

## 8. Journal d'activité

3 nouveaux event types dans `ACTIVITY_EVENT_TYPES` :

- `post_training_review_created`
- `post_training_review_updated`
- `post_training_review_completed`

Labels FR :
- « Suivi post-formation démarré »
- « Suivi post-formation mis à jour »
- « Suivi post-formation complété »

Severities par défaut :
- `post_training_review_completed` → `success`.
- Autres → `info`.

## 9. Limites MVP

- **Pas de formulaire dirigeant public.** Le retour dirigeant est
  saisi manuellement par l'équipe (mail, entretien, etc. → texte
  copié dans le champ).
- **Pas de formulaire participants public.** La synthèse est
  consolidée manuellement.
- **Pas de mail automatique** (rappel J+7 / J+30, demande de
  retour, etc.). Voir §10.
- **Une seule review courante** — pas de versionning historique.
- **Parsing des actions limité** — chaque ligne devient une action
  avec uniquement un `label`. Le owner / dueDate / status restent
  à enrichir via UI plus poussée (drag-and-drop avec champs
  individuels).
- **Coach Brain inerte** — la table ne pousse rien vers le pattern
  store NXT Performance. Le branchement est prévu (§10) quand
  l'équipe NXT exposera l'endpoint d'ingestion.

## 10. Évolutions futures

| Étape | Quand | Effort |
|---|---|---|
| Formulaire dirigeant publique tokenisée (`director_feedback`) | si pilote distant | moyen |
| Formulaire participants public (NPS, satisfaction) | si pilote distant + commercialisation | moyen |
| Mail automatique J+7 / J+30 (rappel suivi formateur, NPS) | quand Resend / SMTP est branché | moyen |
| Export PDF du bilan post-formation pour le client | si commercialisation | faible |
| Alimentation Coach Brain — pousser scores + key_successes + key_blockers vers `coach_brain_patterns` pour boucle d'apprentissage | quand NXT expose l'endpoint d'ingestion | moyen |
| Multi-reviewer versionné (historique) | si équipe pédagogique grossit | moyen |
| Suivi des `follow_up_actions` avec statut + relances | si pilotage opérationnel se densifie | moyen |
| KPI cohorte (moyennes scores par client / mois / formateur) | si supervision long terme | moyen |

## 11. Tests

À dérouler après `supabase db push` de la migration
`20260612100000_add_post_training_reviews.sql` :

1. **Création review** : ouvrir une session `delivered`, saisir
   2 scores + 3 réussites + 2 blocages → Enregistrer brouillon →
   ligne `activity_logs` `post_training_review_created`.
2. **Modification scores** : changer 1 score → événement
   `post_training_review_updated`, moyenne mise à jour.
3. **Compléter review** : cliquer « Marquer comme complété » →
   status `completed`, événement
   `post_training_review_completed`, bandeau emerald.
4. **Cockpit KPI** : KPI « Suivis post-formation à compléter »
   diminue de 1 après validation.
5. **Action prioritaire** : la session validée ne montre plus
   l'action `complete_post_training_review`.
6. **Sécurité non-propriétaire** : Commercial B sur la fiche
   session A → composant affiche une erreur 403 sur GET/PUT
   (`assertCanAccessSession`).
7. **Pages publiques** : `/public/session/<token>` et
   `/public/trainer/<token>` ne mentionnent rien du suivi
   post-formation (vérifier dans le rendu serveur).
8. **`activity_logs` minimisé** : aucune ligne d'activity log ne
   contient le texte des notes formateur / retour dirigeant /
   synthèse participants — seulement les agrégats (status, score
   moyen, counts).

## 12. Sécurité — récap

- ✅ Aucune policy `to anon`.
- ✅ Routes API gated par `requireApiRole(INTERNAL_APP_ROLES)` +
  `assertCanAccessSession`.
- ✅ Service exclusivement server-only.
- ✅ Notes textuelles non loggées dans `activity_logs`
  (minimisation).
- ✅ Pages publiques inchangées.
- ✅ Pas de Gmail / Calendar / Drive / Coach Brain branché.
- ✅ Pas de formulaire public — la saisie reste 100 % interne.
