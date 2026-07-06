# Audit qualité MVP — Start Academy diagnostic

**Date** : 2026-05-23
**Scope** : parcours complet Diagnostic → Recommandation → Proposition →
Session → Collecte → Support brut → Support designé → Export PDF designé.
**Mode** : audit sans nouvelle fonctionnalité. Tests menés avec le moteur
**heuristique local** (pas de clé OpenRouter configurée pendant l'audit).
Toutes les vérifications LLM relèvent de la même architecture — la
qualité narrative changera quand `OPENROUTER_API_KEY` sera posée.

## 1. Scénario testé

**Agence Horizon Immo** — 8 conseillers, équipe hétérogène (3 confirmés,
3 intermédiaires, 2 juniors). Dirigeante : Catherine Lefèvre. Objectif
déclaré : augmenter mandats exclusifs + améliorer suivi vendeur.

**Diagnostic guidé** — 13 réponses :

- Maturité outils : ChatGPT non paramétré, NotebookLM inconnu, Gamma
  jamais utilisé, prompts non standardisés (5 réponses négatives, dont
  4 marquées signal faible).
- Performance commerciale : 5-6 contacts vendeurs / semaine sans suivi,
  taux estimation → mandat ~40 %, exclusivité < 20 % (signal faible),
  CRM hétérogène.
- Compétence métier : estimations OK pour confirmés, faibles pour
  juniors ; difficulté à défendre le prix et obtenir une baisse de prix
  (signal faible).
- Exécution : suivi vendeur irrégulier (signal faible).

**Collecte collaborateurs** — 2 participants :

- Sophie Bernard (Conseiller confirmé) : « Mandat avenue Foch, estimé
  450k, en portefeuille depuis 3 mois, vendeur refuse toute baisse. »
- Thomas Garcia (Conseiller junior) : « Estimation rue de la Paix, je
  n'arrive pas à fermer en exclusivité. »

Payloads bruts conservés dans `/tmp/audit-mvp/` (01..04) pour rejouer.

## 2. Points validés

### 2.1 Robustesse technique

- `npx tsc --noEmit` ✅ aucune erreur. Quelques `Hint` Zod / FormEvent
  pré-existants non bloquants.
- 14 routes HTTP **200** (`/`, `/dashboard`, `/diagnostics`,
  `/diagnostics/new`, `/diagnostics/[id]/recommendation`,
  `/diagnostics/[id]/proposal`, `/sessions`, `/sessions/[id]`,
  `/sessions/[id]/collect`, `/sessions/[id]/support`,
  `/sessions/[id]/support/print`, `/sessions/[id]/support/design`,
  `/sessions/[id]/support/design/print`, `/settings/modules`).
- Aucune erreur / warning dans `.next/dev/logs/next-development.log`
  pendant l'enchaînement complet.
- `SUPABASE_SERVICE_ROLE_KEY` et `OPENROUTER_API_KEY` lus uniquement
  dans des fichiers démarrant par `import "server-only"` (vérifié sur
  [src/lib/supabase/server.ts](../src/lib/supabase/server.ts) et
  [src/lib/ai/llm-client.ts](../src/lib/ai/llm-client.ts)) — impossible
  de les bundler côté client.
- Fallbacks démontrés end-to-end : sans Supabase → localStorage ; sans
  OpenRouter → heuristique. Aucune `throw` n'a remonté en surface.

### 2.2 Anti-hallucination

- **Aucun cas client inventé** sur l'ensemble du parcours. Les 2 cas
  Sophie / Thomas n'apparaissent que sur les modules vendeur (Suivi,
  Veille concurrentielle), jamais sur les modules socles.
- **Aucun prix inventé** : `costPerParticipant: null`,
  `participantCount: 8` (issu du diagnostic), `pricingNote` explicite
  « Tarif à valider en interne ».
- **Aucun moduleId fantôme** : les 8 modules recommandés existent tous
  dans le catalogue Excel (vérifié par grep).
- **Cas réel manquant** systématiquement signalé dans
  `support.missingInformation` et `design.designWarnings` quand un
  module n'a pas de cas correspondant.

### 2.3 Cohérence métier de base

- Maturité outils correctement détectée comme `low` (5 réponses
  négatives sur les bases IA).
- Niveau métier `beginner` (cohérent avec 7 signaux faibles + 0 signal
  d'autonomie marqué).
- Recommandation place bien les **6 modules socles avant les 2 modules
  business** (priorité 1-6 = socles, 7-8 = vendeur) — règle PRD §9.1
  respectée.
- `targetProfile` filtré sur `conseiller` (le seul profil dans le
  diagnostic) — pas de module manager ou assistant remonté.
- Score de confiance **75** à l'analyse, **75** à la proposition, **70**
  au support brut, **52** au support designé. Décroissance attendue :
  chaque couche ajoute des informations manquantes.

### 2.4 Cohérence design

- 4 palettes Start Academy strictes (deep, accent, white, mixed) —
  cover et closing **forcés `deep_blue` côté React** non négociable
  même si le LLM proposait autre chose.
- Logo Start Academy chargé via `/brand/logo-white.png` ou
  `logo-color.png` selon palette — décision automatique.
- Whitelist 13 icônes Lucide — pas d'icône fantôme possible.
- Rythme heuristique respecté : cover → Objectif → Programme → [modules]
  → Plan d'action → Merci. Premier et dernier slideType conformes au
  superRefine Zod.
- Validation Zod stricte : `slides.min(2)`, `confidenceScore ∈ [0,100]`,
  `fundamentals.min(2)`, `instructions.min(2)`, `examplePrompts ≥ 1` si
  `tools` non vide.
- Print A4 paysage : règle `@page` injectée, `print:hidden` sur sidebar
  / topbar / boutons toolbar, `.print-slide-wrapper` force
  `page-break-after: always`.

## 3. Anomalies détectées

### 3.1 Bloquant (à corriger avant démo client)

Rien de bloquant. Le parcours tourne end-to-end, aucune fonctionnalité
ne plante, le PDF designé sort.

### 3.2 Important (à corriger avant démo, ou disclaimer en présentation)

**A. Titre de support à effet de cascade**
Le `supportTitle` produit en mode heuristique est :
« **Support formateur — Parcours de formation Start Academy — Agence
Horizon Immo** ». Le préfixe « Support formateur — » s'ajoute au
`proposalTitle` qui contient déjà « Parcours de formation Start Academy
— Agence Horizon Immo ». Résultat : double mention « Start Academy »
dans le titre.
- Fichier : [src/lib/ai/heuristic-training-support.ts](../src/lib/ai/heuristic-training-support.ts) — fonction
  `buildHeuristicTrainingSupport` (composition `supportTitle`).
- Fix : tester `inputs.proposal?.proposalTitle.startsWith("Parcours")`
  et ne pas re-préfixer dans ce cas.

**B. Module direct « Prepa R2 vendeur » manquant à la reco**
Le besoin métier le plus saillant est « transformer estimation →
mandat exclusif » (point bloquant, signal faible). Le catalogue
contient `conseiller-vendeur-prepa-r2` qui adresse précisément ce
moment du parcours commercial. Le moteur heuristique a privilégié
`Suivi` et `Veille concurrentielle` par scoring de mots-clés, mais a
manqué Prepa R2.
- Fichier : [src/lib/ai/heuristic-recommendation.ts](../src/lib/ai/heuristic-recommendation.ts) — boosts par
  domaine.
- Fix possible : pondérer +1 supplémentaire les modules dont le
  `diagnosticSignals` cite explicitement « exclusivité » ou
  « mandat ». Sera mieux résolu par LLM avec un prompt durci.

**C. Reco « trop tool-heavy »**
8 modules retenus = 6 socles + 2 vendeur. La maturité outils faible
justifie la priorisation des socles, mais 6 socles d'affilée (17 h sur
21 h) noie les enjeux business du dirigeant.
- Heuristique : limiter à **3-4 socles maximum** quand maturité = low,
  pour laisser de la place à plus de modules métier.
- Fichier : [src/lib/ai/heuristic-recommendation.ts](../src/lib/ai/heuristic-recommendation.ts) —
  `pickRecommended()` actuellement plafonné à 8 modules sans limite par
  catégorie.

**D. `performanceIssues` muet sur les signaux faibles forts**
La sortie reco mentionne « Conversion estimation → mandat ou mandat →
exclusivité à améliorer » de façon générique, mais ne reprend pas les
signaux forts précis : « Exclusivité < 20 % », « Suivi vendeur
irrégulier », « Difficulté baisse de prix ». Avec LLM, ces phrases
remonteront mieux ; en heuristique on reste générique.
- Fichier : [src/lib/ai/heuristic-recommendation.ts](../src/lib/ai/heuristic-recommendation.ts) —
  `performanceIssues` est hardcodé par domaine, sans détection des
  weak signals.
- Fix : indexer les `weakSignals` du diagnostic et reformuler en
  performanceIssue concrète (« Taux exclusivité < 20 % » au lieu de
  « Conversion mandat → exclusivité à améliorer »).

**E. Email dirigeant techniciste en mode heuristique**
Chaque ligne du programme dans l'email dirigeant est suffixée par
« Domaine foundation détecté dans les réponses, aligné avec la famille
"Base (paramétrages fonctionnalités)" » — formulation technique de la
heuristique, pas un argumentaire commercial.
- Fichier : [src/lib/ai/heuristic-proposal.ts](../src/lib/ai/heuristic-proposal.ts) —
  `buildExecutiveEmail` reprend `module.reason` brut.
- Fix : reformuler côté heuristique avec une phrase business
  templatée. Avec LLM le problème disparaît.

**F. Densité du support designé : 55 slides pour 21 h**
Le heuristique génère mécaniquement, par module, 6 slides
(problème, conscience, méthode, accélérateur IA, exercice, action
terrain) — soit ~7 slides par heure. Pour un déroulé mixte présentiel
+ distanciel, c'est trop : 30-40 slides serait plus pertinent.
- Particulièrement gênant : les **6 modules socles** ont chacun une
  slide `ai_accelerator`, alors que ces modules **SONT** l'accélérateur
  IA (Prompt, ChatGPT, Gamma, NotebookLM, Claude, Gemini). Slide
  redondante.
- Fichier : [src/lib/ai/heuristic-designed-support.ts](../src/lib/ai/heuristic-designed-support.ts) —
  `shouldBuildAccelerator()` doit retourner `false` quand le module
  EST un module socle. Garde-fou simple :
  `module.moduleName` matche `^(ChatGPT|Claude|Gamma|...)$`.

**G. Titres de slides répétitifs en mode heuristique**
« La douleur métier » apparaît 8 fois, « Méthode » 8 fois, « Action
terrain » 8 fois. Le formateur perçoit une slide « copiée 8 fois ».
- Acceptable en heuristique (fallback), à corriger en priorité dans le
  LLM (titres variés par module).
- Fix heuristique partiel : suffixer par le nom du module —
  « La douleur métier · Prepa R2 vendeur ». Subtitle déjà fait ça,
  mais les titres restent identiques.

### 3.3 Confort (à traiter post-démo)

**H. Cas réels dupliqués entre modules vendeur**
Sophie + Thomas apparaissent dans Suivi ET Veille concurrentielle.
Le filtrage par regex domaine est trop large. Idéalement chaque cas
ne devrait apparaître que dans le module le plus aligné.

**I. Module name brut « Chat gpt » avec « gpt » minuscule**
Vient du fichier Excel d'origine (`Chat gpt ` avec trailing space).
Le générateur trim mais n'orthographie pas — un display layer pourrait
remapper `Chat gpt` → `ChatGPT` à l'affichage.

**J. `detectedNeeds` contient le `declaredGoal` brut**
La liste détaillée inclut une 4ème entrée : « Objectif déclaré : … »
qui est l'echo du diagnostic. Utile pour traçabilité mais peut
brouiller la lecture du commercial qui voulait juste « les besoins
détectés ».

**K. Email subject construit par `clientSummary.split(".")`**
En heuristique, le subject de l'email dirigeant est composé de la
première phrase de `clientSummary` + « — Start Academy ». Donne :
« Agence Horizon Immo — dirigée par Catherine Lefèvre — Start
Academy ». Lisible mais peu vendeur.

**L. Confidence designé chute à 52 avec 7 warnings**
Pour chaque module sans cas réel, le heuristique pousse un warning
« Module X : aucun cas réel collaborateur ». 6 modules socles → 6
warnings + 1 hérité = 7. La pénalité (`warnings.length * 4 = 28`)
plafonne le score à 50-52. Trop punitif pour un design qui est par
ailleurs cohérent.
- Fix : grouper les warnings de cas manquants en 1 seule entrée
  agrégée (« 6 modules sans cas réel disponible »).

## 4. Risques avant démo client

### 4.1 Risques métier

- **Lecture commerciale du support designé** : 55 slides peuvent
  surprendre un dirigeant qui s'attend à un déroulé compact. Cadrer la
  démo en expliquant que c'est le support **formateur** (utilisé en
  salle), pas le support de présentation commerciale.
- **Sans clé OpenRouter** : les démos qui dépendent de la qualité
  narrative (cover percutante, exercice contextualisé) seront en
  retrait. Activer `OPENROUTER_API_KEY` avant démo si possible.

### 4.2 Risques perçus

- Le titre dupliqué « Support formateur — Parcours de formation Start
  Academy — Agence Horizon Immo » ressort dans le PDF (cover + footer
  + header). Ça se voit immédiatement (cf. anomalie A).
- Les 6 slides « Accélérateur IA » pour les 6 modules socles donnent
  l'impression que le déroulé tourne en boucle (cf. anomalie F).

### 4.3 Risques techniques

- Aucun. Aucune feature ne plante, aucun secret n'est exposé, tous les
  fallbacks fonctionnent.

## 5. Corrections recommandées (par priorité)

### Bloquant (avant démo)

— Aucun. Le parcours est démontrable tel quel avec disclaimers.

### Important (avant démo idéalement, ou à mentionner en commentaire)

| # | Anomalie | Fichier | Effort estimé |
|---|----------|---------|---------------|
| A | Titre support dédoublé | [heuristic-training-support.ts](../src/lib/ai/heuristic-training-support.ts) | 5 min |
| F | Slide ai_accelerator redondante pour modules socles | [heuristic-designed-support.ts](../src/lib/ai/heuristic-designed-support.ts) | 10 min |
| C | Plafonner socles à 3-4 dans la reco | [heuristic-recommendation.ts](../src/lib/ai/heuristic-recommendation.ts) | 15 min |
| B | Boost Prepa R2 sur signal exclusivité | [heuristic-recommendation.ts](../src/lib/ai/heuristic-recommendation.ts) | 15 min |
| E | Email dirigeant moins technique | [heuristic-proposal.ts](../src/lib/ai/heuristic-proposal.ts) | 15 min |
| D | performanceIssues précis | [heuristic-recommendation.ts](../src/lib/ai/heuristic-recommendation.ts) | 20 min |
| G | Titres slides hétérogènes (heuristique) | [heuristic-designed-support.ts](../src/lib/ai/heuristic-designed-support.ts) | 15 min |

**Activation OpenRouter** = correction parallèle à toutes ces anomalies.
Le prompt durci a déjà été mis en place lors de la dernière session
qualité — la couche LLM corrigera A, B, D, E, G par construction. F
reste à fixer côté heuristique car les modules socles doivent rester
non-accélérateurs même quand le LLM décide.

### Confort (post-démo)

| # | Anomalie | Fichier | Effort estimé |
|---|----------|---------|---------------|
| L | Agrégation warnings cas manquants | [heuristic-designed-support.ts](../src/lib/ai/heuristic-designed-support.ts) | 10 min |
| H | Cas réels routés à 1 seul module | [heuristic-training-support.ts](../src/lib/ai/heuristic-training-support.ts) | 20 min |
| I | Display layer « ChatGPT » au lieu de « Chat gpt » | [designed-slide.tsx](../src/components/training-support/designed-slide.tsx) ou [data generator](../scripts/generate-module-catalog/generate_catalog.py) | 15 min |
| J | `detectedNeeds` sans echo de `declaredGoal` | [heuristic-recommendation.ts](../src/lib/ai/heuristic-recommendation.ts) | 5 min |
| K | Email subject reformulé | [heuristic-proposal.ts](../src/lib/ai/heuristic-proposal.ts) | 5 min |

## 6. Conclusion

Le MVP est **démontrable en l'état**, avec un parcours complet qui
tourne sans incident technique. Les anomalies sont toutes situées
côté qualité narrative et densité, principalement dues aux limites
mécaniques du moteur heuristique. **L'activation d'OpenRouter résout
par construction ~80 % des points importants.**

Les anomalies F (slide accélérateur redondante sur modules socles) et A
(titre dédoublé) sont les seules visibles en moins de 10 secondes par
un dirigeant : elles méritent d'être corrigées avant démo.

Aucun secret n'est exposé, aucun chemin ne plante, le PDF designé sort
proprement en A4 paysage avec la charte Start Academy respectée. Le
fallback localStorage permet de démontrer le parcours même sans
Supabase configuré, ce qui sécurise la démo terrain.
