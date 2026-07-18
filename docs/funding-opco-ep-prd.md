# PRD — Financement OPCO EP + AGEFICE

**Date** : 2026-07-18
**Rôle** : source de vérité pour tout le calcul de financement (indés + salariés). Aucune implémentation dans ce document — uniquement les règles métier. Le code s'aligne.

---

## 1. Objectif

Consolider les règles de financement des formations Start Academy dans un document unique, pour que le calcul du reste à charge cesse de dépendre de constantes disséminées (`training-pricing.ts`, `funding-config.ts`, prompts IA…) et devienne testable contre une spec écrite. Le document décrit le comportement attendu ; le code doit s'y conformer.

## 2. Deux régimes séparés en calcul, un total consolidé en affichage

### 2.1 AGEFICE (inchangé) — **agents commerciaux indépendants uniquement**

- Cible : participants de statut `indépendant`.
- Barème existant conservé (cf. `funding_config` seeds `AGEFICE_THRESHOLD = 7000`, `AGEFICE_ANNUAL_CAP = 3000`).
- Aucun changement dans ce PRD pour AGEFICE — les règles restent celles de la migration `20260703100000_add_funding_config.sql` et de `training-funding.ts`.

### 2.2 OPCO EP — **salariés uniquement**

- Cible : participants de statut `salarié` (négociateur, assistant, manager, direction — tant qu'il y a bulletin de salaire).
- Nouveau modèle décrit sections 3 à 6 ci-dessous.

### 2.3 Règle interne / règle d'affichage — **NE PAS confondre**

Le dirigeant du cabinet est le **payeur unique** : il commande la formation de son équipe et **assume tout le reste à charge, y compris pour ses indés** (un indépendant ne paie jamais son reste à charge lui-même dans le modèle Start Academy). Il faut donc deux vues distinctes :

**Côté calcul interne** — les 2 régimes restent strictement séparés :
- AGEFICE et OPCO EP sont **deux financeurs distincts**, avec **deux dossiers administratifs séparés** que Start Academy monte et suit indépendamment (feuilles de présence, justificatifs, versement).
- Un participant appartient à **un seul régime** (indé → AGEFICE, salarié → OPCO EP). Le calcul du remboursement par participant n'additionne jamais les 2 régimes sur une même personne.
- Les deux régimes gardent leurs propres enveloppes, plafonds, taux horaires, consommations à retrancher (§9).

**Côté affichage dirigeant (proposition commerciale)** — un **total consolidé** :
- Coût total de la formation = `Σ prix_vente_participant` (indés + salariés confondus)
- Financement total = `remboursement_effectif AGEFICE` + `remboursement_effectif OPCO EP`
- **UN SEUL reste à charge global** = coût total − financement total, présenté au dirigeant comme le montant qu'il doit assumer.

**Note explicite à afficher dans la proposition** (mention obligatoire, non ambiguë) : « Les financements AGEFICE (indépendants) et OPCO EP (salariés) restent gérés en deux dossiers administratifs distincts — Start Academy monte chacun de son côté. Le montant ci-dessus est le total consolidé, à votre charge après remboursement des deux financeurs. »

**En résumé** : `agefice_dossier ≠ opco_ep_dossier` en administratif ; `reste_a_charge_dirigeant` unique en affichage.

---

## 3. OPCO EP — enveloppe entreprise (globale, partagée)

### 3.1 Barème par effectif

L'enveloppe est une **enveloppe entreprise annuelle**, partagée entre **tous les salariés** de l'entreprise cliente, pas par participant.

| Effectif salarié de l'entreprise | Enveloppe annuelle OPCO EP |
|---|---|
| < 11 salariés | **2 500 € HT** |
| 11 à 50 salariés inclus | **4 500 € HT** |
| > 50 salariés | **Non calculable automatiquement** — afficher une alerte « effectif > 50, financement à valider manuellement avec l'OPCO EP » |

### 3.2 Retrait de la constante en dur

L'actuelle constante `OPCO_EP_ANNUAL_CAP = 2500` (seed `funding_config`, cf. `20260703100000_add_funding_config.sql`) reflète la seule tranche `< 11 salariés`. Elle devient **incorrecte** dès qu'un cabinet a 11 salariés ou plus.

**Changement à opérer** : remplacer la lecture d'une constante unique par un lookup conditionnel sur l'effectif entreprise (`clients.collaborators_count`). Le service qui expose la config doit renvoyer le barème complet, pas juste une valeur.

Note d'implémentation (pas d'action ici) : les 3 tranches vivront en base sous la forme de seeds versionnés (`OPCO_EP_ENVELOPE_LT_11`, `OPCO_EP_ENVELOPE_11_TO_50`, `OPCO_EP_THRESHOLD_MANUAL_REVIEW`) — pattern déjà utilisé pour les 4 seeds existants, versioning `valid_from` / `valid_to`.

---

## 4. OPCO EP — coût pédagogique horaire

### 4.1 Deux types de formation, deux tarifs — pas plus

| Type | Coût pédagogique OPCO EP | Définition stricte |
|---|:-:|---|
| `reglementaire` | **40 €/h** | **UNIQUEMENT** TRACFIN, non-discrimination, déontologie. Aucune autre formation ne relève de cette catégorie. |
| `coeur_metier` | **30 €/h** | **TOUT LE RESTE** que Start Academy vend : prospection, estimation, mandats, négociation, vente, IA, outils, posture, communication, management, etc. |

### 4.2 Défaut par défaut

Toute formation dont le type n'est pas explicitement défini = `coeur_metier` (30 €/h). C'est le cas le plus courant dans le catalogue immobilier de Start Academy.

### 4.3 Format présentiel vs distanciel — impact prise en charge

L'OPCO EP prend en charge **uniquement les heures présentielles**. Une formation en visio / e-learning **n'est pas prise en charge par ce régime** — le reste à charge = 100 % du prix Start Academy sur cette portion.

**Modélisation** : ajout d'un champ `format` sur chaque module du catalogue (enum `presentiel` | `distanciel`, défaut `presentiel`), éditable par le commercial au moment de composer la proposition (une même formation peut avoir des sessions présentielles et des sessions distancielles chez des clients différents).

Règle de calcul appliquée par le code :

```
remboursement_opco_ep(module m, participant p) =
    heures(m) × taux_opco(m.funding_type)   si m.format = presentiel
    0                                        si m.format = distanciel
```

Une alerte UI est affichée dès qu'un module distanciel entre dans la proposition : « Module en distanciel — non pris en charge par l'OPCO EP, reste à charge 100 % du prix Start Academy sur ces heures. »

### 4.4 Types NON utilisés — hors périmètre

Le barème OPCO EP officiel comporte d'autres catégories (spécifique résidences tourisme à 25 €/h, socle/transverse à 25 €/h, développement hors plafond à 9,15 €/h). **Start Academy ne les utilise pas**. Ils **ne doivent pas** apparaître dans le code, le catalogue, l'UI ou les prompts IA. Toute formation présente au catalogue Start Academy relève de l'une des 2 catégories du §4.1.

---

## 5. Mécanisme de calcul du reste à charge (salariés OPCO EP)

### 5.1 Formule par participant salarié

Pour chaque participant salarié `p` sur chaque module `m` :

```
prix_vente(m, p)      = heures(m) × 84 €  (tarif Start Academy tout compris,
                                           cf. funding_config
                                           PRICE_PER_HOUR_PER_PARTICIPANT)

taux_opco(m)          = 40 si m.funding_type = reglementaire
                        30 si m.funding_type = coeur_metier

remboursement_opco_theorique(m, p) =
    heures(m) × taux_opco(m)   si m.format = presentiel
    0                          si m.format = distanciel
```

### 5.2 Plafonnement par enveloppe entreprise DISPONIBLE

L'enveloppe (§3.1) plafonne le **cumul** des remboursements sur **tous les salariés** de la session. Elle est diminuée en amont de la consommation déjà entamée par l'entreprise cette année (§9.1) :

```
enveloppe_brute        = lookup(clients.collaborators_count)   (§3.1)
deja_consomme_annee    = diagnostics.opco_ep_amount_consumed_current_year (§9.1)
enveloppe_disponible   = max(0, enveloppe_brute − deja_consomme_annee)

remboursement_total_theorique  = Σ remboursement_opco_theorique(m, p)
                                 pour tous les modules × tous les salariés

remboursement_effectif_opco_ep = min(remboursement_total_theorique,
                                     enveloppe_disponible)

surplus_non_couvert_opco_ep    = remboursement_total_theorique
                                 − remboursement_effectif_opco_ep    (≥ 0)
```

### 5.3 Arbitrage commercial quand l'enveloppe est épuisée

Quand `surplus_non_couvert_opco_ep > 0`, il **n'y a PAS de règle de priorité automatique** dans le code : ni « premier arrivé premier servi » sur les participants, ni « les moins chers d'abord », ni « les managers d'abord ».

Le surplus est simplement **du reste à charge additionnel pour l'entreprise**, à arbitrer par le commercial :
- soit répartir le reste sur tous les participants au prorata,
- soit renoncer à certains modules pour rester dans l'enveloppe,
- soit demander à l'entreprise d'assumer le dépassement (fonds propres, autre financement).

Le code affiche le montant du surplus et met à disposition les leviers d'arbitrage sans imposer d'ordre — voir chantier C §10.

### 5.4 Consolidation avec le régime AGEFICE

Le calcul AGEFICE (indés) se fait en parallèle avec sa propre enveloppe individuelle par participant et sa propre logique de consommation déjà entamée (§9.2). Voir `training-funding.ts` existant, complété selon §9.2.

Puis les 2 régimes sont **additionnés pour l'affichage dirigeant**, jamais dans le calcul interne :

```
cout_total_formation     = Σ prix_vente(m, p) pour tous les modules × tous les participants
                           (indés + salariés confondus)

financement_total        = remboursement_effectif_agefice   (§9.2 après retranchement)
                         + remboursement_effectif_opco_ep   (§5.2 après retranchement)

reste_a_charge_dirigeant = cout_total_formation − financement_total
```

C'est ce `reste_a_charge_dirigeant` qui est présenté au dirigeant comme le montant à sa charge — cf. §2.3 pour la règle d'affichage. Les deux enveloppes, remboursements et surplus AGEFICE / OPCO EP restent visibles en détail dans un bloc « ventilation par régime », mais **le montant qui engage le dirigeant est le total consolidé unique**.

---

## 6. Type de formation sur les modules du catalogue

### 6.1 Enum à 2 valeurs — pas plus

Ajouter un champ `funding_type` sur `training_modules`, contraint par `check (funding_type in ('reglementaire', 'coeur_metier'))`.

**Aucune autre valeur possible.** Pas de `null`, pas de `autre`, pas de `tourisme`, pas de `socle`. Contrainte de non-nullité en base.

### 6.2 Défaut = `coeur_metier`

Migration additive : la nouvelle colonne prend `default 'coeur_metier'` pour toutes les rows existantes. Le catalogue actuel bascule intégralement en cœur de métier, ce qui correspond à la majorité des formations immobilières Start Academy.

### 6.3 Règle de classement (à respecter à la main sur le catalogue)

**`reglementaire`** si et seulement si le module porte sur :
- TRACFIN (lutte anti-blanchiment)
- Non-discrimination
- Déontologie

**`coeur_metier`** dans tous les autres cas — quelle que soit la thématique (prospection, IA, management, etc.). Il n'y a pas de zone grise : si ce n'est pas dans la liste `reglementaire` ci-dessus, c'est `coeur_metier`.

### 6.4 Éditable par le commercial par module

Dans l'UI catalogue (`/settings/modules`, page déjà en place), permettre au commercial de re-catégoriser un module au coup par coup. Un commercial qui découvre qu'un module ALUR contient un chapitre TRACFIN peut le basculer en `reglementaire` — sous sa responsabilité, avec un warning UI « à faire valider par l'OPCO EP ».

---

## 7. Fenêtre temporelle — année civile en cours

### 7.1 Règle uniforme indés + salariés

La collecte des formations passées (nombre d'heures et montant consommé) porte sur **l'année civile en cours** (1er janvier → 31 décembre de l'année du diagnostic). **Pas 24 mois glissants.**

Le calcul s'applique aux 2 régimes :
- **AGEFICE** (indés) : consommation de l'enveloppe annuelle en cours d'année.
- **OPCO EP** (salariés) : idem.

### 7.2 Ce qui change vs état actuel

Les questions actuelles du diagnostic (`diagnostics.formations_24m_count`, `formations_24m_hours`, `formations_24m_organizations`, `formations_24m_topics`, `formations_24m_satisfaction`) parlent des **24 derniers mois**. Ces champs restent utiles pour la mesure de la maturité formation du client (« combien de formation as-tu déjà fait ? »), mais **ne servent PAS au calcul du reste à charge**.

Il faut **ajouter** des champs séparés qui collectent les formations sur l'année civile en cours, distincts des 24 mois. Convention de nommage : `formations_current_year_*` (explicite, sans ambiguïté). Les 2 séries de champs cohabitent en base.

Le prompt IA de recommandation et les blocs `ratios/alerts/funding` du diagnostic doivent être mis à jour pour lire les nouveaux champs `_current_year_` sur le calcul de financement, et rester sur `_24m_` pour la maturité formation — voir chantier A.

---

## 8. Hors périmètre — ne pas modéliser

- **VAE (Validation des Acquis de l'Expérience)** — Start Academy ne vend pas.
- **Bilan de compétences** — idem.
- **Types OPCO non utilisés** — spécifique résidences tourisme, socle/transverse, développement (hors plafond). Aucune de ces catégories ne doit apparaître dans le code, l'UI, les prompts, la doc utilisateur.

Si un client demande ces prestations : réponse commerciale hors app, pas de logique produit à câbler.

---

## 9. Consommation déjà entamée cette année — à retrancher des enveloppes

Les enveloppes annuelles ne sont pas systématiquement intactes au moment où Start Academy monte le dossier. Le diagnostic doit collecter la consommation déjà entamée cette année pour chaque régime, et le code doit la retrancher **avant** le plafonnement.

### 9.1 Côté OPCO EP — question ENTREPRISE (globale, une seule fois)

Nouveau champ sur `diagnostics` (question posée au dirigeant lors du diagnostic) :

- `opco_ep_amount_consumed_current_year` : **montant OPCO EP déjà consommé cette année par l'entreprise, tous salariés confondus**. Nullable (peut être inconnu). Défaut affiché = 0 si le dirigeant confirme n'avoir rien fait cette année.

Calcul :

```
enveloppe_disponible_opco_ep = max(0,
    lookup(collaborators_count)
    − (opco_ep_amount_consumed_current_year ?? 0)
)
```

Si le dirigeant ne connaît pas le montant : afficher une alerte « consommation OPCO EP non renseignée — l'enveloppe présentée est le maximum théorique, à vérifier auprès de l'OPCO EP avant engagement ».

### 9.2 Côté AGEFICE — question par PARTICIPANT indé

Nouveau champ sur `diagnostic_participants` (question posée pour chaque indé) :

- `agefice_amount_consumed_current_year` : **montant AGEFICE déjà consommé cette année par cet indé**. Nullable. Défaut 0 si confirmé.

Calcul, appliqué participant par participant dans `estimateTrainingFunding` (extension du service existant) :

```
enveloppe_disponible_agefice(p) = max(0,
    AGEFICE_ANNUAL_CAP
    − (p.agefice_amount_consumed_current_year ?? 0)
)
```

Si un indé ne connaît pas le montant : même alerte que §9.1, appliquée individuellement à ce participant.

### 9.3 Cas non calculables automatiquement (rappel + complément)

Le calcul du reste à charge est **automatique dans la limite des règles ci-dessus**. Dans les cas suivants, l'app affiche une alerte et **ne produit pas de chiffre engageant** :

| Cas | Alerte à afficher |
|---|---|
| Effectif entreprise > 50 salariés | « Effectif > 50, financement OPCO EP à valider manuellement avec l'OPCO » |
| Module en format distanciel | « Formation distancielle non prise en charge par l'OPCO EP — reste à charge 100 % du prix Start Academy sur ces heures » |
| `opco_ep_amount_consumed_current_year` NULL | « Consommation OPCO EP de l'entreprise non renseignée — enveloppe affichée = maximum théorique, à vérifier avant engagement » |
| `agefice_amount_consumed_current_year` NULL sur un indé | « Consommation AGEFICE de <prénom> non renseignée — enveloppe individuelle affichée = maximum théorique, à vérifier avant engagement » |
| `funding_type` modifié manuellement par le commercial sur un module | « Type de formation modifié — à faire valider par l'OPCO EP » |

Dans tous ces cas, l'app affiche le montant théorique en italique avec la mention « estimation à valider ». Le contrat de la proposition (ligne rouge conformité) ne peut être engagé qu'après confirmation OPCO / AGEFICE côté cabinet.

---

## 10. Découpage en 4 chantiers d'implémentation

Chaque chantier est indépendant. À implémenter dans l'ordre A → B → C → D. Chaque chantier vit dans sa propre PR.

### Chantier A — Fenêtre temporelle année civile + consommation déjà entamée

> **Statut : ✅ livré (2026-07-18, option β).** Collecte des consommations année civile posée (`opco_ep_amount_consumed_current_year` sur `diagnostics` + `agefice_amount_consumed_current_year` sur `diagnostic_participants`, migration additive `20260718180000`). Retranchement AGEFICE per-participant **actif** (§9.2 — plafond et champ tous deux par-indé, pas de dérive). Consommation OPCO EP entreprise **collectée mais calcul volontairement laissé en l'état HEAD** — le cap OPCO EP reste par-participant (bug préexistant vs §3 : plafond entreprise partagé) et retrancher `opco_ep_amount_consumed_current_year` per-participant aurait dupliqué le retranchement N fois par N salariés. **Refonte prévue chantier B** : passer à une enveloppe entreprise (barème par effectif) + retrancher la consommation UNE seule fois de cette enveloppe. Warnings « estimation à valider » actifs sur les 2 champs NULL. Option β validée : 2 nouveaux champs seulement, pas de duplication des 5 `formations_24m_*` morts sur `diagnostics` (cleanup PR séparée post-A). Les champs 24m participants (maturité) restent lus par `ratios-service` sans modification.

- **But** : basculer la collecte des formations passées de « 24 mois glissants » à « année civile en cours » (§7) et collecter la consommation déjà entamée (§9.1 + §9.2).
- **Fichiers impactés** :
  - Migration additive `add_diagnostics_current_year_and_consumed.sql` — ajoute `formations_current_year_count`, `formations_current_year_hours`, `formations_current_year_amount` sur `diagnostics` + `opco_ep_amount_consumed_current_year` sur `diagnostics` + `agefice_amount_consumed_current_year` sur `diagnostic_participants`. Colonnes nullable (peut être inconnu).
  - `src/lib/ai/build-recommendation-prompt.ts` — le prompt lit désormais les champs `current_year_` pour le calcul de financement, garde les `24m_` pour la maturité formation.
  - Module de calcul ratios/alerts/funding (à retrouver dans le repo, référencé par `analyze-training-need/route.ts:437`) — les alertes de plafond passent sur les nouveaux champs `current_year_`.
  - `src/app/(app)/diagnostics/…` — pages/composants du questionnaire diagnostic. Ajout des questions année civile + consommation déjà entamée, en gardant les questions 24 mois qui restent utiles pour la maturité formation (séparation stricte, ne pas fusionner).
  - `docs/diagnostic-prd.md` (si existe) — spec du questionnaire mise à jour.
- **Effort** : **M** — migration légère + surface UI moyenne + revue prompts IA + tests contract sur les alertes de plafond.
- **Dépendances** : aucune. Ce chantier est premier car les 3 suivants s'appuient sur des données `current_year_` correctes.

### Chantier B — Modèle OPCO EP (barème + type + format + calcul)

- **But** : implémenter tout le §3-§4-§5-§6 de ce PRD.
- **Fichiers impactés** :
  - Migration additive `add_opco_ep_envelope_and_funding_type.sql` — 3 nouveaux seeds `funding_config` pour les tranches d'enveloppe + colonne `training_modules.funding_type text not null default 'coeur_metier' check (…)` + colonne `training_modules.format text not null default 'presentiel' check (format in ('presentiel','distanciel'))`.
  - `src/lib/pricing/funding-config-service.ts` — étend `FundingConfig` avec les 3 seuils enveloppe + helper `lookupOpcoEpEnvelope(collaboratorsCount)`.
  - `src/lib/pricing/training-funding.ts` (module pur qui calcule AGEFICE aujourd'hui) — ajout d'un `estimateOpcoEpFunding({ participants, modules, envelope, config })` qui applique le §5 + prise en compte de la consommation déjà entamée (§9.1). Extension du calcul AGEFICE existant pour retrancher la consommation individuelle (§9.2).
  - `src/lib/ai/proposal-schema.ts` — étend `PricingSchema` avec des champs OPCO EP dédiés (enveloppe brute, consommation retranchée, enveloppe disponible, remboursement prévu, remboursement effectif, surplus) + un bloc consolidé (coût total, financement total AGEFICE + OPCO EP, reste à charge dirigeant unique). Attention : le nouveau bloc est **complémentaire** aux champs AGEFICE existants (`estimatedFundingTotal` etc.) — pas de fusion. Les 2 régimes cohabitent en interne, la consolidation ne vit que dans le rendu.
  - `src/app/api/generate-training-proposal/route.ts` — `applyStartAcademyPricing` étendu pour renvoyer les 2 blocs internes + le bloc consolidé.
  - `src/lib/ai/build-proposal-prompt.ts` — règle 1 (tarification) enrichie du barème OPCO EP + interdiction explicite pour le LLM de mentionner tourisme/socle/développement. Interdiction aussi de fusionner AGEFICE et OPCO EP dans un pricingNote pédagogique — le LLM parle des 2 dossiers séparément si nécessaire.
  - `src/app/(app)/settings/modules/…` — UI catalogue avec un dropdown 2-valeurs `funding_type` + un dropdown 2-valeurs `format` par module.
  - `src/app/(app)/diagnostics/[id]/proposal/proposal-view.tsx` — bloc rendu OPCO EP dans la proposition (ventilation par régime) + bloc consolidé au-dessus avec le reste à charge unique et la note obligatoire du §2.3.
  - Nouveau test contract sur le barème d'enveloppe (fail-si-divergence entre seeds et code, pattern F-1).
  - Nouveau test unitaire sur `estimateOpcoEpFunding` — au moins les 3 tranches d'effectif + le cas > 50 (non calculable) + le cas distanciel (pas de prise en charge) + le cas avec consommation déjà entamée.
  - Nouveau test unitaire sur la consolidation (coût total = somme, financement total = somme des 2 régimes, reste à charge = coût − financement).
- **Effort** : **L** — c'est le chantier structurant, ~1-2 j de dev + tests.
- **Dépendances** : chantier A (année civile + consommations) doit être livré avant, sinon le retranchement §9 n'a pas de données à consommer.

### Chantier C — Arbitrage commercial UI

- **But** : quand `surplus_non_couvert > 0` sur l'un ou l'autre des régimes (AGEFICE ou OPCO EP), exposer les leviers d'arbitrage (§5.3) dans l'UI proposition sans imposer de règle automatique.
- **Fichiers impactés** :
  - `src/app/(app)/diagnostics/[id]/proposal/proposal-view.tsx` — nouveau composant `<FundingArbitrageBlock/>` avec les 3 options manuelles (répartir au prorata, retirer des modules, laisser en fonds propres). Sélection commercial persistée dans `proposals.proposal_json.pricing.arbitrage`.
  - `src/lib/ai/proposal-schema.ts` — extension `PricingSchema` avec un champ `arbitrage: { strategy: 'prorata' | 'reduce_scope' | 'own_funds' | null; note: string | null }`.
  - `src/lib/proposals/proposal-server-service.ts` (déjà en place PR #28) — pas de changement structurel, l'objet `proposal_json` évolue automatiquement (jsonb ne verrouille pas le shape en base, la validation Zod suffit).
  - Migration : aucune (extension `proposal_json` via jsonb).
- **Effort** : **S/M** — UI locale, pas de couche serveur nouvelle, pas de migration DB.
- **Dépendances** : chantier B (nécessite le calcul et le rendu OPCO EP en place).

### Chantier D — Geste commercial affiché

- **But** : quand le commercial décide d'un geste (remise, chapitre offert, module gracieux) pour absorber tout ou partie du surplus, l'inscrire explicitement dans la proposition côté client. **Le geste doit être visible du dirigeant**, pas caché dans un calcul mental de Laurent.
- **Fichiers impactés** :
  - `src/lib/ai/proposal-schema.ts` — extension `PricingSchema.commercialGesture: { amount: number | null; label: string | null; reason: 'opco_ep_overflow' | 'agefice_overflow' | 'commercial_discount' | null }`.
  - `src/app/(app)/diagnostics/[id]/proposal/proposal-view.tsx` — bloc « Geste Start Academy : −X € pour votre équipe » rendu au-dessus du prix final, avec la mention explicite du motif (surplus OPCO absorbé, surplus AGEFICE absorbé, remise commerciale…). Impact direct sur le `reste_a_charge_dirigeant` du §2.3 : le geste s'y déduit.
  - `src/lib/ai/build-proposal-prompt.ts` — règle : le LLM ne décide **jamais** d'un geste ; le geste est saisi manuellement par le commercial, écrit dans la proposition par le code, jamais généré.
  - `src/app/(app)/diagnostics/[id]/proposal/…` — nouveau formulaire d'édition du geste côté commercial (avant envoi au dirigeant), avec sauvegarde immédiate via PUT proposals.
- **Effort** : **M** — UI + validation Zod + interdiction claire côté prompt LLM.
- **Dépendances** : chantiers B et C. Le geste s'affiche après l'arbitrage.

---

## 11. Ligne rouge conformité (rappel)

Les heures affichées côté proposition = heures déclarées côté administratif (feuilles de présence Qualiopi, dossier AGEFICE / OPCO EP). Ce PRD ne remet pas cela en cause — il précise seulement la **répartition du financement** de ces heures.

Le geste commercial (§10.D) est un **ajustement de prix**, pas d'heures. Si Start Academy offre 4 h de formation, elles sont dispensées ET déclarées. Le geste = « on facture 4 h × 84 € = 336 € mais on remise de 100 € », pas « on facture 3 h ». Aucune règle du régime OPCO / AGEFICE ne permet d'inventer des heures.

## 12. Références

- `funding_config` seeds actuels : `supabase/migrations/20260703100000_add_funding_config.sql`
- Service actuel AGEFICE : `src/lib/pricing/training-funding.ts` (à étendre avec OPCO EP + consommation déjà entamée §9.2)
- Config lecture : `src/lib/pricing/funding-config-service.ts`
- Prompts IA à réviser : `build-recommendation-prompt.ts`, `build-proposal-prompt.ts`, `heuristic-proposal.ts`
- Rendu proposition : `src/app/(app)/diagnostics/[id]/proposal/proposal-view.tsx`
- Ligne rouge conformité : `docs/proposition-commerciale-v2-prd.md` § « Ligne rouge conformité »
- Doctrine « pas de constante en dur » : `docs/preprod-stabilization-plan.md §11.2 T-15` (pattern refonte tarif 42 → 84)
