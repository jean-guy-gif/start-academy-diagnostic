# Runbook d'exploitation — Start Academy Diagnostic

> Document opérationnel interne. À tenir à jour à chaque changement
> structurel (variables d'env, tables RLS, procédures Supabase /
> OpenRouter). Lecture obligatoire avant toute action de
> maintenance ou réaction incident.

---

## 1. Objectif du runbook

Donner à l'équipe Start Academy un mode d'emploi clair pour :

- **Protéger les données** des clients, dirigeants et collaborateurs
  formés (CNI, RIB, production N-1, contenu de diagnostic).
- **Restaurer après erreur** humaine (suppression accidentelle,
  migration ratée, RLS qui casse un parcours).
- **Réagir vite à une clé compromise** (Supabase, OpenRouter,
  futures intégrations Gmail / Calendar / Drive — *non branchées*).
- **Traiter les documents sensibles** (suppression à la demande,
  purge GDPR, archivage).
- **Vérifier l'état de la plateforme** au quotidien et à la semaine.

Périmètre : Start Academy MVP1 + Phases 1–2 RLS + monitoring IA +
budget mensuel + rate limiting. Coach Brain / NXT Performance hors
scope (downstream consumer only).

---

## 2. Environnements

| Environnement | Description | `APP_ENV` | `SUPABASE_SERVICE_ROLE_KEY` | `OPENROUTER_API_KEY` | Fallback localStorage |
|---|---|---|---|---|---|
| **local** | dev sur poste équipe | `local` | optionnel | optionnel (sinon heuristique) | autorisé |
| **preprod** | environnement de test partagé | `preprod` | **OBLIGATOIRE** (failfast côté code) | obligatoire si l'on teste l'IA | **interdit** (`isLocalFallbackAllowed()` ⇒ false) |
| **prod** | future production interne | `production` | **OBLIGATOIRE** | obligatoire | **interdit** |

Comportements clés à connaître :

- `createSupabaseAdminClient()` lève `Error("SUPABASE_SERVICE_ROLE_KEY
  manquante en environnement non-local.")` si la clé est absente en
  preprod/prod (cf. `src/lib/supabase/server.ts`).
- `isLocalFallbackAllowed()` (cf. `src/lib/storage/local-fallback.ts`)
  retombe sur `NODE_ENV === "production"` quand `APP_ENV` n'est pas
  positionné. Pour être explicite, **toujours** positionner `APP_ENV`
  sur preprod / prod.
- Les routes IA ne sont jamais bloquées par l'absence de
  `OPENROUTER_API_KEY` — elles basculent en moteur heuristique
  (`source = "heuristic"`, `status = "fallback"` dans
  `ai_generation_logs`).

---

## 3. Checklists

### 3.1 Quotidien (rituel matin)

- [ ] Ouvrir `/cockpit` connecté admin.
- [ ] KPI « Appels IA aujourd'hui » plausible (< 20 / commercial actif).
- [ ] KPI « Coût estimé 7 jours » plausible (cohérent avec la
      tendance).
- [ ] Section « Budget IA mensuel » : status `OK` ou
      `Attention` toléré ; status `Dépassé` → escalader §9.
- [ ] Bandeau « Dernière erreur » : si présent et < 24 h, lire
      message et router vers §10 ou §9 selon nature.
- [ ] Section « Activité récente » : pas d'événement `error` non
      attendu sur les dernières 24 h.
- [ ] Vérifier que la console OpenRouter (dashboard externe) a
      du solde restant — alerter si < 20 € (seuil interne).
- [ ] Documents sensibles reçus : ouvrir chaque fiche session ayant
      `participant_submitted` ou `document_uploaded` dans le journal
      d'activité, traiter et marquer dans la note interne.

### 3.2 Hebdomadaire (lundi matin)

- [ ] **Export backup Supabase** (cf. §4) — date stockée dans le
      registre interne.
- [ ] **Contrôle Storage** : ouvrir le bucket `session-documents`
      via dashboard Supabase, vérifier que la taille totale n'a pas
      explosé (seuil interne à fixer ; aujourd'hui un upload pèse
      ~2 Mo en moyenne).
- [ ] **Revue `activity_logs`** : requêter les événements
      `severity = "warning"` ou `"error"` des 7 derniers jours
      (cf. §11 pour la requête).
- [ ] **Revue `ai_generation_logs`** : taux de `fallback` doit
      rester < 30 % ; si plus → vérifier `OPENROUTER_API_KEY` +
      éventuelle dérive Sonnet.
- [ ] **Tokens publics expirés** : vérifier qu'aucun token
      `participant_collect` actif ne dépasse 30 jours d'âge
      (cf. §11).
- [ ] **`.env` non commité** : `grep` rapide dans le repo
      (`git status`) — aucun `.env.local`, `.env.production`, ou
      fichier contenant `SUPABASE_SERVICE_ROLE_KEY=` ne doit
      apparaître.

---

## 4. Backup Supabase

### 4.1 Procédure manuelle (Supabase dashboard)

1. Se connecter au projet Supabase Start Academy.
2. **Database → Backups** :
   - Plan Free : pas de backup automatique → exporter manuellement
     via `pg_dump` (cf. §4.2).
   - Plan Pro / Team : un backup quotidien automatique disponible
     ~7 jours. Cliquer « Download backup » pour le snapshot du
     jour.
3. **Storage → session-documents** :
   - Aucun backup automatique des objets Storage côté Supabase
     plans Free/Pro. Procéder à l'export via API (cf. §4.3).
4. Enregistrer les fichiers dans un coffre-fort interne (chiffré),
   pas dans le repo Git.

### 4.2 Export manuel `pg_dump`

```bash
# Récupérer la connection string depuis Supabase → Settings →
# Database → Connection string (URI). Ne JAMAIS commiter cette URI.

pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
  --schema=public \
  --no-owner \
  --no-privileges \
  -f start_academy_$(date +%Y%m%d).sql
```

**Tables critiques** (à vérifier dans le dump, non exhaustif) :

| Table | Volume attendu | Sensibilité |
|---|---|---|
| `clients` | ~1 / commercial / semaine | moyenne |
| `diagnostics` | ~1 / client | moyenne |
| `diagnostic_answers` | ~10–20 / diagnostic | moyenne |
| `diagnostic_participants` | ~1–5 / diagnostic | **élevée** (statut pro, production N-1) |
| `recommendations` | 1 / diagnostic | moyenne |
| `recommendation_modules` | ~5–15 / recommandation | faible |
| `training_sessions` | 1 / proposition acceptée | moyenne |
| `session_participants` | ~1–10 / session | **élevée** (email participant) |
| `session_documents` | ~3–5 / session | **élevée** (FK vers Storage, contient CNI/RIB) |
| `training_supports` | 1 / session | moyenne |
| `designed_training_supports` | 1 / session | moyenne |
| `public_access_tokens` | ~3 / session | **élevée** (token_hash) |
| `activity_logs` | ~20–40 / session | moyenne |
| `ai_generation_logs` | ~10–50 / session | faible (pas de prompt complet) |

### 4.3 Backup Storage `session-documents`

Le dump SQL contient `storage_path` mais PAS les blobs. Pour les
fichiers eux-mêmes :

```bash
# Lister les objets du bucket
curl -s -X GET \
  "https://[PROJECT].supabase.co/storage/v1/object/list/session-documents" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit":1000,"offset":0}' > storage_index.json

# Pour chaque objet, télécharger via signed URL ou directement en
# service_role. Stocker en coffre chiffré (jamais Git, jamais Drive
# public).
```

Pour MVP : exécuter cet export manuellement chaque lundi.

### 4.4 Limites du backup dashboard

- Plan Free : pas de backup automatique → backup manuel obligatoire
  chaque semaine.
- Plan Pro : 7 jours de rétention seulement → archiver manuellement
  ce qu'on veut garder plus longtemps.
- Pas de backup automatique du bucket Storage côté Supabase.
- Pas de versionning automatique des migrations — c'est git qui
  fait office de source de vérité (toutes les migrations sont
  committées dans `supabase/migrations/`).

### 4.5 Recommandation future

- Backup automatisé quotidien via GitHub Actions ou cron externe →
  S3 chiffré (clé KMS dédiée), rétention 30 jours.
- Backup Storage en miroir vers S3 (ou Backblaze B2).
- Tester la restauration au moins une fois par trimestre
  (cf. §5).

---

## 5. Restauration

### 5.1 Restauration complète

**À ne JAMAIS faire en prod sans snapshot préalable.**

1. **Snapshot avant action** : faire un backup `pg_dump` + dump
   Storage du projet cible AVANT de restaurer quoi que ce soit.
2. Créer un projet Supabase temporaire (ou un schéma `restore_YYYYMMDD`
   sur le projet cible) pour vérifier le dump.
3. Restaurer via `psql` :
   ```bash
   psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
     -f start_academy_YYYYMMDD.sql
   ```
4. Re-vérifier les migrations RLS — un dump `--no-privileges` ne
   restaure pas les policies créées hors migration. Confirmer
   que les policies des Phases 1 → 2E sont présentes
   (cf. `docs/rls-hardening-plan.md`).
5. Re-vérifier les triggers `set_created_by_if_null`, le trigger
   `handle_new_user`, et les helpers SECURITY DEFINER.
6. Restaurer le bucket Storage **séparément** depuis le coffre
   chiffré (uploader les objets en service_role).
7. Vérifier que les `storage_path` dans `session_documents`
   pointent bien vers des objets existants.

### 5.2 Restauration partielle (un dossier)

Cas typique : un commercial a supprimé par erreur un diagnostic
(ne devrait pas arriver côté UI mais via SQL direct admin oui).

1. **Identifier l'`id` du diagnostic** dans le dump précédent.
2. Restaurer dans un schéma de quarantaine
   (`restore_quarantine`) :
   ```sql
   create schema if not exists restore_quarantine;
   -- Importer le dump filtré sur le diagnostic, son client, ses
   -- diagnostic_answers, sa recommendation, etc., dans
   -- restore_quarantine.*.
   ```
3. Inspecter manuellement, puis copier les lignes ligne par ligne
   dans `public.*` en réutilisant les UUIDs originaux :
   ```sql
   insert into public.diagnostics select * from restore_quarantine.diagnostics
     where id = '<UUID>';
   -- Cascade : diagnostic_answers, recommendations, etc.
   ```
4. Pour les FK orphelines (ex: `clients.created_by` pointant vers
   un user supprimé), accepter `NULL` ou recréer le profile.

### 5.3 Précautions générales

- Toujours faire un **snapshot avant restauration** — le dump
  source peut contenir des données stale qu'on ne veut pas écraser.
- **Vérifier RLS** : après restauration, exécuter une lecture
  cookie-auth depuis un compte commercial pour valider que les
  policies couvrent les nouvelles lignes (`created_by` doit être
  bien renseigné).
- **Vérifier Storage paths** : un `storage_path` dans
  `session_documents` qui pointe vers un objet absent du bucket
  → 404 sur signed URL. Soit re-uploader le fichier, soit
  marquer la ligne avec un champ « manquant » (à ajouter au
  modèle si récurrent).
- **Vérifier les tokens publics** : `public_access_tokens` restaurés
  conservent leur `token_hash` — mais le token brut n'existe plus
  (jamais persisté). Si le destinataire avait un lien actif, il
  marche encore ; sinon il faut **régénérer** un nouveau lien
  (cf. §11).

---

## 6. Rotation des clés

### 6.1 `SUPABASE_SERVICE_ROLE_KEY` (critique)

**Quand régénérer** :
- Suspicion de fuite (clé apparue dans un screenshot, un log
  externe, un commit accidentel — `git filter-branch` à prévoir).
- Départ d'un membre de l'équipe ayant eu accès à la clé.
- Au moins une fois par an en rotation préventive.

**Procédure** :

1. Supabase → **Settings → API → Service role key → Roll**.
2. Récupérer la nouvelle clé (affichée une seule fois).
3. Mettre à jour `.env.local` (dev), variables d'env preprod
   (Vercel / hébergeur), variables d'env prod.
4. **Redémarrer le serveur** dans chaque environnement :
   ```bash
   # Local
   npm run dev   # relance Next sur le nouveau .env
   # Vercel / Netlify / autre : redéployer
   ```
5. **Tests après rotation** :
   - GET `/cockpit` connecté admin → 200 + KPIs chargent.
   - POST `/api/sessions/<id>/documents` → 200 + signed URLs valides.
   - `tail` des logs serveur : pas d'`Error: SUPABASE_SERVICE_ROLE_KEY
     manquante`.
   - Cockpit « Activité récente » et « Usage IA » non vides (sauf
     si jeune projet).
6. Documenter dans le registre interne : date, opérateur, raison
   (préventif / réactif).

### 6.2 `OPENROUTER_API_KEY` (sensible)

**Quand régénérer** :
- Coût mensuel anormalement élevé (cf. §9).
- Suspicion de fuite.
- Au moins une fois par an.

**Procédure** :

1. OpenRouter → **Keys → Generate new key**.
2. Mettre à jour `.env` côté serveur(s).
3. Redémarrer.
4. Test : déclencher une recommandation (`/api/analyze-training-need`).
   - Vérifier `ai_generation_logs` : la nouvelle ligne a
     `source = "llm"` (et non `"heuristic"` qui signalerait un
     échec d'auth OpenRouter).
5. Révoquer l'ancienne clé après confirmation que la nouvelle
   fonctionne.

### 6.3 Futures clés Gmail / Calendar / Drive

**Non branchées au MVP.** Procédure générique le jour où elles le
seront :

1. Google Cloud Console → IAM → Service Accounts → rotation de la
   clé JSON OU régénération OAuth refresh_token.
2. Mettre à jour `.env` côté serveur(s).
3. Tester un draft / une lecture de calendrier / un download Drive.
4. Vérifier que les anciennes connexions ne sont plus actives.

---

## 7. Incident — Clé compromise

**Vitesse > propreté.** Procédure en 6 étapes :

1. **Régénérer immédiatement** la clé compromise
   (`SUPABASE_SERVICE_ROLE_KEY` → §6.1 ; `OPENROUTER_API_KEY` →
   §6.2).
2. **Remplacer `.env`** dans tous les environnements affectés
   (dev local de chaque membre, preprod, prod).
3. **Redémarrer le serveur** (preprod / prod).
4. **Vérifier `activity_logs`** sur la fenêtre suspecte :
   ```sql
   select created_at, event_type, event_label, actor_name, actor_role,
          session_id, metadata
   from public.activity_logs
   where created_at >= '<début_suspicion>'
   order by created_at desc
   limit 200;
   ```
5. **Vérifier `ai_generation_logs`** : appels OpenRouter anormaux ?
   ```sql
   select created_at, route, model, status, cost_estimate, created_by
   from public.ai_generation_logs
   where created_at >= '<début_suspicion>'
   order by created_at desc
   limit 200;
   ```
6. **Tokens publics** créés pendant la fenêtre suspecte :
   ```sql
   select id, session_id, access_type, recipient_email,
          recipient_name, expires_at, created_at, created_by
   from public.public_access_tokens
   where created_at >= '<début_suspicion>'
     and is_active = true
   order by created_at desc;
   ```
   Si un token vous semble suspect, **révoquer immédiatement** :
   ```sql
   update public.public_access_tokens
   set is_active = false
   where id = '<TOKEN_ID>';
   ```
7. **Documenter l'incident** dans le registre interne : date,
   détection, périmètre supposé, clés rotées, actions correctives,
   apprentissages.

---

## 8. Incident — Document sensible à supprimer

> **⚠️ Finding F-2 (§8 audit Storage, 2026-07-12) — canal RGPD provisoire.**
> Aucune route DELETE de document n'est exposée dans l'app (choix sûr,
> tracé §11.2). Toute demande RGPD de droit à l'effacement passe donc par
> la procédure manuelle ci-dessous, exécutée par un opérateur admin
> (dashboard Supabase ou API `service_role`). L'ordre **blob Storage
> AVANT ligne DB** est impératif : inverser laisse un blob orphelin dont
> l'existence n'est plus tracée en base (invisible côté app, mais présent
> côté bucket). Une route DELETE dédiée `admin-only`
> (`assertCanAccessSession` + `.remove([storage_path])` + `delete` row +
> `activity_log`, atomique) est au backlog post-pilote (cf. §12 du plan
> de stabilisation preprod). D'ici là, ce §8 est le seul chemin autorisé.

Cas typique : un participant demande la suppression de sa CNI
(droit à l'effacement RGPD).

1. **Identifier la session** :
   ```sql
   select s.id as session_id, c.company_name, s.created_at
   from public.training_sessions s
   join public.clients c on c.id = s.client_id
   where /* critère de recherche : email participant, nom client */
   order by s.created_at desc;
   ```
2. **Identifier les documents** :
   ```sql
   select id, file_name, document_category, storage_path,
          participant_id, created_at
   from public.session_documents
   where session_id = '<SESSION_ID>'
     and document_category in ('cni', 'rib'); -- ou autre catégorie
   ```
3. **Supprimer le fichier Storage** (via dashboard Supabase OU API
   en service_role) :
   ```bash
   curl -X DELETE \
     "https://[PROJECT].supabase.co/storage/v1/object/session-documents/<storage_path>" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   ```
4. **Supprimer la ligne SQL** (DELETE policy = admin only,
   cf. Phase 2D) :
   ```sql
   delete from public.session_documents where id = '<DOC_ID>';
   ```
   *(Conserver l'audit : si la conservation légale est requise,
   préférer un soft-delete via un champ `archived_at` à ajouter
   plus tard — hors MVP.)*
5. **Journaliser** l'action dans `activity_logs` (manuellement via
   un INSERT admin) :
   ```sql
   insert into public.activity_logs
     (session_id, actor_id, actor_name, actor_role,
      event_type, event_label, event_description, severity,
      entity_type, entity_id)
   values
     ('<SESSION_ID>', '<ADMIN_USER_ID>', '<Admin name>', 'admin',
      'document_uploaded', -- ou un type spécifique à créer plus tard
      'Document supprimé suite à demande RGPD',
      'Demande participant <email anonymisé>',
      'warning',
      'session_document', '<DOC_ID>');
   ```
6. **Vérifier les signed URLs** : elles expirent 60 s après
   génération, donc en pratique rien à révoquer activement. Mais
   confirmer qu'aucune nouvelle signed URL ne peut être créée
   pour cet objet supprimé (Storage retournera 404).

---

## 9. Incident — Abus IA / coût anormal

Détection typique : KPI « Coût estimé 7 jours » bondit, ou alerte
budget mensuel `Dépassé`.

1. **Cockpit `/cockpit`** : vérifier KPIs (appels aujourd'hui,
   coût 7 j, taux fallback, dernière erreur).
2. **`ai_generation_logs`** — identifier user + route :
   ```sql
   select created_by, route, count(*) as calls,
          sum(cost_estimate) as cost_eur,
          sum(total_tokens) as tokens
   from public.ai_generation_logs
   where created_at >= now() - interval '24 hours'
     and status != 'rate_limited'
   group by created_by, route
   order by cost_eur desc nulls last
   limit 20;
   ```
3. **Réduire l'enveloppe** si besoin :
   - Baisser `AI_MONTHLY_BUDGET_EUR` (env) → redéployer → cockpit
     repassera en `warning`/`exceeded`.
   - Désactiver temporairement OpenRouter : vider
     `OPENROUTER_API_KEY` → les routes IA basculeront sur
     l'heuristique (`source = "heuristic"`) sans coût.
4. **Ajuster `AI_ROUTE_LIMITS`** dans
   `src/lib/ai/ai-rate-limit-service.ts` si une route est
   surconsommée (ex: passer `analyze-training-need` de 20/h à
   10/h). Redéployer.
5. **Bloquer un user** si abus avéré :
   - Suspendre le compte Supabase Auth (dashboard → Authentication
     → Users → Suspend).
   - Le profile reste mais `auth.users.aud` change → les routes
     refuseront 401.
6. Logger l'incident dans `activity_logs` + registre interne.

---

## 10. Incident — Migration RLS casse une page

Symptôme : un commercial connecté ne voit plus ses diagnostics, ou
le cockpit retourne 500. Cause probable : une policy SELECT
nouvellement durcie ne couvre pas un pattern d'accès.

1. **Identifier la table** : ouvrir la console développeur sur la
   page cassée, regarder le message d'erreur Supabase (typiquement
   `PGRST116` ou `42501 insufficient_privilege`).
2. **Reproduire** : tenter la même requête côté SQL avec le JWT du
   user concerné.
3. **Lire la policy** :
   ```sql
   select polname, polcmd, polqual, polwithcheck
   from pg_policies
   where schemaname = 'public' and tablename = '<table>';
   ```
4. **Rollback ciblé** si la régression bloque les commerciaux :
   ```sql
   -- Exemple : restaurer SELECT permissif sur diagnostics
   drop policy if exists diagnostics_owner_or_admin_select on public.diagnostics;
   create policy diagnostics_authenticated_select_temp
     on public.diagnostics
     for select to authenticated using (true);
   ```
   **Documenter** cette mesure temporaire dans le registre interne
   et planifier le correctif définitif.
5. Utiliser les **plans rollback** documentés dans chaque migration
   Phase 1 → 2E (notes opérationnelles en fin de fichier).
6. **NE JAMAIS ajouter une policy `to anon`** pour dépanner. Le
   bon réflexe est d'élargir une policy existante (ajouter une
   condition `OR public.is_internal_user()`) ou de routeer la
   lecture via une route serveur en service_role + check
   `assertCanAccessSession` / `assertCanAccessDiagnostic`.
7. **Tester après correctif** :
   - Admin OK.
   - Commercial propriétaire OK.
   - Commercial non propriétaire 403.
   - Public tokenisé inchangé.

---

## 11. Tokens publics

### 11.1 Durées d'expiration recommandées

| Access type | Durée par défaut | Pourquoi |
|---|---|---|
| `client_session_view` | 14 jours | Dirigeant peut consulter, choisir un créneau |
| `participant_collect` | 14 jours | Collaborateur remplit + dépose pièces |
| `trainer_session_view` | 60 jours | Formateur garde l'accès pendant la formation |

Configurable par `expiresInDays` dans le body de
`/api/sessions/[id]/create-access-link`.

### 11.2 Désactiver un token

```sql
update public.public_access_tokens
set is_active = false
where id = '<TOKEN_ID>';
```

Pour révoquer en masse (ex: tous les tokens d'une session après
incident) :

```sql
update public.public_access_tokens
set is_active = false
where session_id = '<SESSION_ID>';
```

`validatePublicToken` rejette dès lors avec `reason = "disabled"`.

### 11.3 Vérifier les tokens actifs

```sql
select id, session_id, access_type, recipient_email, recipient_name,
       expires_at, used_count, max_uses, created_at
from public.public_access_tokens
where is_active = true
  and (expires_at is null or expires_at > now())
order by created_at desc
limit 100;
```

### 11.4 Politique d'usage

- **Le token brut n'est exposé qu'une seule fois** à la création
  (route `/api/sessions/[id]/create-access-link`). Stocker en
  base : impossible — seul `token_hash` (SHA-256) est persisté.
- **Ne JAMAIS forwarder** un token brut au-delà du destinataire
  prévu (pas de copie dans un Slack public, pas de capture
  d'écran, pas d'envoi par email à un tiers).
- **`token_hash` ne doit jamais sortir** : aucune route API ne le
  retourne. Vérifié par grep.
- **En cas de doute**, régénérer le lien (créer un nouveau token,
  désactiver l'ancien) plutôt que de réutiliser un token suspect.

---

## 12. Préparation à la production large

Éléments **non encore faits** et à prioriser avant ouverture à des
pilotes distants multiples (ordre indicatif) :

| Élément | Priorité | Effort estimé |
|---|---|---|
| Backup automatisé Supabase + Storage (cron → S3 chiffré) | haute | 1–2 j |
| Test de restauration trimestriel | haute | 0,5 j |
| Monitoring externe (uptime / latence) — Better Stack, Sentry, Datadog | haute | 1 j |
| Alertes email automatiques (budget IA dépassé, erreur 5xx récurrente, OpenRouter quota) | haute | 1–2 j |
| Audit Storage policies formel (RLS sur `storage.objects`) | haute | 0,5 j |
| Rate limit Redis / Upstash (sub-seconde, multi-instance) | moyenne | 1–2 j |
| Logs centralisés (Logflare / Better Stack / Vector + S3) | moyenne | 1 j |
| Procédure RGPD complète documentée (registre, DPO, formulaire demande effacement) | moyenne | 2 j |
| Registre de traitement (Article 30 RGPD) | moyenne | 1 j |
| Webhook Slack pour incidents (Cockpit ne suffit pas hors heures bureau) | moyenne | 0,5 j |
| Test de charge (10 commerciaux × 5 diagnostics simultanés) | basse | 1 j |
| Bug bounty / pentest externe léger | basse | budget externe |
| Procédure de bascule prod ↔ preprod (DNS, env, smoke) | basse | 0,5 j |

---

## 13. Annexes

### 13.1 Requêtes SQL utiles

Toutes les requêtes ci-dessous nécessitent `service_role` ou un
admin connecté via dashboard.

**Compter les sessions par commercial :**
```sql
select p.full_name, p.email, count(s.id) as sessions
from public.training_sessions s
join public.profiles p on p.id = s.created_by
group by p.id, p.full_name, p.email
order by sessions desc;
```

**Documents les plus volumineux :**
```sql
select session_id, file_name, file_type, file_size, created_at
from public.session_documents
order by file_size desc
limit 20;
```

**Diagnostics orphelins (sans recommandation après 7 j) :**
```sql
select d.id, d.client_id, d.created_at, d.status
from public.diagnostics d
left join public.recommendations r on r.diagnostic_id = d.id
where r.id is null
  and d.created_at < now() - interval '7 days'
order by d.created_at;
```

**Activité récente par session :**
```sql
select created_at, event_type, event_label, actor_name, severity
from public.activity_logs
where session_id = '<SESSION_ID>'
order by created_at desc
limit 50;
```

### 13.2 Documents de référence

- [docs/rls-hardening-plan.md](rls-hardening-plan.md) — état RLS.
- [docs/rls-phase-2-access-audit.md](rls-phase-2-access-audit.md) —
  audit Phase 2 + correctifs.
- [docs/security-final-audit-preprod.md](security-final-audit-preprod.md)
  — audit sécurité final.
- [docs/activity-log-prd.md](activity-log-prd.md) — journal interne.
- [docs/ai-monitoring-prd.md](ai-monitoring-prd.md) — monitoring IA.
- [docs/ai-rate-limiting-prd.md](ai-rate-limiting-prd.md) — rate
  limiting.
- [docs/ai-budget-prd.md](ai-budget-prd.md) — budget mensuel.
- [docs/public-access-flow.md](public-access-flow.md) — tokens
  publics.
- [docs/session-documents-upload.md](session-documents-upload.md) —
  bucket Storage.

### 13.3 Glossaire

- **service_role** : clé Supabase qui bypasse RLS. Strictement
  côté serveur.
- **anon key** : clé Supabase publique, soumise à RLS.
- **JWT user** : token cookie auth posé par Supabase Auth ; lu
  par `createSupabaseRouteHandlerClient` côté serveur.
- **failopen / failclose** : politique en cas de panne d'un sous-
  système (cf. rate limiting §5 du PRD).
- **RLS** : Row Level Security Postgres.
- **token brut / token_hash** : pour `public_access_tokens`, le
  brut est exposé une fois à la création, le hash SHA-256 est
  persisté. Validation par comparaison hash.
