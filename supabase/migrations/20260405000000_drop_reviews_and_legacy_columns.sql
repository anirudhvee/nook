-- =============================================================================
-- Drop legacy Apify columns from work_signals and drop the reviews table
-- =============================================================================

alter table work_signals
  drop column if exists wifi_signal,
  drop column if exists outlet_signal,
  drop column if exists noise_signal,
  drop column if exists laptop_signal;

drop table if exists reviews;
