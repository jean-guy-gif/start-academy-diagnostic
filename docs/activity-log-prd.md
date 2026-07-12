# Journal d'activité interne — PRD

## 1. Objectif

Donner à l'équipe Start Academy une vue chronologique de toutes les
actions clés d'un dossier formation : quand, qui, quoi, quel statut.
Évite les "où on en est sur ce dossier ?" et matérialise un audit
trail interne. **Pas de SaaS, pas de partage hors Start Academy.**

## 2. Périmètre MVP

- Une seule table : `activity_logs` (créée par migration
  `20260530120000_add_activity_logs.sql`).
- Écriture **best-effort** : si le log échoue, l'action métier réussit
  quand même (les helpers ne lèvent jamais).
- Lecture interne uniquement : aucune policy anon, lecture réservée aux
  rôles `admin`, `commercial`, `trainer`.
- Pas d'archivage / purge automatique sur le MVP. La table est petite
  (un dossier ≈ 20-40 lignes).

## 3. Table `activity_logs`

| colonne | type | rôle |
|---|---|---|
| `id` | uuid | clé primaire |
| `session_id` | uuid (FK `training_sessions.id`, nullable) | dossier session |
| `diagnostic_id` | uuid (FK `diagnostics.id`, nullable) | diagnostic parent |
| `client_id` | uuid (FK `clients.id`, nullable) | client concerné |
| `actor_id` | uuid (FK `auth.users.id`, nullable) | user interne, null pour anon (public link) |
| `actor_name` | text | snapshot lisible (full_name ou email, ou prénom dirigeant) |
| `actor_role` | text | snapshot rôle (`admin` / `commercial` / `trainer` / null) |
| `event_type` | text | enum applicatif (cf. §4) |
| `event_label` | text | libellé FR affiché (généré par `buildActivityLabel`) |
| `event_description` | text (nullable) | détail libre (notes internes, contexte) |
| `entity_type` | text (nullable) | type d'objet visé (`public_access_token`, `session_document`…) |
| `entity_id` | text (nullable) | id de l'objet visé |
| `severity` | text | `info` / `success` / `warning` / `error` |
| `metadata` | jsonb | métadonnées sûres (cf. §6) |
| `created_at` | timestamptz | auto |

**Immutable.** Aucune policy `UPDATE` ou `DELETE` : on ne réécrit pas
l'histoire. Pour corriger une erreur, on ajoute un nouvel événement.

## 4. Liste des `event_type`

Liste fermée, déclarée dans `src/lib/activity/activity-event-types.ts`.
Toute nouvelle valeur doit être ajoutée ici **et** dans le code.

| event_type | déclenchement | sévérité par défaut |
|---|---|---|
| `diagnostic_created` | `createDiagnostic` Supabase OK | info |
| `diagnostic_completed` | `updateDiagnosticStatus` → `validated` ou `ai_analyzed` | info |
| `recommendation_generated` | `/api/analyze-training-need` succès | success |
| `proposal_generated` | `/api/generate-training-proposal` succès | success |
| `session_created` | `createTrainingSession` Supabase OK | info |
| `access_link_created` | `/api/sessions/[id]/create-access-link` | info |
| `participant_submitted` | `/api/public/submit-participant` (anon) | info |
| `document_uploaded` | `/api/public/upload-document` (anon) | info |
| `date_option_created` | `/api/sessions/[id]/date-options` POST | info |
| `date_option_selected` | `/api/public/select-date-option` (anon) | success |
| `training_support_generated` | `/api/generate-training-support` succès | success |
| `designed_support_generated` | `/api/design-training-support` succès | success |
| `support_validated` | validation manuelle (à brancher) | success |
| `support_archived` | archivage (à brancher) | warning |
| `support_quality_review_created` | 1ère écriture `PUT /api/sessions/[id]/support-quality` | info |
| `support_quality_review_updated` | update `PUT /api/sessions/[id]/support-quality` | info |
| `support_quality_validated` | passage à `status=validated` sur `PUT /api/sessions/[id]/support-quality` | success |
| `support_quality_rejected` | passage à `status=rejected` sur `PUT /api/sessions/[id]/support-quality` | warning |
| `post_training_review_created` | 1ère écriture `PUT /api/sessions/[id]/post-training-review` (pré-condition session ∈ {delivered}) | info |
| `post_training_review_updated` | update `PUT /api/sessions/[id]/post-training-review` (session ∈ {delivered}) | info |
| `post_training_review_completed` | passage à `status=completed` sur `PUT /api/sessions/[id]/post-training-review` | success |
| `post_training_review_modified_after_send` | update `PUT /api/sessions/[id]/post-training-review` **sur session en `report_sent`** — trace la divergence potentielle avec la version reçue par le client (T-8-BIS nuance 2) | info |
| `session_status_changed` | `PATCH /api/sessions/[id]/status` — transition autorisée par la machine à états `session-status-transitions.ts` (T-8). Metadata `{ from, to }`. | info |
| `note_added` | bouton UI "Ajouter une note interne" | info |

## 5. Endpoints

- `POST /api/activity/log` — écriture depuis le client navigateur
  (auth cookie). Le caller transmet un payload Zod-validé.
- `GET /api/sessions/[id]/activity?limit=30` — journal d'une session.
- `GET /api/activity/recent?limit=10` — flux global pour le cockpit.

Côté serveur (route handlers, services), on utilise directement
`createActivityLog` depuis `src/lib/activity/activity-log-service.ts`.
Côté navigateur, on passe par
`logActivityFromClient` (fire-and-forget vers `/api/activity/log`).

## 6. Politique de données — ce qu'on NE LOGGE PAS

Règle d'or : la metadata d'un log doit pouvoir être consultée par
n'importe quel admin sans risque légal ou commercial.

Interdits explicites :

- **Token brut public** ni **token_hash**. On stocke uniquement
  `entity_id` = `public_access_tokens.id`.
- **Contenu d'une CNI / RIB** ou **URL signée** d'un document.
  On garde `documentCategory`, `fileType`, `fileSize` — c'est tout.
- **Production N-1 individuelle** (chiffres d'affaires). La metadata
  des participants ne contient PAS `previousYearProduction`.
- **Contenu complet** d'un diagnostic, d'une proposition ou d'un
  support pédagogique. On stocke titre, durée, modèle LLM utilisé,
  source (`llm` / `heuristic`), counts.
- **Email exact d'un participant** dans la metadata visible aux autres
  commerciaux. On stocke prénom + nom déclaratifs (déjà visibles dans
  la fiche session).

Tout ce qui est OK :

- IDs techniques (sessionId, diagnosticId, tokenId, documentId…).
- Compteurs (nombre de modules, durée totale, count slides).
- Énumérations applicatives (accessType, format, professionalStatus).
- Source d'une génération IA (`llm` / `heuristic`) + nom de modèle.

## 7. Best-effort — JAMAIS bloquant

Tous les chemins d'écriture suivent ce contrat :

1. Try/catch silencieux. Une exception remonte `console.warn` et
   `null`, jamais d'erreur 5xx.
2. `/api/activity/log` retourne 200 même si l'insert échoue
   (`{ ok: false, code: "log_failed" }`).
3. Les routes métier appellent le log **après** persistance principale,
   avec `.catch(() => {})` final.

Conséquence : si la table `activity_logs` est cassée demain, l'app
continue de fonctionner. On a un trou dans le journal, pas un downtime
métier.

## 8. UI

- **Bloc « Journal d'activité »** dans la fiche session
  (`src/app/(app)/sessions/[id]/session-activity-journal.tsx`) :
  30 derniers événements, plus récents en haut, badge sévérité, icône
  par type, champ texte « Ajouter une note interne » → `note_added`.
- **Section « Activité récente »** dans le cockpit
  (`src/app/(app)/cockpit/page.tsx`) : 10 derniers événements tous
  dossiers, lien direct vers la session/diagnostic.

## 9. Notes internes (`note_added`)

Champ libre 500 caractères max, soumis via `/api/activity/log` avec
`eventType: "note_added"`, `eventDescription` = texte de la note. Aucune
diffusion publique : un dirigeant / collaborateur / formateur extérieur
ne voit jamais ces notes (lecture API gated par
`requireApiRole(INTERNAL_APP_ROLES)`).

## 10. Évolutions envisagées (post-MVP)

- Filtrage par `event_type` / sévérité dans l'UI fiche session.
- Export CSV pour audit annuel.
- Branchement `support_validated` / `support_archived` quand le
  workflow d'archivage des supports sera spécifié.
- TTL / archivage : pertinent uniquement si on dépasse 10k lignes par
  client.
