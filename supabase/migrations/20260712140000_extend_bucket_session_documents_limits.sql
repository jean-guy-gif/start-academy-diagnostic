-- =============================================================================
-- Bucket `session-documents` — file_size_limit + allowed_mime_types
--
-- Origine : §8 audit Storage, finding F-1 (2026-07-12). Defense-in-depth.
--
-- Aujourd'hui la sécurité MIME + taille est portée entièrement par la
-- validation JS `validateFileUpload` dans src/lib/documents/document-types.ts.
-- L'unique route d'écriture actuelle (POST /api/public/upload-document) la
-- joue avant tout upload. Ce filet fonctionne mais laisse le bucket ouvert
-- à un futur handler qui oublierait la validation — un `.exe` de 500 Mo
-- pourrait alors atterrir en Storage.
--
-- Cette migration pose une 2e ligne au niveau du bucket lui-même :
--   • file_size_limit     = 10 485 760 (10 Mo, aligné sur MAX_FILE_SIZE_BYTES)
--   • allowed_mime_types  = 12 types alignés sur ALLOWED_MIME_TYPES
--
-- ⚠️ SOURCE UNIQUE — La liste de MIME ci-dessous DUPLIQUE
-- `ALLOWED_MIME_TYPES` défini dans src/lib/documents/document-types.ts:54-71.
-- Toute modification de l'une DOIT être répercutée sur l'autre.
-- Un test de contrat verrouille l'invariant :
--   src/lib/documents/mime-whitelist.contract.test.ts
-- (parse ce fichier de migration + Object.keys(ALLOWED_MIME_TYPES) et fait
--  échouer le build si la moindre divergence apparaît — cf. leçon T-3/T-4).
--
-- Idempotent : le UPDATE ré-applique les mêmes valeurs si rejoué.
-- =============================================================================

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array[
         'application/pdf',
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/heic',
         'image/heif',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/csv',
         'text/plain'
       ]
 where id = 'session-documents';
