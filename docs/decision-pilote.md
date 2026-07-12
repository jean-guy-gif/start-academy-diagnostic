# Décision d'ouverture du pilote

**Date de rédaction** : 2026-07-12
**Décideur** : Laurent
**Statut du document** : brouillon en attente de validation Laurent
sur les points marqués `[À TRANCHER]`.

---

## 1. État de préparation — ce qui a été prouvé

Récapitulatif des livrables du sprint stabilisation preprod (§4 à §9 de
`docs/preprod-stabilization-plan.md`). Chaque ligne renvoie à la preuve
datée dans le registre correspondant.

| # | Point prouvé | Preuve | Référence |
|---|---|---|---|
| P-1 | **Parcours end-to-end fonctionnel** — un commercial peut dérouler diagnostic → recommandation → session → collecte → support → formation → bilan sans SQL manuel | Smoke §4 complet joué 2026-07-08 (22 étapes), + T-8 résolu par PR #17 (transition UI de statut, incluant `→ delivered`) | `preprod-stabilization-plan.md §4` + §13.1.1 registre smoke + §11.2 T-8 |
| P-2 | **Sécurité cross-commercial étanche** — Commercial B ne voit ni ne modifie les dossiers de Commercial A | Smoke §5 : 29 ✅ / 0 ❌ / 9 n/a. 3 fuites majeures colmatées : T-9 (diagnostics/*), T-10c-BIS (`event_description` dans activity/recent), T-11 (cockpit non cloisonné) | `preprod-stabilization-plan.md §5 CLOS 2026-07-12` + §11.2 T-9/T-10c-BIS/T-11 + PR #9/#10/#11 |
| P-3 | **Doctrine `service_role` établie** — tout appel `createSupabaseAdminClient()` doit être accompagné d'un des trois garde-fous | Ajout §7 « Règle service_role » de `docs/rls-hardening-plan.md` + application sur toutes les routes durcies | `docs/rls-hardening-plan.md §7` + PR #12 |
| P-4 | **Backup préprod prouvé utile de bout en bout** — un document backupé est réellement restaurable, SHA-256 identique | Test restauration §7 joué 2026-07-12 sur projet Supabase test isolé : 33/33 critères verts, PDF téléchargé via signed URL SHA-256 identique au backup | `docs/restore-test-log.md` entrée 2026-07-12 + §7 CLOS |
| P-5 | **Cohérence Storage ↔ DB** — pas d'orphelin blob, pas de row sans blob | Audit §8.1 orphelins tranché à 0 sur 4 fichiers (1:1 parfait dans les 2 sens) | `preprod-stabilization-plan.md §8 CLOS 2026-07-12` |
| P-6 | **Bucket privé + policies fermées + signed URL 60s + whitelist MIME + taille max + `getPublicUrl` interdit** | Checklist §8.1 8/8 verts + 4/4 tests négatifs upload OK (`.exe` 400, > 10 Mo 400, sans token 400, token invalide 403) | `preprod-stabilization-plan.md §8` |
| P-7 | **Defense-in-depth Storage** — `file_size_limit` + `allowed_mime_types` posés au niveau bucket Supabase, alignés strict sur `document-types.ts`, test de contrat fail-si-divergence | Migration `20260712140000_extend_bucket_session_documents_limits.sql` + `mime-whitelist.contract.test.ts` | `preprod-stabilization-plan.md §11.2 T-15` + PR #15 |
| P-8 | **Canal RGPD droit à l'effacement documenté** — pas de route DELETE exposée (choix sûr), procédure manuelle admin dans le runbook | `operations-runbook.md §8` mis à jour avec encadré F-2 (ordre impératif blob AVANT ligne DB) | `preprod-stabilization-plan.md §11.2 T-16` + `operations-runbook.md §8` |
| P-9 | **Machine à états de statut session** — transitions autorisées verrouillées par contract test, garde `support_ready → delivered` exige support validé, T-8-BIS refuse bilan sur session en `created`, event distinct sur `report_sent` | Suite tests 95/95 verte dont 22 nouveaux (7 matrice + 6 route + 9 T-8-BIS), vérification manuelle 2026-07-12 | `preprod-stabilization-plan.md §11.2 T-8` + `docs/backlog-post-stabilisation.md §2.2` + PR #17 |
| P-10 | **CI Vercel Preview verte** — `force-dynamic` sur le layout `(app)/` empêche Next.js de tenter un prerender au build sans env vars serveur | PR #19 = première PR avec check Vercel VERT depuis mémoire projet. Confirmé sur PR #20 et #21. | `docs/backlog-post-stabilisation.md §3.1 résolu` + PR #19 |
| P-11 | **Clé `SUPABASE_SERVICE_ROLE_KEY` rotée** — dernier geste avant ouverture. Ancienne clé révoquée par Supabase, nouvelle clé mise à jour dans le seul endroit stockable (`.env.local`), cockpit charge OK | `docs/security-rotation-log.md` entrée 2026-07-12. Inventaire pré-Roll confirmé : `.env.local` seul endroit, Vercel env vars vides, GHA placeholder. | `docs/security-rotation-log.md` + `docs/backlog-post-stabilisation.md §3.2 résolu` |
| P-12 | **Aucun bloquant pilote restant au registre** | Tableau de synthèse `backlog-post-stabilisation.md` — les 3 P0 (§3.1, §3.2, T-8) tous rayés | `docs/backlog-post-stabilisation.md` |

---

## 2. Périmètre du pilote — `[À TRANCHER]`

### 2.1 Nombre de cabinets pilotes

| Option | Description | Implications |
|---|---|---|
| A — 1 cabinet | Un seul cabinet, entièrement piloté par Laurent en direct | Retour terrain riche par cabinet, cadence de test rapide, incidents isolés faciles à diagnostiquer. Un seul point de vue métier — risque de biais sur les évolutions produit. |
| B — 2 cabinets | Un cabinet « facile » (typologie proche de ce qu'on maîtrise) + un cabinet « limite » (typologie plus atypique — indépendant seul, ou équipe > 10, ou spécialité inhabituelle) | Diversité de retours. Charge d'accompagnement doublée. Meilleure couverture des cas d'usage. |
| C — 3 cabinets ou plus | Panel plus large | Représentativité plus forte, mais dilue l'attention. Risque de découvrir un même bug 3 fois avant de le corriger. Généralement déconseillé en phase pilote initial. |

`[À TRANCHER par Laurent]` — recommandation à formuler par toi.

### 2.2 Qui sont les cabinets ?

Non déterminable à partir des documents du repo. `[À REMPLIR par Laurent]`
avec :
- Nom / raison sociale
- Typologie (agence indé taille N, groupe multi-agences, etc.)
- Contact référent
- Motivation à participer (curiosité, besoin réel de formation, obligation
  ALUR, autre)
- Consentement écrit à participer à un pilote (à mettre en place —
  document type « pilote conditionne partagé »)

### 2.3 Périmètre fonctionnel du pilote

| Option | Description | Implications |
|---|---|---|
| P — Parcours complet | Diagnostic → recommandation → session → collecte → **formation dispensée** → bilan post-formation | Exige que T-8 fonctionne (livré, PR #17). Pilote « long » : plusieurs semaines entre diagnostic et bilan. Retour métier riche mais lent. |
| M — Parcours partiel amont | Diagnostic → recommandation → session → **arrêt à la validation pédagogique** (pas de formation réellement dispensée dans le cadre du pilote) | Pilote « court » : quelques jours. Focus sur le diagnostic + la proposition. La formation reste hors scope du test système. Retour métier plus léger mais rapide. |
| PL — Parcours partiel aval | Import de sessions existantes (formations Laurent déjà planifiées) → collecte + support + bilan post-formation | Reprend un déroulé métier déjà en cours. Suppose une import manuelle des sessions existantes. Teste principalement la partie « pédagogique + suivi », pas le diagnostic commercial. |

`[À TRANCHER par Laurent]` — recommandation à formuler par toi selon la
disponibilité des cabinets et la fenêtre temporelle acceptable.

---

## 3. Conditions techniques d'ouverture — `[À TRANCHER]`

### 3.1 Où le pilote consulte-t-il l'app ?

| Option | Description | Implications techniques |
|---|---|---|
| DL — Démo accompagnée sur ta machine (`npm run dev` sur `localhost:3000`) | Le cabinet vient te voir (physique) ou tu partages ton écran (visio). Tu pilotes, ils commentent. | ✅ Aucun bloquant supplémentaire. `.env.local` a la nouvelle clé rotée. Aucune exposition externe. Sécurité maximale, contrôle maximal.<br>❌ Pas d'usage autonome par le cabinet — pas de retour terrain sur la friction d'un usage réel non-accompagné. |
| UP — URL publique Vercel (`https://start-academy-diagnostic.vercel.app` ou domaine custom) | Le cabinet reçoit un lien, se connecte de chez lui, dérouler tout seul. Tu observes à distance via les logs / activity_logs / cockpit. | ✅ Usage autonome, retour terrain plus authentique.<br>❌ **§3.3 backlog devient BLOQUANT** — les env vars Vercel doivent être provisionnées avant ouverture. Aucune n'est présente actuellement (`vercel env ls` → « No Environment Variables found »). Toute route serveur qui appelle `createSupabaseAdminClient()` failfast en runtime. À faire avant : provisionner les 5-8 vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (déjà rotée), `OPENROUTER_API_KEY`, `OPENROUTER_SITE_URL`, `AI_MONTHLY_BUDGET_EUR`) dans les 3 environments Vercel (Production, Preview, Development), redéployer, checklist post-rotation type §9.6 sur l'URL publique. |
| Hybrid — DL en démo initiale, UP en usage autonome ensuite | Session de lancement en direct (option DL), puis bascule sur URL publique pour l'usage courant | Cumule les préparatifs des deux options. `§3.3` reste bloquant pour la bascule. |

`[À TRANCHER par Laurent]` — choix à faire.

### 3.2 Impact sur le calendrier

Si `UP` ou `Hybrid` retenu :
- Chantier §3.3 devient BLOQUANT.
- Estimation ~1-2h pour provisionner les env vars + redéployer + checklist
  post-rotation.
- Nouveau ticket à ouvrir dans `backlog-post-stabilisation.md §3.3` avec
  statut BLOQUANT le temps du chantier.

Si `DL` retenu :
- Aucun bloquant technique restant.
- Le pilote peut démarrer immédiatement.

### 3.3 Authentification côté cabinet

Point implicite mais important : le cabinet a-t-il besoin d'un compte
dédié dans le système ?

| Option | Description | Implications |
|---|---|---|
| Sh — Compte partagé « pilote » | Un compte `pilote-<cabinet>@start-academy.fr` créé pour le cabinet | Simple à mettre en place. Attention aux traces `actor_id` : tout ce que fait le cabinet est attribué au même profil. |
| Ac — Comptes nominatifs | Un compte par personne du cabinet (dirigeant + éventuels commerciaux) | Retour d'activité plus fin, meilleure séparation. Plus de mise en place. |
| No — Pas de compte cabinet, uniquement liens publics tokenisés | Le cabinet ne se connecte jamais à l'app interne — reçoit uniquement les liens dirigeant / participants / formateur générés depuis les sessions de Laurent | Modèle actuel. Le cabinet n'entre pas dans l'app, seulement dans les flux publics. **C'est probablement le modèle réel du pilote**. À confirmer. |

`[À TRANCHER par Laurent]` — mais on suspecte fortement `No`.

---

## 4. Ce qu'on surveille pendant le pilote

### 4.1 Signaux à monitorer

**Techniques** :

| Signal | Source | Seuil d'alerte suggéré |
|---|---|---|
| Erreurs serveur | `vercel logs` (si UP) OU logs terminal `npm run dev` (si DL) | Toute erreur 500 sur route API, ou log `SUPABASE_SERVICE_ROLE_KEY manquante` |
| Erreurs client visibles | Retour utilisateur direct + activity_logs `severity=error` | Toute anomalie remontée par un utilisateur |
| Budget IA consommé | `getAiMonthlyBudgetStatus()` visible dans le cockpit admin | > 80 % du seuil `AI_MONTHLY_BUDGET_EUR` = alerte, 100 % = arrêt IA |
| Volume de générations IA anormal | `ai_generation_logs` count sur fenêtre glissante | À définir en fonction du volume normal observé les premiers jours |
| Cohérence Storage ↔ DB | Script `scripts/security-smoke.mjs` OU query MCP ad hoc | Toute divergence non-attendue (orphelins > 0 dans un sens ou l'autre) |
| Erreurs de transition de statut | activity_logs `event_type=session_status_changed` incohérentes ou 409 fréquents | > 3 refus consécutifs sur le même statut source ↔ retravailler la matrice |

**Métier** :

| Signal | Source | Seuil d'alerte suggéré |
|---|---|---|
| Documents uploadés non pertinents | Revue manuelle dans le cockpit admin | Détecter tôt un mauvais usage du bucket (dépasse la whitelist, révèle un besoin de catégorie manquante) |
| Notes internes dérivantes | activity_logs `event_type=note_added` (via journal détaillé session) | Notes contenant PII non-nécessaire, hors sujet, etc. |
| Bilans post-formation en mode « divergence » (T-8-BIS nuance 2) | activity_logs `event_type=post_training_review_modified_after_send` | Toute occurrence à investiguer (bilan modifié après envoi client) |
| Feedback qualitatif | Retour direct Laurent ↔ cabinet | Quotidien pendant la 1ère semaine |

### 4.2 Fréquence de contrôle — `[À TRANCHER]`

| Option | Cadence | Implications |
|---|---|---|
| Q — Quotidienne | Check logs + cockpit chaque matin | Charge accompagnement ~15-30 min / jour. Rassurant. |
| B — Bi-hebdomadaire | Check lundi + jeudi | Plus léger. Un incident du mardi n'est vu que le jeudi — acceptable si aucun 500 remonté par l'utilisateur entre les deux. |
| E — Sur événement uniquement | Contrôle déclenché uniquement si un utilisateur remonte quelque chose | Le moins de charge. Suppose que les utilisateurs savent et osent remonter. Risque de dérive silencieuse (usage en dehors du champ, mais sans crash). |

`[À TRANCHER par Laurent]`. Recommandation à formuler par toi selon
combien de temps tu peux dédier à l'observation active.

---

## 5. Critères d'arrêt / de succès

### 5.1 Suspension du pilote — critères techniques

Le pilote **doit être suspendu** si l'un des critères suivants est
atteint :

- **Fuite de sécurité** — un utilisateur voit ou modifie une donnée qui
  ne lui appartient pas. Exemples : régression T-9/T-10c-BIS/T-11, ou
  un token public qui révèle une donnée hors périmètre. **Suspension
  immédiate**, notification cabinet, correctif avant reprise.
- **Perte de données** — un document uploadé disparaît, un diagnostic
  saisi n'est plus retrouvé. **Suspension immédiate**, exécution
  `scripts/restore-test.sh` sur le dernier backup pour vérifier
  l'intégrité et récupérer si nécessaire, incident consigné dans un
  nouveau registre `docs/incident-log.md` à créer.
- **Budget IA dépassé** — `AI_MONTHLY_BUDGET_EUR` atteint alors que le
  mois n'est pas fini. **Arrêt automatique** des routes IA (mécanisme
  déjà en place via `getAiMonthlyBudgetStatus()`). Le pilote peut
  continuer sans IA (fallback heuristique) — non-suspension mais
  contrainte tracée.
- **Indisponibilité prolongée** — > 24 h de service dégradé (500
  systématiques ou impossible d'accéder au cockpit). Suspension le
  temps de diagnostiquer.

### 5.2 Suspension du pilote — critères métier

Le pilote **peut être suspendu** (décision Laurent) si :

- Le cabinet exprime une friction bloquante qu'il n'accepte pas de
  contourner pendant la durée du pilote (ex : « impossible de
  supprimer un document, on ne peut pas continuer sans » → F-2 devient
  BLOQUANT rétroactivement).
- Un besoin métier majeur non prévu émerge, qui exige de recadrer le
  scope avant de continuer.

### 5.3 Passage à l'échelle — critères de succès

Le pilote **passe à l'échelle** si :

- **Aucun incident sécurité** pendant toute la durée du pilote.
- **Au moins un parcours complet** (diagnostic → bilan post-formation)
  déroulé avec succès, si `P` retenu comme périmètre (§2.3).
- **Retour cabinet positif** sur le fond (« la valeur métier est là »).
  Un retour tiède ou négatif = « pilote clôturé, retour à la table de
  conception ».
- **Aucun dérapage budget IA** — la consommation reste dans le seuil
  défini.
- **Aucune régression détectée** sur les 3 fuites colmatées §5 (T-9,
  T-10c-BIS, T-11) — vérifiable en jouant `scripts/security-smoke.mjs`
  en fin de pilote.
- Nombre de tickets ouverts en cours de pilote (bugs, demandes
  d'évolution) < seuil `[À TRANCHER]` — au-delà, on passe par une
  itération produit avant d'ouvrir au suivant.

`[À TRANCHER par Laurent]` — seuils précis pour les critères
quantitatifs (durée du pilote, seuil de tickets).

---

## 6. Risques résiduels connus et acceptables pour un pilote contrôlé

Ce qui reste au backlog `docs/backlog-post-stabilisation.md` en statut
POST-PILOTE est acceptable **dans le contexte d'un pilote accompagné et
contrôlé** parce que :

| Item | Nature du risque | Pourquoi acceptable pendant le pilote | Devient inacceptable si |
|---|---|---|---|
| T-7 — catch silencieux services de persistance | Un cascade d'erreur SQL peut être plus longue à diagnostiquer sans trace `console.warn` explicite | Laurent surveille les logs en direct → repère un pattern étrange rapidement, même sans warn structuré | Passage à l'échelle multi-utilisateurs sans supervision quotidienne |
| F-2 / B-1 — pas de route DELETE document admin-only | Un opérateur ne peut pas supprimer un document depuis l'app en cas d'erreur d'upload légitime | Procédure manuelle documentée `operations-runbook.md §8`, canal RGPD tracé | Volume de demandes RGPD > 1/semaine, ou incident de type upload erroné fréquent |
| T-12 / T-14 — améliorations script restore | Le script `restore-test.sh` n'est pas rejouable en une passe après un échec ; mot de passe visible dans `ps` pendant `docker run` | Le script n'est joué qu'en cas de test de restauration périodique — bas volume, pas critique. Test manuel documenté dans `restore-test-log.md`. | Le script devrait tourner en CI/cron ou sur machine partagée |
| §3.3 — Vercel env vars non provisionnées | Le déploiement Vercel est fonctionnellement cassé côté runtime | Aucun impact si pilote en mode `DL` (démo accompagnée locale). Si `UP` retenu → devient BLOQUANT, cf. §3.1 ci-dessus. | Choix `UP` ou `Hybrid` en §3 |
| §1.1 — Proposition commerciale v2 | Le PDF export actuel est minimaliste (pas de bios formateurs, pas d'avis Google, pas de charte 100 % appliquée) | Pour un pilote, Laurent peut compléter à la main la proposition avant envoi — la valeur du pilote n'est pas le PDF final mais la valeur métier | Le pilote demande une proposition commerciale « clé en main » pour signer, ou plusieurs cabinets exigent le livrable |

### Ligne rouge conformité (rappel)

Cf. `docs/proposition-commerciale-v2-prd.md` — **les heures affichées
dans une proposition doivent correspondre exactement aux heures
déclarées dans les documents administratifs (feuilles de présence
Qualiopi, dossier AGEFICE/OPCO/FIF-PL)**. Cette règle prime sur toute
considération de marketing ou d'arrondi, y compris pendant le pilote.
Pas de « 4 h côté proposition, 3 h 30 côté administratif ».

---

## 7. Décision d'ouverture

Cette section est laissée à Laurent, à remplir une fois les points
`[À TRANCHER]` ci-dessus résolus :

- **Date d'ouverture pilote** : `[À FIXER]`
- **Durée prévue** : `[À FIXER]` (recommandation : 4 à 8 semaines si `P`
  parcours complet ; 2 à 3 semaines si `M` parcours partiel amont)
- **Périmètre retenu** : `[cf. §2]`
- **Conditions techniques retenues** : `[cf. §3]`
- **Cadence de contrôle retenue** : `[cf. §4.2]`
- **Signataire côté Start Academy** : Laurent
- **Signataires côté cabinets pilotes** : `[À REMPLIR après §2.2]`

---

## 8. Références

- `docs/preprod-stabilization-plan.md` (plan de stabilisation preprod)
- `docs/backlog-post-stabilisation.md` (backlog consolidé post-sprint)
- `docs/operations-runbook.md` (procédures d'ops)
- `docs/restore-test-log.md` (registre restauration §7)
- `docs/security-rotation-log.md` (registre rotation §9)
- `docs/proposition-commerciale-v2-prd.md` (PRD du premier chantier
  produit post-pilote)
- `docs/rls-hardening-plan.md` (doctrine RLS + règle service_role)
- `docs/activity-log-prd.md` (journal d'activité, source des signaux
  de monitoring §4)
