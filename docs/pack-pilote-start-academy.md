# Pack pilote Start Academy Diagnostic

> Document opérationnel pour ouvrir le pilote avec 1-2 clients de
> confiance. Posé après stabilisation des 3 irritants de l'audit
> pilote (§4.3, §4.4, §4.5 corrigés). Date : 2026-05-25.

---

## 1. Objectif du pilote

Mesurer **6 dimensions** avec un client réel :

| # | Objectif | Métrique attendue |
|---|---|---|
| 1 | Valider la **valeur commerciale** | Le commercial Start Academy gagne du temps à produire la proposition vs sa méthode actuelle |
| 2 | Valider la **pertinence des recommandations** | Le dirigeant comprend pourquoi chaque module est proposé, sans qu'on lui réexplique le diagnostic |
| 3 | Valider la **compréhension dirigeant** | Le dirigeant lit la proposition / l'espace public et sait quoi faire ensuite |
| 4 | Valider la **collecte collaborateurs** | Au moins 50 % des collaborateurs invités complètent le formulaire en autonomie |
| 5 | Valider la **qualité des supports** | Le formateur trouve le support exploitable sans réécriture complète |
| 6 | **Mesurer le gain de temps** | De « RDV → support designé livré » : objectif < 1 j (vs ~3-5 j en méthode actuelle) |

---

## 2. Périmètre du pilote

### Inclus

- Diagnostic commercial assisté (`/diagnostics/new` : contexte → questions → synthèse)
- Saisie des **participants prévisionnels** dès le diagnostic
- Estimation **financement potentiel** (règle MVP : agent indé + N-1 > 7 000 € → potentiellement éligible, plafond 3 000 € / pers., reste à charge clampé à 0)
- Recommandation IA via OpenRouter (Claude Sonnet 4.5) ou heuristique fallback
- Proposition commerciale avec disclaimer non-contractuel
- Création de session + génération des liens publics signés
- Espace public dirigeant avec **synthèse financement anonymisée**
- Collecte collaborateurs (lien `participant_collect`)
- Upload documents sécurisé (bucket privé, signed URL 60 s)
- Choix de date depuis l'espace dirigeant
- Support pédagogique brut (filtré `essential + recommended`)
- Support designé Start Academy
- Export PDF via impression navigateur

### Exclus (rappel au dirigeant en début de pilote)

| Brique | Statut |
|---|---|
| Envoi Gmail automatique | ❌ Non branché — mailto / copie manuelle |
| Google Calendar (sync événements) | ❌ Non branché — gestion manuelle |
| Google Drive (stockage) | ❌ Non branché — Supabase Storage uniquement |
| Coach Brain / COACHNXT actif | ❌ Inerte — couche posée, pas de patterns NXT Performance branchés |
| Paiement / signature électronique | ❌ Hors scope MVP |
| Production commerciale large | ❌ Pilote = 1-2 clients de confiance uniquement |

---

## 3. Profil client pilote idéal

- **Type** : dirigeant d'agence immobilière ou réseau de petite taille.
- **Taille équipe** : 4 à 12 collaborateurs (en dessous, ROI difficile à montrer ; au-dessus, complexité non maîtrisée en pilote).
- **Besoin clair** : IA métier et/ou performance commerciale (suivi vendeur, exclusivité, estimation→mandat).
- **Relation** : confiance préalable avec Start Academy. Le pilote demande de l'indulgence sur les rough edges.
- **Posture** : accepte un outil en phase pilote, sait que tout n'est pas parfait, **donne du feedback précis** (pas juste "j'aime / j'aime pas").
- **Décideur unique** : un dirigeant qui décide. Pas un comité — trop lent pour un cycle pilote.

### À éviter pour le pilote

- Clients prestige avec attentes premium sans tolérance pour le rough.
- Clients très techniques qui voudront challenger l'architecture.
- Clients sans engagement ferme à donner du feedback (le pilote sert à *apprendre*, pas à closer).

---

## 4. Scénario de test recommandé

**Cas de référence** : agence de 6 à 8 participants.

| Variable | Valeur |
|---|---|
| Effectif | 6 à 8 conseillers / managers |
| Statuts | Mix salariés + agents commerciaux indépendants |
| Sujets prioritaires | Vendeurs (suivi, baisse de prix, exclusivité) + IA métier (ChatGPT paramétré, NotebookLM, etc.) |
| Collaborateurs collectés | ≥ 2 cas concrets remontés |
| Documents | ≥ 1 document uploadé (cas client / statistiques) |
| Date | 1 créneau choisi par le dirigeant |
| Livrables générés | Proposition + support brut + support designé + PDF |

**Référence Horizon Immo** (cf. [test-openrouter-mvp.md](./test-openrouter-mvp.md) §10) : 6 conseillers, 4 socle IA + 4 métier vendeur, 18 h totales, 4 536 € budget, 2 268 € reste à charge si 3 indé éligibles.

---

## 5. Script de cadrage client

À dire au dirigeant **avant** la démo / le pilote (~3 minutes) :

> « Vous êtes parmi les premiers clients à tester Start Academy
> Diagnostic. C'est un outil que nous utilisons en interne pour
> transformer un rendez-vous commercial en parcours de formation
> personnalisé.
>
> Ce qui est **automatisé** aujourd'hui :
> - Le diagnostic à partir des questions que je vous pose
> - Le choix des modules les plus pertinents pour votre équipe
> - La proposition que vous allez recevoir
> - Le support de formation qu'utilisera votre formateur
>
> Ce qui reste **manuel** :
> - L'envoi de l'email de proposition (je le fais à la main)
> - La gestion du calendrier (on convient des dates par téléphone)
> - Le stockage des documents (sur notre outil, pas sur votre Drive)
>
> Ce qu'on attend de vous :
> - 30 minutes pour le diagnostic
> - Que vous transmettiez les liens à votre équipe
> - Que vous nous donniez votre ressenti, même direct
>
> **Sur les données** :
> - Nous traitons vos données et celles de votre équipe avec
>   prudence. Les pièces administratives (CNI, RIB) sont stockées
>   dans un espace privé, accessible uniquement par votre
>   interlocuteur Start Academy et votre formateur.
> - Aucune information individuelle de financement n'apparaît
>   sur l'espace partagé avec votre équipe.
>
> **Ce pilote n'est pas la version finale** : il y aura des
> ajustements après votre retour. C'est précisément pour ça qu'on
> vous fait confiance. »

---

## 6. Checklist avant pilote

À cocher **24 h avant** la première démo client :

- [ ] **Supabase migrations** — `supabase db push` exécuté, toutes les migrations appliquées (notamment `diagnostic_participants` + `priority_tier`)
- [ ] **Catalogue seedé** — `npm run check:catalog` retourne ✅ 79 modules
- [ ] **OpenRouter crédité** — solde > 10 € (sécurité pour 2-3 démos complètes)
- [ ] **Compte admin OK** — un user `admin` créé via Supabase Studio + `profiles.role = 'admin'`
- [ ] **Scénario client préparé** — entreprise, dirigeant, équipe et 2 cas concrets notés sur post-it
- [ ] **PDF testé** — un export designé d'un diagnostic test la veille
- [ ] **Liens publics testés** — un lien dirigeant + un lien collecte ouverts en navigation privée
- [ ] **Upload document testé** — un PDF de test uploadé via la page collect
- [ ] **service_role à régénérer** si la clé a été partagée hors équipe — `Settings → API → service_role → regenerate` côté Supabase
- [ ] **`.env.local` non commité** — vérifier `git ls-files | grep '\.env'` doit être vide
- [ ] **Navigation privée testée** — la page dirigeant rend correctement hors session admin
- [ ] **Tarif validé** : 18 h × 6 = 4 536 € avec 3 indé éligibles → 2 268 € PEC → 2 268 € reste à charge (cf. validations math)

---

## 7. Checklist pendant pilote

À noter pendant / après chaque étape avec le client :

| Étape | À mesurer | Cible |
|---|---|---|
| Diagnostic | Temps total | ≤ 30 min |
| Diagnostic | Qualité des questions (pertinent / hors sujet) | 0 question hors sujet |
| Recommandation | Pertinence des modules | ≥ 5/6 modules essential/recommended jugés pertinents par le commercial |
| Recommandation | Cohérence du `priorityTier` | Aucun module jugé "à reclasser" en démo |
| Proposition | Lisibilité (le dirigeant lit sans relance) | Réaction "ok je comprends" en < 2 min |
| Proposition | Réaction dirigeant sur le prix | Pas de "c'est cher ?" sans explication |
| Proposition | Compréhension du financement | Dirigeant retient "1 h = 42 € / pers." et "indé éligible si N-1 > 7 000 €" |
| Collecte | Nombre de collaborateurs ayant rempli en autonomie | ≥ 50 % |
| Collecte | Délai moyen de soumission | < 24 h après envoi du lien |
| Documents | Nombre de docs reçus | ≥ 1 doc utile |
| Documents | Pas de fichier corrompu / mauvais format | 100 % conformes |
| Support brut | Le formateur reprend > 80 % du contenu sans réécriture | Pour les modules essential |
| Support designé | Nombre de slides modifiées manuellement | < 10 % |
| PDF | Aucun débordement texte | 100 % slides propres |
| PDF | Toolbar absente de l'export | Vérifié |

---

## 8. Grille de feedback (1-5)

Donner cette grille au dirigeant à la fin du pilote.
Échelle : 1 = très insatisfait, 5 = excellent.

| # | Critère | Note 1-5 |
|---|---|---|
| 1 | Clarté du diagnostic réalisé en RDV | ☐ |
| 2 | Pertinence des modules recommandés | ☐ |
| 3 | Lisibilité de la proposition reçue | ☐ |
| 4 | Crédibilité du prix et du financement potentiel | ☐ |
| 5 | Simplicité du guide dirigeant (espace public) | ☐ |
| 6 | Facilité de la collecte collaborateurs (lien public) | ☐ |
| 7 | Qualité du support formateur | ☐ |
| 8 | Qualité visuelle du PDF designé | ☐ |
| 9 | Valeur perçue globale | ☐ |
| 10 | Probabilité de continuer / acheter à l'issue | ☐ |

**Section libre** :
- 1 truc qui vous a manqué : ________________
- 1 truc qui vous a surpris en bien : ________________
- 1 truc à changer en priorité : ________________

---

## 9. Risques connus à mentionner en interne

À garder en tête **en équipe Start Academy** durant le pilote — à NE PAS exposer directement au client :

| # | Risque | Mitigation pendant pilote |
|---|---|---|
| 1 | **Gmail non branché** | Envoi email manuel par le commercial (mailto pré-rempli depuis la fiche session). À documenter pour le client : "vous recevez l'email de votre interlocuteur dédié". |
| 2 | **Calendar non branché** | Coordination de dates par téléphone / SMS. La page dirigeant permet la sélection d'un créneau parmi ceux proposés par le commercial. |
| 3 | **Drive non branché** | Documents stockés en bucket privé Supabase, pas dans Drive client. Sortie via signed URL 60 s. À expliquer au dirigeant que le stockage Drive arrive plus tard. |
| 4 | **Coach Brain inerte** | La couche existe mais aucun pattern NXT Performance n'est injecté. Le LLM travaille seul. Surveiller en pilote la qualité narrative : si insuffisante, on accélère le branchement amont. |
| 5 | **Monitoring OpenRouter absent** | Aucune alerte budget. Vérifier le solde après chaque démo. Cible : < 0,50 € par cycle complet (diagnostic + reco + proposition + support brut + support designé). |
| 6 | **RLS à durcir** | Aujourd'hui : `authenticated` peut tout faire. Acceptable car aucun client ne sera dans la base pendant le pilote — seuls les commerciaux Start Academy. À durcir avant prod élargie (cf. [docs/rls-hardening-plan.md](./rls-hardening-plan.md)). |
| 7 | **`service_role` à régénérer** | Si la clé a été partagée hors équipe technique, la régénérer avant tout pilote externe. |
| 8 | **RGPD documents sensibles** | CNI et RIB stockés en bucket privé, mais : pas de purge automatique, pas de notification au client, pas d'export RGPD packagé. Documenter au client que sur demande on supprime. À industrialiser avant prod. |
| 9 | **Pas de rate limiting OpenRouter** | Un user authentifié pourrait spammer les routes IA. Acceptable en pilote (≤ 5 utilisateurs internes connus), pas en prod. |
| 10 | **Anciens diagnostics non migrés** | Les diagnostics créés avant la migration `priority_tier` ont leurs modules avec `priorityTier = null`. Fallback existe (tous les modules vont dans le support), pas de crash. Surveiller. |

---

## 10. Critères de succès du pilote

Au moins **5 sur 8** doivent être validés pour passer en production contrôlée :

- [ ] Le dirigeant comprend la proposition **sans explication lourde** (en lecture autonome de l'email + page publique).
- [ ] La recommandation est jugée **pertinente** par le commercial Start Academy ET par le dirigeant.
- [ ] Le **coût et le reste à charge** sont compris sans calcul à la main par le dirigeant.
- [ ] **≥ 50 % des collaborateurs** remplissent le formulaire en autonomie.
- [ ] Le **support designé** est jugé exploitable par le formateur **sans refonte majeure** (< 10 % des slides modifiées).
- [ ] Le **PDF** est présentable à un formateur ou un participant **sans honte** (aucun débordement, charte propre).
- [ ] Le **gain de temps commercial** est perceptible : « j'aurais mis 3-5 jours avant, là j'ai mis 1 jour ».
- [ ] **Au moins 1 client** déclare vouloir continuer (« je signe », « je veux qu'on le fasse en vrai »).

---

## 11. Décision post-pilote

3 issues possibles, à trancher dans les **5 jours ouvrés** suivant le dernier pilote pour ne pas perdre le momentum :

### Issue A — Go production contrôlée ✅

**Conditions** : ≥ 5/8 critères de succès validés, aucun bug bloquant non corrigé, au moins 1 client pilote prêt à continuer.

**Plan** :
1. Corriger les irritants remontés par le pilote (sprint < 2 semaines).
2. Brancher Gmail draft réel (cf. [docs/gmail-draft-integration.md](./gmail-draft-integration.md) §6).
3. Durcir RLS étape 1-3 (cf. [docs/rls-hardening-plan.md](./rls-hardening-plan.md)).
4. Ajouter rate limiting OpenRouter.
5. Ouvrir à 5-10 clients pilote élargi.

### Issue B — Itération produit courte 🔄

**Conditions** : 3-4/8 critères validés, valeur perçue OK mais une dimension clé est insuffisante (ex : qualité support, compréhension dirigeant…).

**Plan** :
1. Identifier la dimension qui a chuté.
2. Sprint focalisé (~3 semaines) pour la corriger.
3. Refaire un pilote avec **un** client (le même ou un nouveau).
4. Re-décider à l'issue.

### Issue C — Stop / repositionnement ❌

**Conditions** : < 3/8 critères validés, ou retour client négatif global ("la valeur n'est pas là"), ou complexité technique disproportionnée au ROI.

**Plan** :
1. Documenter ce qui a appris (post-mortem).
2. Décider entre :
   - **Repositionner** : changer la cible (autre métier, autre taille d'équipe).
   - **Pivoter** : garder l'architecture mais changer le produit (ex : focus uniquement sur le support, ou uniquement sur le diagnostic).
   - **Arrêter** : recycler les briques utiles (pricing, auth, public links) sur d'autres projets Start Academy.

---

## Annexe — Documents de référence

| Doc | Pourquoi |
|---|---|
| [audit-pilote-complet-start-academy.md](./audit-pilote-complet-start-academy.md) | Décision technique pré-pilote, anomalies corrigées |
| [demo-mvp-start-academy.md](./demo-mvp-start-academy.md) | Script de démo en 5 ou 15 min |
| [setup-supabase.md](./setup-supabase.md) | Installation de zéro (migrations + seed) |
| [test-openrouter-mvp.md](./test-openrouter-mvp.md) §10 | Coûts OpenRouter validés (~0,30-0,50 € / cycle complet) |
| [session-documents-upload.md](./session-documents-upload.md) | Architecture upload + RGPD à expliquer |
| [public-access-flow.md](./public-access-flow.md) | Garanties tokens publics |
| [coach-brain-integration-plan.md](./coach-brain-integration-plan.md) | Pourquoi Coach Brain inerte, plan futur |
| [rls-hardening-plan.md](./rls-hardening-plan.md) | Sécurité base de données — étapes à appliquer post-pilote |
