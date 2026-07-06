# PRD — Référentiel financement Start Academy (v1.0)

> Source de vérité pour l'estimation de prise en charge dans les
> propositions commerciales. Toutes les valeurs sont **indicatives** —
> l'organisme financeur reste seul décisionnaire dossier par dossier.

---

## 1. Objectifs

- Rendre les seuils / plafonds AGEFICE et OPCO EP **paramétrables**
  sans redeploy (correctif de production sans PR code).
- **Versionner** les changements — un dossier passé conserve les
  règles qui étaient actives à sa date de génération (historique
  auditable).
- Fournir un **fallback** rétro-compatible côté code : sans base,
  les constantes MVP restent la source de vérité.
- Aligner tous les calculs sur un **taux de consommation** unique
  affiché en « environ X % » (correction 6 du référentiel diagnostic).

---

## 2. Schéma `funding_config`

Migration : `supabase/migrations/20260703100000_add_funding_config.sql`.

```sql
create table public.funding_config (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,
  value_numeric  numeric,
  value_text     text,
  valid_from     date not null default current_date,
  valid_to       date,           -- null = actif
  notes          text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Index partiel unique : une seule ligne active par key
create unique index funding_config_active_key_uidx
  on public.funding_config (key)
  where valid_to is null;
```

**RLS** : SELECT `is_internal_user()`, INSERT/UPDATE/DELETE `is_admin()`.
Pas d'accès `anon` — les valeurs ne sont pas sensibles mais l'écriture
doit rester tracée à un admin identifiable.

---

## 3. Clés seed (v1.0)

| Clé | value_numeric | Sémantique |
|---|---|---|
| `AGEFICE_THRESHOLD` | `7000` | Seuil CA N-1 (€) au-delà duquel un agent commercial indépendant est **potentiellement éligible** AGEFICE |
| `AGEFICE_ANNUAL_CAP` | `3000` | Plafond annuel indicatif AGEFICE par indé éligible (€) |
| `CONSUMPTION_LEVER_PERCENT` | `30` | Sous ce % de consommation 24 mois → activer le levier commercial « vos droits sont sous-utilisés » |
| `OPCO_EP_ANNUAL_CAP` | `2500` | Plafond annuel indicatif OPCO EP par salarié éligible (€) — **« valeur indicative à valider »** (notes seed explicites) |

Le seed est aligné avec les constantes de
[`src/lib/pricing/training-funding.ts`](../src/lib/pricing/training-funding.ts)
(`FUNDING_REVENUE_THRESHOLD`, `MAX_ESTIMATED_FUNDING_PER_ELIGIBLE_PARTICIPANT`,
`OPCO_EP_ANNUAL_CAP_DEFAULT`, `CONSUMPTION_LEVER_PERCENT_DEFAULT`).

---

## 4. Procédure de rotation d'une valeur

```sql
-- 1. Clore la ligne active (elle devient historique).
update public.funding_config
set    valid_to = current_date
where  key = 'AGEFICE_THRESHOLD'
  and  valid_to is null;

-- 2. Insérer la nouvelle valeur (l'index partiel garantit qu'il n'y en
--    a jamais deux « en cours » simultanément).
insert into public.funding_config (key, value_numeric, notes)
values ('AGEFICE_THRESHOLD', 8000, 'Ajusté après note AGEFICE 2027-Q1.');
```

L'index partiel unique **`funding_config_active_key_uidx`** garantit
l'invariant : `for key K, count(where valid_to is null) ≤ 1`.

---

## 5. Fallback constantes (chemin code)

`getActiveFundingConfig()` ([`src/lib/pricing/funding-config-service.ts`](../src/lib/pricing/funding-config-service.ts))
retourne toujours un `FundingConfig` :

1. **Client Supabase indisponible** (env manquantes) → renvoie
   `DEFAULT_FUNDING_CONFIG`.
2. **Erreur de lecture** (data null + error) → même fallback silencieux.
3. **Clé partielle absente** en base → seule cette clé retombe sur son
   défaut, les autres viennent de la base.
4. **value_numeric non-finite** (string vide, texte) → défaut.

Tests couvrant les 4 cas : [`funding-config.test.ts`](../src/lib/pricing/funding-config.test.ts).

---

## 6. `estimateOpcoBudget(count, config?)`

Signature : `estimateOpcoBudget(eligibleSalariesCount, config?) → { eligibleSalariesCount, annualCapPerSalarie, estimatedAnnualBudget, disclaimer }`.

Règle : `estimatedAnnualBudget = max(0, ⌊count⌋) × opcoEpAnnualCap`.
- Compte négatif → clampé à 0 (invariant testé).
- Sans config → `opcoEpAnnualCap = 2500`.
- Avec config → override.

Sert au cockpit interne (Diagnostics avec alertes) et au bloc
« Potentiel de financement » dans la proposition. **Ne se substitue
pas au dossier OPCO** : `disclaimer = FUNDING_DISCLAIMER`.

---

## 7. Taux de consommation des droits sur 24 mois

`computeConsumptionRate(input): ConsumptionRateEstimate`.

**Formule** :
- Numérateur : `Σ consumed24m[i]` (les `null` sont **ignorés**, jamais
  transformés en 0 arbitraire — cela signalerait de la consommation
  fictive).
- Dénominateur : `ageficeAnnualCap × 2 × ageficeEligibleCount + opcoEpAnnualCap × 2 × opcoEligibleCount`.
  - `× 2` car période 24 mois.
  - Approximation MVP : pas de modulation par convention / temps de
    travail. La granularité viendra si un dossier réel le nécessite.
- `percent = round(numerator/denominator × 1000) / 10` (arrondi 0.1 %).
- **Dénominateur = 0 → `percent = null`**, `label = "Taux de consommation non estimable (budget mobilisable inconnu)"`. **Jamais NaN.**

### Correction 6 — libellé « environ »

Quand `percent ≠ null`, le libellé est toujours de la forme :
```
Environ 62.0 % des droits mobilisables consommés sur 24 mois (estimation)
```
- Le `label` est prêt à afficher — l'UI et le prompt IA **NE le
  reformattent PAS**.
- Le préfixe « Environ » (majuscule initiale) est un engagement produit
  vis-à-vis du dirigeant : on n'affirme jamais un chiffre exact quand
  l'observation vient de déclaratif.

### Levier commercial < 30 %

`belowLeverThreshold = (percent < consumptionLeverPercent)` — quand
vrai, le moteur ratios/alertes émet l'alerte
`consumption_rate_below_lever` (chapitre 2, sévérité **info**) qui
active dans le prompt IA la phrase « vos droits sont sous-utilisés,
levier commercial disponible ». Le seuil `consumptionLeverPercent` vit
en `funding_config`.

---

## 8. Contrat `missing_required_data` (correction 4)

Le moteur `computeRatiosAndAlerts` émet une alerte
`missing_required_data:<questionId>` (chapitre = celui de la question,
sévérité **warning**) **uniquement** quand :

1. La question est `required: true` dans le référentiel
   ([`src/lib/data/diagnostic-questions.ts`](../src/lib/data/diagnostic-questions.ts)).
2. **ET** elle a une **trace** dans `answers` : soit `isSkipped: true`,
   soit `answer` null / vide (`""` / whitespace-only).

**Limitation acceptée — diagnostic abandonné en cours de route** :
tant qu'une question required **n'a pas de trace** dans `answers`
(l'utilisateur a arrêté avant d'y arriver), aucune alerte
`missing_required_data` n'est émise. C'est intentionnel :

- Le moteur ne connaît pas la position courante dans le flow.
- Alerter sur toutes les required jamais présentées (parce que filtrées
  par profil, ou parce que le diagnostic est incomplet) produirait du
  bruit massif à chaque brouillon.
- L'UI cockpit signale déjà l'état « diagnostic en cours »
  (`status = 'in_progress'`).

**Conséquence** : un diagnostic abandonné très tôt aura peu ou pas
d'alertes `missing_required_data`. Le cockpit `Diagnostics avec
alertes` reste donc un compteur de **qualité** (des données
manquantes détectées), pas de **volume** (des cases à cocher).

Tests couvrant les 3 cas : [`ratios-service.test.ts`](../src/lib/diagnostics/ratios-service.test.ts).

---

## 9. Références

- [`src/lib/pricing/training-funding.ts`](../src/lib/pricing/training-funding.ts) — moteur pur.
- [`src/lib/pricing/funding-config-service.ts`](../src/lib/pricing/funding-config-service.ts) — service de lecture (server-only).
- [`src/lib/diagnostics/ratios-service.ts`](../src/lib/diagnostics/ratios-service.ts) — moteur ratios/alertes (v1.0).
- [`supabase/migrations/20260703100000_add_funding_config.sql`](../supabase/migrations/20260703100000_add_funding_config.sql) — création + seed.
- Tests : `training-funding.test.ts`, `funding-config.test.ts`, `ratios-service.test.ts` (39 tests / 3 fichiers).
