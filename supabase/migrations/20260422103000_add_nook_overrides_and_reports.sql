-- ---------------------------------------------------------------------------
-- Human corrections that should survive reseeds
-- ---------------------------------------------------------------------------
create table if not exists public.nook_overrides (
  nook_id uuid primary key references public.nooks(id) on delete cascade,
  address_override text,
  operating_status_override text check (
    operating_status_override in ('active', 'temporarily_closed', 'permanently_closed')
  ),
  updated_by uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint nook_overrides_has_value check (
    address_override is not null or operating_status_override is not null
  )
);

drop trigger if exists set_nook_overrides_updated_at on public.nook_overrides;
create trigger set_nook_overrides_updated_at
  before update on public.nook_overrides
  for each row
  execute function public.set_updated_at();

alter table public.nook_overrides enable row level security;

drop policy if exists "nook_overrides_select_public" on public.nook_overrides;
create policy "nook_overrides_select_public"
  on public.nook_overrides for select
  to anon, authenticated
  using (true);

drop policy if exists "nook_overrides_insert_authenticated" on public.nook_overrides;
create policy "nook_overrides_insert_authenticated"
  on public.nook_overrides for insert
  to authenticated
  with check (updated_by = auth.uid());

drop policy if exists "nook_overrides_update_authenticated" on public.nook_overrides;
create policy "nook_overrides_update_authenticated"
  on public.nook_overrides for update
  to authenticated
  using (updated_by = auth.uid())
  with check (updated_by = auth.uid());

create table if not exists public.nook_closure_reports (
  id uuid primary key default gen_random_uuid(),
  nook_id uuid not null references public.nooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz default now(),
  unique (nook_id, user_id)
);

alter table public.nook_closure_reports enable row level security;

drop policy if exists "nook_closure_reports_select_authenticated" on public.nook_closure_reports;
create policy "nook_closure_reports_select_authenticated"
  on public.nook_closure_reports for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "nook_closure_reports_insert_authenticated" on public.nook_closure_reports;
create policy "nook_closure_reports_insert_authenticated"
  on public.nook_closure_reports for insert
  to authenticated
  with check (user_id = auth.uid());

create index if not exists nook_closure_reports_nook_id_idx
  on public.nook_closure_reports (nook_id, created_at desc);

create table if not exists public.nook_address_suggestions (
  id uuid primary key default gen_random_uuid(),
  nook_id uuid not null references public.nooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  proposed_address text not null check (length(trim(proposed_address)) > 0),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.nook_address_suggestions enable row level security;

drop policy if exists "nook_address_suggestions_select_authenticated" on public.nook_address_suggestions;
create policy "nook_address_suggestions_select_authenticated"
  on public.nook_address_suggestions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "nook_address_suggestions_insert_authenticated" on public.nook_address_suggestions;
create policy "nook_address_suggestions_insert_authenticated"
  on public.nook_address_suggestions for insert
  to authenticated
  with check (user_id = auth.uid());

create index if not exists nook_address_suggestions_nook_id_status_idx
  on public.nook_address_suggestions (nook_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Nearby search should respect effective address/status from overrides
-- ---------------------------------------------------------------------------
create or replace function public.search_nooks_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer default 1500,
  p_type text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  slug text,
  overture_id text,
  name text,
  lat double precision,
  lng double precision,
  address text,
  type text,
  city text,
  region text,
  country text,
  website text,
  phone text,
  operating_status text,
  seed_run_id text,
  distance_meters double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as point
  )
  select
    nooks.id,
    nooks.slug,
    nooks.overture_id,
    nooks.name,
    nooks.lat,
    nooks.lng,
    coalesce(nook_overrides.address_override, nooks.address) as address,
    nooks.type,
    nooks.city,
    nooks.region,
    nooks.country,
    nooks.website,
    nooks.phone,
    coalesce(nook_overrides.operating_status_override, nooks.operating_status, 'active') as operating_status,
    nooks.seed_run_id,
    ST_Distance(nooks.location, origin.point) as distance_meters
  from public.nooks
  left join public.nook_overrides
    on nook_overrides.nook_id = nooks.id
  cross join origin
  where ST_DWithin(
    nooks.location,
    origin.point,
    least(greatest(coalesce(p_radius_meters, 1500), 1), 50000)
  )
    and coalesce(nook_overrides.operating_status_override, nooks.operating_status, '') != 'permanently_closed'
    and (p_type is null or p_type = 'all' or nooks.type = p_type)
  order by distance_meters asc, nooks.name asc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;
