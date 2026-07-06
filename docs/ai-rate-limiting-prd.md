# Rate limiting IA / OpenRouter — PRD

## 1. Objectif

Protéger le budget OpenRouter (Sonnet 4.5 ≈ 3 $ / 1M tokens en
entrée, 15 $ en sortie — cf. `ai-monitoring-prd.md`) contre les
appels IA répétés (clic frénétique, bug front, abus interne).

Le rate limiting est **complémentaire** des gardes d'ownership
(audit `security-final-audit-preprod.md` §I-1 → I-5) : ownership
empêche d'appeler l'IA sur les ressources d'un collègue ; rate
limiting empêche d'exploser le budget sur ses propres ressources.

## 2. Routes protégées

| Route | Fenêtre | Limite |
|---|---|---|
| `POST /api/analyze-training-need` | 60 min | 20 appels / user |
| `POST /api/generate-training-proposal` | 60 min | 15 appels / user |
| `POST /api/generate-training-support` | 60 min | 8 appels / user |
| `POST /api/design-training-support` | 60 min | 6 appels / user |

Les limites sont définies dans
[`AI_ROUTE_LIMITS`](../src/lib/ai/ai-rate-limit-service.ts) et
peuvent être ajustées sans migration SQL.

## 3. Comportement

### 3.1 Ordre d'exécution (obligatoire)

Chaque route IA suit cet ordre :

1. `requireApiRole(INTERNAL_APP_ROLES)` — refus 401/403 avant
   parsing.
2. Parsing Zod du body — refus 400 si invalide.
3. `assertCanAccessDiagnostic` / `assertCanAccessSession` — refus
   403 sans rien compter dans le rate limit.
4. **`checkAiRateLimit({ userId, route })`** — refus 429 si limite
   dépassée.
5. Chargement Supabase + appel OpenRouter (ou heuristique).
6. `logAiGeneration({...status: "success" | "fallback" | "error"})`.

### 3.2 Réponse 429

```json
{
  "ok": false,
  "code": "rate_limited",
  "error": "Limite d'usage IA atteinte. Réessayez plus tard."
}
```

`resetAt` n'est pas exposé au caller (approximation conservatrice
côté serveur, cf. §6).

### 3.3 Journalisation

Quand un appel est refusé, on insère une ligne
`ai_generation_logs` avec :

- `status = "rate_limited"` (nouvelle valeur — migration
  `20260610100000_ai_logs_status_rate_limited.sql`).
- `source = null` (aucune inférence IA n'a eu lieu).
- `provider = "rate-limiter"`.
- `model = null`.
- `created_by = userId`.
- `route = "/api/..."` (la même que la route bloquée).
- `error = "Rate limit: X/Y appels sur la fenêtre."`.

Avantage : le cockpit "Usage IA" et l'historique global montrent
ces refus comme n'importe quel autre événement IA. Pas de table
dédiée à maintenir.

## 4. Pourquoi `ai_generation_logs` (pas de Redis)

- **MVP-friendly** : pas de nouvelle infra à déployer.
- **Fiable assez** : `created_by` est posé sur chaque ligne par les
  routes IA (`logAiGeneration(..., createdBy: auth.profile.id)`).
  Le count par user + route est exact à ±une milliseconde.
- **Observable** : les refus apparaissent dans la même table que les
  réussites → un seul endroit à regarder pour l'audit.

Limites acceptées en MVP :
- Pas de protection contre un burst dans une même milliseconde
  (lecture/écriture non-transactionnelle).
- Pas de protection par IP — un même user qui distribue le token
  utilise la même limite.
- L'appel à `checkAiRateLimit` ajoute un round-trip Postgres
  (un `count(*)` avec index sur `(created_by, route, created_at)`).
  Coût négligeable comparé au LLM lui-même.

## 5. Failopen vs failclose

Le service `checkAiRateLimit` peut retourner
`{ ok: false, reason: "supabase_unavailable" | "query_failed" |
"unconfigured" }` quand l'infra est dégradée.

**Politique MVP : failopen.** Les routes IA traitent le `ok: false`
comme "pas de blocage" et laissent l'appel passer. Justification :
préférer un éventuel sur-coût ponctuel à un blocage de toute la
production sur une panne Supabase mineure. Le monitoring IA
remontera la dérive éventuelle.

Si demain on bascule en mode "failclose", il suffit de changer
3 lignes dans chaque route (`if (!rate.ok) return formatRateLimitError()`).

## 6. Reset approximatif

`resetAt` est calculé comme `now() + windowMinutes`. C'est une
**borne haute** : le slot le plus ancien dans la fenêtre expirera
au plus tard à ce moment-là, donc le caller pourra réessayer
au moins à ce point. Pas exposé au client en MVP — l'API renvoie
juste « Réessayez plus tard ».

Si on veut un reset exact (plus tôt), il faudrait une requête
supplémentaire `min(created_at) where ... → resetAt = min + window`.
Réservé à une évolution future.

## 7. Observabilité

### 7.1 Cockpit

Bloc « Usage IA » (`/cockpit`) :
- La KPI « Fallback heuristique » affiche en sous-titre le nombre
  d'erreurs **et** le nombre de refus rate limit sur 7 jours :
  > 3 erreurs sur 7 jours. · 5 bloqués rate limit.
- Les badges dans la liste « 5 derniers appels » utilisent un ton
  orange pour `status = rate_limited` (distinct du rouge `error`
  et du vert `success`).

### 7.2 Requête manuelle

```sql
-- Refus rate limit sur les 7 derniers jours, par user + route
select
  created_by,
  route,
  count(*) as refusals
from public.ai_generation_logs
where status = 'rate_limited'
  and created_at >= now() - interval '7 days'
group by created_by, route
order by refusals desc;
```

## 8. Évolutions futures

| Étape | Quand | Effort |
|---|---|---|
| Cache mémoire process (LRU 1 min) | si > 1000 req/s | faible |
| Redis / Upstash sliding window précis | si SaaS / multi-tenant | moyen |
| Rate limit par IP (proxy header) | si exposition externe | moyen |
| Budget mensuel global avec alerte e-mail | si pilote distant | moyen |
| `resetAt` exact dans la réponse 429 | si UX dédiée | faible |
| Tarification adaptive (limites par tier) | si commercialisation | moyen |

## 9. Tests

À dérouler après `supabase db push` de la migration
`20260610100000_ai_logs_status_rate_limited.sql` :

1. Admin / commercial propriétaire : appel normal → 200, slot
   consommé.
2. Répéter 20× la route `/api/analyze-training-need` → 21ᵉ appel
   → 429 `{ ok: false, code: "rate_limited", ... }`.
3. **Aucun appel OpenRouter** ne doit être déclenché après le 429
   (vérifier dans `ai_generation_logs` : la ligne 21 a `provider =
   "rate-limiter"`, `source = null`, `status = "rate_limited"`).
4. Refus ownership (commercial B sur diagnostic A) → 403 → la
   tentative ne compte PAS dans le rate limit du commercial B.
5. Sans auth → 401 → idem, pas comptée.
6. Cockpit : KPI "Usage IA" remonte `5 bloqués rate limit` si on
   est >= 5 refus sur 7 jours.

## 10. Configuration

Aucune variable d'environnement nécessaire — les limites sont
codées dans `AI_ROUTE_LIMITS`. Pour ajuster :

1. Modifier la constante dans
   `src/lib/ai/ai-rate-limit-service.ts`.
2. `npm run dev` → tester.
3. Re-déployer.

Pas de hot-reload. Si on veut une config dynamique (DB ou env),
prévoir une migration légère + un cache de 60 s côté serveur.
