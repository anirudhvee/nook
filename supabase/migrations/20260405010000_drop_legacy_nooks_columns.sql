-- =============================================================================
-- Drop legacy signal and hours columns from nooks — now sourced from OpenAI/Places API
-- =============================================================================

alter table nooks
  drop column if exists wifi_quality,
  drop column if exists outlet_availability,
  drop column if exists noise_level,
  drop column if exists laptop_friendly,
  drop column if exists hours;
