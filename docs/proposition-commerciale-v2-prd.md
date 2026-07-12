# PRD — Proposition commerciale v2

**Date** : 2026-07-12
**Statut vis-à-vis du pilote** : POST-PILOTE
**Origine** : premier chantier de construction après clôture du sprint
stabilisation (backlog `docs/backlog-post-stabilisation.md` §1).

## Contexte

Aujourd'hui, la « proposition commerciale » livrée par Start Academy à un
client résulte du chaînage diagnostic → recommandation → session, avec un
export PDF minimaliste centré sur le plan pédagogique et le budget. Les
retours terrain (Laurent, commercial pilote) et l'analyse concurrentielle
montrent que ce livrable **n'embarque pas les éléments qui font signer** :
l'ancrage humain (qui sont les formateurs, ce qu'ils ont fait), la preuve
sociale (avis, chiffres cumulés), les différenciants tangibles (prise en
charge admin clé en main, formation sur site, forfait tout compris, cadre
Qualiopi + ALUR), et l'outillage dirigeant pour convaincre son équipe en
interne.

**Objectif v2** : livrer une proposition commerciale qui **fait signer**.
Un document unique — PDF exportable + version web consultable via signed
URL — qui articule les 8 blocs ci-dessous en 100 % conforme à la charte
graphique Start Academy.

## Ligne rouge conformité

Le contenu tarifaire et le nombre d'heures affichés dans la proposition
doivent correspondre **exactement** au nombre d'heures qui apparaîtront
ensuite dans les documents administratifs (feuilles de présence,
attestation Qualiopi, dossier AGEFICE/OPCO). **Impossible d'écrire dans
la proposition « 4 h » et de déclarer « 3 h 30 » à l'AGEFICE.** Cette
règle prime sur toute considération de marketing ou d'arrondi.
Implication : la « demi-journée = 4 h » du bloc 8 devient contractuelle
dès la signature. Toute future variation de format (demi-journée 3 h,
journée 7 h, atelier 2 h) DOIT être répercutée simultanément côté
proposition, côté administratif, et côté recommandation Start Academy.

## Bloc 1 — Qui est Start Academy

Manifeste et valeurs, formatés en 1–2 pages du PDF, animés en accueil de
la version web.

### Contenu

- **Raison d'être** : rendre les indépendants et petites structures
  immobilières visibles, structurés et rentables — sans jargon, sans
  sur-vente, sans arnaque de la « formation OPCO ».
- **Chiffres clés cumulés** (source brand book officiel — cf.
  `docs/brand/charte-graphique.pdf`) :
  - **+500 professionnels formés**
  - **+15 000 heures de formation dispensées**
  - **+180 entreprises accompagnées**
- **Partenaires institutionnels** (liste à consolider avec Laurent avant
  intégration au PDF : logos + accord d'usage) : AGEFICE, FIF-PL, OPCO EP,
  Qualiopi, ainsi que les réseaux immobiliers avec lesquels Start Academy
  a des accords cadre.

### Contrainte

Les chiffres cumulés sont **datés au moment de la publication** et
doivent être révisés à chaque semestre. Prévoir un champ de configuration
(cf. dépendances techniques) pour éviter de re-générer la proposition à
la main à chaque incrément.

## Bloc 2 — Bios formateurs

Une bio pour chaque formateur qui interviendra sur la session vendue.
Ancrage humain concret, pas d'auto-célébration.

### Jean-Guy Ourmières

- **12 ans terrain** (agent commercial → manager d'agence).
- Ex-**ERA** : commercial 5 ans dans une agence indépendante du réseau,
  formation métier complète.
- Ex-**manager Keller Williams** : structuration d'équipe de 25+ agents,
  pilotage de la conquête et de la fidélisation client.
- **100+ agents coachés** en 1 à 1 sur les 4 dernières années.
- **2 000+ heures de formation** dispensées en présentiel et distanciel.

### Laurent [nom complet à confirmer avec Laurent]

- **Gérant de 3 agences** immobilières implantées à **Saint-Laurent-du-Var,
  Vence et Cagnes-sur-Mer**.
- **10 ans de direction opérationnelle** — recrutement, structuration
  commerciale, développement local sur la côte est des Alpes-Maritimes.
- **1 500+ heures de formation** dispensées, orientées « scale-up d'agence
  indépendante » et pilotage d'équipe commerciale.

### Contrainte

Les bios reflètent l'intervention réelle. Si un troisième intervenant est
prévu sur la session, il **doit** avoir sa propre bio de même format,
même densité — pas un paragraphe étoile qui gonfle une expertise fictive.

## Bloc 3 — Avis Google

Preuve sociale externe, vérifiable par le client.

### v1 (livrable initial, statique)

- **Note globale** Google et **nombre d'avis** cumulés au moment de la
  génération de la proposition (extraction manuelle depuis la fiche
  Google Business).
- **3 verbatims sélectionnés** (courts, contextualisés — pas des « super,
  merci ! » anonymes).
- Chaque verbatim : prénom + type de structure (« Marie, agence indé
  Nice ») + date de l'avis.

### v2 (connecteur, ultérieur)

Alimentation live via Google Business Profile API. Non prioritaire tant
que la note et le volume évoluent lentement (< 10 nouveaux avis / mois).

### Contrainte

- Aucun avis fabriqué ou reformulé.
- Si Start Academy tombe en dessous d'un seuil de note (< 4,5) ou si un
  avis récent est franchement négatif, la sélection des 3 verbatims doit
  refléter l'état réel, pas être un cherry-picking mensonger.

## Bloc 4 — Arguments différenciants

Ce qui fait que le client choisit Start Academy plutôt qu'un autre
organisme.

| # | Argument | Formulation client |
|---|---|---|
| 4.1 | **Prise en charge administrative clé en main** | « Vous n'écrivez pas une ligne de dossier — nous montons AGEFICE / OPCO / FIF-PL de A à Z » |
| 4.2 | **Formats courts, demi-journée** | « 4 h qui produisent un résultat, pas 3 jours qui vident l'agenda » |
| 4.3 | **Zéro avance de trésorerie** | « Nous encaissons directement l'OPCO ou l'AGEFICE — vous n'avancez rien » |
| 4.4 | **Formation sur site** | « Chez vous, dans vos locaux — vos vrais outils, vos vrais cas clients » |
| 4.5 | **Équipes non mélangées** | « Vous ne partagez pas la salle avec une agence concurrente du réseau d'à côté » |
| 4.6 | **Personnalisée** | « Le programme part de votre diagnostic — pas d'un catalogue générique » |
| 4.7 | **Cadre Qualiopi + loi ALUR** | « Certification Qualiopi active + réponse à l'obligation ALUR (14 h/an ou 42 h/3 ans — **à vérifier référence légale exacte avant publication**) » |

### Contrainte

Chaque argument ci-dessus est **contractuel** dès la signature :
- 4.1 → une équipe admin qui monte le dossier (pas « on vous envoie un
  formulaire à remplir »).
- 4.2 → 4 h vraies (bloc 8).
- 4.3 → pas de facture au client avant l'accord de prise en charge.
- 4.4 → si formation en salle Start Academy, retrait de cet argument de
  la proposition.
- 4.5 → si contrainte impose de mixer deux enseignes, le formuler
  explicitement en amont.
- 4.6 → doit s'appuyer sur un vrai diagnostic (le nôtre, produit par
  Start Academy Diagnostic).
- 4.7 → validation par un tiers de la référence légale ALUR **avant** de
  publier la proposition externe.

## Bloc 5 — FAQ / Simulateur

Renvoi vers l'outil de simulation existant, hébergé à part.

### Contenu

- **Lien mis en avant** : `https://simulateur-formation-start-academy.vercel.app/`
- **Positionnement** : « Estimez en 2 minutes votre prise en charge
  AGEFICE / OPCO / FIF-PL selon votre statut et votre effectif ».
- **Version PDF** : QR code + URL courte lisible.
- **Version web** : bouton CTA « Simuler ma prise en charge » avec
  redirection.

### Contrainte

- L'URL simulateur est **externe** à ce produit. Toute modification
  d'URL doit être répercutée dans un fichier de config (pas en dur dans
  le template PDF).
- Si le simulateur tombe (503, refonte, etc.), le CTA doit être
  désactivable sans re-générer la proposition.

## Bloc 6 — Charte graphique appliquée

Alignement 100 % avec le brand book officiel.

### Palette

| Rôle | Hex |
|---|---|
| Bleu principal | `#00527A` |
| Bleu vif | `#3EA9FF` |

### Typographie

| Rôle | Famille |
|---|---|
| Display | **Rajdhani** |
| Body | **Montserrat** |

### Assets

Committés en source unique dans `docs/brand/` :
- `logo.png` + `logo-white.png` (versions web/UI)
- `logo-bleu-hd.pdf` + `logo-blanc-hd.pdf` (versions impression / export)
- `charte-graphique.pdf` (brand book de référence)
- `docs/brand/README.md` (règles d'usage)

### Contrainte

- **Zéro couleur ou typo hors charte** dans la proposition v2.
- Toute déclinaison spécifique (ex. Rajdhani en italique) doit être
  validée contre `charte-graphique.pdf` avant intégration.
- Le fichier Rajdhani / Montserrat doit être **inline** (data URI) ou
  fourni en local dans le bundle PDF — pas de dépendance à un CDN font.

## Bloc 7 — Pack communication dirigeant

Livrable secondaire mais critique : 3 à 5 slides que le dirigeant peut
utiliser en réunion d'équipe pour embarquer ses agents.

### Contenu attendu (draft à valider avec Laurent)

1. **Slide 1** — « Pourquoi maintenant » : posture marché immobilier
   local, ce qui va changer dans les 12 prochains mois.
2. **Slide 2** — « Ce qu'on va apprendre » : 3-5 bullets pédagogiques
   issus de la recommandation Start Academy.
3. **Slide 3** — « Qui intervient » : formateurs (photos + accroche
   courte, dérivée du bloc 2).
4. **Slide 4** — « Comment ça se passe » : logistique concrète (4 h sur
   site, tel jour, telle salle, pas d'avance frais).
5. **Slide 5** (optionnelle) — « Ce que ça produit » : engagement de
   résultat mesurable (ex. « au bout de 3 mois : mise en pratique
   effective sur 80 % des dossiers en cours »).

### Contrainte

- Slides au format présentation (16:9), déclinaison charte du bloc 6.
- Livrables : PDF exportable + fichier source Keynote ou PowerPoint
  éditable par le dirigeant (celui-ci voudra probablement ajouter le
  nom de son agence).

## Bloc 8 — Présentation tarifaire

Cœur de la proposition — ce que le client signe.

### Format tarifaire de référence

- **Forfait demi-journée = 4 h de formation dispensée**
- **336 € tout compris** par participant (ou par session, à trancher —
  cf. contrainte ci-dessous)
- **Prise en charge AGEFICE visée : 100 %**
- Zéro avance trésorerie (cf. 4.3)

### Contrainte

- **Le tarif est paramétrable**. Aucune valeur en dur dans le template.
  Source : `public.funding_config` (table déjà versionnée avec `valid_to`
  cf. §6 sprint stabilisation) — étendre pour porter les paramètres
  « format », « durée h », « tarif unitaire », « type de facturation »
  (participant vs session).
- **La règle « demi-journée = 4 h » est un paramètre**, pas un
  invariant. Si un jour le format évolue vers 3 h, changer la valeur
  dans `funding_config` répercute automatiquement dans les propositions
  générées après la date de validité.
- **Ligne rouge conformité** (rappel) : ce nombre d'heures est celui qui
  figurera dans les feuilles de présence Qualiopi et le dossier
  administratif. **Non-négociable.**

## Livrables

| # | Livrable | Format |
|---|---|---|
| L-1 | Template proposition — version PDF | HTML → PDF via Playwright (skill `print-html-pdf`) |
| L-2 | Template proposition — version web consultable | Route SSR protégée signed URL (30 j) |
| L-3 | Pack communication dirigeant | PDF + fichier source éditable |
| L-4 | Migration `funding_config` étendue | Champs `format`, `duration_hours`, `unit_price_eur`, `billing_unit` |
| L-5 | Interface admin (settings) pour éditer le tarif | Route existante `/settings` — nouvelle sous-section « Tarifs » |

## Dépendances techniques

- **Bloc 6** : charte graphique déjà committée (`docs/brand/`).
- **Bloc 8** : dépend d'une migration additive sur `funding_config`.
  Devra respecter la doctrine du sprint stabilisation (backup préalable,
  migration mergée avant push, pas d'écrasement de config existante grâce
  au versioning `valid_from` / `valid_to`).
- **Bloc 3 v2** : dépend d'un connecteur Google Business Profile API —
  hors périmètre v2, tracé en backlog v3.
- **Bloc 5** : dépend d'un fichier de config `simulator_url` externe
  éditable sans re-build.

## Critères d'acceptance

- [ ] Les 8 blocs sont présents dans le PDF généré, dans l'ordre défini.
- [ ] Zéro couleur ou typo hors charte graphique du bloc 6.
- [ ] Le tarif provient de `funding_config` — remplacement d'une valeur
      dans la table met à jour la proposition à la prochaine génération.
- [ ] Le nombre d'heures dans la proposition = le nombre d'heures dans
      la feuille de présence Qualiopi générée (test de contrat).
- [ ] Le pack communication dirigeant est exportable en PDF et modifiable
      en éditable (Keynote / PowerPoint).
- [ ] La proposition v2 est générée pour au moins **un** vrai client
      pilote avant d'être promue « stable ».
- [ ] Consultation web (SSR + signed URL 30 j) fonctionnelle,
      révocation possible.

## Hors périmètre v2

- Connecteur Google Business Profile (bloc 3 v2) — v3.
- Signature électronique intégrée — v3.
- Version multi-langue — non prévue.
- Personnalisation par intervenant (autre que formateurs) — non prévue.
