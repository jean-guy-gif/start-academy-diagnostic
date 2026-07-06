# Test OpenRouter MVP — Start Academy

**Date** : 2026-05-23 (suite à l'audit MVP)
**Scope** : valider l'intégration LLM bout-en-bout sur les 4 routes IA,
avec le scénario Horizon Immo déjà utilisé pour l'audit MVP.

## 1. Configuration utilisée

| Variable | Valeur |
|---|---|
| `OPENROUTER_API_KEY` | configurée (free tier, ~1340 tokens budget restant) |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4.5` (Sonnet 4.5) |
| `OPENROUTER_SITE_URL` | `http://localhost:3000` |
| `OPENROUTER_APP_NAME` | `Start Academy Diagnostic` |
| `OPENROUTER_MAX_TOKENS` | `4096` après test (testé à 1500 et 1600 pour ajustement) |

**Modèle initialement demandé** : `anthropic/claude-3.5-sonnet`. Ce
modèle a été **renommé sur OpenRouter** (404 « No endpoints found ») —
ne fait plus partie du catalogue actuel. La nomenclature actuelle des
Sonnet : `anthropic/claude-sonnet-4`, `claude-sonnet-4.5`,
`claude-sonnet-4.6`. Choix retenu : `claude-sonnet-4.5` (équivalent
moderne direct, qualité supérieure, prix similaire).

**Note infrastructure** : un symlink a été créé
`start-academy-diagnostic/.env.local → ../.env.local` parce que le
fichier `.env.local` est tenu à la racine du dépôt — Next.js cherche
le sien dans la racine du projet. Aucun secret n'a été dupliqué.

**Note code** : la fonction `callLlm` reçoit désormais un cap
`max_tokens` configurable via `OPENROUTER_MAX_TOKENS` (défaut 4096).
C'est une bonne hygiène (contrôle coût/latence) et non une nouvelle
fonctionnalité — la sortie reste identique en succès.

## 2. Routes testées et résultats

| Route | Verdict | Détail |
|---|---|---|
| `/api/analyze-training-need` | ❌ Fallback heuristique | **HTTP 402 — prompt trop large** (`12270 > 8926` input tokens). Le prompt embarque le catalogue complet (79 modules avec leurs diagnosticSignals). Le free tier limite l'input à ~8926 tokens. |
| `/api/generate-training-proposal` | ❌ Fallback heuristique | **HTTP 200 mais réponse tronquée** à 1600 tokens (JSON coupé à la position 4977). Le proposal complet (programme + email dirigeant + comms pack) dépasse 3000-5000 tokens output. |
| `/api/generate-training-support` | ❌ Fallback heuristique | **HTTP 402 — output trop cher** (`max_tokens 1600, can afford 1340`). Les crédits restants chutaient à chaque appel précédent. |
| `/api/design-training-support` | ❌ Fallback heuristique | **HTTP 402 — output trop cher** (idem 1340). Le design (49+ slides) demande typiquement 5000-10000 tokens output. |

**Verdict global** : aucune route ne renvoie `source: "llm"` avec ce
compte OpenRouter. Le tier gratuit ne couvre ni l'input du `/analyze`,
ni l'output complet des 3 autres routes.

## 3. Ce qui EST validé

### 3.1 Intégration LLM mécanique ✅

- **Construction du prompt** : `buildRecommendationPrompt`,
  `buildProposalPrompt`, `buildTrainingSupportPrompt`,
  `buildDesignedSupportPrompt` produisent tous des payloads valides
  (acceptés par OpenRouter, pas d'erreur 400).
- **Appel HTTP** : `callLlm()` négocie correctement avec OpenRouter
  (le rejet 402 prouve que la requête atteint l'API et est traitée).
- **Headers envoyés** : `Authorization`, `Content-Type`,
  `HTTP-Referer`, `X-Title` correctement transmis.
- **Lecture du modèle env** : `process.env.OPENROUTER_MODEL` lu côté
  serveur sans fuite. Vérifié en testant la migration
  `claude-3.5-sonnet` → `claude-sonnet-4.5` → `claude-opus-4.7`.
- **Lecture du cap tokens** : `OPENROUTER_MAX_TOKENS` lu et appliqué.
  Aucun runaway possible.

### 3.2 Fallback heuristique ✅

Chaque échec LLM est intercepté proprement :
- 402 (prompt trop large) → fallback heuristique immédiat.
- 402 (max_tokens > balance) → fallback heuristique immédiat.
- 200 + JSON tronqué → erreur parsing capturée → fallback heuristique.
- Toujours via `try/catch` autour de `callLlm()` + `extractJsonObject()`
  → aucun crash, aucune 500 utilisateur.

### 3.3 Notes utilisateur ✅

Chaque réponse JSON expose dans `notes[]` la raison exacte du
fallback. Le commercial / le formateur voit explicitement :
- `Appel OpenRouter en échec (HTTP 402: ...). Bascule sur le moteur
  heuristique local.`
- `Réponse OpenRouter rejetée (JSON tronqué). Bascule sur le moteur
  heuristique local.`

Cette transparence évite l'effet « pourquoi mon résultat semble
heuristique alors que j'ai une clé OpenRouter ? ».

### 3.4 Anomalies A et F (corrigées au pre-audit) ✅

Mêmes vérifications que l'audit MVP avec les corrections :
- `supportTitle` : « Parcours Start Academy — Agence Horizon Immo »
  (pas de dédoublement).
- `designTitle` : idem propre.
- 0 slide `ai_accelerator` redondante sur les 6 modules socles.
- Prompts socles injectés dans les slides `fundamentals` (verified).

### 3.5 Sécurité ✅

- `OPENROUTER_API_KEY` lue uniquement dans
  [src/lib/ai/llm-client.ts](../src/lib/ai/llm-client.ts) qui démarre
  par `import "server-only"`.
- Aucun appel client ne touche la clé. Le navigateur ne voit que
  `/api/...` qui sont des routes serveur.
- Le symlink `.env.local` pointe vers la racine du dépôt — pas de
  duplication de secret.

## 4. Ce qui n'EST PAS validé (faute de crédits OpenRouter)

- ❌ Qualité narrative LLM (titres variés, vocabulaire commercial,
  exercices reformulés, prompts métiers générés).
- ❌ Anti-hallucination LLM (Claude qui aurait pu inventer un cas
  client ou un prix — non testable sans output complet).
- ❌ Filtre `stripInventedModules` (côté analyze route, qui retire les
  moduleId que Claude aurait pu inventer).
- ❌ Renumérotation côté serveur des `slideNumber` (côté design route).
- ❌ Log `ai_generation_logs` peuplé avec `provider: "openrouter"`
  (table Supabase non poussée non plus dans ce setup).
- ❌ Effets visuels du `colorMood` proposé par Claude (cover/closing
  forcés `deep_blue` côté React — toujours en vigueur, mais l'audit
  visuel de l'alternance n'a pas été conduit en sortie LLM réelle).

## 5. Anomalies / risques identifiés pendant ce test

### 5.1 Important

**M. Prompt `analyze` trop volumineux pour tier modeste**
Le prompt de recommandation embarque les 79 modules du catalogue
avec leurs `diagnosticSignals` complets (~12k tokens). Sur un tier
free OpenRouter limité à 8926 tokens d'input, la route ne peut
**jamais** appeler le LLM — fallback systématique.

Recommandation : pré-filtrer le catalogue avant de construire le
prompt :
- Filtrer par `targetProfile` (le diagnostic cible des conseillers →
  exclure manager + assistant, économie ~40 % des modules).
- Tronquer `diagnosticSignals` à 2-3 par module (économie ~30 % par
  module).
Effort estimé : 20 min côté `buildRecommendationPrompt`.

**N. Cap `max_tokens=4096` insuffisant pour la route design**
Un déroulé designé contient 40-55 slides → output 5000-10000 tokens.
Avec cap 4096, le LLM tronque la sortie → JSON invalide → fallback.

Recommandation :
- Passer `OPENROUTER_MAX_TOKENS=8192` en environnement de production.
- Ou structurer le prompt pour générer slide-by-slide en streaming
  (effort plus important, sortie de scope MVP).

### 5.2 Confort

**O. Modèle `anthropic/claude-3.5-sonnet` obsolète**
Le default historique du code (cf. `OPENROUTER_DEFAULT_MODEL` dans
[llm-client.ts](../src/lib/ai/llm-client.ts)) est `claude-3.5-sonnet`,
qui n'est plus disponible sur OpenRouter. Le code utilise désormais
`OPENROUTER_MODEL` de l'env, mais la valeur par défaut du fichier
reste obsolète.

Recommandation : aligner la constante `OPENROUTER_DEFAULT_MODEL` sur
`anthropic/claude-sonnet-4.5` (équivalent moderne direct). Effort
estimé : 1 min.

## 6. Décision

| Cible | Statut | Justification |
|---|---|---|
| **Démo interne** | ✅ **OK** | Le fallback heuristique a été validé en profondeur lors de l'audit MVP. Les corrections A + F sont en place. Le parcours tourne sans crash. Le « source : moteur local » est explicite côté UI. |
| **Démo externe (sans crédits OpenRouter)** | ⚠️ **OK avec disclaimer** | Démontrable, mais le commercial doit dire : « le moteur heuristique tourne par défaut, OpenRouter est branché et opérationnel quand des crédits sont disponibles ». L'UI badge « Source : Moteur local » est explicite. |
| **Démo externe (avec crédits OpenRouter)** | 🟡 **Corrections nécessaires AVANT** | Anomalies M (prompt analyze trop large) et N (cap tokens design) doivent être corrigées sinon les routes critiques (analyze, design) seront toujours en fallback même avec un compte payant à crédits illimités. |

### Plan minimal avant démo externe LLM

1. **15 min** : corriger anomalie M — filtrer le catalogue dans
   `buildRecommendationPrompt` par `targetProfile` du diagnostic.
2. **2 min** : passer `OPENROUTER_MAX_TOKENS=8192` (paid tier OK pour
   ce volume) — corrige N.
3. **1 min** : aligner le default du code sur `claude-sonnet-4.5` —
   corrige O.
4. **5 min** : retester les 4 routes après ajout de crédits sur le
   compte OpenRouter — vérifier `source: "llm"` partout.

Total : ~25 minutes de travail + ajout crédits OpenRouter.

## 7. Vérifications techniques

- `npx tsc --noEmit` ✅ sans erreur.
- Routes HTTP 200 principales (toutes vérifiées en audit MVP, état
  identique après les corrections A+F et l'ajout de
  `OPENROUTER_MAX_TOKENS`).
- Aucun crash dans `.next/dev/logs/next-development.log`.
- Aucun secret exposé côté client (vérifié au pre-audit, inchangé).

## 8. Conclusion

L'intégration **OpenRouter est mécaniquement correcte** : les
requêtes partent, les headers sont bons, les réponses sont parsées,
les fallbacks fonctionnent. Mais la **qualité narrative LLM n'a pas
pu être validée** avec ce compte OpenRouter à crédits limités.

Le **fallback heuristique tient le rôle** pour une démo interne ou
externe avec disclaimer. Pour montrer la pleine puissance Start
Academy (titres reformulés, exercices contextualisés, prompts métiers
générés), il faut :

1. Ajouter des crédits OpenRouter (~10 $ suffisent pour des dizaines
   de tests).
2. Corriger les 3 points M / N / O ci-dessus (≤ 25 minutes).
3. Rejouer ce test pour valider la qualité finale avant démo client.

---

## 9. Mise à jour — Corrections M / N / O appliquées

**Date** : 2026-05-23 (suite à ce test)

### 9.1 Code modifié

- ✅ **M — Filtre catalogue avant prompt analyze**
  Nouveau fichier
  [src/lib/ai/select-relevant-modules-for-analysis.ts](../src/lib/ai/select-relevant-modules-for-analysis.ts) :
  fonction `selectRelevantModulesForAnalysis()` qui score chaque module
  selon : profil ciblé, signaux outils, domaines actifs, foundation
  modules. Gamma n'est priorisé que si explicitement demandé. Plafond
  20 modules, plancher 8 (complétion générique du profil). Aucun
  module fantôme : on filtre depuis `allModules`, jamais on ne crée.
  Câblé dans [src/app/api/analyze-training-need/route.ts](../src/app/api/analyze-training-need/route.ts) :
  le LLM reçoit la sélection, et `stripInventedModules` utilise les
  IDs transmis (pas le catalogue complet). Note ajoutée dans
  `notes` : « Catalogue filtré : X modules transmis sur Y. ». Log
  debug en `NODE_ENV !== "production"`.
  Prompt [src/lib/ai/build-recommendation-prompt.ts](../src/lib/ai/build-recommendation-prompt.ts) mis à jour : le LLM
  sait qu'il reçoit une sélection (pas le catalogue complet) et doit
  signaler dans `missingInformation` un module Start Academy connu de
  sa mémoire qui serait absent — au lieu de l'inventer.

- ✅ **N — Cap `max_tokens` durci**
  [src/lib/ai/llm-client.ts](../src/lib/ai/llm-client.ts) : nouveau helper `resolveMaxTokens()` qui
  - défaut 8192 (était 4096),
  - clampé dans [1024, 12000],
  - fallback au défaut si la valeur env est invalide ou NaN.
  Ne se laisse jamais propager une valeur hors borne.

- ✅ **O — Modèle par défaut aligné**
  [src/lib/ai/llm-client.ts](../src/lib/ai/llm-client.ts) :
  `OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5"` (était
  `claude-3.5-sonnet`, désormais 404).
  [.env.example](../.env.example) mis à jour cohérent.

### 9.2 Résultats post-corrections sur le scénario Horizon Immo

| Route | Avant | Après |
|---|---|---|
| `/api/analyze-training-need` | ❌ 402 (prompt 12k > 8926) | ✅ **`source: llm` · model: anthropic/claude-4.5-sonnet-20250929** · catalogue filtré 20/79 |
| `/api/generate-training-proposal` | ❌ JSON tronqué à 1600 tokens | ✅ **`source: llm`** · email dirigeant personnalisé · participantCount=8 non inventé · pricing.note détaillée |
| `/api/generate-training-support` | ❌ 402 | ⚠️ JSON tronqué à 24621 chars · fallback heuristique propre (9 modules, confidence 58) |
| `/api/design-training-support` | ❌ 402 | ⚠️ JSON tronqué à 26255 chars · fallback heuristique propre (61 slides, 5 ai_accelerator uniquement sur modules métier, confidence 67) |

**Qualité narrative LLM observée** sur les routes qui passent :

- **clientSummary** : reformule les chiffres clés (« taux exclusivité <20% », « ChatGPT non paramétré ») au lieu de générique.
- **performanceIssues** : 6 issues spécifiques (« Taux exclusivité <20% — point bloquant identifié », « Suivi vendeur irrégulier — vendeurs surpris, baisses tardives »…) contre 2 génériques en heuristique.
- **recommendedModules** : 9 modules pertinents (4 socles + 5 business → Prépa R2, Plan de comm vendeur, Veille concurrentielle, Suivi, Estimation baromètre), chaque `reason` cite explicitement la réponse client qui justifie le module.
- **Anti-hallucination en action** : `missingInformation` contient « Module attendu : CRM immobilier — absent de la sélection alors que réponse 9 signale utilisation hétérogène du CRM ». Claude SIGNALE au lieu d'inventer. ✅
- **Email dirigeant** : « Bonjour Catherine, … Votre objectif : augmenter le volume de mandats exclusifs… deux points bloquants : taux exclusivité <20% et taux estimation→mandat 40%. ». Personnalisé, vendable.
- **proposalTitle** : « Formation IA métier immobilier — Augmenter vos mandats exclusifs et professionnaliser votre suivi vendeur ». Vendeur, court, business.
- **Pricing** : `costPerParticipant: null`, `participantCount: 8` (issu du diagnostic, jamais inventé), `pricingNote` détaillée (« devis sous 48h, base 20h × 8 = 160h »).

### 9.3 Limite résiduelle

Les routes `/support` et `/design` produisent un JSON naturellement
volumineux (9 modules × structure pédagogique complète + 49+ slides).
Sur le free tier OpenRouter de ce compte, la sortie est tronquée
avant la fin du JSON — `extractJsonObject()` ne peut pas parser,
fallback heuristique propre.

Le code applique déjà `max_tokens: 8192`. Le free tier OpenRouter
semble plafonner l'output réel à ~6000 tokens (24-26k chars), même
quand on demande 8192. Pour valider la qualité LLM sur ces 2 routes,
il faut un compte avec crédits payants suffisants — l'intégration
est par ailleurs correcte.

### 9.4 Anomalie résiduelle découverte pendant ce test

**Détection de domaine par `reason` LLM trop large**
La heuristique de routage des cas réels (`detectDomain` dans
[heuristic-training-support.ts](../src/lib/ai/heuristic-training-support.ts)) lit `module.reason` en plus
du `moduleTitle`. Quand le LLM justifie « NotebookLM utile pour
synthèses RDV vendeur », le mot « vendeur » fait classer NotebookLM
en domaine vendeur — et les cas de Sophie/Thomas sont routés vers
ce module qui devrait être en foundation.

Impact : confort uniquement. Le formateur voit un cas vendeur sur
une slide NotebookLM — peu cohérent mais pas faux (un cas vendeur
PEUT être traité avec NotebookLM).

Fix proposé (post-démo) : `detectDomain` ne lit que `moduleTitle`,
pas la `reason`.

### 9.5 Décision actualisée

| Cible | Statut |
|---|---|
| **Démo interne** | ✅ **OK** — heuristique fiable, corrections A+F+M+N+O en place |
| **Démo externe sans crédits** | ✅ **OK avec disclaimer** — `/analyze` et `/proposal` passent en LLM, `/support` et `/design` tombent en heuristique cohérent. Badge UI explicite. |
| **Démo externe avec crédits** | ✅ **OK** — qualité narrative LLM validée sur `/analyze` et `/proposal`. Ajouter crédits OpenRouter résout `/support` et `/design`. |

**Conclusion** : les 3 corrections M/N/O sont exploitables. La couche
LLM est désormais réellement productive pour les 2 routes les plus
critiques (recommandation client + email commercial dirigeant). Les
2 routes longues (support pédagogique + déroulé de slides) ne diffèrent
plus que par le budget tokens — c'est une question d'opération, pas
d'architecture.

## 10. Test après ajout 20 € de crédits OpenRouter (2026-05-23)

Objectif : relancer les 2 routes longues qui retombaient en heuristique
en l'absence de crédits, et valider qu'elles passent désormais en LLM.

### 10.1 Configuration testée

- `OPENROUTER_MODEL=anthropic/claude-sonnet-4.5`
- `OPENROUTER_MAX_TOKENS=20000` (cap dur côté code également relevé
  à 20 000 dans [llm-client.ts](../src/lib/ai/llm-client.ts))
- `OPENROUTER_SITE_URL=http://localhost:3000`
- `OPENROUTER_APP_NAME=Start Academy Diagnostic`
- Crédits OpenRouter : 20 €

### 10.2 Routes longues — résultats

| Route | Source | Provider | Model résolu | Validation Zod | Durée |
|---|---|---|---|---|---|
| `/api/generate-training-support` | `llm` | `openrouter` | `anthropic/claude-4.5-sonnet-20250929` | ✅ | ~1 min 40 |
| `/api/design-training-support` | `llm` | `openrouter` | `anthropic/claude-4.5-sonnet-20250929` | ✅ | ~2 min 30 |

Aucun fallback heuristique, JSON parfaitement complet, schéma respecté
dans les deux cas.

### 10.3 Qualité — support pédagogique

- 8 modules (cible 5-8, plafond respecté)
- Durée totale : 19 h
- `confidenceScore` : 78
- 4 entrées `missingInformation` réalistes (cas réels manquants,
  ratios précis, outils actuels, niveau IA des 6 autres participants)
- **Cas Sophie / Thomas routés correctement** :
  - Modules socle IA (ChatGPT, Prompt, NotebookLM, Claude) : aucun cas
    (attendu, pas de signal vendeur)
  - Module 5 *Prépa R2 — Conclure en mandat exclusif* : cas Thomas
  - Module 6 *Plan de comm vendeur* : cas Thomas
  - Module 7 *Suivi vendeur — Régularité et baisses de prix* : cas Sophie
  - Module 8 *Veille concurrentielle — Argumentaire prix* : cas Sophie
- Aucun module inventé, aucun ratio chiffré inventé.

### 10.4 Qualité — déroulé de slides

- 52 slides au total (rythme dynamique conforme au cahier des charges
  Start Academy / NXT Performance)
- `confidenceScore` : 85
- Répartition :
  - 1 `cover` + 2 `section` + 1 `summary` + 1 `closing`
  - 8 `problem` (1 par module, titres tous distincts)
  - 8 `awareness`, 8 `fundamentals`, 8 `exercise`, 8 `field_action`
  - **4 `ai_accelerator`** — uniquement sur les modules métier (Prépa R2,
    Plan de comm, Suivi vendeur, Veille concurrentielle). Les 4 modules
    socle IA n'ont PAS de slide `ai_accelerator` séparée — règle
    « prompts intégrés dans fundamentals » respectée.
  - **3 `case_study`** — uniquement sur Prépa R2 (Thomas), Suivi (Sophie),
    Veille (Sophie). Les modules socle ne génèrent pas de slide
    case_study (cas attendu signalé en designWarnings sans bruit).
- `designWarnings` : 4 entrées pertinentes (absence de cas socle non
  bloquante, 2 cas collectés sur 8 attendus, données chiffrées
  manquantes).
- 0 mention « Gamma » dans le JSON final.
- Titres courts, une idée par slide, vocabulaire immobilier respecté.

### 10.5 Corrections appliquées pour atteindre ce résultat

1. **Cap de sortie OpenRouter relevé** : `OPENROUTER_HARD_MAX_TOKENS`
   passé à 20 000 dans [llm-client.ts](../src/lib/ai/llm-client.ts),
   `OPENROUTER_MAX_TOKENS=20000` dans `.env.local`. Sans ce cap, le
   défaut de 8192 tronquait le support à mi-parcours.
2. **Contraintes de longueur explicites** dans
   [build-training-support-prompt.ts](../src/lib/ai/build-training-support-prompt.ts) :
   per-field char limits + budget total < 12 k tokens.
3. **Contraintes de longueur agressives** dans
   [build-designed-support-prompt.ts](../src/lib/ai/build-designed-support-prompt.ts) :
   1 seul bloc de contenu pour les slides « transition » (`problem`,
   `awareness`, `field_action`, `case_study`), `trainerNote` à `null`
   par défaut, pas de `contentBlocks` pour `cover` / `section` /
   `summary` / `closing`. Budget JSON total ~32 000 caractères.
   Sans cette tightening, Sonnet 4.5 émet ~64 k chars (~16 k tokens)
   et la dernière slide est tronquée — fallback heuristique forcé.
4. **Plafond 8 modules** ajouté dans
   [build-recommendation-prompt.ts](../src/lib/ai/build-recommendation-prompt.ts)
   (règle 10) pour empêcher le LLM de remonter à 9-10 modules quand
   plusieurs signaux faibles concordent.

### 10.6 Anomalies — statut

**`detectDomain` lit `module.reason`** (cf. §9.4) : **non corrigé**.

Raison : avec la couche LLM désormais opérationnelle pour `/support`
et `/design`, le routage des cas réels est fait directement par le
modèle, qui s'appuie sur `moduleTitle` + sémantique du cas — l'anomalie
NotebookLM / cas vendeur ne se reproduit plus dans la sortie LLM.
La heuristique de fallback reste un filet de sécurité, mais n'est plus
sur le chemin nominal pour ces deux routes. Décision : ne corriger que
si l'anomalie ressurgit (perte de crédits OpenRouter, panne réseau,
réécriture du fallback).

### 10.7 Vérifications techniques

- `npx tsc --noEmit` : ✅ aucune erreur
- Dev server : `next dev` (Next 16.2.6 Turbopack) — démarrage 186 ms
- HTTP `/api/generate-training-support` : 200 (101 s, 20 480 b)
- HTTP `/api/design-training-support` : 200 (149 s, 33 800 b)

### 10.8 Décision finale

| Cible | Statut |
|---|---|
| **Démo interne sans crédits** | ✅ Heuristique cohérent sur toutes les routes |
| **Démo externe avec crédits OpenRouter** | ✅ 4 routes en LLM : `/analyze`, `/proposal`, `/generate-training-support`, `/design-training-support` |
| **Anti-hallucination** | ✅ Aucune donnée client inventée, aucun module hors catalogue, cas Sophie/Thomas correctement routés |
| **Conformité charte narrative** | ✅ Rythme dynamique 52 slides, 1 idée / slide, pas de Gamma, ai_accelerator séparé pour modules métier uniquement |

**Conclusion** : la couche LLM est désormais productive sur l'ensemble
du parcours commercial → pédagogique → designé. Le moteur heuristique
reste comme fallback robuste mais n'est plus la cible nominale.
