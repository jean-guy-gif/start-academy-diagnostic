# Budget IA mensuel — PRD

## 1. Objectif

Suivre une enveloppe mensuelle estimée pour OpenRouter et afficher
une alerte cockpit lorsque le seuil approche / est dépassé.

Complète :
- [ai-monitoring-prd.md](ai-monitoring-prd.md) — monitoring par appel.
- [ai-rate-limiting-prd.md](ai-rate-limiting-prd.md) — limite par
  user / route.

Le présent PRD couvre la **vue agrégée** : combien on a dépensé ce
mois calendaire, quelle marge il reste, faut-il s'inquiéter ?

## 2. Périmètre MVP

- **Aucun blocage automatique** : seuls warning / exceeded sont
  surfacés en cockpit. Les routes IA continuent d'autoriser
  l'appel même si le budget est dépassé.
- **Pas de table dédiée** : on ré-utilise `ai_generation_logs.cost_estimate`
  (déjà calculé par `estimateOpenRouterCost`).
- **Pas d'alerte email** : observable uniquement dans `/cockpit`.

## 3. Variables d'environnement

Documentées dans `.env.example` :

| Variable | Défaut | Rôle |
|---|---|---|
| `AI_MONTHLY_BUDGET_EUR` | _(non défini)_ | Budget mensuel en EUR. Si vide / non numérique → status `not_configured`. |
| `AI_MONTHLY_WARNING_THRESHOLD_PERCENT` | `80` | Seuil d'alerte (en %). Doit être dans `]0, 100]`. |

Lues côté server-only par
[`readAiBudgetConfig()`](../src/lib/ai/ai-monitoring-service.ts).
La clé n'est jamais exposée au client.

## 4. Calcul

```
windowStart  = 1er du mois calendaire courant à 00:00 (local server)
spentEur     = somme(ai_generation_logs.cost_estimate where created_at >= windowStart)
percentUsed  = spentEur / budgetEur × 100
remainingEur = max(0, budgetEur − spentEur)
```

Status :

| Status | Condition |
|---|---|
| `not_configured` | `AI_MONTHLY_BUDGET_EUR` absent / invalide |
| `ok` | `percentUsed < warningThreshold` |
| `warning` | `percentUsed >= warningThreshold && < 100` |
| `exceeded` | `percentUsed >= 100` |

Si Supabase est indisponible (admin client null en local), on
renvoie `spentEur = 0` (et `status = "ok"` ou `not_configured`) —
jamais crash. Le cockpit reste fonctionnel.

## 5. Limites MVP

- **`cost_estimate` est une estimation** (pas une facture OpenRouter
  réelle). Les vrais coûts peuvent diverger de ±10–20 % (cache
  prompts, tarif modèle qui change, etc.). Volontairement
  conservateur (cf. ai-monitoring-prd §5).
- **Pas de répartition** par utilisateur / route / type de génération
  — c'est un agrégat global.
- **Mois calendaire local serveur** : pas de gestion explicite des
  fuseaux horaires. À reconsidérer si Start Academy s'internationalise.
- **Pas de blocage** : un commercial peut continuer à appeler l'IA
  même en `exceeded`. Le rate limiting par user/route reste actif
  et limite le débit.

## 6. UI cockpit

Bloc « Usage IA » → nouvelle section « Budget IA mensuel » en haut :

- 3 KPIs : Budget, Dépensé, Reste estimé.
- Barre de progression colorée (vert / ambre / rouge selon status).
- Badge status : OK / Attention / Dépassé / Non configuré.
- Bandeau d'alerte si `warning` ou `exceeded` :
  > Budget IA mensuel proche d'être atteint.
  > Budget IA mensuel dépassé.

Si `not_configured`, on affiche un message neutre invitant à définir
`AI_MONTHLY_BUDGET_EUR`.

## 7. Tests

À dérouler après modification des env vars :

1. **Non configuré** (`AI_MONTHLY_BUDGET_EUR` vide) :
   - cockpit affiche `Non configuré`, aucun KPI numérique, message
     d'invitation à définir la variable.
2. **Budget 50 €, dépense 5 €** : status `ok`, barre 10 %, pas de
   bandeau.
3. **Budget 50 €, dépense 40 €** (≥ 80 %) : status `warning`,
   bandeau ambre « proche d'être atteint », barre 80 %.
4. **Budget 50 €, dépense 60 €** (≥ 100 %) : status `exceeded`,
   bandeau rouge « dépassé », barre saturée à 100 % visuellement
   mais texte `120.0%`.
5. **`cost_estimate` à NULL** sur certaines lignes (cas
   `rate_limited` ou tokens absents) : la somme ignore les NULL,
   pas de crash.
6. **Supabase admin indisponible** (local sans service_role) : le
   cockpit affiche `spentEur = 0`, status `ok` (ou
   `not_configured`), aucune erreur 500.

## 8. Évolutions futures

| Étape | Quand | Effort |
|---|---|---|
| Blocage dur quand `exceeded` | si dépassement répété | faible (1 helper côté rate-limit) |
| Alerte email automatique à 80 % / 100 % | si pilote distant | moyen (intégration SMTP / Resend) |
| Budget par route ou par user (sous-enveloppes) | si commercialisation | moyen |
| Vraie consommation OpenRouter (API billing) en lieu de l'estimate | si OpenRouter expose l'endpoint | faible côté code |
| Mois fiscal configurable (ex. début mois = 15) | si comptabilité spécifique | faible |
| Historique mensuel (graphe coûts par mois) | si supervision long terme | moyen |
| Webhook vers Slack / Discord | si équipe distribuée | faible |

## 9. Sécurité

- `AI_MONTHLY_BUDGET_EUR` et `AI_MONTHLY_WARNING_THRESHOLD_PERCENT`
  sont des variables non-sensibles ; pas de NEXT_PUBLIC_ pour ne
  pas les exposer côté client. Lecture exclusivement server-side.
- L'agrégat passe par `createSupabaseAdminClient()` → bypass RLS
  (cohérent : c'est un KPI interne agrégé, pas une donnée client).
- L'accès au cockpit est gated par `requireRole(INTERNAL_APP_ROLES)`.
