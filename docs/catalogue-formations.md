# Catalogue des modules de formation Start Academy

> Export du catalogue figé dans `src/lib/data/module-catalog.ts`. Auto-généré — ne pas éditer à la main. Régénérer via `npm run generate:catalog` côté code, puis ré-exporter ce markdown.

**79 modules**, regroupés en 6 familles.

## Sommaire

- [Acheteur](#acheteur) — 8 modules
- [Admin](#admin) — 11 modules
- [Base (paramétrages fonctionnalités)](#base-param-trages-fonctionnalit-s) — 16 modules
- [Prospection (usecases)](#prospection-usecases) — 14 modules
- [Usecases](#usecases) — 16 modules
- [Vendeur](#vendeur) — 14 modules

## Acheteur

### Agent recherche

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 3 · **Outils** : Agent LBC · **Plateforme** : GPT

**Identification du besoin** :

> Les conseillers perdent-ils du temps à chercher des biens au lieu de vendre ? Quel délai entre la demande acquéreur et la proposition de biens ? Le besoin est-il sourcing, matching, qualification ou automatisation de recherche ?

**Signaux diagnostic** :

- IA utile — IA utilisée sans indicateur de gain ou sans adoption terrain

<sub>id : `conseiller-acheteur-agent-recherche`</sub>

---

### Découverte et remerciements acheteur

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1

**Identification du besoin** :

> Les acquéreurs sont-ils qualifiés avant visite : financement, urgence, critères, arbitrages, décisionnaires ? Quel taux découverte -> visite et visite -> offre ? Le besoin est-il méthode de découverte, relance ou qualité de synthèse ?

**Signaux diagnostic** :

- Équipe junior

<sub>id : `conseiller-acheteur-d-couverte-et-remerciements-acheteur`</sub>

---

### Suivi acheteur

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1

**Identification du besoin** :

> Combien d'acquéreurs qualifiés sont suivis chaque semaine ? Quel taux de relance aboutit à une visite ou une offre ? Le problème vient-il de l'organisation, de la personnalisation ou de l'absence de priorisation ?

**Signaux diagnostic** :

- Vendeurs difficiles à faire baisser
- Beaucoup de visites mais peu d’offres
- Base acquéreurs ou vendeurs dormante
- Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives
- Acheteur — Visites nombreuses sans offre : découverte faible, mauvais matching ou prix mal traité

<sub>id : `conseiller-acheteur-suivi-acheteur`</sub>

---

### Suivi acheteur autonome

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 4 h · **Niveau** : 3

**Identification du besoin** :

> Le suivi acquéreur est-il régulier sans dépendre uniquement de la mémoire du conseiller, cette technologie fragile ? Quels gains attendez-vous : plus de visites, moins d'oublis, meilleure qualification, relances plus rapides ?

**Signaux diagnostic** :

- Vendeurs difficiles à faire baisser
- Beaucoup de visites mais peu d’offres
- Base acquéreurs ou vendeurs dormante
- Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives
- Acheteur — Visites nombreuses sans offre : découverte faible, mauvais matching ou prix mal traité

<sub>id : `conseiller-acheteur-suivi-acheteur-autonome`</sub>

---

### Synthétiser copro

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> Les éléments de copropriété sont-ils maîtrisés avant engagement acquéreur ? Les conseillers savent-ils repérer charges, travaux, procédures, fonds travaux ? Le besoin est-il lecture documentaire, synthèse ou explication pédagogique ?

<sub>id : `conseiller-acheteur-synth-tiser-copro`</sub>

---

### Synthétiser couts financiers

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> Les conseillers savent-ils expliquer le coût total d'acquisition : frais, charges, travaux, financement, fiscalité simple ? Les offres échouent-elles à cause d'un budget mal cadré ? Le besoin est-il qualification financière ou support de décision ?

<sub>id : `conseiller-acheteur-synth-tiser-couts-financiers`</sub>

---

### Synthétiser diags

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> Les diagnostics sont-ils lus avant la visite et l'offre ? Les conseillers savent-ils expliquer les anomalies sans affoler ni minimiser ? Le besoin est-il compréhension technique, discours client ou sécurisation de la négociation ?

<sub>id : `conseiller-acheteur-synth-tiser-diags`</sub>

---

### Synthétiser pv

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> Les conseillers savent-ils résumer un PV d'AG et détecter les points qui peuvent bloquer une offre ? Combien de ventes ralentissent à cause d'une mauvaise explication copropriété ? Le besoin est-il compétence documentaire ou support de synthèse ?

<sub>id : `conseiller-acheteur-synth-tiser-pv`</sub>

---

## Admin

### Annonces

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Payant** : non

**Identification du besoin** :

> Combien de temps faut-il pour produire une annonce complète ? Les annonces performent-elles selon les ratios vues -> clics -> contacts ? Le besoin est-il rapidité, qualité rédactionnelle, conformité ou adaptation au canal ?

**Signaux diagnostic** :

- Beaucoup de vues mais peu de contacts
- Diffusion — Beaucoup de vues mais peu de clics : annonce/photos. Beaucoup de visites mais peu d’offres : prix ou qualification

<sub>id : `conseiller-admin-annonces`</sub>

---

### Automatisation Boite mail

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 3

**Identification du besoin** :

> La boîte mail ralentit-elle le traitement des demandes clients, notaires, diagnostiqueurs et vendeurs ? Quels délais de réponse constatez-vous ? Le besoin est-il tri, priorisation, modèles de réponse ou automatisation contrôlée ?

<sub>id : `conseiller-admin-automatisation-boite-mail`</sub>

---

### Chatbot mandat

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1 · **Plateforme** : Notebook · **Payant** : non

**Identification du besoin** :

> Les clients posent-ils souvent les mêmes questions sur le mandat ? Les conseillers répondent-ils de façon homogène et sécurisée ? Le besoin est-il d'améliorer la compétence mandat ou de fournir un support d'aide à la réponse ?

**Signaux diagnostic** :

- Mandats simples mais peu d’exclusivités

<sub>id : `conseiller-admin-chatbot-mandat`</sub>

---

### My juridic assistant

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1

**Identification du besoin** :

> Les conseillers savent-ils répondre aux questions juridiques simples sans improviser dangereusement ? Quels sujets reviennent : mandat, offre, DPE, copropriété, compromis ? Le besoin est-il réflexe de prudence, base documentaire ou assistant d'aide ?

<sub>id : `conseiller-admin-my-juridic-assistant`</sub>

---

### Nursing BDD

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 4

**Identification du besoin** :

> La base de données produit-elle des opportunités ou dort-elle paisiblement comme un fichier Excel abandonné ? Quels ratios suivez-vous : contacts relancés, réponses, RDV, mandats, visites ? Le besoin est-il segmentation, routine ou relance automatisée ?

**Signaux diagnostic** :

- Base acquéreurs ou vendeurs dormante
- Organisation — CRM incomplet, relances oubliées, activité non pilotée

<sub>id : `conseiller-admin-nursing-bdd`</sub>

---

### Synthétiser compromis (présentation vidéo ou vocale)

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 2 · **Plateforme** : Notebook

**Identification du besoin** :

> Les compromis sont-ils expliqués de façon claire avant signature ? Les clients comprennent-ils les conditions, délais et engagements ? Le besoin est-il pédagogie, synthèse, vidéo de présentation ou sécurisation du parcours client ?

<sub>id : `conseiller-admin-synth-tiser-compromis-pr-sentation-vid-o-ou-vocale`</sub>

---

### Synthétiser copro

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> Les informations de copropriété sont-elles fiables, partagées et compréhensibles par tous ? Où apparaissent les erreurs : annonce, visite, offre, compromis ? Le besoin est-il process admin, lecture ou restitution client ?

<sub>id : `conseiller-admin-synth-tiser-copro`</sub>

---

### Synthétiser couts financiers

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> Les coûts financiers et annexes sont-ils présentés de manière homogène ? Les conseillers savent-ils éviter les mauvaises surprises qui cassent une offre ? Le besoin est-il outil de calcul, pédagogie ou contrôle avant engagement ?

<sub>id : `conseiller-admin-synth-tiser-couts-financiers`</sub>

---

### Synthétiser diags

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> Les diagnostics sont-ils exploités comme un outil de conseil ou seulement rangés dans le dossier, ce grand cimetière numérique ? Le besoin est-il de gagner en compréhension, en anticipation des objections ou en sécurité commerciale ?

<sub>id : `conseiller-admin-synth-tiser-diags`</sub>

---

### Synthétiser pv

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Plateforme** : Notebook LM

**Identification du besoin** :

> L'équipe sait-elle extraire rapidement les décisions importantes d'un PV ? Le retard de lecture impacte-t-il les délais de vente ou la qualité de conseil ? Le besoin est-il méthode, synthèse ou contrôle des risques ?

<sub>id : `conseiller-admin-synth-tiser-pv`</sub>

---

### Veille automatique immo

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 3

**Identification du besoin** :

> L'équipe suit-elle les évolutions marché, réglementaires et concurrentielles utiles au terrain ? Cette veille améliore-t-elle les estimations, relances vendeurs ou négociations ? Le besoin est-il source fiable, fréquence ou restitution simple ?

<sub>id : `conseiller-admin-veille-automatique-immo`</sub>

---

## Base (paramétrages fonctionnalités)

### Chat gpt 🏛️

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Équipe junior
- Compétence — Écarts forts entre conseillers ou dépendance au manager
- IA utile — IA utilisée sans indicateur de gain ou sans adoption terrain
- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- ChatGPT - paramétrage — Chaque conseiller utilise l'outil différemment ; résultats inégaux ; peur de l'erreur ou de la confidentialité.

<sub>id : `assistant-base-param-trages-fonctionnalit-s-chat-gpt`</sub>

---

### Claude 🏛️

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- Claude — Documents hétérogènes, trames inexistantes, qualité dépendante de la personne.

<sub>id : `assistant-base-param-trages-fonctionnalit-s-claude`</sub>

---

### Gamma 🏛️

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- Supports commerciaux faibles — Les conseillers savent-ils produire une présentation propre et orientée décision ?
- Gamma — Supports moches, trop longs, faits à la dernière minute. Grande tradition locale.

<sub>id : `assistant-base-param-trages-fonctionnalit-s-gamma`</sub>

---

### Gemini 🏛️

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Gemini / Google Workspace — Infos dispersées, doublons, documents introuvables, relances oubliées.

<sub>id : `assistant-base-param-trages-fonctionnalit-s-gemini`</sub>

---

### Notebook LM 🏛️

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Documents mal exploités — NotebookLM ou autre outil documentaire est-il connu et maîtrisé ?
- NotebookLM — Lecture longue, erreurs d'interprétation, dépendance au manager pour synthétiser.

<sub>id : `assistant-base-param-trages-fonctionnalit-s-notebook-lm`</sub>

---

### Chat gpt 🏛️

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 4 h · **Niveau** : 0 · **Module fondation** : oui

**Identification du besoin** :

> L'équipe a-t-elle déjà paramétré ChatGPT : instructions personnalisées, mémoire/projets, GPTs utiles, règles de confidentialité, modèles de prompts ? Les conseillers savent-ils l'utiliser sur des cas métier concrets : préparation RDV vendeur, compte rendu, relance, objection, analyse de stats ? Mesure-t-on le gain : temps gagné, relances envoyées, qualité des réponses, taux RDV ?

**Signaux diagnostic** :

- Équipe junior
- Compétence — Écarts forts entre conseillers ou dépendance au manager
- IA utile — IA utilisée sans indicateur de gain ou sans adoption terrain
- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- ChatGPT - paramétrage — Chaque conseiller utilise l'outil différemment ; résultats inégaux ; peur de l'erreur ou de la confidentialité.

<sub>id : `conseiller-base-param-trages-fonctionnalit-s-chat-gpt`</sub>

---

### Claude 🏛️

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 4 h · **Niveau** : 0 · **Module fondation** : oui

**Identification du besoin** :

> Ont-ils déjà testé Claude pour produire des contenus longs et structurés : supports, scripts, mails, comptes rendus, déroulés, matrices ? Savent-ils comparer les usages avec ChatGPT ? Le besoin est-il de produire plus vite, de mieux structurer ou de standardiser les livrables de l'équipe ?

**Signaux diagnostic** :

- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- Claude — Documents hétérogènes, trames inexistantes, qualité dépendante de la personne.

<sub>id : `conseiller-base-param-trages-fonctionnalit-s-claude`</sub>

---

### Gamma 🏛️

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 0 · **Module fondation** : oui

**Identification du besoin** :

> Les conseillers ont-ils déjà réalisé une présentation sur Gamma ? Savent-ils transformer un diagnostic vendeur, un bilan de diffusion ou une proposition de service en support clair, à la charte, utilisable en RDV ? Le frein est-il l'outil, la structure du message, le design ou le temps de production ?

**Signaux diagnostic** :

- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- Supports commerciaux faibles — Les conseillers savent-ils produire une présentation propre et orientée décision ?
- Gamma — Supports moches, trop longs, faits à la dernière minute. Grande tradition locale.

<sub>id : `conseiller-base-param-trages-fonctionnalit-s-gamma`</sub>

---

### Gemini 🏛️

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 0 · **Module fondation** : oui

**Identification du besoin** :

> L'équipe utilise-t-elle Google Workspace et Gemini : Gmail, Drive, Docs, Sheets, Slides ? Les conseillers savent-ils rechercher, synthétiser et rédiger à partir de leurs documents ? Où se perd le plus de temps : retrouver l'information, produire un document, partager, suivre ou relancer ?

**Signaux diagnostic** :

- Gemini / Google Workspace — Infos dispersées, doublons, documents introuvables, relances oubliées.

<sub>id : `conseiller-base-param-trages-fonctionnalit-s-gemini`</sub>

---

### Notebook LM 🏛️

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 4 h · **Niveau** : 0 · **Module fondation** : oui

**Identification du besoin** :

> Connaissent-ils NotebookLM et savent-ils s'en servir avec des sources fiables : diagnostics, PV d'AG, règlement de copropriété, offres, documents agence, supports formation ? Savent-ils obtenir une synthèse exploitable sans inventer ? Le besoin porte-t-il sur fiabilité, rapidité de lecture ou vulgarisation client ?

**Signaux diagnostic** :

- Documents mal exploités — NotebookLM ou autre outil documentaire est-il connu et maîtrisé ?
- NotebookLM — Lecture longue, erreurs d'interprétation, dépendance au manager pour synthétiser.

<sub>id : `conseiller-base-param-trages-fonctionnalit-s-notebook-lm`</sub>

---

### Prompt 🏛️

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 0 · **Outils** : prompt creator · **Module fondation** : oui

**Identification du besoin** :

> Les conseillers savent-ils écrire un prompt métier réutilisable avec contexte, rôle, objectif, contraintes, données d'entrée et format de sortie ? Ont-ils une bibliothèque commune de prompts ? Les résultats produits sont-ils exploitables du premier coup ou faut-il tout refaire, comme souvent quand l'humain appelle ça 'tester' ?

**Signaux diagnostic** :

- Équipe junior
- Compétence — Écarts forts entre conseillers ou dépendance au manager
- IA utile — IA utilisée sans indicateur de gain ou sans adoption terrain
- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- ChatGPT - paramétrage — Chaque conseiller utilise l'outil différemment ; résultats inégaux ; peur de l'erreur ou de la confidentialité.
- Méthode de prompt — L'IA est jugée mauvaise alors que la demande est vide. Scénario classique.

<sub>id : `conseiller-base-param-trages-fonctionnalit-s-prompt`</sub>

---

### Chat gpt 🏛️

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Équipe junior
- Compétence — Écarts forts entre conseillers ou dépendance au manager
- IA utile — IA utilisée sans indicateur de gain ou sans adoption terrain
- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- ChatGPT - paramétrage — Chaque conseiller utilise l'outil différemment ; résultats inégaux ; peur de l'erreur ou de la confidentialité.

<sub>id : `manager-base-param-trages-fonctionnalit-s-chat-gpt`</sub>

---

### Claude 🏛️

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- Claude — Documents hétérogènes, trames inexistantes, qualité dépendante de la personne.

<sub>id : `manager-base-param-trages-fonctionnalit-s-claude`</sub>

---

### Gamma 🏛️

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Socle IA non paramétré — Les outils sont-ils paramétrés, personnalisés et utilisés avec des modèles communs ?
- Supports commerciaux faibles — Les conseillers savent-ils produire une présentation propre et orientée décision ?
- Gamma — Supports moches, trop longs, faits à la dernière minute. Grande tradition locale.

<sub>id : `manager-base-param-trages-fonctionnalit-s-gamma`</sub>

---

### Gemini 🏛️

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Gemini / Google Workspace — Infos dispersées, doublons, documents introuvables, relances oubliées.

<sub>id : `manager-base-param-trages-fonctionnalit-s-gemini`</sub>

---

### Notebook LM 🏛️

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : — · **Module fondation** : oui

**Signaux diagnostic** :

- Documents mal exploités — NotebookLM ou autre outil documentaire est-il connu et maîtrisé ?
- NotebookLM — Lecture longue, erreurs d'interprétation, dépendance au manager pour synthétiser.

<sub>id : `manager-base-param-trages-fonctionnalit-s-notebook-lm`</sub>

---

## Prospection (usecases)

### e réputation

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : —

<sub>id : `assistant-prospection-usecases-e-r-putation`</sub>

---

### Etude de marché agence

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : —

<sub>id : `assistant-prospection-usecases-etude-de-march-agence`</sub>

---

### Etude de marché biens à la vente

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : —

<sub>id : `assistant-prospection-usecases-etude-de-march-biens-la-vente`</sub>

---

### Etude de marché biens vendus

**Profil cible** : `assistant` · **Source** : `Assistantes` · **Durée** : — h · **Niveau** : —

<sub>id : `assistant-prospection-usecases-etude-de-march-biens-vendus`</sub>

---

### Base de données entretien relance

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 3 · **Outils** : A créer agent · **Payant** : oui

**Identification du besoin** :

> Combien de contacts dormants sont relancés chaque semaine par conseiller ? Quel taux de réponse et de RDV obtenez-vous ? Le problème vient-il de la discipline de relance, de la qualité du message ou de l'absence d'automatisation ?

**Signaux diagnostic** :

- Base acquéreurs ou vendeurs dormante
- CRM mal utilisé — Le problème vient-il de l'outil, de la discipline ou du process ?

<sub>id : `conseiller-prospection-usecases-base-de-donn-es-entretien-relance`</sub>

---

### e réputation

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Outils** : A créer · **Payant** : non

**Identification du besoin** :

> Les avis clients sont-ils demandés systématiquement au bon moment ? Combien d'avis récents par conseiller ou par agence ? Le besoin est-il d'améliorer la crédibilité commerciale, la méthode de demande ou le suivi des clients satisfaits ?

<sub>id : `conseiller-prospection-usecases-e-r-putation`</sub>

---

### Entrainement

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Outils** : Train my agent · **Payant** : oui

**Identification du besoin** :

> Les conseillers s'entraînent-ils sur les situations qui font perdre du chiffre : appel PAP, objection commission, exclusivité, baisse de prix, offre basse ? Mesure-t-on leur progression ? Le besoin est-il de renforcer compétence, posture ou réflexes terrain ?

<sub>id : `conseiller-prospection-usecases-entrainement`</sub>

---

### Estimation baromètre

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 2 · **Outils** : A créer · **Payant** : non

**Identification du besoin** :

> Les conseillers savent-ils utiliser les données marché pour renforcer une estimation ? Le taux estimation -> mandat est-il insuffisant ? Le besoin est-il de mieux préparer le RDV, de mieux argumenter le prix ou de rendre la donnée compréhensible pour le vendeur ?

**Signaux diagnostic** :

- Estimations nombreuses mais peu de mandats
- Estimation — Taux faible ou très variable entre conseillers

<sub>id : `conseiller-prospection-usecases-estimation-barom-tre`</sub>

---

### Expert DPE

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 2 · **Outils** : A créer via gpt · **Payant** : non

**Identification du besoin** :

> Les conseillers maîtrisent-ils l'impact du DPE sur le prix, le délai de vente et l'argumentaire vendeur ? Combien de RDV ou mandats sont perdus faute d'explication claire ? Le besoin est-il technique, commercial ou pédagogique ?

<sub>id : `conseiller-prospection-usecases-expert-dpe`</sub>

---

### Génération de contenu

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 2 · **Outils** : Prospect IA · **Payant** : non

**Identification du besoin** :

> Les contenus générés produisent-ils des contacts ou seulement de la visibilité ? Quels ratios suivez-vous : publications, messages envoyés, réponses, RDV pris ? Les conseillers savent-ils adapter le contenu à la cible, au canal et à l'objectif commercial ?

**Signaux diagnostic** :

- Manque de mandats / peu de vendeurs / faible prospection
- Beaucoup de vues mais peu de contacts
- Prospection — Pas de chiffre connu, moins de 10 contacts qualifiés, ou prospection irrégulière

<sub>id : `conseiller-prospection-usecases-g-n-ration-de-contenu`</sub>

---

### Pige Faq

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 2 · **Outils** : Vendre seul bien accompagné · **Payant** : non

**Identification du besoin** :

> Quel est le taux appels PAP -> conversations -> RDV -> mandats ? Les conseillers savent-ils traiter les objections et créer de la valeur face au 'je vends seul' ? Le besoin porte-t-il sur script, posture, relance ou preuve de valeur ?

**Signaux diagnostic** :

- Manque de mandats / peu de vendeurs / faible prospection
- Prospection — Pas de chiffre connu, moins de 10 contacts qualifiés, ou prospection irrégulière
- RDV vendeur — Beaucoup d’actions mais peu de RDV : problème de ciblage, message ou posture
- Pige / veille annonces — Peu de RDV PAP, relances non suivies, faible argumentaire face au vendeur.

<sub>id : `conseiller-prospection-usecases-pige-faq`</sub>

---

### Réseaux sociaux

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 2 · **Outils** : rien · **Plateforme** : claude design · **Payant** : oui

**Identification du besoin** :

> Les réseaux sociaux contribuent-ils réellement aux objectifs commerciaux : notoriété locale, contacts vendeurs, recrutement acquéreurs, preuve d'expertise ? Quels ratios sont suivis : messages entrants, RDV, mandats ? Le besoin est-il contenu, régularité ou conversion ?

**Signaux diagnostic** :

- Beaucoup de vues mais peu de contacts
- RDV vendeur — Beaucoup d’actions mais peu de RDV : problème de ciblage, message ou posture
- Réseaux sociaux — Posts sans cible, sans appel à l'action, sans mesure.

<sub>id : `conseiller-prospection-usecases-r-seaux-sociaux`</sub>

---

### Secteur base de données

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Outils** : My boitage · **Plateforme** : Gpt · **Payant** : non

**Identification du besoin** :

> Les conseillers connaissent-ils leurs secteurs prioritaires et leurs volumes de prospection ? Combien de contacts propriétaires qualifiés créent-ils par semaine ? Le frein vient-il du ciblage, de la base de données, de la régularité ou du suivi ?

<sub>id : `conseiller-prospection-usecases-secteur-base-de-donn-es`</sub>

---

### Veille concurrentielle

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1 · **Outils** : A créer · **Payant** : non

**Identification du besoin** :

> Les conseillers analysent-ils les biens concurrents avant estimation, suivi vendeur et négociation ? Utilisent-ils cette veille pour améliorer le taux de mandat, la baisse de prix ou l'acceptation d'offre ? Le besoin est-il méthode, outil ou discipline ?

**Signaux diagnostic** :

- Estimations nombreuses mais peu de mandats
- Vendeurs difficiles à faire baisser
- Équipe confirmée mais irrégulière
- Estimation — Taux faible ou très variable entre conseillers
- Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives
- Négociation — Offres transmises mais non travaillées
- Pige / veille annonces — Peu de RDV PAP, relances non suivies, faible argumentaire face au vendeur.

<sub>id : `conseiller-prospection-usecases-veille-concurrentielle`</sub>

---

## Usecases

### Agent de coaching

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-agent-de-coaching`</sub>

---

### Analyse CV

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-analyse-cv`</sub>

---

### Assitant recrutement

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-assitant-recrutement`</sub>

---

### Automatisation boite mail

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-automatisation-boite-mail`</sub>

---

### e réputation

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-e-r-putation`</sub>

---

### Etude de marché agence

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-etude-de-march-agence`</sub>

---

### Etude de marché biens à la vente

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-etude-de-march-biens-la-vente`</sub>

---

### Etude de marché biens vendus

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-etude-de-march-biens-vendus`</sub>

---

### Générateur annonces joab board

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

**Signaux diagnostic** :

- Beaucoup de vues mais peu de contacts
- Diffusion — Beaucoup de vues mais peu de clics : annonce/photos. Beaucoup de visites mais peu d’offres : prix ou qualification

<sub>id : `manager-usecases-g-n-rateur-annonces-joab-board`</sub>

---

### My juridic assistant

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-my-juridic-assistant`</sub>

---

### Onboarding collab

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-onboarding-collab`</sub>

---

### Prépa coaching

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-pr-pa-coaching`</sub>

---

### Prépa réunion

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-pr-pa-r-union`</sub>

---

### Suivi recrutement

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

**Signaux diagnostic** :

- Vendeurs difficiles à faire baisser
- Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives

<sub>id : `manager-usecases-suivi-recrutement`</sub>

---

### Training

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

**Signaux diagnostic** :

- Équipe confirmée mais irrégulière

<sub>id : `manager-usecases-training`</sub>

---

### Veille immo

**Profil cible** : `manager` · **Source** : `Manager` · **Durée** : — h · **Niveau** : —

<sub>id : `manager-usecases-veille-immo`</sub>

---

## Vendeur

### Annonces

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Payant** : non

**Identification du besoin** :

> Les annonces génèrent-elles assez de clics, contacts et visites par rapport aux vues ? Les conseillers savent-ils identifier si le problème vient du prix, du titre, des photos, du texte ou du positionnement ? Le besoin est-il rédaction, analyse ou optimisation ?

**Signaux diagnostic** :

- Beaucoup de vues mais peu de contacts
- Diffusion — Beaucoup de vues mais peu de clics : annonce/photos. Beaucoup de visites mais peu d’offres : prix ou qualification

<sub>id : `conseiller-vendeur-annonces`</sub>

---

### Chatbot mandat

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1 · **Plateforme** : Notebook · **Payant** : non

**Identification du besoin** :

> Les conseillers comprennent-ils suffisamment le mandat pour le présenter sans approximation ? Quelles erreurs ou hésitations apparaissent en RDV ? Le besoin est-il juridique de premier niveau, argumentaire ou sécurisation de la signature ?

**Signaux diagnostic** :

- Mandats simples mais peu d’exclusivités

<sub>id : `conseiller-vendeur-chatbot-mandat`</sub>

---

### Découverte et remerciements

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1 · **Outils** : protocole vendeur · **Plateforme** : gpt · **Payant** : non

**Identification du besoin** :

> Après un RDV vendeur, les conseillers font-ils systématiquement une synthèse et une relance ? Quel taux de second RDV ou de mandat est obtenu après cette relance ? Le besoin est-il méthode de suivi, qualité du message ou rythme commercial ?

**Signaux diagnostic** :

- Équipe junior

<sub>id : `conseiller-vendeur-d-couverte-et-remerciements`</sub>

---

### Dossier rénov

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 2 · **Outils** : my renov immo · **Payant** : non

**Identification du besoin** :

> Les conseillers savent-ils évaluer l'impact des travaux sur le prix, la négociation et la projection acquéreur ? Perd-on des visites ou des offres faute de chiffrage ou de solution ? Le besoin est-il conseil vendeur, argumentaire ou support rénov ?

<sub>id : `conseiller-vendeur-dossier-r-nov`</sub>

---

### Entrainement

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Outils** : Train my agent · **Payant** : non

**Identification du besoin** :

> Les conseillers sont-ils capables de conduire un RDV vendeur complet sans perdre le fil : découverte, estimation, exclusivité, objections, conclusion ? Sur quels passages perdent-ils le plus de performance ? Le besoin est-il entraînement, script ou feedback ?

<sub>id : `conseiller-vendeur-entrainement`</sub>

---

### Photos

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Payant** : non

**Identification du besoin** :

> Les photos actuelles améliorent-elles l'attractivité des biens ? Les conseillers savent-ils préparer un logement, sélectionner les visuels et détecter les photos qui pénalisent le taux de clic ? Le besoin est-il technique, commercial ou process ?

**Signaux diagnostic** :

- Beaucoup de vues mais peu de contacts
- Diffusion — Beaucoup de vues mais peu de clics : annonce/photos. Beaucoup de visites mais peu d’offres : prix ou qualification

<sub>id : `conseiller-vendeur-photos`</sub>

---

### Plan de comm vendeur

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Payant** : non

**Identification du besoin** :

> Le plan de communication aide-t-il réellement à signer le mandat ou reste-t-il une liste d'actions standard ? Les vendeurs comprennent-ils ce qui différencie l'agence ? Le besoin est-il packaging, discours commercial ou preuve de suivi ?

**Signaux diagnostic** :

- Mandats simples mais peu d’exclusivités
- Exclusivité — Exclusivité rarement proposée ou mal défendue

<sub>id : `conseiller-vendeur-plan-de-comm-vendeur`</sub>

---

### Prépa R2

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Payant** : non

**Identification du besoin** :

> Les R2 aboutissent-ils à une décision claire ? Quel taux R2 -> mandat signé et mandat exclusif ? Les conseillers savent-ils défendre leur estimation, présenter la stratégie et conclure ? Le besoin est-il argumentaire, preuve de valeur ou conclusion ?

**Signaux diagnostic** :

- Estimations nombreuses mais peu de mandats
- Mandats simples mais peu d’exclusivités
- Estimation — Taux faible ou très variable entre conseillers
- Exclusivité — Exclusivité rarement proposée ou mal défendue

<sub>id : `conseiller-vendeur-pr-pa-r2`</sub>

---

### Préparation R1

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Payant** : non

**Identification du besoin** :

> Les R1 vendeurs sont-ils préparés avec des objectifs clairs : découverte, motivation, concurrence, délai, prix, décisionnaire ? Quel taux R1 -> R2 obtenez-vous ? Le besoin est-il trame, qualification ou posture de découverte ?

**Signaux diagnostic** :

- Équipe junior

<sub>id : `conseiller-vendeur-pr-paration-r1`</sub>

---

### Production esti autre langue et vidéo

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Plateforme** : Notebook · **Payant** : non

**Identification du besoin** :

> Avez-vous des vendeurs étrangers, éloignés ou peu disponibles ? Les conseillers savent-ils produire une restitution claire, multilingue ou vidéo ? Le besoin est-il d'améliorer la compréhension client, la réactivité ou l'image professionnelle ?

<sub>id : `conseiller-vendeur-production-esti-autre-langue-et-vid-o`</sub>

---

### Suivi

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1 · **Outils** : Projet · **Payant** : non

**Identification du besoin** :

> À quelle fréquence les vendeurs reçoivent-ils un compte rendu utile ? Le suivi améliore-t-il le taux de baisse de prix, de maintien mandat et de satisfaction client ? Le besoin est-il régularité, analyse ou capacité à dire les choses clairement ?

**Signaux diagnostic** :

- Vendeurs difficiles à faire baisser
- Beaucoup de visites mais peu d’offres
- Base acquéreurs ou vendeurs dormante
- Équipe confirmée mais irrégulière
- Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives
- Diffusion — Beaucoup de vues mais peu de clics : annonce/photos. Beaucoup de visites mais peu d’offres : prix ou qualification
- Acheteur — Visites nombreuses sans offre : découverte faible, mauvais matching ou prix mal traité
- Négociation — Offres transmises mais non travaillées

<sub>id : `conseiller-vendeur-suivi`</sub>

---

### Suivi automatisé

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 4 h · **Niveau** : 3 · **Outils** : Agent · **Plateforme** : gpt · **Payant** : oui

**Identification du besoin** :

> Combien de temps est perdu chaque semaine sur les comptes rendus vendeurs ? Les relances sont-elles faites dans les délais ? L'automatisation doit-elle améliorer le ratio temps passé / qualité perçue / décisions obtenues ?

**Signaux diagnostic** :

- Vendeurs difficiles à faire baisser
- Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives

<sub>id : `conseiller-vendeur-suivi-automatis`</sub>

---

### Veille concurrentielle

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 2 h · **Niveau** : 1 · **Plateforme** : notebook · **Payant** : non

**Identification du besoin** :

> Avant un RDV vendeur, les conseillers savent-ils comparer le bien aux concurrents directs ? Cette analyse aide-t-elle à obtenir le bon prix ou l'exclusivité ? Le besoin est-il de créer un réflexe d'analyse marché avant chaque rendez-vous ?

**Signaux diagnostic** :

- Estimations nombreuses mais peu de mandats
- Vendeurs difficiles à faire baisser
- Équipe confirmée mais irrégulière
- Estimation — Taux faible ou très variable entre conseillers
- Suivi vendeur — Suivi irrégulier, vendeur surpris, baisses tardives
- Négociation — Offres transmises mais non travaillées
- Pige / veille annonces — Peu de RDV PAP, relances non suivies, faible argumentaire face au vendeur.

<sub>id : `conseiller-vendeur-veille-concurrentielle`</sub>

---

### Vidéos

**Profil cible** : `conseiller` · **Source** : `Conseiller` · **Durée** : 1 h · **Niveau** : 1 · **Payant** : oui

**Identification du besoin** :

> La vidéo est-elle utilisée pour augmenter la confiance, la projection ou le suivi vendeur ? Mesurez-vous son impact sur les contacts, visites qualifiées ou mandats ? Le besoin est-il tournage, scénario, diffusion ou présentation client ?

**Signaux diagnostic** :

- Diffusion — Beaucoup de vues mais peu de clics : annonce/photos. Beaucoup de visites mais peu d’offres : prix ou qualification

<sub>id : `conseiller-vendeur-vid-os`</sub>

---
