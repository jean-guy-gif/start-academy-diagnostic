# Créneaux proposés — choix de dates sans Google Calendar

> Permet au commercial de proposer plusieurs créneaux et au dirigeant
> d'en choisir un depuis son espace public sécurisé. **Sans Google
> Calendar pour le MVP.**

---

## 1. Logique MVP

Trois étapes côté produit :

1. **Le commercial propose** plusieurs créneaux depuis la fiche session
   interne (titre, début, fin, lieu, format présentiel/visio/hybride).
2. **Le dirigeant choisit** un créneau depuis son lien public
   `/public/session/[token]`. Aucune authentification Supabase requise
   pour lui — la validation passe par le token signé.
3. **Le commercial confirme** ensuite manuellement (par téléphone /
   email) avant de bloquer la date côté équipe Start Academy. Aucune
   notification automatique n'est envoyée pour l'instant.

Tout reste persisté dans la table `session_date_options` côté
Supabase. La fiche session interne affiche l'état en temps réel.

---

## 2. Pourquoi pas Google Calendar maintenant

| Raison | Détail |
|---|---|
| Découplage | Le flux fonctionne sans dépendance externe. Le commercial peut tester / piloter sans configuration cloud. |
| Sécurité | Pas de scopes Google supplémentaires à demander tant que le besoin n'est pas validé pilote. |
| Coût d'intégration | OAuth Google + Calendar API + watch webhook = ~1 sprint dédié. Pas prioritaire avant 2-3 pilotes. |
| Compatibilité future | Le modèle de données (`start_at`, `end_at`, `location`, `format`) est volontairement aligné sur ce que demande l'API Calendar v3. La migration sera transparente. |

L'intégration Calendar arrive **après** que le flux MVP soit validé
sur 2-3 clients pilotes.

---

## 3. Flux dirigeant

```
1. Le commercial a généré un lien client_session_view dans la fiche session
2. Le dirigeant ouvre /public/session/[token]
3. Le serveur valide le token → charge la session + les date options via service_role
4. La page affiche la section "Choix des dates"
       - Si aucun créneau : message d'attente
       - Si des créneaux : carte par option avec bouton "Choisir ce créneau"
5. Le dirigeant clique → POST /api/public/select-date-option
       body: { token, optionId, selectedByEmail? }
6. La route :
       a. Valide le token (validatePublicToken)
       b. Vérifie accessType === "client_session_view"
       c. Délègue à selectDateOptionViaServiceRole :
           - vérifie que l'option appartient à la session
           - refuse si statut = cancelled
           - dé-sélectionne les autres "selected" de la session
           - passe l'option cible en "selected", note selected_at + selected_by_email
7. Réponse OK : la page affiche le créneau choisi en emerald
8. Le dirigeant peut toujours changer d'avis (re-choisir un autre créneau
   provoque une nouvelle bascule).
```

---

## 4. Flux commercial

```
1. Depuis /sessions/[id], le commercial voit la carte "Créneaux proposés"
2. Il remplit le mini-formulaire :
       - Intitulé (optionnel)
       - Début + Fin (datetime-local)
       - Lieu (optionnel)
       - Format (présentiel / visio / hybride / non précisé)
3. POST /api/sessions/[id]/date-options
       - auth requise (admin / commercial / trainer)
       - Zod : startAt + endAt ISO, endAt > startAt
       - insert via service_role, retourne le record complet
4. La liste se met à jour avec un badge "Proposé"
5. Quand le dirigeant choisit, le badge devient "Choisi par le dirigeant" en emerald
6. Le commercial peut "Annuler" un créneau encore au statut "proposed"
       - DELETE /api/sessions/[id]/date-options/[optionId]
       - update via service_role, statut → "cancelled" (pas de DELETE physique
         pour garder l'audit trail)
```

---

## 5. Garanties

| Garantie | Comment |
|---|---|
| Pas d'anon insert / update | RLS authenticated uniquement. La route publique utilise service_role APRÈS validation token. |
| Pas plusieurs `selected` | Le helper serveur passe d'abord les autres `selected` en `proposed` avant de mettre la cible en `selected`. |
| Pas de cross-session | `selectDateOptionViaServiceRole` vérifie `option.session_id === expectedSessionId` (issu du token). |
| Pas de sélection après annulation | Refusée si `option.status === "cancelled"`. |
| Pas de Calendar | Aucune dépendance Google. Aucun email envoyé automatiquement. |
| Audit trail | Le statut `cancelled` reste en base — pas de DELETE physique. `selected_by_email` + `selected_at` enregistrés. |

---

## 6. Fichiers concernés

| Fichier | Rôle |
|---|---|
| [supabase/migrations/20260527120000_add_session_date_options.sql](../supabase/migrations/20260527120000_add_session_date_options.sql) | Table + index + RLS authenticated + trigger updated_at. |
| [src/lib/sessions/session-date-options-service.ts](../src/lib/sessions/session-date-options-service.ts) | Service navigateur (CRUD via Supabase browser client). Réservé aux callers authentifiés. |
| [src/lib/sessions/session-date-options-server.ts](../src/lib/sessions/session-date-options-server.ts) | `server-only`. `selectDateOptionViaServiceRole`, `listDateOptionsViaServiceRole`. Garde-fous unique-selected et cross-session. |
| [src/app/api/sessions/[id]/date-options/route.ts](../src/app/api/sessions/[id]/date-options/route.ts) | GET (liste) + POST (créer). Auth obligatoire. |
| [src/app/api/sessions/[id]/date-options/[optionId]/route.ts](../src/app/api/sessions/[id]/date-options/[optionId]/route.ts) | DELETE (annule, garde l'audit). |
| [src/app/api/public/select-date-option/route.ts](../src/app/api/public/select-date-option/route.ts) | Route publique anon. Validation token + check accessType + service_role. |
| [src/app/(app)/sessions/[id]/session-date-options.tsx](../src/app/(app)/sessions/[id]/session-date-options.tsx) | UI commercial : formulaire ajout + liste + annulation. |
| [src/app/public/session/[token]/date-choice.tsx](../src/app/public/session/[token]/date-choice.tsx) | UI dirigeant : choix créneau + confirmation visuelle. |

---

## 7. Future intégration Google Calendar

Quand on activera Calendar :

1. **OAuth** côté serveur : scope minimal
   `https://www.googleapis.com/auth/calendar.events`.
2. À la **sélection** par le dirigeant (`selectDateOptionViaServiceRole`)
   ou à la **confirmation** par le commercial : créer un événement
   Calendar et stocker `metadata.calendar_event_id` dans la ligne
   `session_date_options`.
3. Inviter le dirigeant + le formateur via `attendees[]`.
4. Activer un **watch webhook** sur l'événement pour capter une
   éventuelle modification côté Calendar (`channels.watch`).
5. Ajouter une colonne `calendar_sync_status` (optionnelle) pour
   tracer les divergences entre Supabase et Calendar.

Aucune de ces étapes ne nécessitera de migration breaking : les champs
`start_at`, `end_at`, `location`, `format`, `metadata` sont déjà
suffisants.

---

## 8. Hors scope (rappel)

- Pas d'envoi automatique d'email à la sélection.
- Pas de Calendar.
- Pas de Drive.
- Pas de notification push.
- Pas de récurrence / multi-journée — un créneau = un slot continu
  (`end_at` > `start_at`).
