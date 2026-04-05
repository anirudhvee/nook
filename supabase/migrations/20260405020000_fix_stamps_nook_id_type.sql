-- =============================================================================
-- Change stamps.nook_id from uuid to text to match Google Place ID format
-- =============================================================================

alter table stamps
  drop constraint if exists stamps_nook_id_fkey;

alter table stamps
  alter column nook_id type text using nook_id::text;
