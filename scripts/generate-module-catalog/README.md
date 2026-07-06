# generate-module-catalog

Transforme le catalogue Start Academy au format Excel en un fichier TypeScript
typé consommé par l'application Next.js.

## Fichier source

Placer le classeur Excel dans :

```
data/catalogue-formations-start-academy.xlsx
```

(à la racine du dépôt `Start Proposition/`, **pas** dans le projet Next.js).

Onglets attendus :

- `Conseiller`, `Manager`, `Assistantes` — modules de formation
- `Guide diagnostic IA`, `Diagnostic performance`, `Diagnostic outils de base`
  — signaux de diagnostic et règles de déclenchement

## Lancement

Depuis la racine du projet Next.js (`start-academy-diagnostic/`) :

```bash
npm run generate:catalog
```

ou directement :

```bash
python3 scripts/generate-module-catalog/generate_catalog.py
```

Le script résout ses chemins par rapport à son propre emplacement, il peut
donc être exécuté depuis n'importe quel répertoire.

## Pré-requis

- Python 3.9+
- `openpyxl` : `pip3 install openpyxl`

## Sortie

Le script écrit :

```
src/lib/data/module-catalog.ts
```

contenant quatre exports typés :

- `moduleCatalog` — tous les modules de formation
- `performanceDiagnosticFamilies` — familles du diagnostic performance
- `toolBaseDiagnostic` — diagnostic des outils socles
- `diagnosticSignalMap` — table « signal entendu en RDV → modules à déclencher »

Le fichier généré est **auto-géré** : ne pas l'éditer à la main. Toute
modification du catalogue passe par le fichier Excel, puis la régénération.

## Logique de transformation notable

- Les en-têtes de section dans chaque onglet (lignes où la colonne « Durée »
  contient le texte « Durée ») servent de bornes de famille.
- Les modules dont le nom contient un mot-clé socle (ChatGPT, Claude, Gamma,
  NotebookLM, Gemini, Prompt, CRM, Canva) ou qui appartiennent à la famille
  « Base » sont marqués `isFoundationModule: true`.
- Les `diagnosticSignals` sont rattachés à chaque module via une comparaison
  de tokens normalisés (espaces / casse / ponctuation ignorés) entre le nom
  du module et les listes « Modules à déclencher » des trois onglets de
  diagnostic.
- Les cellules vides sont conservées en `null` pour rester fidèle à la
  source : aucune donnée n'est inventée.
