-- =============================================================================
-- Initial schema: nooks, stamps, reviews, work_signals
-- =============================================================================

-- ---------------------------------------------------------------------------
-- nooks — core venue record
-- ---------------------------------------------------------------------------
create table nooks (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  place_id            text unique,                          -- Google Places ID
  lat                 float not null,
  lng                 float not null,
  address             text,
  type                text not null
                        check (type in ('cafe', 'library', 'coworking', 'other')),
  wifi_quality        int  check (wifi_quality between 1 and 5),
  outlet_availability int  check (outlet_availability between 1 and 5),
  noise_level         int  check (noise_level between 1 and 5),
  laptop_friendly     bool,
  hours               jsonb,
  submitted_by        uuid references auth.users on delete set null,
  created_at          timestamptz not null default now()
);

alter table nooks enable row level security;

-- Anyone authenticated can browse nooks
create policy "nooks_select_authenticated"
  on nooks for select
  to authenticated
  using (true);

-- Authenticated users may submit a nook; submitted_by must equal their own uid
create policy "nooks_insert_authenticated"
  on nooks for insert
  to authenticated
  with check (submitted_by = auth.uid());

-- ---------------------------------------------------------------------------
-- stamps — passport stamps (user <-> nook visits)
-- ---------------------------------------------------------------------------
create table stamps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  nook_id    uuid not null references nooks on delete cascade,
  stamped_at timestamptz not null default now(),
  note       text,
  unique (user_id, nook_id)                               -- one stamp per place
);

alter table stamps enable row level security;

-- Users can only see their own stamps
create policy "stamps_select_own"
  on stamps for select
  to authenticated
  using (user_id = auth.uid());

-- Users can only create stamps for themselves
create policy "stamps_insert_own"
  on stamps for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can delete their own stamps (un-stamp)
create policy "stamps_delete_own"
  on stamps for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reviews — cached Google Maps reviews fetched via Apify
-- ---------------------------------------------------------------------------
create table reviews (
  id          uuid primary key default gen_random_uuid(),
  nook_id     uuid not null references nooks on delete cascade,
  source      text not null default 'google',
  review_text text,
  rating      int  check (rating between 1 and 5),
  reviewed_at timestamptz,
  fetched_at  timestamptz not null default now()           -- used for 7-day TTL
);

-- Index to make cache-hit checks fast: given nook_id, find freshest fetch
create index reviews_nook_fetched_idx on reviews (nook_id, fetched_at desc);

alter table reviews enable row level security;

-- Authenticated users can read cached reviews
create policy "reviews_select_authenticated"
  on reviews for select
  to authenticated
  using (true);

-- Only the service role writes reviews (Apify ingest happens server-side).
-- No insert/update policy for anon/authenticated roles; the service role
-- bypasses RLS entirely, so this is safe.

-- ---------------------------------------------------------------------------
-- work_signals — AI-parsed signals derived from reviews (cached, not re-run)
-- ---------------------------------------------------------------------------
create table work_signals (
  nook_id       uuid primary key references nooks on delete cascade,
  wifi_signal   text,
  outlet_signal text,
  noise_signal  text,
  laptop_signal text,
  parsed_at     timestamptz not null default now()
);

alter table work_signals enable row level security;

-- Authenticated users can read parsed signals
create policy "work_signals_select_authenticated"
  on work_signals for select
  to authenticated
  using (true);

-- Only the service role writes work_signals (Claude parsing happens server-side).
