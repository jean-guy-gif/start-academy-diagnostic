# Accès public post-proposition

> Document produit + technique. À jour au 2026-05-25 après la
> correction produit qui a retiré l'idée d'un diagnostic client autonome.

---

## 1. Règle produit fondamentale

**Le client ne fait JAMAIS son diagnostic.**

- Le diagnostic est **réalisé par le commercial Start Academy** pendant
  le rendez-vous : questions guidées posées par le commercial, réponses
  saisies par le commercial, ou transcript collé / importé par le
  commercial.
- Aucun chemin public ne permet à un dirigeant ou à un collaborateur
  de *créer* ou *remplir* un diagnostic.
- Les liens publics servent uniquement à **donner accès POST-proposition**
  à des contenus déjà produits par Start Academy.

Conséquence : il n'existe pas (et ne doit pas exister) de route
`/public/diagnostic/[token]`. Les seuls points d'entrée publics sont :

| Lien public | Type d'accès | Cible | Permet quoi |
|---|---|---|---|
| `/public/session/[token]` | `client_session_view` | Dirigeant client | Lecture seule de la proposition + statut + prochaines étapes |
| `/public/collect/[token]` | `participant_collect` | Collaborateur | Remplir sa préparation (1 soumission par email) |
| `/public/trainer/[token]` | `trainer_session_view` | Formateur | Lecture seule du diagnostic, recommandation, participants |

---

## 2. Rôles & enchaînement

```
1. COMMERCIAL
   ├─ crée le client
   ├─ réalise le diagnostic (guidé ou transcript)
   ├─ génère la recommandation
   ├─ génère la proposition
   ├─ crée la session
   └─ génère les liens d'invitation depuis /sessions/[id]
        ├─ lien dirigeant
        ├─ lien collecte collaborateurs
        └─ lien formateur (si formateur externe)

2. DIRIGEANT
   ├─ reçoit son lien par email manuel (Gmail à venir)
   ├─ consulte /public/session/[token]
   ├─ voit la proposition, le statut, les prochaines étapes
   ├─ peut éventuellement valider (placeholder MVP)
   └─ NE peut PAS remplir le diagnostic, NE peut PAS modifier la session

3. COLLABORATEUR
   ├─ reçoit son lien par email manuel
   ├─ consulte /public/collect/[token]
   ├─ remplit sa fiche de préparation (1 fois par email)
   └─ NE voit RIEN d'autre que son formulaire + le contexte minimal

4. FORMATEUR (si distinct du commercial)
   ├─ reçoit son lien par email manuel
   ├─ consulte /public/trainer/[token]
   ├─ voit diagnostic, recommandation, participants, cas concrets
   └─ lecture seule MVP
```

---

## 3. Architecture des tokens

### 3.1 Table `public_access_tokens`

Migration :
[supabase/migrations/20260525120000_public_access_tokens.sql](../supabase/migrations/20260525120000_public_access_tokens.sql)

Schéma résumé :

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid PK | identifiant interne pour révocation |
| `token_hash` | text unique | SHA-256 hex du token brut, **jamais le brut** |
| `session_id` | uuid FK | sur `training_sessions(id)` cascade |
| `access_type` | text check | `client_session_view`, `participant_collect`, `trainer_session_view` |
| `recipient_email` | text null | indicatif — qui doit recevoir |
| `recipient_name` | text null | prénom du destinataire pour affichage public |
| `expires_at` | timestamptz null | null = pas d'expiration |
| `max_uses` | integer null | null = illimité |
| `used_count` | integer | incrémenté côté serveur après action effective |
| `is_active` | boolean | révocation manuelle |
| `metadata` | jsonb | flexibilité futur |
| `created_by` | uuid null | `auth.users(id)` qui a généré |

Index : `session_id`, `token_hash`, `access_type`, `recipient_email`,
`is_active`, `expires_at`.

RLS : permissive pour `authenticated` uniquement. **Aucune policy
anon.** Les pages publiques ne lisent JAMAIS cette table directement
côté navigateur — elles passent par les routes serveurs qui utilisent
`service_role`.

### 3.2 Génération du token (côté serveur uniquement)

[src/lib/public-access/public-token-service.ts](../src/lib/public-access/public-token-service.ts)

1. `randomBytes(32)` → base64url → token brut (256 bits d'entropie).
2. SHA-256 du brut → hash hex stocké dans `token_hash`.
3. Insertion en base via `service_role`.
4. Le brut est **retourné une seule fois** au caller (la route
   `create-access-link`) puis disparaît du serveur — il n'est pas
   logué, pas écrit en cookie, pas mis en cache.
5. La validation hash le token entrant et fait un lookup indexé sur
   `token_hash`. Comparaison `timingSafeEqual` en complément (défense
   en profondeur).

### 3.3 Routes API

- **`POST /api/sessions/[id]/create-access-link`** *(interne, auth requise)*
  - Auth : profil avec rôle `admin` / `commercial` / `trainer`.
  - Input : `{ accessType, recipientEmail?, recipientName?, expiresInDays?, maxUses? }`.
  - Output : `{ id, accessType, url, token, expiresAt, maxUses }`.
  - Le `token` apparaît une seule fois ici — l'UI doit le présenter
    immédiatement pour copie.

- **`POST /api/public/validate-token`** *(public, anon)*
  - Input : `{ token }`.
  - Output : `{ valid, accessType, sessionId, sessionTitle?, clientName?, recipientEmail?, recipientName? }`
    OU `{ valid: false, reason }`.
  - Aucun `token_hash` exposé.

- **`POST /api/public/submit-participant`** *(public, anon, écrit via service_role)*
  - Input : `{ token, participant: { firstName, lastName, email, role, estimatedLevel, personalGoal, mainProblem, toolsUsed[], concreteCase } }`.
  - Étapes : valider token → vérifier `accessType === "participant_collect"`
    → upsert `session_participants` via `service_role` (anti-doublon
    sur `(session_id, email)`) → incrémenter `used_count`.
  - Output : `{ ok, participantId }` ou `{ ok: false, error, reason? }`.

### 3.4 Pages publiques

- [src/app/public/session/[token]/page.tsx](../src/app/public/session/[token]/page.tsx)
  → dirigeant, lecture seule.
- [src/app/public/collect/[token]/page.tsx](../src/app/public/collect/[token]/page.tsx)
  + [public-collect-form.tsx](../src/app/public/collect/[token]/public-collect-form.tsx)
  → collaborateur, soumission via fetch.
- [src/app/public/trainer/[token]/page.tsx](../src/app/public/trainer/[token]/page.tsx)
  → formateur, lecture seule étendue.

Toutes utilisent `dynamic = "force-dynamic"` (pas de cache côté Vercel /
Next, le token est unique par requête).

---

## 4. Génération des liens depuis la fiche session

[src/app/(app)/sessions/[id]/access-invitations.tsx](../src/app/(app)/sessions/[id]/access-invitations.tsx)
ajoute un bloc « Accès & invitations » à la fiche session interne
(`/sessions/[id]`).

Trois sous-blocs (dirigeant / collecte / formateur), chacun avec :
- email destinataire (optionnel, informatif)
- nom destinataire (optionnel, affiché dans la page publique)
- durée d'expiration (jours, défaut 30)
- bouton « Générer le lien »
- affichage du lien complet (URL absolue) avec bouton « Copier »

**Aucun email n'est envoyé automatiquement** — l'envoi (Gmail, autre)
sera branché plus tard. Pour l'instant le commercial copie le lien et
le partage par son canal habituel.

---

## 5. Lien interne legacy

L'URL historique `/sessions/[id]/collect` est conservée pour usage
interne / dev. Elle ne nécessite pas de token et ne doit pas être
partagée hors équipe Start Academy. Sur la fiche session, elle est
explicitement étiquetée « (legacy) » avec mention de préférer le lien
public signé.

À envisager (post-MVP) : la transformer en redirection vers la fiche
session ou la supprimer une fois les pilotes consommant le lien
public.

---

## 6. Garanties de sécurité

| Garantie | Comment |
|---|---|
| Token brut jamais en base | Seul `token_hash` (SHA-256 hex) persisté |
| Token brut jamais réémis | Pas de relecture — re-générer si perdu |
| Pas de lookup anon | Pages publiques passent par routes serveurs |
| Pas d'insert anon | `submit-participant` écrit via `service_role` après validation |
| service_role jamais exposé | `import "server-only"` sur tous les fichiers concernés |
| Comparaison time-constant | `timingSafeEqual` en complément du lookup indexé |
| Expiration & quota | `expires_at`, `max_uses` vérifiés à chaque validation |
| Révocation manuelle | `is_active = false` (UI à venir) |
| RLS authenticated | Création / liste tokens réservée aux rôles internes |

---

## 7. Limites connues (MVP)

- **Pas d'envoi email automatique** — Gmail à brancher plus tard.
- **Validation dirigeant placeholder** — bouton « Valider la formation »
  non câblé (retour email manuel pour l'instant).
- **Incrément `used_count` non atomique** — best-effort. Race
  condition acceptable au volume actuel ; RPC atomique à ajouter quand
  on aura des actions sensibles anti-replay.
- **Pas de révocation depuis l'UI** — il faut UPDATE `is_active = false`
  via Supabase Studio pour révoquer un lien actif (UI à venir).
- **Pas de Drive / Calendar branché** — la consigne produit le précise.
- **Pas de Coach Brain / Gamma** — idem.

---

## 8. Checklist sécurité avant pilote externe

- [ ] Supabase configuré avec `SUPABASE_SERVICE_ROLE_KEY` côté
      `.env.local` ou Vercel — sans elle, aucune route publique ne
      fonctionne.
- [ ] Migration `20260525120000_public_access_tokens.sql` appliquée.
- [ ] Test : générer un lien dirigeant → ouvrir dans un navigateur en
      navigation privée → vérifier qu'aucun autre token n'apparaît
      dans les requêtes réseau.
- [ ] Test : copier un faux token → vérifier que `/public/session/...`
      affiche la page erreur sans fuiter d'info.
- [ ] Test : générer un lien collecte avec `expiresInDays = 1` →
      modifier l'horloge / attendre → vérifier l'erreur `expired`.
- [ ] Test : soumettre deux fois le même email collaborateur → vérifier
      l'upsert (pas de doublon).
- [ ] Vérifier dans Supabase Studio : `public_access_tokens.token_hash`
      ne contient JAMAIS la valeur du token brut copié dans le lien.
- [ ] Vérifier que les pages `/public/*` ne lèvent pas d'erreur de
      cache : `Cache-Control: no-store` ou `dynamic = force-dynamic`
      (déjà en place sur les 3 pages).
