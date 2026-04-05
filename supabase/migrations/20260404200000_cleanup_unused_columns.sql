-- =============================================================================
-- Clean up unused columns now that work signals are stored as a jsonb array
-- =============================================================================

alter table work_signals
  drop column if exists wifi_signal,
  drop column if exists outlet_signal,
  drop column if exists noise_signal,
  drop column if exists laptop_signal;
