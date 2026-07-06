# Monitoring IA / coûts OpenRouter — PRD

## 1. Objectif

Donner à Start Academy une vue interne et instrumentée de l'usage de
l'IA (OpenRouter) : combien on appelle, sur quelles routes, avec quel
modèle, combien ça coûte approximativement, et combien de fois on
bascule sur le moteur heuristique local.

Pas de SaaS exposé, pas de dashboard public — uniquement le cockpit
interne et la table `ai_generation_logs` côté Supabase.

## 2. Périmètre MVP

- **Une seule table** : `ai_generation_logs` (héritée MVP1) étendue
  par la migration `20260601100000_extend_ai_generation_logs.sql`.
- **Quatre routes** instrumentées :
  - `POST /api/analyze-training-need`
  - `POST /api/generate-training-proposal`
  - `POST /api/generate-training-support`
  - `POST /api/design-training-support`
- **Best-effort** : un échec d'écriture monitoring ne fait JAMAIS
  échouer la génération métier (`void logAiGeneration(...)` +
  try/catch silencieux dans le service).
- **Cockpit** : bloc « Usage IA » avec 4 KPI + 5 derniers appels +
  alerte dernière erreur.

## 3. Champs `ai_generation_logs` (post-migration)

Champs existants conservés :

| colonne | type | rôle |
|---|---|---|
| `id` | uuid | clé primaire |
| `diagnostic_id` | uuid (FK) | rattachement diagnostic |
| `recommendation_id` | uuid (FK) | rattachement recommandation |
| `session_id` | uuid (FK) | rattachement session |
| `provider` | text NOT NULL | `openrouter` ou `internal-heuristic` |
| `model` | text | modèle OpenRouter utilisé (`anthropic/claude-sonnet-4.5`…) |
| `purpose` | text | legacy MVP1 — slug intent (`analyze`, `generate_proposal`…) |
| `duration_ms` | integer | latence call LLM |
| `tokens_input` | integer | prompt_tokens OpenRouter |
| `tokens_output` | integer | completion_tokens OpenRouter |
| `cost_estimate` | numeric | coût estimé EUR (cf. §5) |
| `error` | text | message d'erreur tronqué (≤ 500 chars) |
| `created_by` | uuid (FK profiles.id) | user déclencheur |
| `created_at` | timestamptz | auto |

Champs ajoutés par cette migration :

| colonne | type | rôle |
|---|---|---|
| `route` | text | route API précise (`/api/generate-training-support`) |
| `source` | text check (`llm` / `heuristic`) | quel moteur a produit la sortie |
| `total_tokens` | integer | `tokens_input + tokens_output` (cache pour agrégations) |

Le `status` check est étendu pour autoriser `fallback` en plus de
`success / error / partial` (existants MVP1).

`prompt` et `response` (colonnes jsonb existantes) restent dans le
schéma pour la rétro-compat, mais **les routes n'écrivent plus dedans**
— `logAiGeneration` y stocke `null`.

## 4. Politique de données — ce qu'on NE LOGGE PAS

- **Prompt complet** (système + user). Trop long, trop sensible.
- **Réponse complète** du LLM. Même raison.
- **Clés OpenRouter** ou autres secrets — jamais sérialisés.
- **Contenu client** : nom du dirigeant, email, production N-1,
  contenu du diagnostic.
- **Messages d'erreur OpenRouter > 500 caractères** : tronqués, car
  ils peuvent citer le prompt.

OK :

- Route applicative (`/api/...`).
- Métriques techniques (`duration_ms`, `tokens_input`,
  `tokens_output`, `total_tokens`).
- Identifiants techniques (`session_id`, `diagnostic_id`,
  `recommendation_id`).
- Source (`llm` / `heuristic`) et status
  (`success` / `fallback` / `error` / `partial`).
- Coût estimé en euros.
- Modèle utilisé (chaîne publique OpenRouter).

## 5. Estimation de coût

Approximation, **non contractuelle**. Calcul côté
`estimateOpenRouterCost(input)` dans
`src/lib/ai/ai-monitoring-service.ts` :

```text
USD = (tokens_input  / 1_000_000) * pricing.input
    + (tokens_output / 1_000_000) * pricing.output

EUR = USD * 0.92 (taux figé MVP)
```

Tarifs en USD par 1M tokens — table `MODEL_PRICING_USD_PER_MTOK`,
volontairement conservatrice (repères ~mai 2026, à actualiser
manuellement).

Si `tokens_input` ET `tokens_output` sont absents (OpenRouter ne
renvoie pas toujours `usage`), `cost_estimate` reste `null`. Pas de
fabrication de chiffre — mieux vaut un trou qu'une donnée fausse.

## 6. Statuts (`status`)

| valeur | signification |
|---|---|
| `success` | OpenRouter a répondu, validation Zod OK, source = `llm` |
| `fallback` | OpenRouter indispo / Zod refusé → moteur heuristique appelé, source = `heuristic` |
| `error` | Exception réseau / 5xx OpenRouter ; l'app a basculé en heuristique pour l'UX, mais on tag `error` ici |
| `partial` | Legacy MVP1 — non utilisé par la nouvelle instrumentation, conservé pour rétro-compat |

## 7. Best-effort — JAMAIS bloquant

Contrat dur :

1. `logAiGeneration(input)` est appelée via `void` (pas d'`await`)
   APRÈS la persistance principale et avant le `return NextResponse.json`.
2. Le service est entièrement try/catch interne. Une exception
   `console.warn` puis retourne `null`.
3. Si Supabase service_role est indisponible, on `console.warn` et on
   sort. Pas d'erreur HTTP.

Conséquence : si demain la table est inaccessible, l'app continue de
générer recommandations / propositions / supports sans interruption.

## 8. UI cockpit

Bloc « Usage IA » dans `/cockpit` :

- 4 KPI cards : appels aujourd'hui, 7 jours, coût estimé 7 jours,
  taux de fallback (avec couleur ambre si > 30 %).
- Bandeau « Dernière erreur » (si présente) avec route, message
  tronqué, timestamp.
- Liste des 5 derniers appels : status badge, route, source, modèle,
  durée, tokens, coût.

Vide → message neutre :

> Aucun appel IA enregistré pour le moment.

## 9. Page détaillée (optionnelle)

Pas créée en MVP. Le cockpit suffit pour piloter au jour le jour.
Quand l'équipe aura besoin d'analyser des tendances par route /
période / status, on créera `/settings/ai-usage` (liste + filtres
période / route / status).

## 10. Évolutions envisagées

- **Budget mensuel** : alerte à 80 % d'un plafond configurable.
- **Rate limiting** par route et par user.
- **Modèle par route** : un Sonnet pour le design (long), un Haiku
  pour l'analyse (court) — pilotage via variables d'env dédiées.
- **Dashboard détaillé** `/settings/ai-usage` avec filtres et export
  CSV.
- **Rafraîchir les tarifs** : OpenRouter expose les prix par modèle
  via API publique — possible automatisation.
- **Webhook coût réel** : si OpenRouter renvoie un coût réel dans
  `usage`, le persister en plus de l'estimation pour comparer.
