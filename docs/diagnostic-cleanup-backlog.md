# Diagnostic — backlog de nettoyage (post-reformulation 2026-07-24)

Résiduels identifiés lors de la reformulation des 71 questions. Non traités
dans le chantier reformulation par choix explicite (aucune modification d'ID
ni de type pour préserver la baseline des `diagnostic_answers` persistés).
À trancher en chantier séparé, chacun impliquant une décision produit + une
migration de données si l'ID/le type bouge.

## 1. Doublon — outil de pige demandé deux fois

**Symptôme.** Deux questions distinctes portent la même information :

| ID | Chapitre | Type | Libellé (post-reformulation) |
| --- | --- | --- | --- |
| `prospecting-pige-tool` | 3 (Prospection) | `text` | « D'ailleurs, pour piger, ils s'appuient sur quoi comme outil ? » |
| `tools-pige` | 10 (Outils & IA) | `text` | « Et côté pige — vous avez un outil qui surveille le marché, ou c'est manuel ? » |

Le hint de `prospecting-pige-tool` précise déjà : *« Même donnée que la
question pige du chapitre Outils : si déjà répondue, recopier sans reposer
la question. »* — un `prefillFrom` existe historiquement dans le type
`DiagnosticQuestion` (`src/types/index.ts:148`) mais n'est pas appliqué ici.

**Options** :
- (a) Ajouter `prefillFrom: { questionId: "prospecting-pige-tool" }` sur
  `tools-pige` — non destructif, pas de migration.
- (b) Supprimer l'une des deux entrées + migrer les réponses existantes
  vers l'ID conservé. Destructif, à réserver si le doublon devient
  vraiment gênant.

**Recommandation** : (a) — coût minimal, respecte le principe MVP de
`prefillFrom` déjà validé pour deux autres cas (outil de pige Ch.3 → Ch.10,
outil d'estimation Ch.4 → Ch.10, cf. commentaire `diagnostic-questions.ts`).

## 2. Typage — note Google (`google-reviews-score`)

**Symptôme.** La question chapitre 9 « Et la note, elle dit quoi ? »
demande la note Google (échelle 1–5). Elle est actuellement typée
`percent` — le hint clarifie *« Saisir la note sur 5 (ex. 4,6) »*, mais
l'UI de saisie (input `type="text"` avec inputMode `numeric`, cf.
`new-diagnostic-flow.tsx`) reste identique en pratique.

**Impact opérationnel** :
- Le rendu et la validation acceptent aujourd'hui n'importe quel nombre
  saisi — pas d'erreur immédiate.
- Le prompt IA (via `ratios-service`) traite ce champ comme un pourcentage
  → interprétation potentiellement fausse d'une note « 4,6 » comme « 4,6 % ».
- Aucun ratio actuel ne consomme cette valeur en préprod (à vérifier).

**Options** :
- (a) Introduire un type dédié `type: "rating"` (1–5) — nouveau membre
  d'`DiagnosticQuestionType`, à propager dans le rendu + moteur ratios.
  Migration : réponses existantes non affectées (chaîne stockée telle
  quelle).
- (b) Garder `percent` mais documenter l'échelle 1–5 explicitement dans
  le hint (déjà fait).
- (c) Convertir en `int` avec choix `[1, 2, 3, 4, 5]` — perd les demi-
  points (4,6 impossible).

**Recommandation** : (a) — nécessite un chantier dédié couvrant l'UI de
saisie + tests. Le contract test anti-dérive de la reformulation actuelle
échouera intentionnellement si `type` change, ce qui forcera la
coordination.
