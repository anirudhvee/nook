-- =============================================================================
-- Add summary column to work_signals for cached AI-generated summaries
-- =============================================================================

alter table work_signals add column if not exists summary text;
