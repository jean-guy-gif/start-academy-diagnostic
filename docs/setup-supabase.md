# Setup Supabase pour Start Academy Diagnostic

> Procédure officielle après chaque nouvelle instance Supabase ou
> remise à zéro du projet. À tenir à jour à chaque ajout de migration
> ou de seed.

---

## 1. Pré-requis

- Projet Supabase créé sur https://supabase.com.
- CLI Supabase installé (`brew install supabase/tap/supabase` ou
  équivalent).
- `.env.local` complété :
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Applique les migrations

```bash
supabase link --project-ref <project-ref>
supabase db push
```

`supabase db push` applique **toutes** les migrations de
`supabase/migrations/` dans l'ordre. Aujourd'hui :

| Date | Migration | Contenu |
|---|---|---|
| 20260521 | `init_mvp1` | Schéma initial (profiles, clients, diagnostics, recommendations, sessions, logs IA) |
| 20260522 | `add_session_participants_documents` | Tables `session_participants` + `session_documents` |
| 20260523 | `add_training_supports` | Table `training_supports` |
| 20260523 | `add_designed_training_supports` | Table `designed_training_supports` |
| 20260524 | `auth_socle` | Rename `formateur` → `trainer`, colonne `organization`, trigger `handle_new_user` |
| 20260525 | `public_access_tokens` | Table `public_access_tokens` (liens publics sécurisés) |
| 20260526 | `add_participant_admin_fields` | Champs `last_diploma`, `real_estate_experience_years`, `professional_status` |
| 20260526 | `create_session_documents_bucket` | Bucket Supabase Storage privé `session-documents` |

---

## 3. ⚠️ Exécute le seed catalogue

**`supabase db push` n'exécute PAS `supabase/seed.sql`.** Si tu
oublies cette étape, la table `training_modules` reste vide et
toutes les recommandations remontent une alerte "catalogue vide".

Deux options :

### Option A — SQL Editor Supabase (recommandé)

1. Ouvrir le projet sur https://supabase.com.
2. SQL Editor → New query.
3. Copier-coller le contenu complet de `supabase/seed.sql`.
4. Exécuter.

### Option B — CLI

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

(Remplace `$DATABASE_URL` par la connection string de ton projet,
visible dans Project Settings → Database → Connection string.)

---

## 4. Vérifie le seed

```bash
npm run check:catalog
```

Sortie attendue :

```
✅ Catalogue OK : 79 modules dans training_modules.
```

Si tu vois :

```
❌ La table training_modules est VIDE.
```

→ Retourne à l'étape 3.

---

## 5. Checklist d'installation

- [ ] `supabase link` exécuté avec le bon `project-ref`.
- [ ] `supabase db push` exécuté → migrations appliquées sans erreur.
- [ ] `supabase/seed.sql` exécuté manuellement → 79 lignes dans
      `training_modules`.
- [ ] `npm run check:catalog` → ✅ OK.
- [ ] `npm run dev` → http://localhost:3000 répond.
- [ ] `/settings/modules` (en local) affiche bien
      « Source : Supabase » et non « Source : local ».

---

## 6. Configuration Supabase Storage

La migration `20260526120100_create_session_documents_bucket.sql` crée
le bucket privé `session-documents` (cf. `docs/session-documents-upload.md`).

**Vérifie après `db push` :**

- Storage → Buckets → `session-documents` est présent.
- `Public` est désactivé.
- Aucune policy `storage.objects` ouverte à `anon` ou `authenticated`.

Les uploads / téléchargements passent via `service_role` côté routes
serveurs. Tout accès direct par un client (navigateur, anon) doit
renvoyer 401/403.

---

## 7. Premier utilisateur admin

Le trigger `handle_new_user` (cf. migration `20260524120000_auth_socle`)
crée automatiquement une ligne `profiles` au signup. Pour créer un
admin :

### Option A — Création via Supabase Studio

1. Authentication → Users → Invite user.
2. Remplir email + password.
3. Dans `raw_user_meta_data`, ajouter :
   ```json
   { "role": "admin", "full_name": "Prénom Nom" }
   ```
4. Le trigger crée la ligne `profiles` avec `role = "admin"`.

### Option B — UPDATE manuel après signup

Si l'utilisateur s'est inscrit sans metadata, mettre à jour manuellement :

```sql
update public.profiles set role = 'admin' where email = 'admin@start-academy.fr';
```

---

## 8. Troubleshooting

| Symptôme | Cause probable | Fix |
|---|---|---|
| Recommandation : « catalogue vide » | Seed non exécuté | Étape 3 |
| Login : « Connexion impossible » | Trigger `handle_new_user` non créé | Re-appliquer la migration `auth_socle` |
| Upload document : 503 | `SUPABASE_SERVICE_ROLE_KEY` manquante | Compléter `.env.local` |
| Téléchargement document : 404 sur signed URL | URL expirée (60 s) | Cliquer « Actualiser » dans la fiche session |
| Token public valide refusé | Bucket `session-documents` absent | Étape 6 |
