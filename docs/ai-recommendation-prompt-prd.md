# PRD — Prompt IA de recommandation (v1.0b)

> Contrat entre le moteur code (ratios/alertes/financement) et le LLM.
> Le LLM ne recalcule PAS ces 3 dimensions — il les utilise comme
> vérité autoritaire.

---

## 1. Objectif

Réduire le risque d'hallucination et de dérive numérique en
rendant le LLM **consommateur** des blocs pré-calculés, plus
générateur libre. Trois dimensions sont désormais **fournies au
prompt** au lieu d'être « re-devinées » par le modèle :

1. **Ratios** (chapitre 3 → chapitre 8 : contacts → RDV, RDV → mandat,
   exclusivité, visites/vente, offres → compromis, compromis → acte,
   etc.).
2. **Alertes** (issues du moteur `computeRatiosAndAlerts` — sévérités
   `info` / `warning` / `error`).
3. **Financement** (agrégat `estimateTrainingFunding` + config active
   `funding_config`).

Fichier concerné : [`src/lib/ai/build-recommendation-prompt.ts`](../src/lib/ai/build-recommendation-prompt.ts).

---

## 2. Les 3 blocs autoritaires (règles 12-14 du SYSTEM_PROMPT)

### Règle 12 — Ratios sont autoritatifs

```
Les ratios fournis dans le bloc RATIOS_AUTORITATIFS sont calculés
par le moteur code (module pur `ratios-service.ts`) sur les réponses
du diagnostic. Tu NE les recalcules PAS. Tu peux les commenter, les
mettre en perspective vs le benchmark, mais tu utilises les VALEURS
telles quelles.
```

### Règle 13 — Alertes sont autoritatives

```
Les alertes fournies dans le bloc ALERTES_AUTORITATIVES ont été
détectées par le moteur code selon des règles versionnées. Tu NE
supprimes PAS d'alerte. Tu peux prioriser tes recommandations en
fonction de leur sévérité (`error` > `warning` > `info`), et tu
peux marquer les alertes que tu prends en compte dans le champ
`alertsAcknowledged` de la réponse.
```

### Règle 14 — Financement est autoritatif

```
Le bloc FINANCEMENT_AUTORITATIF fournit budget mobilisable et
disclaimer. Tu NE recomputes PAS les montants (AGEFICE, OPCO EP).
Tu conserves le préfixe « environ » sur le taux de consommation
(engagement produit vis-à-vis du dirigeant). Tu affiches le
disclaimer inchangé si tu cites un montant.
```

Rappel : la règle 15 stipule que la sortie du LLM est **JSON only**
(pas de préambule / postambule). Toute déviation → validation Zod
rejetée → bascule sur heuristique (cf. `analyze-training-need`).

---

## 3. `alertsAcknowledged` — schéma de sortie LLM

Ajouté au `RecommendationSchema` ([`src/lib/ai/recommendation-schema.ts`](../src/lib/ai/recommendation-schema.ts)) :

```ts
alertsAcknowledged: z.array(z.string()).optional().default([])
```

- **Optionnel côté LLM** (le modèle peut oublier ce champ, on retombe
  sur `[]`).
- **Obligatoire côté type inféré** (Zod produit un tableau, jamais
  `undefined`).
- Contenu attendu : liste de `code`s d'alertes tels qu'ils apparaissent
  dans le bloc `ALERTES_AUTORITATIVES` (ex : `contacts_to_rdv_below_benchmark`,
  `missing_required_data:prospecting-methods`).
- Les 4 constructeurs manuels de `Recommendation` (heuristique locale +
  3 routes historiques) initialisent `alertsAcknowledged: []` par
  défaut.

Usage cockpit (à venir) : afficher un badge « IA a acknowledgé N/M
alertes » sur la fiche recommandation — signal de qualité du raisonnement
LLM.

---

## 4. Flow d'appel `/api/analyze-training-need`

Ordre v1.0b (chronologique dans le handler) :

1. `requireApiRole(INTERNAL_APP_ROLES)` — gate d'auth.
2. `assertCanAccessDiagnostic(profile, diagnosticId)` — ownership.
3. `checkAiRateLimit` — préserve le budget OpenRouter.
4. Chargement Supabase : diagnostic + client + answers + **participants**
   + colonnes v1.0 (`ventes_n_moins_1`, `ca_global_n_moins_1`,
   effectifs, `activite_repartition`).
5. `getActiveFundingConfig()` — lecture `funding_config` avec fallback
   défauts.
6. `computeRatiosAndAlerts(...)` — moteur pur.
7. `estimateTrainingFunding(...)` — agrégat participants + config.
8. `buildRecommendationPrompt({ ..., ratios, alerts, fundingSummary })`
   — 3 blocs injectés.
9. `callLlm(prompt)` puis validation Zod → fallback heuristique si KO.
10. `persistRecommendation` + `logAiGeneration` + `createActivityLog`.

**Mode inline hérité MVP1** (payload direct sans passer par Supabase) :
les 3 blocs restent `null` — le prompt fonctionne comme avant v1.0b
(rétro-compat).

---

## 5. Références

- [`src/lib/ai/build-recommendation-prompt.ts`](../src/lib/ai/build-recommendation-prompt.ts) — prompt + `PromptInputs`.
- [`src/lib/ai/recommendation-schema.ts`](../src/lib/ai/recommendation-schema.ts) — `RecommendationSchema` (Zod) + `alertsAcknowledged`.
- [`src/app/api/analyze-training-need/route.ts`](../src/app/api/analyze-training-need/route.ts) — chaînage v1.0b.
- [`docs/funding-referential-prd.md`](funding-referential-prd.md) — bloc financement (formules, `funding_config`, taux consommation).
- [`docs/ai-monitoring-prd.md`](ai-monitoring-prd.md) — journalisation.
- [`docs/ai-rate-limiting-prd.md`](ai-rate-limiting-prd.md) — rate limit.
- [`docs/ai-budget-prd.md`](ai-budget-prd.md) — budget mensuel.
