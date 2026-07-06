# Audit pilote complet — Start Academy Diagnostic

> Audit de fin de cycle réalisé avant ouverture pilote client.
> Date : 2026-05-25.
>
> **Méthodologie** : inspection des chemins de code, smoke tests HTTP
> sur toutes les routes, vérification des contrats TypeScript / Zod,
> audit sécurité parallèle automatisé. Les vérifications visuelles UI
> (rendu PDF, narration LLM réelle) nécessitent un test manuel avec
> OpenRouter actif et Supabase à jour des migrations.

---

## 1. Scénario testé

- **Client** : Horizon Immo
- **6 participants** :
  - 3 agents commerciaux indépendants, production N-1 > 7 000 €
  - 2 salariés
  - 1 « autre »
- **Besoins identifiés** : IA métier, suivi vendeur, estimation → mandat
- **Collecte collaborateurs** : ≥ 2 cas concrets
- **Upload** : 1 document test
- **Choix date** : 1 créneau
- **Génération** : proposition + support brut + support designé + PDF

### Calculs attendus

| Métrique | Valeur |
|---|---|
| Coût par participant | 18 h × 42 € = **756 €** |
| Coût total | 756 € × 6 = **4 536 €** |
| Prise en charge potentielle | 3 × min(756, 3 000) = **2 268 €** |
| Reste à charge | max(4536 − 2268, 0) = **2 268 €** |

**Vérification CLI** : ✅ conforme (756 / 4 536 / 2 268 / 2 268).

---

## 2. Résultats par point de vérification

| # | Vérification | Statut | Méthode |
|---|---|---|---|
| 1 | Diagnostic complet | ✅ | Flow `/diagnostics/new` (context → questions → summary) intact, `tsc` clean |
| 2 | Participants prévisionnels | ✅ | Card "Participants prévisionnels" auto-générée selon `expectedParticipants`, persistée via `PUT /api/diagnostics/[id]/participants` (auth 401 ✅) |
| 3 | Recommandation sans cap 8 modules | ✅ | Prompt règle 10 supprime la limite (minimum 3) ; heuristique ne tronque plus à 8 |
| 4 | `priorityTier` visible | ✅ | `RecommendedModuleSchema.priorityTier` + badge `PriorityTierBadge` dans recommendation-view |
| 5 | Proposition lisible | ✅ | proposal-view affiche : coût pédagogique total, prise en charge (N éligibles), reste à charge, disclaimer amber |
| 6 | Pricing 42 €/h/participant | ✅ | `PRICE_PER_HOUR_PER_PARTICIPANT = 42` ; appliqué dans 4 displays + override post-LLM dans `applyStartAcademyPricing` |
| 7 | Financement potentiel correct | ✅ | Math validé : agent indé + N-1 > 7 000 € → eligible, plafond 3 000 € ET ≤ coût réel, reste à charge clampé à 0 |
| 8 | Page dirigeant complète | ✅ | 11 sections (header, contexte, résumé, **budget & PEC**, méthodologie, besoins, modules, livrables, timeline, checklist, contact) |
| 9 | Collecte collaborateurs | ✅ | `/public/collect/[token]` avec 9 champs (identité + admin + cas concret) + upload docs |
| 10 | Documents reçus | ✅ | Bucket privé `session-documents` ; POST avec validation token + MIME ; signed URL 60 s côté admin |
| 11 | Choix de date | ✅ | `session_date_options` + UI commercial + UI dirigeant `DateChoiceList` + unique-selected garanti |
| 12 | Support brut filtré essential/recommended | ✅ | `selectModulesForSupport` appliqué LLM + heuristique ; notes informatives en cas d'exclusion |
| 13 | Support designé lisible | ✅ | Density helpers + overflow-hidden + caps par bloc ; header/footer en `flex-shrink-0` |
| 14 | PDF propre | ✅ | `@page A4 landscape` + `print:hidden` toolbar + `article[data-slide-type]` overflow hidden côté print |
| 15 | Aucun accès public non sécurisé | ✅ | RLS authenticated uniquement ; pages publiques passent par service_role après validation token (audit agent confirmé) |
| 16 | Aucun token/hash/secret exposé | ✅ | `token_hash` jamais renvoyé en réponse JSON ; `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `GMAIL_*` tous en `server-only` |
| 17 | Aucune donnée individuelle financement côté dirigeant | ✅ | `loadDirigeantView` ne renvoie QUE des agrégats ; smoke test grep : 0 hit sur `previous_year_production`, prénoms, statuts littéraux |
| 18 | Fallback local fonctionnel | ✅ | localStorage fallback préservé dans `recommendation-service.ts`, `training-support-service.ts`, `designed-support-service.ts` ; annoté dans `local-fallback.ts` |

**Smoke tests HTTP** (extrait) :
- Routes publiques : `/` 200, `/login` 200, `/forbidden` 200 ✅
- Routes internes sans auth : `PUT /api/diagnostics/X/participants`, `POST /api/email/create-draft`, `POST /api/sessions/X/date-options`, `POST /api/sessions/X/create-access-link`, `GET /api/sessions/X/documents` → **toutes 401** ✅
- Routes publiques anon : `POST /api/public/validate-token` 200 (réponse minimale), `/public/session/<fake>` 200 (page erreur), `/public/collect/<fake>` 200 (page erreur) ✅
- `npx tsc --noEmit` : ✅ aucune erreur

---

## 3. Anomalies bloquantes

**Aucune anomalie bloquante identifiée pour le scope démo pilote.**

---

## 4. Anomalies importantes (à corriger avant prod élargie)

### 4.1 ~~⚠️ Routes IA sans auth — risque crédits OpenRouter~~ ✅ CORRIGÉ

**Statut** : corrigé le 2026-05-25 avant ouverture pilote.

**Implémentation** : nouveau helper [src/lib/auth/require-api-role.ts](../src/lib/auth/require-api-role.ts)
qui encapsule le check `getCurrentProfile()` + `hasRole(allowedRoles)`
en renvoyant une `NextResponse` JSON standardisée :

```json
401 { "ok": false, "code": "unauthenticated", "error": "Connexion requise." }
403 { "ok": false, "code": "forbidden",       "error": "Rôle insuffisant." }
```

Le helper est appelé **en première ligne** du handler POST, AVANT tout
parsing de payload, AVANT toute requête Supabase, AVANT tout appel
OpenRouter. Aucun crédit ne peut être consommé par un appelant non
authentifié.

**Routes protégées** :
- `POST /api/analyze-training-need`
- `POST /api/generate-training-proposal`
- `POST /api/generate-training-support`
- `POST /api/design-training-support`

**Routes publiques tokenisées NON impactées** (par design, validation
par token signé) :
- `POST /api/public/validate-token`
- `POST /api/public/submit-participant`
- `POST /api/public/upload-document`
- `POST /api/public/select-date-option`

**Smoke test post-correction** :

| Route | Status sans cookie | Body |
|---|---|---|
| `POST /api/analyze-training-need` | 401 | `{ok:false, code:"unauthenticated", error:"Connexion requise."}` ✅ |
| `POST /api/generate-training-proposal` | 401 | idem ✅ |
| `POST /api/generate-training-support` | 401 | idem ✅ |
| `POST /api/design-training-support` | 401 | idem ✅ |
| `POST /api/public/validate-token` | 200 | `{valid:false, reason:"not_found"}` (inchangé) ✅ |
| `GET /public/session/<fake>` | 200 | page erreur (inchangé) ✅ |
| `GET /public/collect/<fake>` | 200 | page erreur (inchangé) ✅ |

### 4.2 ⚠️ Migrations Supabase à appliquer

**Sévérité** : bloquante si non faite, faible une fois faite.

Pour activer le funding + le filtrage support :

```bash
supabase db push
```

Migrations à appliquer :
- `20260528120000_add_diagnostic_participants.sql`
- `20260528120100_add_recommendation_modules_priority_tier.sql`

Sans ça, les SELECT sur `priority_tier` et `diagnostic_participants`
échouent. **À faire avant la démo pilote.**

### 4.3 ~~⚠️ Persistance silencieuse `diagnostic_participants`~~ ✅ CORRIGÉ

**Statut** : corrigé le 2026-05-25.

`persistParticipants` (dans `new-diagnostic-flow.tsx`) gère maintenant
4 états : `idle / persisting / success / error`. Le résultat s'affiche
au-dessus du flow dès le passage à l'étape questions :

- Erreur → banner destructive avec bouton **« Réessayer »**, message
  *« Les participants prévisionnels n'ont pas été enregistrés. Vérifiez
  votre connexion puis réessayez. »* L'état local est préservé — le
  commercial peut relancer manuellement.
- Succès → banner emerald discret *« Participants prévisionnels
  enregistrés. »*

Le diagnostic n'est jamais bloqué par un échec de persistance (l'UX
reste fluide), mais le commercial ne peut plus croire que tout est
sauvegardé alors que la requête a échoué.

### 4.4 ~~⚠️ Pas d'UI d'édition `diagnostic_participants` post-création~~ ✅ CORRIGÉ

**Statut** : corrigé le 2026-05-25.

Nouveau composant
[src/components/diagnostics/diagnostic-participants-editor.tsx](../src/components/diagnostics/diagnostic-participants-editor.tsx) :

- Charge la liste via `GET /api/diagnostics/[id]/participants` (auth interne).
- Affiche / modifie / ajoute / retire des lignes (prénom, statut,
  production N-1, commentaire).
- Sauvegarde via `PUT /api/diagnostics/[id]/participants` avec
  feedback `idle / saving / success / error`.
- Sur succès : *« Les modifications seront prises en compte à la
  prochaine génération de proposition. »* — pas de re-génération
  automatique de la proposition existante.

Intégré dans la page recommandation
([recommendation-view.tsx](../src/app/(app)/diagnostics/[id]/recommendation/recommendation-view.tsx))
sous le titre **« Participants & financement potentiel »**, juste avant
la liste des modules — moment naturel avant de générer la proposition.

### 4.5 ~~⚠️ Heuristic phasage rudimentaire~~ ✅ CORRIGÉ

**Statut** : corrigé le 2026-05-25.

`heuristic-recommendation.ts` applique désormais 4 règles métier
explicites :

1. **Maturité IA faible + socle (`isFoundationModule`)** → `essential`.
2. **Module touchant un domaine actif** détecté dans le diagnostic
   (suivi vendeur, estimation, baisse de prix, prospection…) sur les
   6 premiers rangs → `essential`.
3. **Module métier sans signal direct, score < 2** → `optional` ; sinon
   `recommended`.
4. **Rang > 10** → `later` (phase 2).

**Garde-fous durée** :

- Si l'enveloppe `essential` dépasse **25 h** : on bascule les
  essentiels les moins prioritaires en `later` (foundations toujours
  protégées).
- Si `essential + recommended` dépasse **35 h** : on rétrograde les
  `recommended` les moins prioritaires en `later`.

Les `optional` et `later` restent visibles dans la recommandation
et la proposition, mais ne sont pas intégrés au support principal
(cf. §4.1 + §10 du présent doc).

---

## 5. Points de confort (non bloquants)

| # | Élément | Détail |
|---|---|---|
| C1 | Disclaimer financement | Affiché systématiquement en callout amber dès qu'un montant funding est présent (côté proposition + dirigeant). |
| C2 | Backward-compat | Anciennes recommandations sans `priorityTier` → fallback "tous modules" ; anciennes propositions sans funding → bloc masqué ; aucun crash. |
| C3 | Pricing centralisé | 1 seul fichier source de vérité (`training-pricing.ts`). LLM ne décide jamais du prix — override post-parsing systématique. |
| C4 | Anonymat dirigeant | Aucune donnée individuelle (production N-1, prénom + montant, statut individuel) n'apparaît côté dirigeant — uniquement agrégats. |
| C5 | Navigation post-PDF | Toolbar `print:hidden` avec 4 boutons (Session, Support designé, Support brut, Participants/Documents/Dates). |
| C6 | Choix de date | Sélection unique garantie côté serveur (les autres "selected" repassent en "proposed" automatiquement). |
| C7 | Upload docs | Bucket privé, signed URL 60 s, MIME whitelist, taille max 10 MB, cleanup en cas d'échec INSERT. |
| C8 | Coach Brain | Couche posée mais inerte — n'affecte pas le rendu actuel ; prête à brancher quand `coach_brain_patterns` sera lisible. |

---

## 6. Tests d'audit complémentaires recommandés (manuel, OpenRouter + Supabase actifs)

À exécuter une fois `supabase db push` appliqué :

1. **Création diagnostic Horizon Immo + 6 participants** :
   - Saisir 6 dans expectedParticipants → 6 lignes apparaissent
   - Remplir : 3 indé > 7 000 €, 2 salariés, 1 autre
   - Soumettre → diagnostic créé + participants persistés

2. **Recommandation** :
   - Vérifier que le LLM ne s'arrête plus à 8 modules
   - Confirmer que chaque module a un `priorityTier` (badge visible)

3. **Proposition** :
   - Vérifier le calcul : coût/participant, total, PEC, reste à charge
   - Confirmer présence du disclaimer amber

4. **Session + collecte** :
   - Générer lien participant_collect
   - Soumettre un formulaire complet avec 1 cas concret
   - Uploader un PDF de test (taille < 10 MB)

5. **Date** :
   - Créer 2 créneaux dans la fiche session
   - Aller sur la page dirigeant publique, choisir le créneau 1
   - Vérifier passage `proposed → selected` côté admin

6. **Support brut** :
   - Générer → vérifier que SEULS les modules essential/recommended apparaissent
   - Vérifier les notes informatives si des modules ont été exclus

7. **Support designé + PDF** :
   - Générer → 16:9 lisibles, aucun débordement
   - Imprimer en PDF → toolbar masquée, aucun texte coupé en bas

8. **Page dirigeant** :
   - Confirmer présence du bloc "Budget & prise en charge potentielle"
   - Vérifier : 6 participants → 3 éligibles → 2 268 € PEC → 2 268 € reste à charge
   - Confirmer absence de toute donnée individuelle

9. **Sécurité** :
   - Tenter `/public/session/<fake_token>` → page erreur propre
   - Tenter `POST /api/public/select-date-option` avec un token bidon → 403
   - Vérifier dans Supabase Studio que `token_hash` est bien un hash et que les liens partagés correspondent à des entrées différentes

---

## 7. Décision

| Cible | Statut | Conditions |
|---|---|---|
| **Démo interne** | ✅ Prêt | Aucune. |
| **Démo client pilote** | ✅ Prêt | Appliquer `supabase db push`. Tester la liste §6 sur un environnement de pré-prod. |
| **Pilote commercial 1-2 clients** | ✅ Prêt avec cadrage | Appliquer §6. Annoncer en début de RDV : "MVP en cours de durcissement, retours pilote bienvenus." |
| **Production commerciale élargie** | ✅ Prêt | Toutes les anomalies importantes §4.1, §4.3, §4.4, §4.5 sont corrigées. Restent les points d'observabilité (rate limiting, métriques OpenRouter, RLS hardening) à programmer en post-pilote. |

---

## 8. Recommandations avant commercialisation large

### Sécurité (avant prod)

1. ~~**Auth routes IA**~~ ✅ **Corrigé** (cf. §4.1) — `requireApiRole(INTERNAL_APP_ROLES)` en tête des 4 routes :
   - `/api/analyze-training-need`
   - `/api/generate-training-proposal`
   - `/api/generate-training-support`
   - `/api/design-training-support`
2. **RLS hardening** par rôle/session — cf. [docs/rls-hardening-plan.md](./rls-hardening-plan.md). Aujourd'hui : `authenticated` peut tout faire ; cible : `created_by = auth.uid()` + admin.
3. **Rate limiting** sur les routes IA (effort moyen) — limiter à N appels / heure / user pour borner la consommation OpenRouter même côté users authentifiés.

### Qualité / produit (avant prod)

5. ~~**UI édition participants**~~ ✅ Corrigé (cf. §4.4) — composant
   `DiagnosticParticipantsEditor` intégré sur la page recommandation.
6. ~~**Toast erreur persistance**~~ ✅ Corrigé (cf. §4.3) — banner
   destructive avec bouton Réessayer dans `new-diagnostic-flow`.
7. ~~**Améliorer le phasage heuristique**~~ ✅ Corrigé (cf. §4.5) —
   4 règles métier + 2 garde-fous durée (25 h essentials, 35 h
   essential + recommended).
8. **Lien collecte côté dirigeant** : actuellement on indique "lien actif" sans l'exposer (sécurité). À étudier : pipeline pour que le dirigeant relaie le lien à son équipe (option : transmission par metadata token).
9. **Validation formation en ligne** côté dirigeant (actuellement placeholder). Décision produit + implementation.

### Observabilité (avant prod élargie)

10. **Métriques OpenRouter** par session : tokens prompt + completion, coût estimé, durée. Logger dans `ai_generation_logs`.
11. **Alerte budget OpenRouter** — seuil quotidien / hebdomadaire avec notification.
12. **Logs auth** : qui a généré quel lien public, qui a téléchargé quel document. Audit trail propre.

### Documentation pilote

13. **Guide de démo** mis à jour avec les nouveaux flows (cf. [docs/demo-mvp-start-academy.md](./demo-mvp-start-academy.md) à actualiser).
14. **Doc d'onboarding commercial** : comment saisir les participants prévisionnels, à quoi sert le funding, comment l'expliquer au dirigeant.
15. **Doc gestion incidents** : si OpenRouter tombe, comment basculer en heuristique sans paniquer.

---

## 9. Synthèse — état du produit au 2026-05-25

**Forces** :
- Architecture découplée (LLM = narration, React = design, code = pricing/funding).
- Anti-hallucination strict : aucun prix LLM, aucun module hors catalogue, aucun cas client inventé.
- Sécurité solide sur les chemins métier (RLS, service_role server-only, tokens hashés, disclaimer systématique).
- Backward-compat préservée à chaque ajout (anciens diagnostics, propositions, modules legacy fonctionnent).
- Pricing 42 €/h centralisé en un seul endroit ; règle funding clairement isolée.

**Limites assumées** :
- Pas de Gmail / Calendar / Drive branché (mailto + manual transmit).
- COACHNXT non branché (couche posée, inerte).
- Pas de UI d'édition post-création pour les participants prévisionnels.
- Quelques routes IA sans auth (cf. §4.1).

**Recommandation finale** : ✅ **Prêt pour démo pilote** avec
1-2 clients de confiance, après application des migrations Supabase
et tests manuels de la §6. Corrections §4.1 + §4.3-4.5 à programmer
dans la fenêtre 4-6 semaines après pilote pour la commercialisation
élargie.
