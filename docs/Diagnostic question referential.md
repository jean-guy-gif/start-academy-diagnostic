# Référentiel des questions — Diagnostic agence Start Academy

> **Statut** : Source de vérité métier du diagnostic guidé.
> **Version** : 1.0 — Juillet 2026
> **Périmètre** : Transaction immobilière dans l'ancien — chaîne complète de production.
> **Règle** : toute modification du questionnaire dans le code doit être répercutée ici, et inversement.

---

## Principes structurants

1. **11 chapitres**, dans l'ordre de la chaîne de production (du vendeur vers l'acte), précédés de l'identité et de l'équipe/financement.
2. Chaque question est **[O]** obligatoire ou **[F]** facultative. Une donnée obligatoire manquante ne bloque jamais le diagnostic : elle génère une **alerte "donnée manquante"** visible au cockpit.
3. Chaque réponse alimente au moins un des éléments suivants : ratio, alerte, recommandation IA, proposition, stratégie de financement, décision cockpit.
4. Les fiches collaborateurs (agents indés / salariés) sont **répétables et complétables après coup**.
5. Les questions conditionnelles évitent les tunnels : on ne pose jamais une question dont la réponse est déjà connue ou hors sujet.
6. **Synthèses intermédiaires** : après Ch.2 → "Votre potentiel de financement" ; après Ch.8 → "Votre pipeline de transformation".
7. Les plafonds et règles de financement (AGEFICE, OPCO EP) vivent dans un **référentiel paramétrable** (jamais en dur dans le code ou les prompts). Ils sont datés et révisés annuellement.

---

## Chapitre 1 — Identité & contexte (~3 min)

**Objectif** : cadrer l'entreprise et vérifier que le diagnostic est pertinent (transaction ancien).

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Nom de l'entreprise | texte | O | Identité |
| Enseigne / Réseau | texte | F | Contexte (indépendant vs réseau → calibrage reco IA) |
| SIRET | texte (validé 14 chiffres) | O | Identité, éligibilité financement |
| Date de création | date | F | Maturité de l'agence |
| Adresse principale | texte | O | Identité |
| Site internet | url | F | E-réputation (croisement Ch.9) |
| Nombre d'agences | entier | O | Structure, dimensionnement formation collective |
| Secteurs géographiques couverts | texte | F | Contexte marché |
| Activité principale (répartition % : transaction ancien / neuf / location / gestion / syndic) | multi-choix + % | O | **Alerte si transaction ancien < 50 % du CA** (diagnostic calibré ancien) |
| Typologie des biens (appartements / maisons / prestige / commerces / terrains) | multi-choix | F | Calibrage reco |
| Nombre de ventes réalisées N-1 | entier | O | Ratio CA moyen/vente, pipeline |
| CA global N-1 | € | O | Ratios de productivité |
| Objectif CA année en cours | € | F | Écart ambition vs moyens (reco IA) |
| Ambition à 3 ans (texte libre court) | texte | F | Vision dirigeant, ton de la proposition |

**Ratios calculés** : CA moyen par vente ; CA par collaborateur (après Ch.2) ; ventes par agent (après Ch.2).

---

## Chapitre 2 — Équipe & financement

**Objectif** : cartographier l'équipe et produire immédiatement la stratégie de financement. C'est le chapitre qui **montre la valeur en premier**.

### 2.1 Effectifs globaux

| Question | Type | O/F |
|---|---|---|
| Nombre total de collaborateurs | entier | O |
| Nombre de salariés | entier | O |
| Nombre d'agents commerciaux indépendants | entier | O |
| Nombre d'assistants | entier | F |
| Nombre de managers | entier | F |
| Nombre de dirigeants | entier | O |

> Contrôle de cohérence : total ≈ somme des catégories, sinon avertissement non bloquant.

### 2.2 Fiche agent commercial indépendant (répétable)

| Champ | Type | O/F | Alimente |
|---|---|---|---|
| Nom | texte | O | Fiche participant |
| Date d'entrée | date | F | Ancienneté |
| Statut (débutant < 1 an / confirmé / expert) | choix | O | Calibrage parcours formation |
| CA N-1 | € | **O pour le calcul** — sinon **alerte "CA N-1 manquant"** | **Droits AGEFICE année en cours** (règle seuil existante, ex. N-1 > 7 k€) |
| CA année en cours | € | F | **Projection droits N+1 — toujours étiquetée "projection, non acquise"** |
| Formations suivies 24 derniers mois (nb) | entier | F | Taux de consommation des droits |
| Heures suivies 24 derniers mois | entier | F | Taux de consommation des droits |
| Montant financé / consommé 24 derniers mois | € | F | Taux de consommation des droits |
| Souhaite évoluer ? | O/N | F | Reco individuelle |
| Souhaite être formé ? | O/N | F | Reco individuelle, priorisation |
| Besoin prioritaire | choix (familles du catalogue 79 modules) + libre | F | Mapping direct catalogue → proposition |

### 2.3 Fiche salarié (répétable)

| Champ | Type | O/F | Alimente |
|---|---|---|---|
| Nom | texte | O | Fiche participant |
| Fonction | texte | O | Éligibilité, pertinence modules |
| Temps plein / partiel | choix | O | Calcul plafonds OPCO |
| Date d'entrée | date | F | Ancienneté |
| Convention collective | texte, **pré-rempli "Immobilier — IDCC 1527"** | F | Éligibilité OPCO EP |
| Éligibilité OPCO | O/N, pré-coché Oui | O | Stratégie financement collectif |
| Formations 24 derniers mois (nb, heures, coût pris en charge) | entiers + € | F | Taux de consommation |
| Besoin individuel | choix catalogue + libre | F | Proposition |

### 2.4 Historique formation & financement (entreprise)

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Formations réalisées sur les 24 derniers mois ? | O/N | O | Taux de consommation |
| Si oui : nombre, heures totales, organismes, thèmes principaux, satisfaction (1–5) | conditionnel | F | Contexte concurrentiel, reco |
| Avez-vous déjà utilisé vos droits AGEFICE ? | O/N/Ne sait pas | O | Stratégie financement |
| Avez-vous déjà utilisé votre OPCO ? | O/N/Ne sait pas | O | Stratégie financement |
| Connaissez-vous vos droits actuels ? | O/N | O | Argument commercial |
| Avez-vous déjà eu des refus de prise en charge ? | O/N + motif | O | **Alerte risque administratif** |
| Disposez-vous d'un budget formation interne ? | O/N + montant | F | Reste à charge |

### 2.5 Calculs automatiques (moteur financement + IA)

Le système produit automatiquement :

1. Nombre de personnes finançables individuellement.
2. Budget estimatif mobilisable AGEFICE (à partir des CA N-1, règles du référentiel paramétrable).
3. Budget estimatif mobilisable OPCO (salariés éligibles).
4. Budget total disponible estimé.
5. Heures finançables en individuel / en collectif.
6. Reste à charge éventuel.
7. **Taux de consommation des droits sur 24 mois** = montant consommé 24 mois ÷ budget théoriquement mobilisable 24 mois. *Indicateur stratégique : "Vous n'avez utilisé que X % des financements potentiellement mobilisables ces deux dernières années."*
8. Alertes : CA N-1 manquant ou insuffisant, droits déjà consommés, risques d'inéligibilité, données manquantes, refus antérieurs.

> **Règle absolue** : une projection basée sur le CA en cours n'est **jamais** présentée comme un droit acquis. Mention systématique dans l'UI, le rapport et la proposition.

---

## Chapitre 3 — Prospection & entrées vendeurs

**Objectif** : mesurer la capacité de l'agence à générer des contacts vendeurs.

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Méthodes de prospection utilisées (pige / terrain / boîtage / réseaux sociaux / recommandation / notoriété / farming secteur / aucune) | multi-choix | O | Reco modules prospection |
| Qui prospecte ? (tous les agents / certains / personne) | choix | O | **Alerte forte si "personne"** |
| Temps hebdomadaire moyen dédié à la prospection par agent | heures | F | Cause probable (volume mandats) |
| Les agents ont-ils des secteurs attribués ? | O/N | F | Organisation |
| Contacts vendeurs générés par mois (moyenne) | entier | O | **Ratio contacts → RDV** |
| Outil de pige utilisé | texte/choix | F | Ch.10 croisement outils |
| Existe-t-il un script ou une trame de prospection ? | O/N | F | Reco module "prospection structurée" |

*Conditionnel : si "personne ne prospecte", sauter temps hebdo, secteurs, outil de pige, script.*

**Ratio clé** : contacts vendeurs/mois → RDV estimation/mois (Ch.4).

---

## Chapitre 4 — RDV vendeur, découverte & estimation

**Objectif** : mesurer la qualité de l'entrée en relation vendeur — là où se joue le mandat.

| Question | Type | O/F | Alimente |
|---|---|---|---|
| RDV estimation par mois (moyenne agence) | entier | O | **Ratio RDV → mandat** |
| Process de découverte vendeur formalisé (motivation, délai, projet) ? | O/N | O | **Alerte si non** — cause n°1 des mandats simples surévalués |
| Méthode : R1/R2 ou RDV unique ? | choix | F | Reco méthode de vente |
| Un avis de valeur écrit est-il remis ? | O/N | F | Professionnalisation |
| Outil d'estimation utilisé | texte/choix | O | Ch.10, fiabilité prix de rentrée |
| Délai moyen de remise de l'estimation | choix (immédiat / 48 h / plus) | F | Expérience vendeur |

---

## Chapitre 5 — Mandats & exclusivité

**Objectif** : mesurer la qualité et la valeur du stock.

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Mandats rentrés par mois (moyenne) | entier | O | Pipeline |
| Stock de mandats actifs | entier | O | Ratio mandats/agent, stock mort (croisé Ch.6) |
| **% d'exclusivités** dans les rentrées | % | O | **Alerte si < benchmark paramétrable** → module "vendre l'exclusivité" |
| Durée moyenne des mandats | mois | F | Pilotage stock |
| Acceptez-vous des prix de rentrée au-dessus du marché ? (souvent / parfois / jamais) | choix | O | Cause probable (délais, baisses) |
| Mandats par agent (calculé ou déclaré) | entier | F | Charge / productivité |

---

## Chapitre 6 — Commercialisation & suivi vendeur

**Objectif** : mesurer le pilotage du stock — le chapitre qui révèle le "stock mort".

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Fréquence des comptes-rendus vendeur (hebdo / bimensuel / à la demande / jamais) | choix | O | **Alerte si "à la demande" ou "jamais"** |
| Canal des comptes-rendus (tél / email / espace vendeur / auto) | multi-choix | F | Outils, expérience vendeur |
| **% de baisses de prix obtenues par mois** sur le stock | % | O | Pilotage prix, santé du stock |
| Délai moyen avant première baisse de prix | semaines | F | Cause probable délais de vente |
| Process de requalification des mandats anciens ? | O/N | O | Reco pilotage stock |
| % de mandats expirés non vendus | % | F | Fuite de valeur |

---

## Chapitre 7 — Acquéreurs

**Objectif** : mesurer la génération et la qualification acquéreurs.

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Contacts acquéreurs par mois | entier | O | Pipeline aval |
| **Sources acquéreurs en %** (portails / vitrine / base / recommandation / réseaux sociaux / autre) | répartition % | O | Dépendance portails → reco base de données |
| Découverte acquéreur formalisée ? | O/N | O | Qualité des visites |
| Le financement est-il vérifié avant les visites ? | O/N | O | **Alerte forte si non** (visites inutiles, chutes compromis) |
| Taux de sortie de découverte vers visite | % | F | Ratio qualification |

---

## Chapitre 8 — Visites, offres & transformation

**Objectif** : mesurer la transformation — où la chaîne fuit.

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Visites par mois | entier | O | **Ratio visites/vente** |
| Bons de visite systématiques ? | O/N | F | Sécurisation juridique |
| Compte-rendu au vendeur après chaque visite ? | O/N | O | Croisé Ch.6 |
| Offres par mois | entier | O | Ratio visites → offres |
| Compromis par mois | entier | O | Ratio offres → compromis |
| Actes authentiques par mois | entier | O | Ratio compromis → acte |
| Taux de chute compromis → acte | % | F | **Alerte si > seuil** (financement mal vérifié, croisé Ch.7) |
| Délai moyen mandat → compromis | semaines | F | Santé du stock |
| Délai moyen compromis → acte | semaines | F | Trésorerie |

**Synthèse intermédiaire "Pipeline de transformation"** : funnel contacts vendeurs → RDV → mandats → (dont % exclu) → visites → offres → compromis → actes, avec mise en évidence des **2 étapes les plus faibles** vs benchmarks paramétrables.

---

## Chapitre 9 — Base de données & e-réputation

**Objectif** : mesurer les actifs immatériels de l'agence.

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Volume de la base de contacts | entier | O | Actif exploitable |
| Le CRM est-il à jour ? | O/N/Partiellement | O | Reco exploitation base |
| La base est-elle segmentée (vendeurs / acquéreurs / anciens clients) ? | O/N | F | Reco |
| Exploitation de la base (emailing / SMS / rapprochement auto / aucune) | multi-choix | O | Reco module base de données |
| **Nombre d'avis Google** | entier | O | **Ratio avis/vente** |
| **Note Google** | décimal (1–5) | O | E-réputation |
| Process de collecte d'avis ? | O/N | O | Gisement (agence à 40 ventes/an et 12 avis) |
| Répondez-vous aux avis ? | O/N/Parfois | F | Professionnalisation |
| **Mots positifs récurrents** dans les avis | texte libre court | F | Forces (rapport IA : "ce qui fonctionne") |
| **Mots négatifs récurrents** dans les avis | texte libre court | F | **Causes probables IA** |

---

## Chapitre 10 — Outils & IA

**Objectif** : cartographier l'équipement et la maturité digitale.

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Logiciel métier (transaction) | texte/choix | O | Compatibilité recos |
| Outil d'estimation | texte/choix (pré-rempli depuis Ch.4) | F | — |
| Outil de pige | texte/choix (pré-rempli depuis Ch.3) | F | — |
| Portails de diffusion utilisés | multi-choix | F | Coûts / dépendance |
| Signature électronique ? | O/N | F | Modernisation |
| Usages actuels de l'IA (rédaction annonces / estimation / réponses avis / prospection / aucun) | multi-choix | O | **Reco modules IA appliquée à l'immobilier** |
| Appétence de l'équipe pour l'IA (faible / moyenne / forte) | choix | F | Calibrage parcours |

*Pré-remplissage : ne jamais redemander un outil déjà cité aux chapitres 3 ou 4.*

---

## Chapitre 11 — Management, pilotage & vision

**Objectif** : comprendre comment le dirigeant pilote — et calibrer le ton de la recommandation (dirigeant pilote vs dirigeant producteur).

| Question | Type | O/F | Alimente |
|---|---|---|---|
| Fréquence des réunions d'équipe | choix (hebdo / mensuelle / irrégulière / aucune) | O | Pilotage |
| Coaching individuel des agents ? | O/N | O | Reco management |
| Quels indicateurs suivez-vous ? (liste + "aucun") | multi-choix | O | **Alerte forte si "aucun"** |
| Disposez-vous d'un tableau de bord ? | O/N | F | Reco pilotage |
| Objectifs individuels fixés ? | O/N | F | Management |
| Onboarding structuré des nouveaux ? | O/N | F | Reco (croisé recrutement) |
| Recrutement en cours ou prévu ? | O/N + nb + profils | O | Volonté de croissance → modules onboarding |
| Top 3 difficultés actuelles | texte libre / choix | O | **Priorités IA** |
| Top 3 priorités | texte libre / choix | O | **Plan d'action IA** |
| Projets en cours | texte libre | F | Contexte |
| Projets à venir | texte libre | F | Contexte, ambition |

---

## Ratios & benchmarks (référentiel paramétrable)

Tous les seuils sont **paramétrables** et versionnés (pas en dur). Valeurs initiales indicatives à valider par Start Academy :

| Ratio | Formule | Seuil d'alerte initial |
|---|---|---|
| Contacts vendeurs → RDV | RDV / contacts | < 20 % |
| RDV → mandat | mandats / RDV | < 40 % |
| % exclusivité | exclus / mandats rentrés | < 30 % |
| Visites / vente | visites / actes | > 15 |
| Offres → compromis | compromis / offres | < 60 % |
| Compromis → acte | actes / compromis | < 85 % |
| Avis / ventes annuelles | nb avis / ventes N-1 | < 30 % |
| Taux de consommation des droits | consommé 24 mois / mobilisable 24 mois | < 30 % → **levier commercial** |

---

## Règles transverses

1. **Aucune donnée obligatoire ne bloque** : manquante → alerte cockpit "donnée manquante" + relance possible.
2. **Pré-remplissage systématique** entre chapitres (outils, effectifs).
3. **Questions conditionnelles** : ne jamais poser une question hors contexte.
4. Les réponses individuelles (noms, CA des agents) sont des **données sensibles** : RLS participants existantes, jamais exposées via les liens publics tokenisés, jamais dans les logs IA.
5. Le prompt de recommandation IA reçoit les **ratios calculés + benchmarks + alertes**, pas les réponses brutes une à une.
6. Toute évolution de ce référentiel = mise à jour de ce document + du PRD financement si impact financement.