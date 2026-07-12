#!/usr/bin/env bash
# =============================================================================
# §7 — Test restauration minimal (preprod-stabilization-plan.md §7)
#
# CIBLE : projet Supabase test isolé, jamais la préprod.
#
# PRÉREQUIS côté opérateur :
#   1. Projet Supabase test créé manuellement via dashboard (nom suggéré :
#      start-academy-restore-test-<YYYYMMDD>). Compte Free suffit.
#   2. Fichier .env.restore-test (gitignoré via .env*) à la racine du projet,
#      contenant EXCLUSIVEMENT les vars du projet test :
#         RESTORE_DB_URL=postgresql://postgres.<TEST_REF>:<PWD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
#         RESTORE_URL=https://<TEST_REF>.supabase.co
#         RESTORE_SERVICE_KEY=<service_role JWT du projet test>
#
#      ⚠️ RESTORE_DB_URL DOIT pointer sur le Session pooler (IPv4).
#         La connexion directe `db.<ref>.supabase.co:5432` résout uniquement
#         en AAAA (IPv6) et le container postgres:17 (Docker par défaut) n'a
#         pas de route IPv6 → psql timeout avec
#         « could not connect to server: Cannot assign requested address ».
#         Format pooler : user = `postgres.<TEST_REF>` (et non `postgres`),
#         host = `aws-0-<REGION>.pooler.supabase.com`, port = `5432` (session)
#         ou `6543` (transaction — préférer 5432 ici pour compat pg_dump).
#         Mot de passe : éviter les caractères spéciaux `@`, `!`, `:`, `/`, `?`,
#         `#` qui cassent l'URI — sinon les URL-encoder. Cf. §11.2 T-13.
#
#      ⚠️ Compromis connu §11.2 T-14 : le mot de passe apparaît dans
#         `ps auxww` pendant chaque `docker run` (arg direct de psql).
#         Acceptable pour un test local jetable, refusé pour CI / machine
#         partagée.
#
#   3. Docker Desktop lancé (psql exécuté via image postgres:17).
#
# GARDES INFRANCHISSABLES :
#   (A) Aucune commande ne doit toucher la préprod. Le project ref préprod
#       'shhcefbojixjhgefcbyn' est explicitement interdit dans RESTORE_*.
#   (B) Le projet cible doit être vierge (0 table dans schema public). Sinon
#       on ARRÊTE — pas d'écrasement à l'aveugle.
#
# À exécuter depuis la racine du repo :
#   bash scripts/restore-test.sh
# =============================================================================

set -euo pipefail

PREPROD_REF="shhcefbojixjhgefcbyn"
BACKUP_TS="20260712_1205"
STORAGE_DIR="backups/storage_${BACKUP_TS}"
TEST_DOC_PATH="sessions/74a97a81-8542-414f-9211-f6838ecc0ada/participants/jean-guy_at_start-academy.fr/1783524815182-Dossier_Tactique_Suivi_IA_A4_1_2_.pdf"
TEST_DOC_LOCAL="${STORAGE_DIR}/${TEST_DOC_PATH}"

# ---------------------------------------------------------------------------
# 0. Prérequis fichiers
# ---------------------------------------------------------------------------
if [ ! -f .env.restore-test ]; then
  echo "❌ .env.restore-test manquant à la racine." >&2
  echo "   Crée-le avec RESTORE_DB_URL, RESTORE_URL, RESTORE_SERVICE_KEY (voir header du script)." >&2
  exit 1
fi
if [ ! -f "backups/preprod_schema_${BACKUP_TS}.sql" ] \
   || [ ! -f "backups/preprod_auth_data_${BACKUP_TS}.sql" ] \
   || [ ! -f "backups/preprod_data_${BACKUP_TS}.sql" ]; then
  echo "❌ Un ou plusieurs dumps ${BACKUP_TS} sont manquants dans backups/." >&2
  exit 1
fi
if [ ! -f "$TEST_DOC_LOCAL" ] || [ ! -f "${STORAGE_DIR}/MANIFEST.json" ]; then
  echo "❌ Backup Storage ${BACKUP_TS} incomplet (doc test ou MANIFEST manquant)." >&2
  exit 1
fi
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker daemon non joignable. Lance Docker Desktop d'abord." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Charger UNIQUEMENT .env.restore-test (pas de .env.local ici)
# ---------------------------------------------------------------------------
set -a
# shellcheck disable=SC1091
source .env.restore-test
set +a
: "${RESTORE_DB_URL:?RESTORE_DB_URL manquante dans .env.restore-test}"
: "${RESTORE_URL:?RESTORE_URL manquante dans .env.restore-test}"
: "${RESTORE_SERVICE_KEY:?RESTORE_SERVICE_KEY manquante dans .env.restore-test}"

# ---------------------------------------------------------------------------
# GARDE (A) : cible ≠ préprod
# ---------------------------------------------------------------------------
HOST_DB=$(printf '%s' "$RESTORE_DB_URL" | sed -E 's|^postgres(ql)?://[^@]+@||; s|[:/].*$||')
HOST_URL=$(printf '%s' "$RESTORE_URL" | sed -E 's|^https?://||; s|/.*$||')

echo "======================================================"
echo "  GARDE (A) — CIBLE"
echo "  HOST DB  : $HOST_DB"
echo "  HOST URL : $HOST_URL"
echo "======================================================"

if printf '%s\n%s\n%s\n' "$RESTORE_DB_URL" "$RESTORE_URL" "$RESTORE_SERVICE_KEY" \
     | grep -q "$PREPROD_REF"; then
  echo "❌ STOP — une variable RESTORE_* contient l'identifiant préprod '$PREPROD_REF'." >&2
  echo "   Le §7 doit viser un projet TEST isolé. Vérifie .env.restore-test." >&2
  exit 2
fi
echo "✅ Cible confirmée : PAS la préprod."

# ---------------------------------------------------------------------------
# psql via Docker (aucun psql système). Projet monté en RO.
# ---------------------------------------------------------------------------
psql_test() {
  # NB : $RESTORE_DB_URL est expansé côté hôte (voulu ici) et passé
  # directement en argument à psql dans le conteneur. Pas d'indirection
  # PGURL — sous `set -u` elle serait évaluée côté hôte, où elle n'existe
  # pas, et casserait avec "PGURL: unbound variable".
  docker run --rm -i \
    -v "$PWD:/repo:ro" \
    postgres:17 \
    psql "$RESTORE_DB_URL" "$@"
}

# ---------------------------------------------------------------------------
# GARDE (B) : projet vierge (bloquant)
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  GARDE (B) — PROJET VIERGE"
echo "======================================================"
COUNT=$(psql_test -tAc "select count(*) from information_schema.tables where table_schema='public';" \
        | tr -d '[:space:]')
echo "  tables dans schema public : $COUNT"
if [ "$COUNT" != "0" ]; then
  echo "❌ STOP — le projet cible n'est pas vierge ($COUNT tables dans public)." >&2
  echo "   Soit ce n'est pas le bon projet, soit il a déjà été utilisé." >&2
  echo "   On n'écrase pas à l'aveugle." >&2
  exit 3
fi
echo "✅ Projet vierge confirmé."

# ---------------------------------------------------------------------------
# 3. RESTORE SCHEMA
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  RESTORE 1/3 — SCHEMA"
echo "======================================================"
psql_test -v ON_ERROR_STOP=1 -f "/repo/backups/preprod_schema_${BACKUP_TS}.sql" > /dev/null
SRR=$(psql_test -tAc "show session_replication_role;" | tr -d '[:space:]')
echo "  session_replication_role (post-schema) : $SRR (attendu : origin)"

# ---------------------------------------------------------------------------
# 4. RESTORE AUTH DATA (avant public : FK profiles.id → auth.users.id)
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  RESTORE 2/3 — AUTH DATA"
echo "======================================================"
psql_test -v ON_ERROR_STOP=1 -f "/repo/backups/preprod_auth_data_${BACKUP_TS}.sql" > /dev/null
AUTH_USERS=$(psql_test -tAc "select count(*) from auth.users;" | tr -d '[:space:]')
echo "  auth.users : $AUTH_USERS (attendu : 4)"

# ---------------------------------------------------------------------------
# 5. RESTORE PUBLIC DATA
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  RESTORE 3/3 — PUBLIC DATA"
echo "======================================================"
psql_test -v ON_ERROR_STOP=1 -f "/repo/backups/preprod_data_${BACKUP_TS}.sql" > /dev/null
SRR=$(psql_test -tAc "show session_replication_role;" | tr -d '[:space:]')
echo "  session_replication_role (post-data) : $SRR (attendu : origin)"

# ---------------------------------------------------------------------------
# 6. Counts vs préprod (§6.3)
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  VÉRIF COUNTS — attendu = tableau §6.3"
echo "======================================================"
psql_test <<'SQL'
select 'diagnostics'                as t, count(*) from public.diagnostics
union all select 'training_sessions',          count(*) from public.training_sessions
union all select 'diagnostic_participants',    count(*) from public.diagnostic_participants
union all select 'diagnostic_answers',         count(*) from public.diagnostic_answers
union all select 'post_training_reviews',      count(*) from public.post_training_reviews
union all select 'clients',                    count(*) from public.clients
union all select 'recommendations',            count(*) from public.recommendations
union all select 'profiles',                   count(*) from public.profiles
union all select 'session_participants',       count(*) from public.session_participants
union all select 'session_documents',          count(*) from public.session_documents
union all select 'session_date_options',       count(*) from public.session_date_options
union all select 'support_quality_reviews',    count(*) from public.support_quality_reviews
union all select 'designed_training_supports', count(*) from public.designed_training_supports
union all select 'training_supports',          count(*) from public.training_supports
union all select 'recommendation_modules',     count(*) from public.recommendation_modules
union all select 'training_modules',           count(*) from public.training_modules
union all select 'public_access_tokens',       count(*) from public.public_access_tokens
union all select 'funding_config',             count(*) from public.funding_config
union all select 'activity_logs',              count(*) from public.activity_logs
union all select 'ai_generation_logs',         count(*) from public.ai_generation_logs
order by t;
SQL

# ---------------------------------------------------------------------------
# 7. Vérif RLS
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  VÉRIF RLS (attendu : 0 table sans RLS dans public)"
echo "======================================================"
NORLS=$(psql_test -tAc "select count(*) from pg_tables where schemaname='public' and rowsecurity=false;" \
        | tr -d '[:space:]')
echo "  tables public sans RLS : $NORLS"
if [ "$NORLS" != "0" ]; then
  echo "⚠️  Attention : $NORLS tables sans RLS — liste :" >&2
  psql_test -c "select tablename from pg_tables where schemaname='public' and rowsecurity=false;" >&2
fi

# ---------------------------------------------------------------------------
# 8. Bucket session-documents
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  BUCKET session-documents"
echo "======================================================"
psql_test -v ON_ERROR_STOP=1 \
  -f /repo/supabase/migrations/20260526120100_create_session_documents_bucket.sql > /dev/null
BUCKET_PUB=$(psql_test -tAc "select public from storage.buckets where id='session-documents';" \
             | tr -d '[:space:]')
echo "  bucket 'session-documents' public : $BUCKET_PUB (attendu : f)"

# ---------------------------------------------------------------------------
# 9. Upload doc test
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  UPLOAD DOC TEST — PDF 79 kB"
echo "  path : $TEST_DOC_PATH"
echo "======================================================"
UPLOAD_HTTP=$(curl -sS -o /tmp/upload-resp.json -w "%{http_code}" -X POST \
  "$RESTORE_URL/storage/v1/object/session-documents/$TEST_DOC_PATH" \
  -H "apikey: $RESTORE_SERVICE_KEY" \
  -H "Authorization: Bearer $RESTORE_SERVICE_KEY" \
  -H "Content-Type: application/pdf" \
  --data-binary "@$TEST_DOC_LOCAL")
echo "  HTTP upload : $UPLOAD_HTTP (attendu : 200)"
if [ "$UPLOAD_HTTP" != "200" ]; then
  echo "❌ Upload en échec :" >&2
  cat /tmp/upload-resp.json >&2
  exit 4
fi

# ---------------------------------------------------------------------------
# 10. Signed URL 60 s
# ---------------------------------------------------------------------------
SIGN_RESP=$(curl -sS -X POST \
  "$RESTORE_URL/storage/v1/object/sign/session-documents/$TEST_DOC_PATH" \
  -H "apikey: $RESTORE_SERVICE_KEY" \
  -H "Authorization: Bearer $RESTORE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expiresIn":60}')
SIGNED_URL=$(printf '%s' "$SIGN_RESP" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('signedURL',''))")
if [ -z "$SIGNED_URL" ]; then
  echo "❌ Signed URL non générée : $SIGN_RESP" >&2
  exit 5
fi
echo "  signed URL générée : ${SIGNED_URL:0:70}..."

# ---------------------------------------------------------------------------
# 11. Download via signed URL (sans header auth)
# ---------------------------------------------------------------------------
DL_HTTP=$(curl -sS -o /tmp/restore-check.pdf -w "%{http_code}" \
  "$RESTORE_URL/storage/v1$SIGNED_URL")
echo "  HTTP download : $DL_HTTP (attendu : 200)"
if [ "$DL_HTTP" != "200" ]; then
  echo "❌ Download signed URL échoué." >&2
  exit 6
fi

# ---------------------------------------------------------------------------
# 12. SHA-256 vérif contre MANIFEST.json backup
# ---------------------------------------------------------------------------
LOCAL_SHA=$(python3 -c "
import json,sys
m = json.load(open('${STORAGE_DIR}/MANIFEST.json'))
match = [e['sha256'] for e in m if e['path'] == '$TEST_DOC_PATH']
print(match[0] if match else '')
")
DL_SHA=$(shasum -a 256 /tmp/restore-check.pdf | awk '{print $1}')
echo
echo "  SHA backup   : $LOCAL_SHA"
echo "  SHA download : $DL_SHA"
if [ "$LOCAL_SHA" = "$DL_SHA" ] && [ -n "$LOCAL_SHA" ]; then
  echo "  ✅ MATCH — Storage bout-en-bout validé"
else
  echo "  ❌ MISMATCH — le blob restauré diverge du backup" >&2
  exit 7
fi

# ---------------------------------------------------------------------------
# 13. Navigabilité diag → session → doc
# ---------------------------------------------------------------------------
echo
echo "======================================================"
echo "  NAVIGABILITÉ diag → session → doc"
echo "======================================================"
psql_test <<SQL
select d.id as diag_id, ts.id as session_id, sd.storage_path
from public.diagnostics d
join public.training_sessions ts on ts.diagnostic_id = d.id
join public.session_documents sd on sd.session_id = ts.id
where sd.storage_path = '$TEST_DOC_PATH';
SQL

# ---------------------------------------------------------------------------
# Nettoyage local
# ---------------------------------------------------------------------------
rm -f /tmp/upload-resp.json /tmp/restore-check.pdf

echo
echo "======================================================"
echo "  ✅ §7 restauration — séquence complète OK"
echo "     Remplis maintenant docs/restore-test-log.md"
echo "     puis supprime le projet Supabase test et .env.restore-test."
echo "======================================================"
