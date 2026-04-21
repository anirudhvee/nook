alter table public.nooks
  add column if not exists last_seed_run_id text;

create index if not exists nooks_last_seed_run_id_idx
  on public.nooks (last_seed_run_id);
