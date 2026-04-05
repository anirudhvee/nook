-- =============================================================================
-- Align review/work_signal cache tables with Google Place IDs
-- =============================================================================

alter table reviews
  drop constraint if exists reviews_nook_id_fkey;

alter table reviews
  alter column nook_id type text using nook_id::text;

drop index if exists reviews_nook_fetched_idx;
create index reviews_nook_fetched_idx on reviews (nook_id, fetched_at desc);

alter table work_signals
  drop constraint if exists work_signals_nook_id_fkey;

alter table work_signals
  alter column nook_id type text using nook_id::text;
