# Intégration Coach Brain / COACHNXT

> Plan d'intégration **progressif** entre la matière pédagogique COACHNXT
> (côté NXT Performance) et la chaîne de génération de support
> Start Academy Diagnostic. Posé en couche d'architecture aujourd'hui,
> activé brique par brique demain.

---

## 1. Rappel — architecture NXT Performance existante

NXT Performance possède déjà :

- **COACHNXT** — moteur local RAG basé sur :
  - embeddings (modèle local Ollama),
  - SQLite vector DB,
  - patterns miner / extracteur.
- **Pipeline existant** : Drive → OpenRouter → patterns → Supabase
  (table `coach_brain_patterns`).
- **UI NXT Performance** déjà branchée via hooks (`useCoachingPattern`).
- **Table Supabase `coach_brain_patterns`** — propriété de NXT Performance.

**Ce qu'on ne refait PAS côté Start Academy Diagnostic :**

- pas de RAG, pas d'embeddings, pas de vector DB ici,
- pas de nouvelle table `coach_brain_patterns`,
- pas de refonte UI NXT Performance,
- pas d'extraction de patterns depuis ce projet.

Start Academy Diagnostic est **strictement consommateur**.

---

## 2. Rôle du Coach Brain dans Start Academy Diagnostic

Le Coach Brain **enrichit** la matière injectée dans les prompts du
support pédagogique et du support designé :

| Catégorie | Contient typiquement |
|---|---|
| `method` | méthodes internes Start Academy / NXT Performance |
| `script` | scripts vendeur / acquéreur / restitution |
| `objection` | objections terrain + parades |
| `exercise` | exercices reproductibles en salle |
| `example` | exemples terrain réels (anonymisés) |
| `prompt` | prompts IA validés et projetables |
| `slide_reference` | slides de conférences déjà testées |

Le Coach Brain **ne décide PAS** :

- du design final (charte, couleurs, layouts, polices) → React.
- du nombre de slides sans garde-fou → slide budget.
- du HTML / CSS → toujours interdit dans la sortie LLM.
- du remplacement de Claude / OpenRouter → narration reste LLM.
- du remplacement de React → rendu reste React.

---

## 3. Architecture cible Start Academy Diagnostic

```
┌─────────────────────────────────────────────────────────────────────┐
│  Diagnostic + recommandation + session + documents collaborateur     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Coach Brain / COACHNXT — enrichissement pédagogique                 │
│  (lecture coach_brain_patterns NXT Performance + filtre/ranking)     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ CoachBrainContext
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Claude / OpenRouter — narration (sélection, structure, reformulation)│
└──────────────────────────┬──────────────────────────────────────────┘
                           │ TrainingSupport / DesignedSupport JSON
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  React — design Start Academy (layouts, charte, icônes, rendu PDF)   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
                  Support designé exporté
```

**Garde-fous transverses :**

- **Slide budget** = fourchette indicative, pas plafond rigide.
  Plusieurs slides courtes valent mieux qu'une slide chargée.
- **Style Start Academy** = rythme, démonstration avant explication,
  une idée par slide, vocabulaire métier immobilier.
- **Aucune invention** de cas client, de chiffre, de prompt ou de
  module hors catalogue.

---

## 4. Couche posée aujourd'hui (état actuel du code)

Les fichiers suivants sont déjà en place — tous inertes tant qu'aucune
source amont n'est branchée :

| Fichier | Rôle |
|---|---|
| [src/lib/coach-brain/coach-brain.types.ts](../src/lib/coach-brain/coach-brain.types.ts) | Types `CoachBrainPattern`, 7 sous-types (Method, Script, Objection, Exercise, Example, Prompt, SlideReference), `CoachBrainContext`, helpers `isCoachBrainContextEmpty`, `countCoachBrainItems`. |
| [src/lib/coach-brain/coach-brain-service.ts](../src/lib/coach-brain/coach-brain-service.ts) | `server-only`. `getCoachBrainContextForSession`, `getCoachBrainContextForModules`, `selectCoachBrainContentForSupport`, `mapCoachBrainPatternsToContext`. **Tous retournent un contexte vide pour l'instant** — commentaires explicites sur le branchement futur (Supabase `coach_brain_patterns`, COACHNXT local RAG, filtre/ranking). |
| [src/lib/coach-brain/coach-brain-pattern-adapter.ts](../src/lib/coach-brain/coach-brain-pattern-adapter.ts) | Conversion pure et synchrone `CoachBrainPattern[]` → `CoachBrainContext`. Normalise sourceType, tags, profil, priorité, confidence. Tri stable par priorité desc. Utilisable client comme serveur. |
| [src/lib/ai/build-training-support-prompt.ts](../src/lib/ai/build-training-support-prompt.ts) | Accepte `coachBrainContext?: CoachBrainContext`. Injecte une section « Coach Brain / COACHNXT Context » UNIQUEMENT quand non-vide. Le SYSTEM_PROMPT contient les 7 règles d'usage Coach Brain. |
| [src/lib/ai/build-designed-support-prompt.ts](../src/lib/ai/build-designed-support-prompt.ts) | Idem, pour le support designé. Inclut la règle « tu peux produire plusieurs slides courtes successives quand la matière Coach Brain le justifie ». |
| [src/lib/ai/heuristic-training-support.ts](../src/lib/ai/heuristic-training-support.ts) | Signature étendue pour parité — le moteur heuristique ignore le contexte pour l'instant. |
| [src/lib/ai/heuristic-designed-support.ts](../src/lib/ai/heuristic-designed-support.ts) | Idem. |
| [src/app/api/generate-training-support/route.ts](../src/app/api/generate-training-support/route.ts) | Appelle `selectCoachBrainContentForSupport({ sessionId, moduleIds })`, passe le résultat aux builders. Vide aujourd'hui → comportement byte-pour-byte identique. |
| [src/app/api/design-training-support/route.ts](../src/app/api/design-training-support/route.ts) | Idem pour la design route. |

**Invariant testé :** si `coachBrainContext` est vide, les prompts
générés et le rendu final sont strictement identiques à la version
sans Coach Brain. C'est le contrat de rétro-compatibilité.

---

## 5. Stratégie d'intégration progressive

### Étape 1 — Lecture `coach_brain_patterns` côté Start Academy

- **Pré-requis** : NXT Performance écrit déjà la table ; il faut juste
  qu'elle soit lisible par notre service_role (ou via une vue RLS
  ouverte aux rôles internes Start Academy).
- **Action** : remplir `getCoachBrainContextForModules` :
  - requête `select * from coach_brain_patterns where related_module_ids && $1 and (target_profile is null or target_profile = $2)` ;
  - tri `priority desc`, puis `confidence_score desc` ;
  - cap items par catégorie (`maxItemsPerCategory`, défaut ~3) pour borner le budget tokens.
- **Mesures à observer** :
  - latence ajoutée à `/api/generate-training-support` ;
  - tokens prompt avant/après ;
  - qualité narrative (revue manuelle).

### Étape 2 — Filtres profil / tags / signaux

- **Action** : enrichir `selectCoachBrainContentForSupport` avec :
  - filtre profil cible (`conseiller`, `manager`, `assistant`, `direction`),
  - filtre par tags issus du diagnostic (signaux faibles, vocabulaire),
  - dédoublonnage par `id`.

### Étape 3 — Injection dans support brut

- **Action** : passer le `coachBrainContext` au builder, vérifier que :
  - Claude exploite la matière sans recopier mot pour mot ;
  - les `trainerNote` deviennent des paragraphes plus riches ;
  - les exercices reprennent les `exercise` Coach Brain quand pertinents.
- **Mesure** : confidence score moyen + revue narrative.

### Étape 4 — Injection dans support designé

- **Action** : même mécanique sur la design route.
- **Attendu** :
  - apparition de slides supplémentaires courtes quand `slide_reference`,
    `example` ou `script` apportent un rythme,
  - aucune augmentation du nombre de modules ni de la durée totale,
  - aucun contenu inventé.

### Étape 5 — Mesure qualité / coût / densité

- **Métriques à logger** dans `ai_generation_logs` :
  - `coach_brain_items_used` (compte),
  - tokens prompt + completion,
  - confidence score retourné par Claude,
  - durée totale.
- **Décision** : monter `maxItemsPerCategory` ou élargir les filtres
  si la qualité augmente sans exploser le coût.

### Étape 6 — Branchement COACHNXT local (optionnel)

- **Si** la lecture directe `coach_brain_patterns` est suffisante,
  cette étape peut être différée.
- **Si** on veut un reranking sémantique fin (ex : matcher
  `RecommendedModule.reason` vs `pattern.content` via embeddings),
  appel à un endpoint interne NXT Performance qui expose COACHNXT.
  On NE rapatrie PAS le RAG côté Start Academy.

---

## 6. Lien avec les documents uploadés

Les pièces déposées par les collaborateurs via
[/public/collect/[token]](../src/app/public/collect/[token]) (catégories
`cas_client`, `support_actuel`, `export_crm`, `statistiques`) sont une
**source future** du Coach Brain : après extraction texte, elles
peuvent être ingérées comme `CoachBrainExample` ou `CoachBrainSlideReference`
de source `client_upload`.

C'est une étape ultérieure (probablement après étape 3-4) — elle
nécessite :

- extraction texte (PDF / DOCX / images via OCR),
- pipeline d'ingestion contrôlé (le commercial valide avant injection),
- anonymisation des données sensibles.

Voir [session-documents-upload.md](./session-documents-upload.md) §7
« Limites MVP ».

---

## 7. Garde-fous qualité

À chaque étape d'activation :

- [ ] **Slide budget reste un garde-fou.** Si on observe une dérive
      (nombre de slides ×2, durée ×2), revenir aux contraintes du
      prompt avant d'élargir Coach Brain.
- [ ] **Pas d'encyclopédie.** Si une slide dépasse 600 caractères en
      moyenne, on serre le `maxItemsPerCategory` ou on coupe `content`
      à 300 caractères à l'injection.
- [ ] **Pas de mot-à-mot.** Si Claude recopie la matière Coach Brain,
      durcir la règle 8 du SYSTEM_PROMPT.
- [ ] **Cas client jamais inventés.** Maintien strict : seuls les cas
      remontés via `session_participants.concrete_case` apparaissent
      en `case_study`.
- [ ] **Latence acceptable.** Si la lecture amont ajoute > 2 s,
      ajouter un cache court (5 minutes par `moduleIds`).
- [ ] **Coût OpenRouter contenu.** Tokens prompt doivent rester sous
      le cap (`OPENROUTER_MAX_TOKENS`).

---

## 8. Ce qui reste explicitement hors scope

- Recréer COACHNXT (RAG / vector DB) côté Start Academy.
- Modifier le schéma `coach_brain_patterns` ou son alimentation.
- Refondre l'UI NXT Performance.
- Brancher Gmail, Calendar, Drive — sans rapport avec Coach Brain.
- Modifier les prompts existants quand `coachBrainContext` est vide
  (rétro-compatibilité stricte).

---

## 9. Prochaine étape technique recommandée

1. **Décision côté NXT Performance** : choisir entre
   « lecture directe `coach_brain_patterns` via Supabase service_role »
   et « endpoint interne `GET /api/coachnxt/patterns?moduleIds=...` ».
2. **Une fois la décision prise** : remplir `getCoachBrainContextForModules`
   dans `coach-brain-service.ts` (un seul fichier à modifier — toute la
   plomberie aval est déjà en place).
3. **Premier test pilote** : générer un support sur Horizon Immo avec
   et sans Coach Brain. Mesurer narratif, durée totale, tokens, coût.
4. **Itérer** sur `maxItemsPerCategory` et les filtres tags / profil.
