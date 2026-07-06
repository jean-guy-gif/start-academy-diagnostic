# Intégration Gmail Draft — état & plan

> Création de **brouillons** Gmail à partir des liens d'accès générés
> dans la fiche session. **Aucun envoi automatique** : le commercial
> relit et envoie depuis sa propre boîte Gmail.

---

## 1. Objectif

À partir d'un lien généré (dirigeant / collaborateur / formateur), le
commercial doit pouvoir :

1. Copier le lien (déjà OK)
2. Copier le message (déjà OK)
3. Ouvrir un mailto pré-rempli (déjà OK)
4. **Créer un brouillon Gmail prêt à relire** — l'objet de ce
   document.

L'étape 4 est volontairement la dernière : elle évite la copie/colle
manuelle dans Gmail web, **sans** prendre le risque d'un envoi
automatique non revu.

---

## 2. Garanties non négociables

| Garantie | Comment |
|---|---|
| **Aucun envoi automatique** | Le service ne sait créer que des drafts. Pas de `users.messages.send`, pas de SMTP outbound. |
| **Validation humaine obligatoire** | Le brouillon apparaît dans Gmail web : le commercial relit, complète, envoie manuellement. |
| **Aucune clé côté client** | Variables `GMAIL_*` server-only, jamais préfixées `NEXT_PUBLIC_`. Service `import "server-only"`. |
| **Endpoint protégé** | `POST /api/email/create-draft` requiert un user connecté avec un rôle interne (`admin` / `commercial` / `trainer`). |
| **Body visible avant création** | Le composant `AccessInvitations` affiche le sujet + le body complet avant que le bouton ne soit cliquable. |
| **Drafts uniquement** | Le scope OAuth recommandé est `https://www.googleapis.com/auth/gmail.compose`, **pas** `gmail.send`. |
| **Logs sans contenu sensible** | Seuls la cible, la taille et l'auteur sont logués — pas le body de l'email. |

---

## 3. Variables d'environnement requises

Toutes les 4 doivent être présentes pour activer le flux. Une absence
= la route renvoie `{ ok: false, code: "not_configured" }` et l'UI
affiche le fallback mailto.

| Variable | Rôle |
|---|---|
| `GMAIL_CLIENT_ID` | OAuth2 client ID (Google Cloud Console). |
| `GMAIL_CLIENT_SECRET` | OAuth2 client secret. Server-only. |
| `GMAIL_REFRESH_TOKEN` | Refresh token long-lived obtenu via un consent flow one-shot (scope `gmail.compose`). |
| `GMAIL_SENDER_EMAIL` | Adresse Gmail/Workspace expéditrice (`from`). |

Cf. [.env.example](../.env.example) — section Gmail Draft.

**Ne jamais commiter `.env.local`** : ce fichier contient les secrets.
`.gitignore` couvre déjà `.env*`.

---

## 4. Flux cible (quand le provider sera branché)

```
1. Commercial génère un lien dans /sessions/[id]
        │
        │ buildEmailTemplate(...) côté client construit {to, subject, body}
        ▼
2. Commercial clique "Créer un brouillon Gmail"
        │
        │ POST /api/email/create-draft
        │ body: { to, subject, body, accessLinkId?, sessionId? }
        ▼
3. Route serveur
        a. requireRole(INTERNAL_APP_ROLES) — 401/403 sinon
        b. Validation Zod (email, longueurs)
        c. isGmailDraftAvailable() — si non, renvoie not_configured
        d. createGmailDraft(input) — délégué à googleapis
        ▼
4. googleapis (côté serveur uniquement)
        a. OAuth2Client(CLIENT_ID, CLIENT_SECRET) + refresh_token
        b. Construction RFC 2822 (From, To, Subject, Content-Type, body)
        c. base64url(messageRaw)
        d. gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } })
        ▼
5. Réponse : { ok: true, draftId, draftUrl? }
        │
        ▼
6. UI affiche "Brouillon créé" + bouton "Ouvrir le brouillon" (URL Gmail web)
```

---

## 5. État actuel du code

Tout est en place SAUF l'appel `googleapis`. La couche est utilisable
de bout en bout : elle retourne aujourd'hui un statut `not_implemented`
qui se comporte exactement comme `not_configured` côté UI.

| Fichier | Rôle |
|---|---|
| [src/lib/email/gmail-draft-service.ts](../src/lib/email/gmail-draft-service.ts) | `server-only`. Types `GmailDraftResult`, `CreateGmailDraftInput`. Fonctions `isGmailDraftAvailable`, `createGmailDraft`, `buildDraftPayloadFromAccessLink`. Validation locale (email, longueurs). Retourne `not_configured` / `not_implemented` / `invalid_input` / `provider_error`. |
| [src/app/api/email/create-draft/route.ts](../src/app/api/email/create-draft/route.ts) | Route POST protégée. Auth + Zod + délégation au service. HTTP 200 sur les échecs contrôlés, 502 sur erreur provider, 401/403 sur auth. |
| [src/app/(app)/sessions/[id]/access-invitations.tsx](../src/app/(app)/sessions/[id]/access-invitations.tsx) | Bouton « Créer un brouillon Gmail » activé uniquement si email destinataire renseigné. Gère les états : idle / creating / not_configured / error / success (avec lien "Ouvrir le brouillon" quand disponible). |
| [.env.example](../.env.example) | 4 variables `GMAIL_*` documentées, vides par défaut. |

---

## 6. Étapes pour brancher réellement Gmail

### A. Préparer les credentials Google

1. Google Cloud Console → créer un projet (ou réutiliser).
2. APIs & Services → Library → activer **Gmail API**.
3. APIs & Services → OAuth consent screen :
   - User type : Internal (si Workspace) ou External + ajout de
     l'adresse expéditrice en testeur.
   - Scope : `https://www.googleapis.com/auth/gmail.compose`.
4. APIs & Services → Credentials → Create OAuth client ID :
   - Application type : Desktop OU Web (Web si on veut un consent
     flow côté navigateur).
   - Récupérer `CLIENT_ID` + `CLIENT_SECRET`.

### B. Obtenir un refresh token

Une seule fois, hors du flux applicatif :

```bash
# Exemple Node.js minimal (à exécuter localement, hors repo)
# 1) Génère une URL de consent
# 2) L'utilisateur ouvre cette URL → autorise → reçoit un `code`
# 3) Échange `code` → `refresh_token` + `access_token`
```

Le `refresh_token` est long-lived — c'est lui qu'on met dans
`GMAIL_REFRESH_TOKEN`. Le `access_token` est régénéré à chaque appel
par `googleapis` automatiquement.

### C. Brancher le provider

1. Installer la lib :
   ```bash
   npm install googleapis
   ```
2. Dans [src/lib/email/gmail-draft-service.ts](../src/lib/email/gmail-draft-service.ts),
   remplacer le bloc « TODO — Branchement Gmail » par :
   ```ts
   const { google } = await import("googleapis");
   const oauth = new google.auth.OAuth2(
     process.env.GMAIL_CLIENT_ID!,
     process.env.GMAIL_CLIENT_SECRET!,
   );
   oauth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN! });
   const gmail = google.gmail({ version: "v1", auth: oauth });
   const raw = Buffer.from(
     `From: ${process.env.GMAIL_SENDER_EMAIL}\r\n` +
     `To: ${input.to}\r\n` +
     `Subject: ${input.subject}\r\n` +
     `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
     input.body
   ).toString("base64url");
   const res = await gmail.users.drafts.create({
     userId: "me",
     requestBody: { message: { raw } },
   });
   return {
     ok: true,
     draftId: res.data.id ?? "unknown",
     draftUrl: `https://mail.google.com/mail/u/0/#drafts?compose=${res.data.message?.id ?? ""}`,
   };
   ```
3. Tester en local avec un compte de test (pas l'adresse de prod
   directement).
4. Une fois validé, déployer en production.

### D. Vérifications post-branchement

- [ ] Un brouillon apparaît bien dans Gmail web sous l'adresse
      `GMAIL_SENDER_EMAIL`.
- [ ] Le commercial peut le modifier puis envoyer manuellement.
- [ ] Aucun email n'a été envoyé pendant la création du brouillon.
- [ ] Les logs `ai_generation_logs` (ou un nouveau log dédié) ne
      contiennent **pas** le body du message.
- [ ] La révocation du refresh_token coupe immédiatement le flux
      (la route retombe en `provider_error`).

---

## 7. Risques & sécurité

| Risque | Mitigation |
|---|---|
| **Envoi accidentel d'email** | Scope OAuth `gmail.compose` uniquement — pas `gmail.send`. Code service `createGmailDraft` n'invoque jamais `users.messages.send`. Revue de code obligatoire à toute modif de ce fichier. |
| **Fuite du `refresh_token`** | Variable server-only. Pas de log. Rotation périodique (révocation + regénération si fuite suspectée). |
| **Phishing par un utilisateur Start Academy** | La route `create-draft` exige un rôle interne. Le sujet/body sont enregistrés (cible + taille) sans contenu pour audit. À renforcer si besoin : whitelist des domaines de destinataire ou approbation admin. |
| **Quota Gmail API** | 1 000 000 quota units / jour par défaut. `drafts.create` coûte 10 unités. Largement suffisant. À monitorer si volume > 50 000 drafts / jour. |
| **Exposition CLIENT_SECRET** | Server-only via `process.env`. Jamais référencé côté client. Vérifier au build (`grep "GMAIL_CLIENT_SECRET" .next` doit rester vide). |
| **Cohérence sujet/body côté serveur** | Aujourd'hui le client envoie le template. Si besoin, brancher `buildDraftPayloadFromAccessLink` côté serveur pour regénérer depuis sessionId+accessLinkId au lieu de faire confiance au payload. |

---

## 8. Hors scope (rappel)

- Pas d'envoi automatique (jamais).
- Pas de Calendar.
- Pas de Drive.
- Pas de tracking d'ouverture / click.
- Pas de templates HTML rich (texte brut suffit pour le MVP — un
  upgrade HTML peut venir plus tard).
- Pas de pièces jointes via l'API (les liens publics font le travail).
