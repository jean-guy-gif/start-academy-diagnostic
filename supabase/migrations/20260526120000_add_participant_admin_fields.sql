-- =============================================================================
-- Start Academy — Champs administratifs collaborateurs
--
-- Ajoute à `session_participants` les informations nécessaires au
-- montage du dossier de formation (CFP / URSSAF) et à l'adaptation du
-- contenu pédagogique au profil :
--   - last_diploma                  : dernier diplôme obtenu
--   - real_estate_experience_years  : tranche d'ancienneté immobilier
--   - professional_status           : salarié / agent commercial indépendant / autre
--
-- Tous nullables — la collecte historique ne possède pas ces champs.
-- =============================================================================

alter table public.session_participants
  add column if not exists last_diploma text;

alter table public.session_participants
  add column if not exists real_estate_experience_years text;

alter table public.session_participants
  add column if not exists professional_status text;

-- Si le champ existait déjà sans constraint, on s'assure que la
-- contrainte est posée. `drop constraint if exists` rend l'opération
-- idempotente.
alter table public.session_participants
  drop constraint if exists session_participants_professional_status_check;

alter table public.session_participants
  add constraint session_participants_professional_status_check
  check (
    professional_status is null
    or professional_status in ('salarie', 'agent_commercial_independant', 'autre')
  );
