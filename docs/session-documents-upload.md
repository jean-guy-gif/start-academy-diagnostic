# Upload de pièces — session documents

> Architecture de sécurité pour le dépôt de pièces collaborateur via
> le lien public `participant_collect`.

---

## 1. Vue d'ensemble

Le flux d'upload public permet à un collaborateur titulaire d'un
token `participant_collect` de déposer :

- **Pièces administratives sensibles** : CNI, RIB, attestation
  CFP / URSSAF.
- **Documents pédagogiques** : cas client, support actuel, export CRM,
  statistiques commerciales, autre.

Toutes les pièces sont stockées dans un bucket Supabase Storage
**strictement privé** : aucune URL publique, aucun accès anon
direct.

---

## 2. Catégories acceptées

| Code | Libellé | Sensibilité |
|---|---|---|
| `cni` | Carte d'identité (CNI) | Sensible — données personnelles |
| `rib` | RIB | Sensible — données bancaires |
| `cfp_urssaf` | Attestation CFP / URSSAF | Administratif |
| `support_actuel` | Support actuel | Pédagogique |
| `cas_client` | Cas client | Pédagogique |
| `export_crm` | Export CRM | Commercial |
| `statistiques` | Statistiques commerciales | Commercial |
| `autre` | Autre document utile | Variable |

Définies dans
[src/lib/documents/document-types.ts](../src/lib/documents/document-types.ts).

---

## 3. Pipeline d'upload public

```
[Collaborateur navigateur]
        │
        │ POST /api/public/upload-document
        │ multipart/form-data:
        │   token, participantEmail, documentCategory, file
        ▼
[Route serveur Next]
   1. Validation cheap :
        - taille ≤ 10 MB
        - MIME whitelist
        - extension cohérente
   2. Validation token (validatePublicToken)
        - is_active, expires_at, max_uses
        - accessType === "participant_collect"
   3. Cherche participant_id via (session_id, email)
   4. Upload via service_role dans bucket privé
   5. Insert row session_documents
   6. Si l'insert échoue → cleanup blob
   7. Incrémente used_count (best-effort)
        │
        ▼
[Bucket privé session-documents]
        │
        │ Aucun accès anon. Aucune policy ouverte.
        ▼
[Téléchargement interne]
   GET /api/sessions/[id]/documents
        - auth obligatoire (admin / commercial / trainer)
        - retourne signed URL 60 s par fichier
```

---

## 4. Garanties de sécurité

| Garantie | Comment |
|---|---|
| Bucket strictement privé | `storage.buckets.public = false` dans la migration |
| Aucune policy `anon` | RLS Supabase Storage non ouverte à `anon` ni `authenticated` |
| Tout passe par `service_role` | Routes serveurs `import "server-only"` |
| Token validé AVANT upload | `validatePublicToken` puis check `accessType === "participant_collect"` |
| Type de token cloisonné | Un token `client_session_view` ne peut PAS uploader |
| MIME whitelist | 12 types autorisés (PDF, JPG, PNG, WEBP, HEIC/HEIF, DOC/DOCX, XLS/XLSX, CSV, TXT) |
| Taille limitée | 10 MB par fichier |
| Pas de SVG | Bloqué (évite XSS) |
| Pas d'exécutable | Bloqué |
| Chemin storage prédictible | `sessions/{sessionId}/participants/{emailNorm}/{ts}-{safeName}` |
| Téléchargement signé courte durée | 60 s par défaut — pas de cache |
| Cleanup en cas d'échec INSERT | Blob retiré du bucket |

---

## 5. Chemin storage

```
session-documents/
  └── sessions/
        └── {sessionId}/
              └── participants/
                    └── {emailNormalized}/
                          ├── 1716678123456-cni.pdf
                          ├── 1716678199012-rib.pdf
                          └── 1716678234890-export-crm.xlsx
```

Le nom de fichier est préfixé par un timestamp Unix (ms) pour éviter
les collisions et permettre l'ordre chronologique.

`emailNormalized` : `jean.dupont@example.com` → `jean.dupont_at_example.com`
(cf. `normalizeEmailForPath`).

---

## 6. Téléchargement (interne uniquement)

La fiche session interne `/sessions/[id]` affiche un bloc
« Documents reçus ». Pour chaque document :

1. La page client appelle `GET /api/sessions/[id]/documents`.
2. La route vérifie l'auth (rôle interne).
3. Elle génère une **signed URL valable 60 secondes** par document
   (Supabase Storage `createSignedUrl`).
4. La UI affiche un bouton « Télécharger » qui ouvre la signed URL
   dans un nouvel onglet.
5. Au-delà de 60 s, l'utilisateur peut cliquer « Actualiser » pour
   regénérer les URLs.

**Aucun chemin storage brut n'est exposé côté navigateur** — seules
les URLs signées sortent.

---

## 7. Limites MVP

- **Pas de scan antivirus.** Les fichiers sont stockés tels quels.
  À envisager : intégration ClamAV ou équivalent en post-upload.
- **Pas d'expiration automatique des fichiers.** Un fichier déposé
  reste indéfiniment. À envisager : politique de rétention.
- **Pas de re-upload / remplacement.** `upsert: false` — un upload
  avec le même nom dans la même seconde échouera. À envisager :
  versioning ou suffixe aléatoire.
- **Pas de Google Drive / SharePoint.** Volontaire — la consigne
  produit le précise.
- **Pas de notification email** au formateur lors d'un dépôt.

---

## 8. Future intégration Drive

Quand la brique Drive sera prête, deux options :

1. **Drive comme storage principal** : remplacer le bucket Supabase par
   Google Drive (via service account). Garder `session_documents.storage_path`
   comme identifiant Drive (file ID).
2. **Drive comme miroir** : continuer à uploader dans Supabase Storage,
   puis répliquer asynchrone dans Drive pour le formateur. Plus
   robuste mais double coût.

Dans tous les cas, **garder le bucket Supabase privé** : le
téléchargement passe par signed URL ou par re-upload côté Drive.

---

## 9. Checklist sécurité

- [ ] Bucket `session-documents` créé avec `public = false`.
- [ ] Aucune policy `storage.objects` ouverte à `anon`.
- [ ] Aucune policy `storage.objects` ouverte à `authenticated` en
      écriture libre.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` jamais préfixée `NEXT_PUBLIC_`.
- [ ] Test : un curl POST sur `/api/public/upload-document` avec un
      token de type `client_session_view` doit retourner 403.
- [ ] Test : un curl POST avec un faux token doit retourner 403
      `not_found`.
- [ ] Test : upload d'un `.svg` ou `.exe` doit retourner 400
      `mime_not_allowed`.
- [ ] Test : un fichier de 11 MB doit retourner 400 `too_large`.
- [ ] Vérifier dans Supabase Studio : `session_documents.storage_path`
      ne contient JAMAIS d'URL publique, uniquement un chemin relatif
      `sessions/.../...`.
