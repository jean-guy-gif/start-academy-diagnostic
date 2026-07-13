# Backlog post-stabilisation

**Date de consolidation** : 2026-07-12
**Origine** : capture unique des items identifiés pendant le sprint
stabilisation preprod (§4 smoke fonctionnel, §5 smoke sécurité, §7 restore
test, §8 audit Storage) mais non traités dans ce sprint.

## Objectif

Éviter la dispersion. Ce document est **la** source unique pour :
- décider ce qui bloque l'ouverture du pilote,
- décider ce qui peut attendre le retour du pilote,
- prioriser les prochains chantiers de construction post-stabilisation.

Il **référence** les tickets existants (registre §11.2 de
`docs/preprod-stabilization-plan.md`) sans les redéfinir, et **spécifie**
uniquement les items produit qui n'ont pas encore de ticket.

## Format

Chaque item se lit sur 3 dimensions :

- **Nature** : produit / dette technique / sécurité-infra.
- **Priorité** : P0 (bloquant pilote) → P3 (opportuniste).
- **Statut pilote** : **BLOQUANT** (doit être fait avant l'ouverture) ou
  **POST-PILOTE** (peut attendre le retour terrain).

---

## Section 1 — Backlog produit

### 1.1 Proposition commerciale v2 — premier chantier post-stabilisation

- **Nature** : produit.
- **Priorité** : P1 (haute — premier chantier de construction dès
  ouverture pilote effectuée).
- **Statut pilote** : **POST-PILOTE**.
- **PRD dédié** : [`docs/proposition-commerciale-v2-prd.md`](proposition-commerciale-v2-prd.md).

Refonte de la proposition commerciale livrée au client, articulée en
8 blocs (manifeste + bios formateurs + preuve sociale Google + arguments
différenciants + FAQ/simulateur + charte graphique + pack communication
dirigeant + présentation tarifaire). Objectif produit : passer d'un
export PDF minimaliste à un livrable **qui fait signer** — ancrage
humain, preuve sociale, cadre Qualiopi + ALUR, forfait tout compris.

**Ligne rouge** : les heures affichées dans la proposition = les heures
réellement dispensées et déclarées dans les documents administratifs
(feuilles de présence Qualiopi, dossier AGEFICE / OPCO / FIF-PL).
Impossible d'écrire « 4 h » côté proposition et « 3 h 30 » côté
administratif — cette contrainte prime sur toute considération de
marketing ou d'arrondi.

**Dépendances** :
- Migration additive `funding_config` pour rendre le tarif (336 € / demi-
  journée / 4 h / AGEFICE 100 % visée) **paramétrable** — jamais en dur.
- Assets brand committés : cf. `docs/brand/` (fait dans ce même commit).

### 1.2 [Placeholder] — Prochains chantiers produit

À compléter au retour du pilote. Candidats déjà pressentis mais non
détaillés ici : connecteur Google Business Profile (bloc 3 v2 de la
proposition), signature électronique, dashboard client post-formation.

---

## Section 2 — Dettes techniques

Références §11.2 du registre de stabilisation
[`docs/preprod-stabilization-plan.md`](preprod-stabilization-plan.md).
Aucune redéfinition ici — seulement le statut pilote et la priorité.

### 2.1 T-7 — Catch silencieux dans les services de persistance

- **Nature** : dette technique (observabilité).
- **Priorité** : P2 (moyenne — améliore le temps de diagnostic sans
  bloquer un usage).
- **Statut pilote** : **POST-PILOTE**.
- **Origine** : §11.2 T-7 (registre existant).

Les services de persistance (`support-quality-service.ts`,
`training-support-service.ts`, `designed-support-service.ts`, à auditer
aussi les autres) avalent les erreurs Supabase avec `catch { return null; }`.
Le code Postgres (23514, 23503, 23505…) n'est pas remonté dans les logs.
Cascade type T-4→T-5 très longue à diagnostiquer sans trace SQL.

### 2.2 T-8 — Pas d'action UI pour transition de statut session

- **Nature** : dette produit (workflow interne).
- **Priorité** : ~~P0 conditionnel~~ — livré.
- **Statut pilote** : **✅ Résolu (PR #17), vérifié manuellement 2026-07-12**.
- **Origine** : §11.2 T-8.

Livré par PR #17 (2026-07-12) sous forme d'une machine à états
`session-status-transitions.ts` (source unique, 9 AVANT + 7 RETOUR = 16
arêtes verrouillées par contract test), d'une route
`PATCH /api/sessions/[id]/status` alignée sur le pattern `support-quality`,
et d'un bloc UI dans la fiche session (bouton « Passer à l'étape
suivante » + dropdown « Changer manuellement » + confirmation modale
sur `delivered` / `report_sent`). Cascade **T-8-BIS** livrée dans la
même PR : `GET/PUT /api/sessions/[id]/post-training-review` refuse
désormais toute saisie sur une session hors `{delivered, report_sent}`
avec 409 `session_status_precondition`, et trace la divergence via
l'event dédié `post_training_review_modified_after_send` sur
`report_sent`.

**Vérification manuelle 2026-07-12** :
- Avancement de statut via l'UI sur la fiche session, sans passer par
  SQL éditeur.
- Garde T-8-BIS confirmée : bilan post-formation refusé (409) sur une
  session en `created` avec message explicite ; accepté sur `delivered`.
- Transitions interdites absentes du dropdown « Changer manuellement »
  (la matrice est bien la source de vérité côté client aussi).
- Confirmation modale renforcée déclenchée sur transition vers
  `delivered` et `report_sent`, non déclenchée sur les autres.

Canal hotfix inchangé : `UPDATE public.training_sessions SET status =
'…' WHERE id = '…'` en SQL éditeur, délibérément inconfortable — admin
n'a aucun override applicatif.

### 2.3 T-12 / T-13 / T-14 — Améliorations script restore `§7`

- **Nature** : dette technique (outillage backup/restore).
- **Priorité** : P3 (opportuniste — le script tourne, ces items le
  rendent plus ergonomique et plus sûr).
- **Statut pilote** : **POST-PILOTE**.
- **Origine** : §11.2 T-12 / T-13 / T-14.

- **T-12** : rendre le script rejouable d'un coup après un échec au
  milieu (`--reset-target` optionnel qui joue `truncate auth.users
  cascade` + `drop/create schema public` avant la garde B).
- **T-13** : Session pooler IPv4 documenté dans le header du script (déjà
  résolu dans PR #14). Rappel dans le backlog pour traçabilité.
- **T-14** : mot de passe DB visible dans `ps auxww` pendant `docker
  run`. Refactor optionnel : décomposer `RESTORE_DB_URL` en `PGHOST` /
  `PGUSER` / `PGDATABASE` / `PGPASSWORD` et passer `PGPASSWORD` via
  variable env conteneur.

### 2.4 F-2 / B-1 — Route DELETE document admin-only

- **Nature** : dette produit (workflow RGPD).
- **Priorité** : P2 (moyenne — la procédure manuelle du runbook §8
  couvre le besoin RGPD à faible volume).
- **Statut pilote** : **POST-PILOTE**.
- **Origine** : §11.2 T-16 (finding F-2, canal RGPD documenté) + §11.5 B-1
  (spec de la route DELETE).

Aucune route DELETE de document exposée dans l'app. Le droit à
l'effacement RGPD passe aujourd'hui par la procédure manuelle du runbook
§8 (dashboard Supabase, ordre blob AVANT ligne DB). À implémenter
lorsque le volume de demandes justifie une route dédiée (> 1 demande /
semaine).

---

## Section 3 — Sécurité / infra avant ouverture pilote

Items qui gèrent le risque de posture avant d'exposer le produit à un
utilisateur externe. Le curseur ici bascule facilement en BLOQUANT.

### 3.1 CI Vercel rouge chronique

- **Nature** : sécurité / infra (posture).
- **Priorité** : ~~P0~~ — levé.
- **Statut pilote** : **✅ Résolu (PR #19), Vercel Preview vert confirmé 2026-07-12**.
- **Origine** : constat récurrent PRs #10 à #17 (registre technique
  interne). Vercel deployment preview retournait `fail` de façon
  systématique alors que la CI GitHub Actions `typecheck + test + build`
  passait.

**Diagnostic** : le preview environment Vercel n'a pas les env vars
serveur (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, …)
provisionnées. Next.js tentait de prerender toutes les pages du
sous-arbre `(app)/` et crashait sur `settings/modules/page.tsx` →
`getTrainingModules` → `createSupabaseAdminClient` qui exigeait la clé
service_role au build time. Les 13 autres pages `(app)/` échappaient au
crash uniquement parce qu'elles déléguent au client — accident
architectural qui aurait cassé dès qu'une nouvelle page serveur y
serait ajoutée.

**Fix Option B validée** : `export const dynamic = "force-dynamic"`
posé UNE fois sur `src/app/(app)/layout.tsx` (PR #19). Motif : toutes
les pages sous `(app)/` sont derrière l'auth gate (cookies via
`requireRole`), donc dynamiques par nature — aucune n'a de sens
statique. La contrainte au niveau layout couvre le sous-arbre entier
sans risque d'oubli sur les futures pages. Nettoyage au passage du
`force-dynamic` local devenu redondant dans `cockpit/page.tsx`.

**Preuve de propagation Next.js 16.2** (`npm run build` local) : les 14
pages `(app)/` sont désormais toutes marquées `ƒ (Dynamic)`, y compris
`/settings/modules` qui crashait. La seule page statique restante est
`/forbidden` (hors sous-arbre `(app)/`, cohérent). **PR #19 est la
première PR avec un check Vercel VERT depuis la mémoire du projet.**

### 3.2 §9 rotation `SUPABASE_SERVICE_ROLE_KEY`

- **Nature** : sécurité (hygiène de clé).
- **Priorité** : ~~P0~~ — levé.
- **Statut pilote** : **✅ Résolu 2026-07-12**.
- **Origine** : `preprod-stabilization-plan.md` §9.
- **Registre d'exécution** : [`docs/security-rotation-log.md`](security-rotation-log.md) entrée du 2026-07-12.

Motif consigné : la clé a transité pendant les manipulations §5 (smoke
sécurité), §7 (restore test), §8 (audit Storage), et un incident
`vercel link` qui a écrasé `.env.local` (reconstruit depuis Timeline
VS Code). Rotation préventive comme dernier geste avant ouverture
pilote. Inventaire confirmé avant Roll : la clé n'existait qu'à **un
seul endroit stockable** (`.env.local`) — Vercel n'a aucune env var
provisionnée (`vercel env ls` vide), GitHub Actions utilise un
placeholder littéral. Séquence exécutée en < 5 min sans fenêtre de
préprod down publique (rotation locale). Checklist §9.6 verte : cockpit
charge avec la nouvelle clé, ancienne clé révoquée par Supabase.

### 3.3 Env vars Vercel — chantier ouvert quand pilote sur URL publique

- **Nature** : infra (préparation déploiement public).
- **Priorité** : ~~P1~~ — levé.
- **Statut pilote** : **✅ Résolu 2026-07-12**.
- **Origine** : découvert pendant le pré-audit §9 (2026-07-12).

Provisionnement terminé le 2026-07-12 via dashboard Vercel :
**9 env vars** désormais présentes sur Vercel (Production, Preview,
Development), incluant les 8 initialement identifiées + la nouvelle
`NEXT_PUBLIC_APP_URL` livrée par PR #23 :

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY` (valeur post-rotation §9)
4. `NEXT_PUBLIC_APP_URL` = `https://start-academy-diagnostic.vercel.app`
   (Production + Preview), `http://localhost:3000` (Development)
5. `OPENROUTER_API_KEY`
6. `OPENROUTER_SITE_URL`
7. `OPENROUTER_MODEL`
8. `OPENROUTER_MAX_TOKENS`
9. `AI_MONTHLY_BUDGET_EUR` (+ `AI_MONTHLY_WARNING_THRESHOLD_PERCENT`
   si nécessaire pour l'alerte cockpit)

Redéploiement sans cache effectué post-provisionnement.

**Vérification 2026-07-12** : un lien dirigeant généré depuis la prod
pointe vers l'URL stable `https://start-academy-diagnostic.vercel.app/public/session/…`
au lieu de l'URL de déploiement instable, y compris quand la
génération part depuis une URL de déploiement instable (le fix PR #23
`absoluteAppUrl()` côté serveur enlève toute dépendance à
`window.location.origin` client).

**Effet net** : l'app est désormais **pleinement opérationnelle en
ligne** — cockpit, routes publiques tokenisées, routes IA, upload
document + signed URL, toutes fonctionnelles depuis
`https://start-academy-diagnostic.vercel.app`. Le pilote peut être
ouvert en mode `UP` (URL publique) sans bloquant technique
supplémentaire.

**Corollaire** (trace inchangée) : la prochaine rotation
`SUPABASE_SERVICE_ROLE_KEY` devra couvrir `.env.local` **ET** Vercel
env vars en parallèle (retour au plan initial 2 endroits), désormais
que Vercel est configuré. Le log `security-rotation-log.md §Leçons`
trace cette dépendance.

---

## Synthèse — Bloquant pilote vs post-pilote

**🎯 Aucun bloquant pilote restant** au 2026-07-12. Les quatre §3.1 /
§3.2 / §3.3 / T-8 ont été résolus dans la journée (PR #17, #19, #23,
rotation clé, provisionnement Vercel). **L'app est pleinement
opérationnelle en ligne** sur `https://start-academy-diagnostic.vercel.app`
— le pilote peut désormais être ouvert en mode URL publique (`UP`) sans
réserve technique.

| # | Item | Nature | Priorité | Statut pilote |
|---|---|---|:---:|:---:|
| 3.3 | ~~Env vars Vercel~~ | Infra | ~~P1~~ | ✅ Résolu 2026-07-12 |
| 3.2 | ~~§9 rotation `SUPABASE_SERVICE_ROLE_KEY`~~ | Sécurité | ~~P0~~ | ✅ Résolu 2026-07-12 |
| 3.1 | ~~CI Vercel rouge chronique~~ | Sécurité / infra | ~~P0~~ | ✅ Résolu (PR #19) |
| 2.2 | ~~T-8 — action UI transition statut session~~ | Dette produit | ~~P0 conditionnel~~ | ✅ Résolu (PR #17) |
| 1.1 | Proposition commerciale v2 | Produit | P1 | POST-PILOTE |
| 2.1 | T-7 — catch silencieux services | Dette technique | P2 | POST-PILOTE |
| 2.4 | F-2 / B-1 — route DELETE document | Dette produit | P2 | POST-PILOTE |
| 2.3 | T-12 / T-13 / T-14 — améliorations script restore | Dette technique | P3 | POST-PILOTE |
| 1.2 | Prochains chantiers produit | Produit | à définir | POST-PILOTE |

## Règle de tri

Un item peut basculer de **POST-PILOTE** vers **BLOQUANT** si :
- le pilote découvre un usage qui l'exige (ex : T-8 si parcours complet),
- un incident sécurité l'expose (ex : F-2 si volume RGPD élevé),
- une contrainte externe l'impose (ex : audit Qualiopi programmé avant
  ouverture pilote).

Dans ce cas, mettre à jour ce document **et** le §11.2 du plan de
stabilisation dans la même PR, pour éviter la dispersion (leçon du
sprint stabilisation : les listes dupliquées silencieusement dérivent —
cf. T-3 / T-4 / F-1).
