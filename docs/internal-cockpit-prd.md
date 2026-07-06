# Cockpit interne Start Academy — PRD

> **Cadrage produit acté le 2026-05-25** : cette plateforme n'a pas
> vocation à être vendue comme outil SaaS externe. Elle est conçue
> comme un outil INTERNE Start Academy pour gagner du temps,
> structurer les rendez-vous commerciaux, produire les propositions
> de formation et préparer les supports.
>
> Le cockpit est la page de pilotage principale pour l'équipe.

---

## 1. Objectif interne

Permettre à l'équipe Start Academy de **piloter toutes les formations
depuis une vue centrale** :

- Voir d'un coup d'œil l'état de chaque dossier (diagnostic → bilan).
- Savoir **quoi faire ensuite** sur chaque dossier — explicitement,
  sans deviner.
- Détecter les alertes système (Supabase inaccessible, OpenRouter
  manquant, catalogue vide…) avant qu'elles bloquent une démo.
- Concentrer la charge mentale du commercial / formateur sur les
  actions à valeur, pas sur la navigation entre 6 écrans.

## 2. Pourquoi ce n'est pas un SaaS externe

| Raison | Détail |
|---|---|
| **Public visé** | Équipe Start Academy (~5 personnes) — pas des dirigeants d'agences. |
| **Cycle de vente** | Le commercial reste l'interface humaine principale. L'outil l'assiste, ne le remplace pas. |
| **Posture produit** | Concentration sur **efficacité interne** : moins de gestes par dossier, plus de cohérence. Pas de freemium, pas d'onboarding marketing, pas de pricing pages. |
| **Charge opérationnelle** | Pas besoin de support client externe, pas besoin de SLA contractuels. Ressource libérée pour ce qui crée la valeur (parcours pédagogique). |
| **Confidentialité** | Pas de comparaison entre clients différents qui se croisent. Les données restent dans le périmètre Start Academy. |

→ Toute évolution doit être pensée comme **« qu'est-ce qui fait gagner
30 minutes au commercial / au formateur ? »** et non « qu'est-ce qui
attirera un nouveau client SaaS ? ».

---

## 3. Architecture cockpit

### 3.1 Route et accès

- **Route** : [/cockpit](../src/app/(app)/cockpit/page.tsx)
- **Page principale interne** : c'est désormais la page d'entrée
  par défaut après authentification (cf. §3.5 ci-dessous).
- **Auth** : `requireRole(INTERNAL_APP_ROLES)` — accessible aux 3
  rôles internes `admin`, `commercial`, `trainer`. Non connecté →
  `/login`. Rôle externe (`client_viewer` / `participant`) →
  `/forbidden`.
- **Navigation** : entrée « Cockpit » en tête de sidebar
  (icône `Compass`). L'entrée « Dashboard » a été retirée.
- **CTAs principaux** dans le header du cockpit : « Nouveau
  diagnostic » → `/diagnostics/new` et « Voir les sessions » →
  `/sessions`.

### 3.5 Cockpit = page principale interne

Depuis ce sprint, `/cockpit` est **la page d'entrée par défaut** pour
tout utilisateur interne authentifié :

- **Post-login** : [signInAction](../src/app/login/actions.ts)
  redirige vers `/cockpit` par défaut. Si un paramètre `?next=` est
  fourni et valide (chemin relatif interne, validé par
  `NEXT_PATH_PATTERN`), il est respecté — sinon fallback `/cockpit`.
- **Utilisateur déjà connecté arrivant sur `/login`** : [login/page.tsx](../src/app/login/page.tsx)
  redirige immédiatement vers `/cockpit`.
- **`/dashboard` déprécié** : [(app)/dashboard/page.tsx](../src/app/(app)/dashboard/page.tsx)
  est désormais un simple `redirect("/cockpit")` côté serveur — toute
  requête sur cette ancienne URL est immédiatement renvoyée vers le
  cockpit. Pas de boucle possible car `/cockpit` ne redirige pas.
- **Page d'accueil** ([src/app/page.tsx](../src/app/page.tsx)) : le
  CTA « Dashboard » de la nav publique a été remplacé par « Cockpit ».
- **Sidebar interne** : entrée « Dashboard » retirée — le cockpit
  est le seul point d'entrée opérationnel.

### 3.2 Composants

| Section | Source | Contenu |
|---|---|---|
| **A. Vue synthèse** | `getCockpitData().overview` | 8 cartes KPI : diagnostics en cours, propositions à finaliser, en attente validation, dates à positionner, collectes incomplètes, supports à générer, formations prêtes, total dossiers actifs. |
| **B. Pipeline formation** | `getCockpitData().pipeline` | Tableau : client, dirigeant, participants, durée, budget, reste à charge, étape, prochaine action, mise à jour. Trié par `updated_at` desc. |
| **C. Actions prioritaires** | `getCockpitData().priorityActions` | Liste « À traiter aujourd'hui » filtrée sur `nextAction.urgency === "today"`, top 20. |
| **D. Alertes** | `getCockpitData().alerts` | Bannières info/warning/error : Supabase non configuré, OpenRouter manquant, catalogue vide. |

### 3.3 Service d'agrégation

[src/lib/cockpit/cockpit-service.ts](../src/lib/cockpit/cockpit-service.ts) (`server-only`) :

- `getCockpitData()` — chargement unique, parallèle, tolérant.
- `getCockpitOverview()`, `getCockpitPipeline()`,
  `getCockpitPriorityActions()`, `getCockpitAlerts()` — façades
  publiques (toutes appellent `getCockpitData()` en interne).
- **Aucune nouvelle table créée** — agrégation depuis `training_sessions`,
  `diagnostics`, `recommendations`, `session_participants`,
  `diagnostic_participants`, `session_date_options`,
  `public_access_tokens`, `training_supports`,
  `designed_training_supports`, `training_modules`, `clients`.
- **Service role** côté serveur via `createSupabaseAdminClient()` —
  jamais exposé. Tolérance : si Supabase n'est pas configuré, le
  cockpit renvoie un payload vide + alert.

### 3.4 Types

[src/lib/cockpit/cockpit.types.ts](../src/lib/cockpit/cockpit.types.ts) :

- `CockpitStage` — 13 étapes pipeline.
- `CockpitStatus` — statut métier (façade lisible).
- `CockpitNextAction` — `{ label, href, urgency, code }`.
- `CockpitPipelineItem` — ligne pipeline complète.
- `CockpitOverview`, `CockpitPriorityAction`, `CockpitAlert`,
  `CockpitData`.

---

## 4. Logique « prochaine action »

[`computeNextActionForSession`](../src/lib/cockpit/cockpit-service.ts)
applique 12 règles séquentielles. Première règle qui matche gagne :

| # | Condition | Prochaine action | Urgence |
|---|---|---|---|
| 1 | Pas de recommendation | Générer la recommandation | today |
| 2 | Session `created` | Finaliser et envoyer la proposition | today |
| 3a | Session `awaiting_client_validation` + pas de lien dirigeant | Générer le lien dirigeant | today |
| 3b | Session `awaiting_client_validation` + lien existant | Attendre choix dirigeant | this_week |
| 4a | Session `dates_to_position` + aucun créneau `proposed` | Proposer des créneaux | today |
| 4b | Session `dates_to_position` + créneaux proposés | Attendre choix dirigeant | this_week |
| 5a | Session `dates_validated` + pas de lien collecte | Envoyer lien collaborateurs | today |
| 5b | Session `dates_validated` + lien collecte existant | Relancer collaborateurs | this_week |
| 6 | Session `collection_open` + participants < attendus | Relancer collaborateurs (N/M) | this_week |
| 7 | Session `data_collected` sans support brut | Générer support brut | today |
| 8 | Support brut existant, designé absent | Générer support designé | today |
| 9 | Support designé en `draft` | Valider le support designé | this_week |
| 10 | Session `support_ready` | Prêt pour formation (sync Calendar futur) | later |
| 11 | Session `delivered` | Préparer suivi post-formation | this_week |
| 12 | Session `report_sent` | Bilan envoyé | later |

**Diagnostic orphelin** (sans session) :
- sans recommendation → « Générer la recommandation »
- avec recommendation → « Générer la proposition »

---

## 5. Données utilisées

### Lecture (sans modification)

| Table | Usage |
|---|---|
| `training_sessions` | Base du pipeline — 1 ligne par session |
| `diagnostics` | Ajout des diagnostics orphelins sans session |
| `clients` | Nom de l'entreprise + dirigeant |
| `recommendations` | Durée totale (`total_duration_hours`) |
| `session_participants` | Count par session pour la collecte |
| `diagnostic_participants` | Estimation funding (statut + production N-1) |
| `session_date_options` | Statut des créneaux proposés / choisis |
| `public_access_tokens` | Vérifie l'existence des liens publics actifs |
| `training_supports` | Présence + statut du support brut |
| `designed_training_supports` | Présence + statut du support designé |
| `training_modules` | Count pour alerter si catalogue vide |

### Écriture

**Aucune.** Le cockpit est en lecture seule. Toutes les actions
(générer la reco, créer la session, envoyer le lien…) renvoient vers
les pages existantes qui font les écritures.

---

## 6. Garanties

| Garantie | Comment |
|---|---|
| Pas de nouvelle table | Toute l'info vient des tables existantes. |
| Pas de service_role exposé | `import "server-only"` sur le service ; les pages serveur l'appellent côté Node. |
| Tolérance données partielles | Une session sans recommendation, sans support, sans participants ne crashe pas — affiche juste l'étape adéquate avec la bonne action suivante. |
| Auth interne | `requireRole(INTERNAL_APP_ROLES)` en tête de page. Pas d'accès anon. |
| Cohérence pricing | `calculateTotalTrainingBudget` + `estimateTrainingFunding` réutilisés depuis les utilitaires centralisés. Aucune logique dupliquée. |
| Pas de modification publique | Aucune route publique modifiée. Aucune logique anti-hallucination touchée. |

---

## 7. Limites MVP

- **Pas de filtres / recherche** sur le pipeline. Si > 50 dossiers,
  la liste devient longue. À adresser quand le volume justifiera.
- **Pas de pagination** côté Supabase — limit 200 sessions + 200
  diagnostics. Suffisant pour le volume actuel ; à paginer si l'app
  dépasse ce seuil.
- **Pas de filtres par commercial / par status** — vue agrégée
  uniquement. Si plusieurs commerciaux travaillent en parallèle,
  ajouter `filter by created_by` est l'évolution naturelle.
- **Pas de notifications push / email** — l'équipe consulte le
  cockpit à la demande. Pas d'alerte temps réel encore.
- **Détection « proposition envoyée »** dérivée du SQL status — pas
  de timestamp précis "envoyée le X par Y" tant que Gmail n'est pas
  branché.
- **Cache absent** : chaque chargement de `/cockpit` requête Supabase.
  À implémenter (`React.cache` + `revalidate`) quand le volume
  l'imposera.

---

## 8. Futures évolutions

### Court terme (post-pilote)

1. **Filtre par commercial** : `pipeline.filter(it => it.commercialId === user.id)` quand plusieurs personnes éditent.
2. **Recherche client** : input + filtre client-side sur `clientName`.
3. **Tri par étape pipeline** : groupé par `stage` au lieu de date.
4. **Compteur de jours sans activité** : flagger les dossiers stagnant > 7 jours.
5. **Action "Relancer dirigeant"** : génération d'un mailto pré-rempli depuis le cockpit (pas de Gmail réel, juste mailto).

### Moyen terme (production élargie)

6. **Gmail draft** : transformer les "envoyer la proposition" en
   création de brouillon Gmail (cf. [gmail-draft-integration.md](./gmail-draft-integration.md) déjà préparée).
7. **Calendar sync** : quand un créneau est `selected`, créer un
   événement Google Calendar avec le client + formateur (cf.
   [session-date-options.md §7](./session-date-options.md)).
8. **Drive sync** : miroir des documents reçus sur le Drive de
   l'équipe Start Academy (cf. [session-documents-upload.md §8](./session-documents-upload.md)).
9. **Monitoring OpenRouter** : carte KPI « tokens consommés ce mois »
   + alerte budget.
10. **RLS hardening** : durcir par rôle/session (cf.
    [rls-hardening-plan.md](./rls-hardening-plan.md)).

### Long terme

11. **Post-formation** : nouveau bloc dans le cockpit pour le suivi
    indicateurs (mandats signés, taux d'exclusivité avant/après…).
12. **Cohorte clients** : voir l'évolution d'un client sur plusieurs
    formations dans le temps.
13. **Statistiques formateur** : par formateur, % de supports validés
    sans modification, retours dirigeant moyens.

---

## 9. Cas dégradés et tolérance

| Situation | Comportement |
|---|---|
| Supabase non configuré | Cockpit s'affiche, KPI à 0, alerte rouge « Supabase non configuré ». |
| OpenRouter non configuré | Cockpit s'affiche normalement, alerte amber « OpenRouter non configuré ». |
| Catalogue Supabase vide | Cockpit s'affiche normalement, alerte rouge « Catalogue Supabase vide ». |
| Aucun dossier en cours | KPI à 0, pipeline vide, message « Aucun dossier actif. Créer un diagnostic pour démarrer. ». |
| Session sans participants | Item pipeline visible, étape `collection_open` + action « Relancer collaborateurs (0/N) ». |
| Recommandation absente | Diagnostic orphelin visible, action « Générer la recommandation ». |
| Données incomplètes (durée null, prix null) | Cases du tableau affichent « — », pas de crash. |

---

## 10. Test et vérifications

- ✅ `npx tsc --noEmit` : 0 erreur
- ✅ `next dev` ready
- ✅ `GET /cockpit` sans cookie → 307 → `/login`
- ✅ `GET /dashboard` (sans cookie) → 1 redirect → `/cockpit` → `/login`
  (chaîne propre, pas de boucle)
- ✅ Page d'accueil publique : CTA « Dashboard » remplacé par « Cockpit »
- ✅ Sidebar interne : « Dashboard » retiré, « Cockpit » en tête
- ✅ `signInAction` redirige vers `/cockpit` par défaut, respecte
  `?next=` valide
- ✅ Utilisateur déjà connecté sur `/login` → redirige `/cockpit`
- ✅ Cockpit affiche CTAs « Nouveau diagnostic » + « Voir les sessions »
- ✅ Routes publiques inchangées (`/login`, `/`, `/public/session/*`)
- ✅ Routes IA toujours protégées (401)
- ✅ Aucune nouvelle table créée — vérifier `git status` côté
  `supabase/migrations/` ne montre pas de nouveau fichier

---

## Annexe — liens utiles

- [Pack pilote](./pack-pilote-start-academy.md)
- [Pilote Azur Patrimoine](./pilote-azur-patrimoine.md)
- [RLS hardening plan](./rls-hardening-plan.md) — à appliquer post-pilote
- [Gmail draft integration plan](./gmail-draft-integration.md) — évolution court terme
- [Session date options](./session-date-options.md) — Calendar à venir
- [Session documents upload](./session-documents-upload.md) — Drive à venir
