-- =============================================================================
-- Allow repeat passport check-ins by storing one row per visit
-- =============================================================================

alter table stamps
  drop constraint if exists stamps_user_id_nook_id_key;

create index if not exists stamps_user_id_stamped_at_idx
  on stamps (user_id, stamped_at desc);

create index if not exists stamps_user_id_nook_id_stamped_at_idx
  on stamps (user_id, nook_id, stamped_at desc);
