# Plan B pilote — Horizon Immo (référence cachée)

> Artefacts de secours pour le pilote client Start Academy. À utiliser
> SEULEMENT si OpenRouter tombe pendant la démo et que tu n'as pas le
> temps de relancer une génération en direct.

---

## Contexte

Ces 3 fichiers sont les **sorties LLM validées** d'un cycle complet
exécuté sur le scénario Horizon Immo (cf. [docs/demo-mvp-start-academy.md §C](../demo-mvp-start-academy.md)) :

- 6 conseillers + 1 manager
- 4 modules socle IA + 4 modules métier vendeur
- 18 h totales, ~4 536 € budget, ~2 268 € reste à charge (3 indé)

| Fichier | Contenu | Source | Confiance |
|---|---|---|---|
| `horizon-immo-recommendation.json` | Recommandation IA (~8 modules, durées, raisons) | heuristic | 65 |
| `horizon-immo-support.json` | Support pédagogique brut (8 modules structurés) | LLM (Claude Sonnet 4.5) | 78 |
| `horizon-immo-design.json` | Support designé 52 slides 16:9 | LLM (Claude Sonnet 4.5) | 85 |

**À noter** : ces artefacts ne contiennent **aucune donnée client réel**
— c'est de la donnée synthétique sur l'agence fictive « Horizon Immo ».
Ils peuvent être affichés en démo sans risque RGPD.

---

## Procédure d'utilisation en démo

### Cas 1 — OpenRouter tombe pendant le rendez-vous client

**Symptôme** : la génération de proposition ou de support reste bloquée
> 2 min, ou tombe en fallback heuristique avec une qualité dégradée.

**Action immédiate** :

1. Ne pas paniquer. Annoncer au client :
   > « Pour vous montrer concrètement le résultat final, je vous affiche
   > un exemple récent que j'ai préparé sur un autre dossier — la
   > structure et la qualité sont identiques à ce que nous allons générer
   > pour vous quand le service répondra. »

2. Ouvrir le PDF Horizon Immo (cf. procédure section suivante).

3. Continuer le RDV en commentant le PDF. Les explications restent
   valables — c'est le même schéma de production.

4. Reprogrammer la génération réelle pour le lendemain à froid, et
   envoyer le résultat par email avec un mot d'excuse.

### Cas 2 — Pas de panne, démo nominale

Ne pas ouvrir ces fichiers. Laisser le live faire son travail.

---

## Comment obtenir le PDF Horizon Immo

**Méthode recommandée — préparer la veille de la démo** :

1. Se connecter en admin sur l'app.
2. Créer un client fictif "Horizon Immo Demo" + diagnostic complet
   (utiliser le scénario du pack pilote §4 — copier-coller des notes).
3. Lancer la recommandation. **Si le résultat ressemble à ce qu'on a
   en cache, tant mieux** ; sinon c'est le LLM qui a évolué, le cache
   reste utilisable comme repli.
4. Générer la proposition + support + support designé.
5. Exporter le PDF designé via `/sessions/[id]/support/design/print`
   → Imprimer → Enregistrer au format PDF (A4 paysage).
6. Sauvegarder le PDF sous `docs/pilote-plan-b/horizon-immo-design.pdf`
   (non commité — déjà couvert par `.gitignore` via le pattern global).

**Méthode rapide — sans connexion** :

Les fichiers JSON ci-dessus contiennent les données brutes. Ils peuvent
être affichés en JSON dans une fenêtre de terminal ou rendus en HTML
quick-and-dirty si le PDF préparé n'est pas accessible. Cette méthode
est dégradée — n'utiliser qu'en dernier recours.

---

## Cohérence avec le pilote en cours

Les artefacts cachés ont été générés avec la version d'OpenRouter et de
la base de prompts du 2026-05-23. Depuis :

- ✅ Filtre support `essential + recommended` ajouté (52 slides cohérent)
- ✅ Funding ajouté à la proposition (les artefacts n'ont PAS de funding
  car générés avant l'ajout — c'est cohérent avec un client Horizon Immo
  fictif sans `diagnostic_participants` saisis)
- ✅ `priorityTier` introduit (les artefacts n'en ont pas — backward-compat
  garantit qu'ils s'affichent quand même)

**Risque résiduel** : si tu montres ce plan B à un client très
attentif, il pourrait remarquer l'absence de la section
« Budget & prise en charge potentielle ». Mitigation : annoncer en
amont « cet exemple est un cycle antérieur, sans la nouvelle estimation
de prise en charge — celle-ci apparaîtra dans votre génération ».

---

## Quand mettre à jour ces artefacts

À régénérer si :

- Le système de prompts évolue significativement.
- La charte React change (couleurs, layouts).
- La règle pricing / funding change.
- Le LLM par défaut change.

Procédure : refaire un cycle complet sur l'app avec un compte admin,
exporter les 3 JSON via les routes API (`/api/analyze`, `/api/generate-*`),
remplacer les fichiers de ce dossier.
