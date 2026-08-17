# Fichier de travail — labels humains à valider

> Objectif : formaliser un libellé humain pour chaque question `yesno` (colonnes « Oui / Non proposés ») et chaque valeur technique de `choice`/`multichoice` (colonne « Libellé humain »). **Ne rien remplir dans le code avant validation ligne à ligne.**

> Colonne laissée vide = décision de garder le défaut (fallback `Oui`/`Non` pour yesno, valeur technique brute pour choice). Une valeur écrite dans le fichier sera reportée en `answerLabels` / `optionLabels` sur la question correspondante dans un lot d'application dédié.

> Rappel technique : `« Ne sait pas »` reste inchangé pour tous les yesno.

---

## Bloc 1 — Questions yesno (27)

| Chapitre | ID | Question | Oui proposé | Non proposé |
| --- | --- | --- | --- | --- |
| Ch.3 | `prospecting-script` | Quand un conseiller décroche son téléphone pour un propriétaire, il a une trame — ou il y va au talent ? |  |  |
| Ch.3 | `skill-prospection` | Honnêtement, si je demandais demain à chacun de vos conseillers de faire une heure de pige devant vous — ça se passerait comment ? |  |  |
| Ch.4 | `seller-discovery-formalized` | Quand un de vos conseillers rencontre un vendeur, comment il s'y prend pour comprendre son projet — il a une trame, ou chacun a sa méthode ? |  |  |
| Ch.4 | `seller-written-valuation` | Qu'est-ce que le vendeur repart avec, concrètement ? Un document écrit, ou c'est annoncé de vive voix ? |  |  |
| Ch.4 | `skill-estimation` | Vos conseillers sont à l'aise pour préparer et défendre une estimation, ou c'est un point qui coince pour certains ? |  |  |
| Ch.4 | `skill-objections` | Et face à un vendeur qui dit "je vais vendre seul" ou "l'agence d'à côté prend moins cher" — ils réagissent comment ? |  |  |
| Ch.4 | `skill-qualification` | Quand un vendeur appelle, vos conseillers arrivent à faire le tri entre un vrai projet et une pêche aux prix ? |  |  |
| Ch.5 | `skill-price-defense` | Et vos conseillers, face à ce vendeur-là — ils tiennent le prix avec des arguments, ou ils lâchent pour ne pas perdre l'affaire ? |  |  |
| Ch.6 | `commercial-requalification-process` | Et les mandats qui dorment depuis six mois — il se passe quoi ? Il y a un moment où on remet tout à plat avec le vendeur, ou ils vieillissent tranquillement ? |  |  |
| Ch.7 | `buyers-discovery-formalized` | Quand un acheteur appelle pour un bien, il se passe quoi — on l'emmène visiter, ou on prend d'abord le temps de comprendre son projet ? |  |  |
| Ch.7 | `buyers-financing-verified` | Et son financement — vous le vérifiez avant d'ouvrir des portes, ou ça se découvre au moment de l'offre ? |  |  |
| Ch.9 | `reviews-collection-process` | Ces avis, ils tombent tout seuls, ou il y a un moment précis où on les demande — à la remise des clés par exemple ? |  |  |
| Ch.10 | `tool-anti-hallucination` | Il vous est déjà arrivé que l'IA invente un chiffre ou une info ? L'équipe sait repérer et éviter ça ? |  |  |
| Ch.10 | `tool-chatgpt-instructions` | Est-ce qu'il connaît votre agence — votre secteur, votre façon de rédiger — ou il répond comme pour n'importe qui ? |  |  |
| Ch.10 | `tool-chatgpt-setup` | Ceux qui l'utilisent, ils l'ont configuré — ou c'est la page blanche à chaque fois ? |  |  |
| Ch.10 | `tool-claude-gemini` | Et au-delà de ChatGPT — Claude, Gemini, ça parle à quelqu'un dans l'équipe ? |  |  |
| Ch.10 | `tool-gamma` | Et pour vos présentations — books vendeur, supports — vous avez testé des outils comme Gamma ? |  |  |
| Ch.10 | `tool-notebook-created` | Vous avez déjà essayé d'y mettre vos propres documents — un règlement de copro, un PV d'AG ? |  |  |
| Ch.10 | `tool-notebooklm` | Dernière ligne droite : NotebookLM, ça vous dit quelque chose ? |  |  |
| Ch.10 | `tool-prompts-standard` | Quand deux conseillers demandent la même chose à l'IA, ils obtiennent la même qualité — ou ça dépend de qui tape ? |  |  |
| Ch.10 | `tool-team-access` | Ces outils, tout le monde y a accès de la même façon, ou certains ont leurs comptes et d'autres rien ? |  |  |
| Ch.10 | `tools-esignature` | Quand un mandat se signe, ça se passe comment — tablette, lien de signature, ou papier ? |  |  |
| Ch.11 | `exec-autonomy` | Et si vous partez deux semaines en vacances en coupant le téléphone — l'activité continue, ou ça ralentit sérieusement ? |  |  |
| Ch.11 | `exec-manager-reporting` | Et entre deux réunions, comment vous savez où en est chacun — ils viennent vers vous, ou c'est vous qui allez à la pêche ? |  |  |
| Ch.11 | `exec-week-structure` | Un lundi matin type chez vous : vos conseillers savent ce qu'ils ont à faire de leur semaine, ou ça se décide au jour le jour ? |  |  |
| Ch.11 | `mgmt-coaching-individual` | Vous arrivez à prendre du temps en tête-à-tête avec chacun — des points individuels réguliers — ou le quotidien mange tout ? |  |  |
| Ch.11 | `mgmt-recruitment` | L'équipe, elle est au complet pour vos ambitions — ou vous cherchez à renforcer ? |  |  |

---

## Bloc 2 — Questions choice / multichoice (12)

| Chapitre | ID | Type | Question | Valeur technique | Libellé humain proposé |
| --- | --- | --- | --- | --- | --- |
| Ch.3 | `prospecting-methods` | multichoice | Entrons dans le vif : aujourd'hui, vos vendeurs, ils arrivent comment ? Racontez-moi tout — le bouche-à-oreille, la pige, le terrain... | `pige` |  |
|  |  |  |  | `terrain` |  |
|  |  |  |  | `boitage` |  |
|  |  |  |  | `reseaux_sociaux` |  |
|  |  |  |  | `recommandation` |  |
|  |  |  |  | `notoriete` |  |
|  |  |  |  | `farming` |  |
|  |  |  |  | `aucune` |  |
| Ch.3 | `prospecting-who` | choice | Et concrètement, qui s'y colle ? Tout le monde prospecte, ou c'est porté par certains ? | `tous` |  |
|  |  |  |  | `certains` |  |
|  |  |  |  | `personne` |  |
| Ch.4 | `estimation-delivery-delay` | choice | Entre le rendez-vous et le moment où le vendeur a son estimation entre les mains, il se passe combien de temps en général ? | `immediat` |  |
|  |  |  |  | `48h` |  |
|  |  |  |  | `plus` |  |
| Ch.4 | `seller-meeting-format` | choice | Racontez-moi comment se passe un rendez-vous vendeur type chez vous : tout en une fois, ou vous revenez présenter l'estimation ? | `r1_r2` |  |
|  |  |  |  | `rdv_unique` |  |
| Ch.5 | `mandates-price-above-market` | choice | Question franchise : un vendeur vous demande 10 % au-dessus du marché pour signer — vous faites quoi ? | `souvent` |  |
|  |  |  |  | `parfois` |  |
|  |  |  |  | `jamais` |  |
| Ch.6 | `commercial-followup-frequency` | choice | Pendant ces mois-là, le vendeur, il entend parler de vous à quel rythme — c'est organisé ou c'est quand il y a du neuf ? | `hebdo` |  |
|  |  |  |  | `bimensuel` |  |
|  |  |  |  | `a_la_demande` |  |
|  |  |  |  | `jamais` |  |
| Ch.9 | `db-crm-uptodate` | choice | Et honnêtement, dans quel état elle est ? Si vous ouvrez une fiche au hasard, elle raconte quoi ? | `oui` |  |
|  |  |  |  | `non` |  |
|  |  |  |  | `partiellement` |  |
| Ch.9 | `db-exploitation` | multichoice | Et cette base, elle vit ? Qu'est-ce que vous en faites — des relances, des campagnes, du matching avec les biens... ou elle dort ? | `emailing` |  |
|  |  |  |  | `sms` |  |
|  |  |  |  | `rapprochement_auto` |  |
|  |  |  |  | `aucune` |  |
| Ch.10 | `tools-ai-usage` | multichoice | Parlons IA. Aujourd'hui, dans l'agence, elle sert à quoi concrètement — même un petit peu ? | `redaction_annonces` |  |
|  |  |  |  | `estimation` |  |
|  |  |  |  | `reponses_avis` |  |
|  |  |  |  | `prospection` |  |
|  |  |  |  | `aucun` |  |
| Ch.10 | `tools-portals` | multichoice | Vos annonces partent où, comme portails ? | `leboncoin` |  |
|  |  |  |  | `seloger` |  |
|  |  |  |  | `logic_immo` |  |
|  |  |  |  | `bien_ici` |  |
|  |  |  |  | `pap` |  |
|  |  |  |  | `autre` |  |
| Ch.11 | `mgmt-indicators-followed` | multichoice | Côté chiffres : qu'est-ce que vous regardez régulièrement pour savoir si l'agence va bien — vous suivez quoi, concrètement ? | `ca` |  |
|  |  |  |  | `mandats` |  |
|  |  |  |  | `exclusivite` |  |
|  |  |  |  | `visites` |  |
|  |  |  |  | `compromis` |  |
|  |  |  |  | `actes` |  |
|  |  |  |  | `avis` |  |
|  |  |  |  | `aucun` |  |
| Ch.11 | `mgmt-team-meeting-frequency` | choice | Parlons de vous maintenant, et de comment tourne l'équipe. Vous vous retrouvez tous ensemble à quel rythme — c'est ritualisé ou au fil de l'eau ? | `hebdo` |  |
|  |  |  |  | `mensuelle` |  |
|  |  |  |  | `irreguliere` |  |
|  |  |  |  | `aucune` |  |

---

_Généré depuis `src/lib/data/diagnostic-questions.ts` après consolidation 71 → 69 (retrait doublons pige/estimation Ch.3/Ch.4). 69 questions au total._
