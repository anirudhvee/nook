-- =============================================================================
-- Cache OpenAI work signals as a string array
-- =============================================================================

alter table work_signals
  add column if not exists signals jsonb not null default '[]'::jsonb;
