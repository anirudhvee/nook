alter table public.nooks
  add column if not exists seed_run_id text;

create index if not exists nooks_seed_run_id_idx
  on public.nooks (seed_run_id);
