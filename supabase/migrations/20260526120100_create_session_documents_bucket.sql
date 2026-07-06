-- =============================================================================
-- Start Academy — Bucket Supabase Storage `session-documents`
--
-- Bucket PRIVÉ (public = false) destiné à recevoir :
--   - pièces administratives collaborateur (CNI, RIB, attestation CFP/URSSAF)
--   - documents pédagogiques (cas client, supports actuels, exports CRM, etc.)
--
-- Règles de sécurité :
--   - bucket strictement PRIVÉ : aucun accès anon direct.
--   - upload public uniquement via `/api/public/upload-document`
--     (route serveur qui valide le token avant d'utiliser service_role).
--   - téléchargement uniquement via signed URL courte durée (60 s)
--     générée par `/api/sessions/[id]/documents` (route auth interne).
--   - aucune policy `storage.objects` ouverte à `anon` ou `authenticated` :
--     tout passe par service_role côté serveur, qui bypasse RLS.
--
-- Documentation : docs/session-documents-upload.md
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('session-documents', 'session-documents', false)
on conflict (id) do update set public = excluded.public;

-- Pas de policies ajoutées sur `storage.objects` :
--   - le bucket est privé par défaut,
--   - service_role contourne RLS pour les opérations légitimes,
--   - on ne veut surtout pas autoriser un user authenticated à lire
--     ou écrire arbitrairement dans ce bucket. Le filtrage par
--     session se fera côté route serveur.
