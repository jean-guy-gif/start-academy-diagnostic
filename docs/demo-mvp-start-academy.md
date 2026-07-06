# Guide de démo MVP — Start Academy Diagnostic

> Document opérationnel pour présenter le produit en interne ou à un
> client pilote. Préparé après la validation OpenRouter du 2026-05-23
> (cf. [test-openrouter-mvp.md](./test-openrouter-mvp.md) §10).

---

## A. Objectif de la démo

Montrer comment Start Academy Diagnostic transforme **un seul rendez-vous
commercial** en l'enchaînement complet :

1. **Diagnostic structuré** — questions guidées, signaux faibles, notes
   commerciales.
2. **Recommandation de modules** — IA sélectionne 5 à 8 modules dans le
   catalogue Start Academy, justifie chaque choix, signale les manques.
3. **Proposition dirigeant** — synthèse exécutive, programme, objectifs
   pédagogiques rédigés pour le décideur.
4. **Session formation** — création d'une session liée à la proposition,
   format, durée, public cible.
5. **Collecte collaborateurs** — niveau IA, outils utilisés, cas concret,
   problématique de chaque participant.
6. **Support pédagogique brut** — déroulé module par module
   (problématique → fondamentaux → exercice → action terrain).
7. **Support designé Start Academy** — déroulé en slides 16:9, charte
   Start Academy (#00527A / #3EA9FF / blanc, Rajdhani / Montserrat).
8. **Export PDF designé** — impression navigateur prête à diffuser.

**Message clé** : un commercial Start Academy entre dans le rendez-vous
avec un questionnaire, et ressort avec un parcours de formation
personnalisé, designé, exportable — au lieu de plusieurs heures
d'allers-retours ingé péda / commercial.

---

## B. Pré-requis techniques

| Élément | Valeur attendue |
|---|---|
| Node + Next | `next dev` (Next 16.2.6 Turbopack) sur http://localhost:3000 |
| `OPENROUTER_API_KEY` | Clé valide, crédits > 5 € pour la démo complète |
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4.5` |
| `OPENROUTER_MAX_TOKENS` | `20000` (impératif pour `/support` et `/design`) |
| `OPENROUTER_SITE_URL` | `http://localhost:3000` |
| `OPENROUTER_APP_NAME` | `Start Academy Diagnostic` |
| Supabase | **Optionnel** — fallback localStorage si non configuré |
| Navigateur | Chrome ou Edge récent (impression PDF native fiable) |
| Réseau | Connexion stable — OpenRouter peut prendre 2-3 minutes
sur les routes longues |

Vérifs rapides avant démo :
- `curl -s http://localhost:3000/api/analyze-training-need -X POST` répond
  HTTP 400 (et non 500) — signe que le serveur tourne.
- `npx tsc --noEmit` ne renvoie aucune erreur (cf. [test-openrouter-mvp.md §10.7](./test-openrouter-mvp.md)).

---

## C. Scénario de démo recommandé : Agence Horizon Immo

Ce scénario est aligné avec les jeux d'essai validés en §10 du test
OpenRouter — il a déjà tourné de bout en bout en mode LLM.

### Client

- **Entreprise** : Horizon Immo
- **Direction** : Catherine (dirigeante)
- **Collaborateurs** : 8 conseillers + 1 manager
- **Profils ciblés** : conseiller + manager

### Problèmes déclarés en RDV

- ChatGPT installé mais jamais paramétré (pas d'instructions, pas de
  vocabulaire métier).
- NotebookLM, Claude, Gemini inconnus.
- CRM hétérogène — chaque conseiller suit ses vendeurs à sa façon.
- Taux d'exclusivité < 20 % sur les mandats.
- Ratio estimation → mandat : 40 % (cible 60 %+).
- Suivi vendeur irrégulier après la signature mandat.
- Difficulté à obtenir les baisses de prix.
- Difficulté à transformer une estimation bien préparée en mandat exclusif.

### Cas collaborateurs à collecter

- **Sophie** — *Mandat avenue Foch, 450 k €, 3 mois en portefeuille,
  vendeur refuse la baisse de prix malgré peu de contacts.*
- **Thomas** — *Estimation rue de la Paix, 2 autres agences en
  parallèle, ne ferme pas en exclusivité.*

> Ces deux cas suffisent à montrer le routage IA : Sophie va sur les
> modules **Suivi vendeur** et **Veille concurrentielle**, Thomas sur
> **Prépa R2** et **Plan de comm vendeur** — automatiquement.

---

## D. Parcours écran par écran

### 1. Landing — `/`

- **Ce que tu montres** : la page d'accueil Start Academy Diagnostic.
- **Ce que tu dis** : « Voici le point d'entrée commercial. Tout part
  d'un RDV chez un dirigeant d'agence. »
- **Résultat attendu** : page d'accueil avec bouton "Nouveau diagnostic".
- **Valeur business** : un seul outil, un seul point d'entrée pour
  toute l'équipe commerciale Start Academy.

### 2. Nouveau diagnostic — `/diagnostics/new`

- **Ce que tu montres** : formulaire d'identification client (entreprise,
  dirigeant, nombre de collaborateurs, profils ciblés).
- **Ce que tu dis** : « En 30 secondes le commercial saisit les bases.
  Ce sont les seules infos qu'il a au moment de décrocher son rendez-vous. »
- **Résultat attendu** : création du diagnostic, redirection vers les
  questions.
- **Valeur business** : moins de saisie, plus de RDV traités par jour.

### 3. Questions guidées — `/diagnostics/[id]`

- **Ce que tu montres** : enchaînement des questions par catégorie
  (Outils, Process, Performance, Équipe). Marquage "signal faible" et
  "passé".
- **Ce que tu dis** : « Le commercial coche, prend des notes courtes,
  marque les signaux faibles. Il n'a pas besoin d'être ingé péda. »
- **Résultat attendu** : 10-15 réponses enregistrées, dont 3-5 marquées
  signal faible.
- **Valeur business** : la trame structure l'entretien — le commercial
  ne rate plus les signaux qui débloquent une vente formation.

### 4. Synthèse diagnostic — `/diagnostics/[id]` (vue récap)

- **Ce que tu montres** : la liste des réponses, signaux faibles, notes
  commerciales, bouton "Générer la recommandation".
- **Ce que tu dis** : « Le commercial valide ce qu'il a saisi. Rien
  d'auto-magique avant cette étape. »
- **Résultat attendu** : récap clair, prêt pour l'IA.
- **Valeur business** : le commercial reste maître de la donnée
  transmise à l'IA.

### 5. Recommandation — `/diagnostics/[id]/recommendation`

- **Ce que tu montres** : 5 à 8 modules recommandés, chacun avec une
  raison liée à une réponse précise du RDV, durée, niveau, cas d'usage.
  Modules socles IA en tête si maturité outils faible.
- **Ce que tu dis** : « Voici la magie : l'IA a lu les réponses et a
  choisi parmi le catalogue Start Academy. Chaque module est justifié
  par une réponse client — pas par une formule générique. »
- **Résultat attendu** : 8 modules (4 socle IA + 4 métier vendeur sur
  Horizon Immo), `confidenceScore` ≥ 75, `missingInformation` rempli.
- **Valeur business** : le commercial sort du RDV avec un programme
  défendable, justifié, sans risque d'inventer un module.

### 6. Proposition — `/diagnostics/[id]/proposal`

- **Ce que tu montres** : email/proposition rédigé pour Catherine —
  résumé exécutif, objectifs pédagogiques, programme synthétique,
  durée, public cible.
- **Ce que tu dis** : « C'est ce qu'il envoie à la dirigeante le soir
  même. Rédigé dans son vocabulaire à elle, pas dans celui d'un
  formateur. »
- **Résultat attendu** : proposition prête à copier dans un email.
- **Valeur business** : retour rapide sur RDV = closing accéléré.

### 7. Création session — `/sessions` puis `/sessions/[id]`

- **Ce que tu montres** : la transformation de la proposition en session
  de formation (titre, statut, format, durée).
- **Ce que tu dis** : « Une fois la proposition acceptée, le commercial
  bascule en session. C'est l'objet qui va contenir les participants
  et les supports. »
- **Résultat attendu** : session créée, liée au diagnostic et à la
  recommandation validée.
- **Valeur business** : continuité commerciale → péda sans rupture.

### 8. Collecte collaborateurs — `/sessions/[id]/collect`

- **Ce que tu montres** : ajout de Sophie et Thomas avec leur niveau,
  outils utilisés, problématique, cas concret.
- **Ce que tu dis** : « Le formateur (ou le manager côté agence) saisit
  les vrais cas terrain. C'est ce qui rend la formation utile. »
- **Résultat attendu** : 2 participants au minimum saisis avec un cas
  concret chacun.
- **Valeur business** : la formation s'ancre sur des situations
  réelles — pas de cas générique qui démotive l'équipe.

### 9. Support pédagogique brut — `/sessions/[id]/support`

- **Ce que tu montres** : génération du support (compter ~1 min 40).
  Puis affichage : 8 modules, chacun avec problématique, fondamentaux,
  accélérateur IA, exercice métier, **cas Sophie/Thomas routés
  automatiquement** sur les modules pertinents (Suivi, Prépa R2…).
- **Ce que tu dis** : « L'IA prend la recommandation + la collecte
  collaborateurs et produit un déroulé de formation. Notez que Sophie
  apparaît sur Suivi vendeur et pas sur ChatGPT — c'est l'IA qui
  route automatiquement. »
- **Résultat attendu** : 8 modules, 19 h, confidenceScore ~78.
- **Valeur business** : formateur entre en salle avec un support
  pré-mâché — plus de soirées passées à préparer.

### 10. Support designé — `/sessions/[id]/support/design`

- **Ce que tu montres** : génération du support designé (~2 min 30).
  52 slides au format 16:9, charte Start Academy appliquée par React
  (couleurs, polices Rajdhani/Montserrat, icônes Lucide).
- **Ce que tu dis** : « Maintenant on passe du contenu pédagogique au
  rendu de présentation. L'IA propose le contenu et l'intention
  narrative ; le composant React applique la charte. Pas de Word, pas
  de PowerPoint. »
- **Résultat attendu** : déroulé dynamique :
  cover → objectif → programme → (problème → conscience → fondamentaux
  → accélérateur IA → exercice → cas → action terrain) × 8 modules
  → synthèse → closing. Cas Sophie/Thomas placés sur les bonnes slides.
- **Valeur business** : sortie commerciale + sortie formateur produites
  par le même flux, sans intervention de designer.

### 11. Export PDF designé — `/sessions/[id]/support/design/print`

- **Ce que tu montres** : la vue print, puis « Imprimer » du navigateur
  → "Enregistrer au format PDF". Pages 16:9, marges nulles.
- **Ce que tu dis** : « Le formateur emporte ce PDF en agence. Pas de
  dépendance à un outil cloud externe pour l'impression. »
- **Résultat attendu** : PDF 52 pages, charte respectée, lisible sans
  zoom.
- **Valeur business** : livrable concret immédiat — la dirigeante voit
  le rendu final avant de signer.

---

## E. Script oral court — 5 minutes

> **Slide 0 — Problème (45 s)**
> « Aujourd'hui, vendre une formation sur-mesure est lent : RDV
> commercial, allers-retours avec l'ingé péda, devis, support créé en
> Word, redesign PowerPoint. Pour produire 1 formation, on perd 1
> semaine. Et le sur-mesure n'est pas industrialisable. »
>
> **Slide 1 — Solution (60 s)**
> « Start Academy Diagnostic prend un RDV commercial et le transforme,
> en une seule session, en : diagnostic structuré, recommandation IA
> de modules, proposition dirigeant, support pédagogique, support
> designé, PDF. »
>
> **Slide 2 — Valeur (60 s)**
> « Trois gains : clarté commerciale (justifications IA défendables),
> gain de temps (de 5 jours à 30 minutes), formation personnalisée
> (les vrais cas Sophie et Thomas remontent dans le support). »
>
> **Slide 3 — Preuve live (90 s)**
> Aller direct sur l'écran 10 (support designé) déjà généré, faire
> défiler 5-6 slides — surtout celles qui contiennent les cas Sophie/
> Thomas. Pointer la charte appliquée automatiquement.
>
> **Slide 4 — Conclusion (45 s)**
> « Start Academy industrialise le sur-mesure. Le commercial ne vend
> plus du temps — il vend un parcours. Le formateur ne prépare plus —
> il anime. »

---

## F. Script oral long — 15 minutes

### Intro — 2 min

« Quand un commercial Start Academy rentre d'un rendez-vous, il a deux
problèmes : prouver qu'il a écouté, et produire un parcours sur-mesure
sans bloquer un ingé péda pendant trois jours. Aujourd'hui je vais vous
montrer comment on a réglé les deux d'un coup. »

Poser le décor : « On va dérouler le cas Horizon Immo — une agence
8 conseillers, dirigeante Catherine, taux d'exclusivité < 20 %.
Vous allez voir le même flux qu'un commercial Start Academy. »

### Écran 1-2 — Saisie initiale (1 min 30)

Transition : « Le commercial part avec une simple saisie : qui c'est,
combien ils sont. »

Montrer landing → nouveau diagnostic. Insister : « Aucune complexité.
Le commercial reste sur le téléphone du dirigeant en saisissant. »

### Écrans 3-4 — Diagnostic et synthèse (3 min)

Transition : « Maintenant la trame des questions structure l'entretien. »

Faire défiler 5-6 questions. **Vigilance** : ne pas lire toutes les
réponses — pointer 2 signaux faibles seulement (« exclusivité < 20 % »,
« ChatGPT jamais paramétré »).

Phrase commerciale : « Le commercial n'a pas besoin d'être pédagogue.
Il pose des questions normales, et le système range tout dans des
catégories que l'IA saura exploiter. »

### Écran 5 — Recommandation (3 min)

Transition : « Voici le premier moment où l'IA prend la parole. »

Cliquer "Générer la recommandation". Pendant l'attente (5-15 s) :
« On envoie le diagnostic + un catalogue filtré (20 modules
pertinents sur les 79 du catalogue Start Academy complet). »

Au retour : **commenter chaque module recommandé** :
- « Module ChatGPT — parce qu'à la question outils, ils ont dit
  "installé mais jamais paramétré". L'IA cite la réponse. »
- « Module Suivi vendeur — parce qu'ils ont dit "suivi irrégulier
  après mandat". »

**Vigilance** : pointer `missingInformation` — « L'IA dit ce qu'elle
n'a PAS eu. Pas d'invention. »

Phrase commerciale : « Chaque module est défendable en RDV de
restitution. Vous ne vendez pas une boîte noire. »

### Écran 6 — Proposition dirigeant (2 min)

Transition : « Le commercial transforme tout ça en un message clair
pour la dirigeante. »

Lire à voix haute le résumé exécutif. **Vigilance** : insister qu'il
est rédigé en langage business, pas pédagogique.

Phrase commerciale : « Vous envoyez ça à Catherine le soir même.
Closing accéléré de plusieurs jours. »

### Écran 7-8 — Session + collecte (2 min)

Transition : « Catherine signe. On bascule en session formation. »

Créer la session. Ajouter Sophie et Thomas. **Vigilance** : insister
sur la simplicité du formulaire collaborateur — niveau, outils, cas.

Phrase commerciale : « La collecte se fait par le manager de l'agence,
pas par le formateur. Donc le formateur arrive avec les vrais cas en
main. »

### Écran 9 — Support brut (2 min)

Transition : « Maintenant on demande à l'IA le déroulé pédagogique. »

Lancer la génération (~1 min 40 — utilisez ce temps pour parler).
Pendant l'attente : « L'IA reçoit : la proposition signée, la
recommandation validée, les cas Sophie et Thomas. Elle produit un
support module par module — problématique, fondamentaux, accélérateur
IA, exercice métier, cas réel, action terrain. »

Au retour : **montrer le routage** : Sophie sur Suivi vendeur,
Thomas sur Prépa R2. « Vous voyez ? Les cas ne sont pas distribués
au hasard. Le système comprend que le cas "refus de baisse de prix"
parle au module Suivi, pas au module ChatGPT. »

### Écran 10 — Support designé (3 min)

Transition : « Dernière étape — on passe au support de présentation. »

Lancer (~2 min 30). Pendant l'attente : « C'est ici qu'on sépare les
responsabilités. Claude produit du contenu et de l'intention narrative.
Le composant React applique la charte Start Academy. Pas d'enfer du
PowerPoint. »

Au retour : 52 slides. **Faire défiler vite** mais pointer :
- Slide cover — accroche.
- Slide problème module 1 — vocabulaire métier.
- Slide accélérateur IA (uniquement modules métier).
- Slide cas Sophie / Thomas.
- Slide synthèse / closing.

Phrase commerciale : « Voilà ce que le formateur emporte en agence.
Pas du templating générique — du contenu calibré sur Horizon Immo. »

### Écran 11 — Export PDF (1 min)

« Et pour la dirigeante, ou pour le formateur qui veut imprimer :
ctrl+P, PDF, terminé. »

### Conclusion — 1 min

« On a montré : 1 RDV → 1 parcours complet, designé, exportable,
ancré sur les vrais cas Sophie et Thomas. Pas un seul fichier Word
créé, pas un seul PowerPoint manipulé. Start Academy industrialise
le sur-mesure. »

---

## G. Points à ne **pas** dire en démo

- ❌ « Tout est finalisé. » → Le MVP couvre le flux commercial →
  pédagogique. Plusieurs briques restent à brancher.
- ❌ « On a Gmail / Calendar / Drive intégrés. » → Aucun de ces
  connecteurs n'est branché. L'envoi email se fait à la main (copier /
  coller), la planification idem.
- ❌ « On envoie les supports avec Gamma. » → Gamma n'est PAS dans le
  scope du MVP. La génération designée est faite par React + Claude.
- ❌ « C'est entièrement automatisé. » → Le commercial reste maître :
  il valide la recommandation, il valide la proposition, il valide la
  collecte avant chaque génération IA.
- ❌ « C'est sécurisé en production. » → Pas encore d'auth utilisateur
  fine, pas encore de lien public de collecte pour les agences.
- ❌ « Tout est prêt pour multi-tenant. » → Pour la démo on travaille
  avec Supabase optionnel + fallback localStorage.

À la place :
- ✅ « L'envoi email et la planification sont les prochaines briques —
  on a volontairement priorisé la production du livrable. »
- ✅ « Gmail / Drive / Calendar arriveront quand le flux commercial sera
  prouvé chez 2-3 clients pilotes. »

---

## H. Bugs et limites connues à assumer

| Limite | Comportement | Comment l'expliquer |
|---|---|---|
| Génération support brut | ~1 min 40 | « OpenRouter, c'est le temps de réflexion d'un humain. Pendant ce temps on commente. » |
| Génération support designé | ~2 min 30 | Idem. Préparer une slide d'attente. |
| Supabase | Optionnel — fallback localStorage si non configuré | « Pour la démo on est en local. En pilote on branche Supabase. » |
| Coût OpenRouter | Quelques centimes par diagnostic complet, mais à monitorer | « On a un compteur côté serveur, on watch ça. » |
| Export PDF | Via impression navigateur (`window.print()`) | « Volontaire — pas de dépendance à un service externe. » |
| Stockage Drive / SharePoint | Non branché | « Prochaine brique. Pour l'instant le PDF reste local. » |
| Lien public sécurisé pour la collecte collaborateurs | Non branché | « Le manager se connecte avec le commercial pour la collecte initiale. » |
| Auth utilisateur fine | Non en place | « Démo locale → on est tout seul. En pilote on ajoute auth. » |

---

## I. Checklist avant démo

À cocher dans l'ordre, 15 minutes avant de présenter :

- [ ] `.env.local` à jour (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
      `OPENROUTER_MAX_TOKENS=20000`)
- [ ] Crédits OpenRouter > 5 € (compte OpenRouter)
- [ ] **Migrations Supabase à jour** — `supabase db push` exécuté
- [ ] **Seed catalogue exécuté** — `supabase/seed.sql` lancé via SQL
      Editor (sinon recommandation IA tombera sur "catalogue vide"). Vérif :
      `npm run check:catalog` → ✅ 79 modules. Doc complète :
      [setup-supabase.md](./setup-supabase.md)
- [ ] **Bucket `session-documents`** créé et privé (cf. setup-supabase §6)
- [ ] `npm run dev` redémarré après la dernière modification de prompt
- [ ] http://localhost:3000 répond — page d'accueil chargée
- [ ] Scénario Horizon Immo prêt : entreprise, dirigeante Catherine,
      8 conseillers, problèmes typés
- [ ] Cas Sophie et Thomas notés sur post-it (saisie pendant la démo)
- [ ] **Plan B** : avoir un diagnostic complet déjà généré dans un
      autre onglet — si OpenRouter rame, on bascule sur l'instance
      pré-générée pour le support designé
- [ ] PDF designé déjà testé une fois la veille
- [ ] Navigateur Chrome ouvert avec UN SEUL onglet — pas d'inbox, pas
      de Slack, pas de PR GitHub en arrière-plan
- [ ] Notifications système coupées
- [ ] Connaître par cœur : fallback localStorage existe si Supabase
      down
- [ ] Compte Supabase prêt si pilote (sinon ne pas l'évoquer)

---

## J. Décision finale

| Cible | Statut | Conditions |
|---|---|---|
| **Démo interne** | ✅ OK | Configuration locale standard. Aucun pré-requis particulier. |
| **Démo client pilote** | ✅ OK avec cadrage | Annoncer en début de RDV : "MVP fonctionnel, prochaines briques email/Drive/Calendar/auth à venir, retours pilote bienvenus." Prévoir un fallback (export pré-généré) en cas de latence OpenRouter. |
| **Production commerciale** | ❌ Non | Besoins ouverts : auth utilisateur fine, lien public sécurisé pour collecte collaborateurs, stockage Drive / S3 pour les PDF, monitoring des coûts OpenRouter, multi-tenant Supabase, journalisation complète des générations IA. |

**Recommandation** : déclencher 1 ou 2 pilotes client après une démo
interne validée. Mesurer en pilote : temps de génération acceptable
pour l'agence, taux de modification des supports en sortie IA, coût
OpenRouter par dossier. Repartir sur la production commerciale avec
ces données chiffrées.
