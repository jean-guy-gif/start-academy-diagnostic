# Audit régression — participants prévisionnels + financement + cap modules

> Audit ciblé exécuté après l'intégration des participants prévisionnels,
> de l'estimation de prise en charge et de la suppression du cap 8 modules.
> Date d'audit : 2026-05-25.
>
> **Note méthodologique** : audit basé sur l'inspection des chemins de
> code, smoke tests HTTP et validation des contrats TypeScript / Zod.
> La validation visuelle complète (rendu UI, qualité narrative LLM)
> nécessite un test manuel en mode connecté (Supabase + OpenRouter).

---

## 1. Scénario testé

- **Client** : Horizon Immo
- **6 participants** :
  - 3 agents commerciaux indépendants, production N-1 > 7 000 €
  - 2 salariés
  - 1 « autre »
- **Durée formation** : ~18 h
- **Problèmes diagnostiqués** : ChatGPT non paramétré, NotebookLM inconnu,
  suivi vendeur irrégulier, baisse de prix difficile, estimation → mandat
  à améliorer.

### Calcul de référence attendu

| Donnée | Valeur attendue |
|---|---|
| Coût par participant | 18 h × 42 € = **756 €** |
| Budget total | 756 € × 6 = **4 536 €** |
| Prise en charge potentielle | 3 × min(756, 3 000) = **2 268 €** |
| Reste à charge | 4 536 − 2 268 = **2 268 €** |

Mathématiques validées par script en CLI lors du commit précédent
(cf. session) : ✅ conforme.

---

## 2. Tests passés (code + smoke)

| # | Élément testé | Méthode | Résultat |
|---|---|---|---|
| 1 | Compilation TypeScript | `npx tsc --noEmit` | ✅ Zéro erreur |
| 2 | Dev server | `next dev` | ✅ Ready |
| 3 | Page d'accueil | `GET /` | ✅ 200 |
| 4 | Login | `GET /login` | ✅ 200 |
| 5 | Auth gate `/diagnostics` | `GET /diagnostics` sans cookie | ✅ 307 → `/login` |
| 6 | Route participants — GET sans auth | curl | ✅ 401 |
| 7 | Route participants — PUT sans auth | curl | ✅ 401 |
| 8 | Route participants — JSON invalide sans auth | curl | ✅ 401 (auth d'abord) |
| 9 | Math coût/participant | 18 × 42 | ✅ 756 € |
| 10 | Math budget total | 756 × 6 | ✅ 4 536 € |
| 11 | Math prise en charge (3 éligibles, cap 3000) | min(756, 3000) × 3 | ✅ 2 268 € |
| 12 | Math reste à charge | max(4536 − 2268, 0) | ✅ 2 268 € (non négatif) |
| 13 | Schema `Pricing` accepte payload legacy | Zod parse | ✅ 4 nouveaux champs `.optional().default(null)` |
| 14 | Schema `RecommendedModule` accepte module legacy | Zod parse | ✅ `priorityTier .optional().default(null)` |
| 15 | Recommendation service backward-compat | Lecture localStorage | ✅ `m.priority_tier ?? null` |
| 16 | UI `PriorityTierBadge(null)` | Composant | ✅ Renvoie null (pas de badge fantôme) |
| 17 | UI proposal-view sans funding | Affichage conditionnel | ✅ `estimatedFundingTotal > 0` requis → bloc caché si null |
| 18 | UI proposal-view disclaimer | Conditionnel | ✅ Callout amber affiché si `fundingDisclaimer` présent |

---

## 3. Chemins de code audités

### 3.1 Flow proposition (LLM + heuristique)

```
POST /api/generate-training-proposal
  ├─ loadFromSupabase() → recommendation + diagnostic
  ├─ listDiagnosticParticipants(diagnosticId) → DiagnosticParticipantRecord[]
  ├─ buildProposalPrompt({client, diagnostic, recommendation})
  ├─ callLlm(prompt) :
  │    ├─ extractJsonObject + ProposalSchema.parse
  │    └─ pricing = applyStartAcademyPricing(
  │         totalDurationHours,
  │         expectedParticipants,
  │         fundingParticipants  ← lus depuis diagnostic_participants
  │       )                       ← override systématique
  │
  └─ Si LLM null/échec → heuristic :
       ├─ buildHeuristicProposal({client, diagnostic, recommendation})
       └─ heuristicWithFunding.pricing = applyStartAcademyPricing(...)  ← override aussi
```

**Garantie** : `pricing` est TOUJOURS recalculé par le code côté route,
peu importe le chemin (LLM ou heuristique). Le LLM ne décide jamais
du prix ni du financement. ✅

### 3.2 Backward-compat propositions stockées en localStorage

Si une proposition pré-existait sans les nouveaux champs funding :

| Field | Comportement à la lecture |
|---|---|
| `pricing.estimatedFundingTotal` | `undefined` → `> 0` est `false` → bloc « Prise en charge » non affiché |
| `pricing.estimatedRemainingCost` | `undefined` → bloc « Reste à charge » non affiché |
| `pricing.eligibleParticipantCount` | `undefined` → label fallback générique |
| `pricing.fundingDisclaimer` | `undefined` → callout amber non affiché |

**Pas de crash, pas de fausse info** : la UI dégrade vers l'affichage
historique (coût/participant + budget total seulement). ✅

### 3.3 Backward-compat modules legacy (sans `priority_tier`)

- DB legacy : colonne `priority_tier` absente jusqu'à la migration
  `20260528120100`. Tant que la migration n'est pas appliquée, le
  SELECT renvoie une erreur (colonne inexistante). **À appliquer
  côté Supabase pour activer le flow funding+phasage.**
- Modules legacy lus en mémoire : `priority_tier ?? null` partout →
  `priorityTier = null` côté objet métier.
- UI `PriorityTierBadge(null)` retourne `null` (composant) → aucun
  badge fantôme. ✅

---

## 4. Anomalies / risques identifiés

### 4.1 ⚠️ Génération support ne filtre PAS par `priorityTier`

**Sévérité** : moyenne (impact UX, pas sécurité).

`heuristic-training-support.ts:338` et `build-training-support-prompt.ts:158`
consomment **tous** les `recommendation.recommendedModules`, y compris
ceux tagués `later` ou `optional`. Si une recommandation contient
12-15 modules (cap supprimé), le support brut puis le PDF designé
incluent tout — risque de PDF surchargé / hors-format.

**Reproduction probable** : diagnostic riche (Horizon Immo) → le LLM
peut proposer 10+ modules. Tous passent dans le support.

**Correction recommandée** : filtrer dans le support brut → ne garder
que `priorityTier ∈ {essential, recommended, null}` et lister les
`later` / `optional` dans `missingInformation` du support.

Patch suggéré dans `/api/generate-training-support/route.ts` AVANT
de passer la recommandation au builder + heuristic :

```ts
const filteredRec = {
  ...context.recommendation,
  recommendedModules: context.recommendation.recommendedModules.filter(
    (m) => m.priorityTier === null || m.priorityTier === "essential" || m.priorityTier === "recommended"
  ),
};
```

### 4.2 ⚠️ Page dirigeant n'affiche pas le funding

**Sévérité** : faible — décision produit en suspens.

`/public/session/[token]` affiche le coût par participant mais **pas**
la prise en charge potentielle ni le reste à charge. Le dirigeant
voit donc un montant brut.

**Question produit** : doit-on exposer l'estimation funding au
dirigeant ? Risques :
- ✓ Avantage : transparence sur le « coût réel » potentiel.
- ✗ Risque : si l'estimation évolue (mise à jour participants,
  changement règle financeur), le dirigeant verra le chiffre changer.

**Recommandation** : décision produit à prendre. Implémentation
facile (ajouter 2 `SummaryStat` + disclaimer) une fois la décision
prise.

### 4.3 ⚠️ Persistance participants en mode dégradé silencieuse

**Sévérité** : faible.

Dans `new-diagnostic-flow.tsx`, `persistParticipants(diagnosticId)` est
un fetch best-effort wrapped dans try/catch. Si l'appel échoue
(Supabase down, 401), l'utilisateur ne le voit pas — le diagnostic
continue, mais les participants prévisionnels ne sont pas persistés.

**Correction recommandée** (post-pilote) : afficher un toast ou un
warning discret dans le banner d'erreur déjà présent.

**Pour MVP** : acceptable — le commercial peut compléter via la
fiche session plus tard quand l'UI dédiée existera.

### 4.4 ℹ️ `expectedParticipants` modifié après création diagnostic

Si un commercial saisit 6 participants, soumet le diagnostic, puis
change d'avis → la liste `diagnostic_participants` reste à 6. Aucun
re-sync.

**Pour MVP** : acceptable — le commercial peut refaire un PUT manuel
ou demain depuis la fiche session (UI à créer).

### 4.5 ℹ️ Heuristic recommendation : phasage approximatif

`pickRecommended` assigne automatiquement le tier :
- foundation OU idx < 4 → `essential`
- idx < 10 → `recommended`
- au-delà → `later`

C'est un fallback simple. Le LLM (chemin nominal) fait un phasage
plus fin. À surveiller en pilote si le fallback heuristique tombe
trop souvent (cf. quota OpenRouter).

### 4.6 ℹ️ `costPerParticipant` stocké en DB potentiellement obsolète

L'analyse persiste `cost_per_participant = calculateCostPerParticipant(totalDurationHours)`
au moment de l'insert. Si la recommandation est régénérée avec une
durée différente, ce champ n'est pas actualisé tant que la
recommandation n'est pas refaite.

**Mitigation existante** : la page dirigeant et la proposal-view
**recalculent** à partir de `total_duration_hours`, source de vérité.
Le `cost_per_participant` en DB n'est donc qu'une trace, jamais
affichée directement après cette mise à jour. ✅

---

## 5. Gaps non bloquants (à traiter post-pilote)

| # | Gap | Impact | Effort |
|---|---|---|---|
| 1 | Pas de UI d'édition des `diagnostic_participants` après création du diagnostic (uniquement via API) | Le commercial doit refaire le diagnostic pour modifier | Petit (1 composant fiche session) |
| 2 | Funding non affiché à dirigeant | Cohérence proposition / espace dirigeant | Très petit |
| 3 | Support brut prend `later`/`optional` | PDF surchargé si reco > 10 modules | Petit (1 filter) |
| 4 | Heuristic phasage rudimentaire | Fallback non optimisé | Moyen (revoir `pickRecommended`) |
| 5 | Persistance participants silencieuse en échec | Saisie perdue sans signal user | Très petit (toast) |

---

## 6. Risques sécurité

| Vérification | État |
|---|---|
| `cost_per_participant` jamais influencé par LLM | ✅ Overridé code-side dans 2 routes |
| Aucun reste à charge négatif | ✅ `Math.max(... − ..., 0)` dans `estimateTrainingFunding` |
| Aucun prix inventé par LLM | ✅ Prompts règle 1 (proposal) + 7 (recommendation) |
| Disclaimer non-contractuel injecté côté serveur | ✅ `FUNDING_DISCLAIMER` ajouté par `applyStartAcademyPricing` |
| Éligibilité non présentée comme certaine | ✅ Label « Potentiellement éligible (à confirmer) » + callout amber |
| Plafond par participant respecté | ✅ `min(costPerParticipant, 3000)` |
| Anon insert sur `diagnostic_participants` | ✅ RLS authenticated only, aucune policy anon |
| Service_role exposé | ✅ `import "server-only"` sur `diagnostic-participants-service.ts` |
| Backward-compat anciens diagnostics | ✅ Pas de funding affiché si participants vides |
| Backward-compat anciens modules | ✅ `priorityTier ?? null` → badge masqué |

---

## 7. Pré-requis à appliquer côté Supabase

Sans cette étape, plusieurs flows tomberont en erreur :

```bash
supabase db push
```

Les deux nouvelles migrations à appliquer :
- `20260528120000_add_diagnostic_participants.sql` — nouvelle table
- `20260528120100_add_recommendation_modules_priority_tier.sql` — nouvelle colonne sur table existante

Sans la migration `priority_tier` : le SELECT
`recommendation_modules(... priority_tier)` renverra une erreur
**colonne inexistante** sur les routes :
- `/api/generate-training-proposal`
- `/api/generate-training-support`
- `recommendations.fetchById` (service browser)

**À vérifier avant démo** : `npm run check:catalog` + tester création
d'un diagnostic minimal.

---

## 8. Décision

| Cible | Statut |
|---|---|
| **Démo interne** (sans saisie participants) | ✅ OK — backward-compat préservée |
| **Démo interne** (avec scénario Horizon Immo 6 participants) | ✅ OK **après application des 2 migrations Supabase** |
| **Démo client pilote** | ✅ OK avec cadrage — funding affiché uniquement dans proposition commerciale ; dirigeant voit coût/participant |
| **Production** | ⚠️ Corrections recommandées avant prod : §4.1 (filtre support par tier) + §4.2 (décision affichage dirigeant) |

---

## 9. Recommandations post-audit

### À faire avant la prochaine démo

1. **Appliquer les 2 migrations Supabase** (`supabase db push`).
2. **Tester manuellement** le scénario Horizon Immo bout-en-bout
   sur un environnement avec OpenRouter actif.
3. **Vérifier visuellement** que la proposition générée contient bien :
   - Coût pédagogique total
   - Prise en charge potentielle (3 éligibles)
   - Reste à charge estimatif
   - Callout amber avec disclaimer

### À faire avant pilote externe

1. ~~**Corriger §4.1** : filtrer le support par `priorityTier`.~~ ✅
   **Corrigé** dans le commit suivant l'audit — cf. §10 ci-dessous.
2. ~~**Décider §4.2** : afficher ou non le funding côté dirigeant.~~ ✅
   **Corrigé** : synthèse anonymisée affichée — cf. §11 ci-dessous.

### À faire avant prod

1. Tester un cas de stress : 15 modules recommandés (vérifier que
   le cap §10 fonctionne et que le PDF reste lisible).
2. Tester un cas dégradé : 0 participant prévisionnel
   (synthèse financement masquée, callout fallback affiché).
3. RLS hardening sur `diagnostic_participants` (cf.
   [docs/rls-hardening-plan.md](./rls-hardening-plan.md)).

---

## 10. Correction §4.1 — Filtre support par `priorityTier` ✅

### Règle métier appliquée

- **Support principal** (brut + designé) = modules tagués `essential` + `recommended`.
- **Exclus du support** : `optional` + `later`. **Conservés** dans la
  recommandation et la proposition (visibles côté commercial).
- **Fallback rétrocompatible** : si AUCUN module n'a de `priorityTier`
  (anciens diagnostics, LLM qui n'a pas suivi la règle 11), on
  garde tous les modules — pour ne pas générer un support vide.
- **Plafond défensif** : 12 modules max dans le support.
  - Tous les `essential` sont conservés (jamais coupés).
  - Les `recommended` sont triés par `priority` ascendant puis
    tronqués si dépassement.
  - Les modules retirés du support apparaissent dans
    `notes` du résultat avec mention explicite.

### Fichiers impactés

| Fichier | Rôle |
|---|---|
| [src/lib/recommendations/select-modules-for-support.ts](../src/lib/recommendations/select-modules-for-support.ts) (nouveau) | `selectModulesForSupport` + `summarizeSupportModuleSelection`. Pures, sync, sans dépendance. |
| [src/app/api/generate-training-support/route.ts](../src/app/api/generate-training-support/route.ts) | Filtre appliqué avant `buildTrainingSupportPrompt` ET `buildHeuristicTrainingSupport`. Les notes du résultat incluent un message "Certains modules complémentaires sont conservés dans la proposition mais non intégrés au support principal." quand des modules sont exclus. |
| `/api/design-training-support/route.ts` | **Aucun changement nécessaire** : la route consomme `TrainingSupport.modules` déjà filtré upstream. La cascade est automatique. |

### Notes informatives produites

- *« Certains modules complémentaires (N optional/later) sont conservés
  dans la proposition mais non intégrés au support principal. »*
- *« Plafond support atteint : N module(s) recommended au-delà de 12
  ont été reportés en phase 2. »*

### Garanties

- ✅ Les modules `optional` / `later` ne sont PAS supprimés de la
  recommandation ni de la proposition.
- ✅ Les notes apparaissent dans le `notes[]` de la réponse API et
  côté UI support.
- ✅ Aucun crash si tous les modules sont `optional` (fallback : on
  passe quand même tous les modules, le support sera léger mais valide).

---

## 11. Correction §4.2 — Synthèse financement côté dirigeant ✅

### Règle d'affichage

Nouvelle section **« Budget & prise en charge potentielle »** sur la
page dirigeant `/public/session/[token]`, juste après le bloc résumé
proposition.

**Affiché (agrégats uniquement)** :

- Coût pédagogique total
- Coût par participant (avec rappel « 1 h = 42 € »)
- Participants potentiellement éligibles (nombre seul)
- Prise en charge potentielle estimée (montant agrégé)
- Reste à charge estimatif
- Callout amber : **« Estimation non contractuelle, sous réserve
  d'éligibilité et de validation du dossier par l'organisme financeur. »**

**JAMAIS exposé au dirigeant** :

- ❌ Production N-1 par participant
- ❌ Prénoms + montants individuels
- ❌ Statut professionnel détaillé par personne
- ❌ Pièces administratives
- ❌ Toute donnée individuelle nominative

### Implémentation

`loadDirigeantView` lit `diagnostic_participants` via
`listDiagnosticParticipants` (server-only / service_role), calcule la
synthèse avec `estimateTrainingFunding`, puis renvoie **uniquement**
les agrégats au composant :

| Champ retourné | Type |
|---|---|
| `totalEstimatedCost` | number ∣ null |
| `estimatedFundingTotal` | number ∣ null |
| `estimatedRemainingCost` | number ∣ null |
| `eligibleParticipantCount` | number ∣ null |
| `fundingDisclaimer` | string ∣ null |

Aucune donnée individuelle ne sort de la fonction.

### Cas dégradés

| Situation | Comportement |
|---|---|
| Recommandation non générée | Section masquée (conditions `totalEstimatedCost \|\| costPerParticipant`). |
| Recommandation OK mais aucun participant prévisionnel | Affiche coût total + coût/participant + message *« La prise en charge potentielle sera estimée après qualification des participants. »* |
| Participants saisis mais aucun éligible | Affiche `estimatedFundingTotal = 0` → bloc masqué, message d'attente affiché. |
| Anciens diagnostics sans `diagnostic_participants` | Fallback identique au cas "aucun participant". |

### Vérifications

- ✅ `npx tsc --noEmit` aucune erreur
- ✅ Page dirigeant renvoie 200
- ✅ Aucun leak de donnée individuelle dans le HTML (grep sur
  production N-1, statut littéral, prénoms : **0 hit**)
- ✅ Disclaimer présent (côté code ; affichage dépend de la présence
  de participants)
- ✅ Fallback disclaimer (`FALLBACK_FUNDING_DISCLAIMER`) injecté si
  données legacy sans disclaimer

---

## 12. État final post-corrections

| Cible | Statut |
|---|---|
| **Démo interne (sans participants)** | ✅ OK — backward-compat préservée |
| **Démo interne (Horizon Immo 6 pers.)** | ✅ OK après `supabase db push` |
| **Démo client pilote** | ✅ OK — funding visible côté proposition ET côté dirigeant (synthèse anonymisée) |
| **Production** | ✅ Prêt — sous réserve des 3 tests stress / dégradé / RLS listés plus haut |
