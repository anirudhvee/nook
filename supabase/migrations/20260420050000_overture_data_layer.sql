-- =============================================================================
-- Overture data layer: venue catalog, community signals, photos, and seed tracking
-- =============================================================================

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- nooks - replace Google Place IDs with Overture IDs while keeping lat/lng
-- ---------------------------------------------------------------------------
alter table public.nooks
  add column if not exists overture_id text,
  add column if not exists slug text,
  add column if not exists location geography(Point, 4326),
  add column if not exists website text,
  add column if not exists phone text,
  add column if not exists social text,
  add column if not exists email text,
  add column if not exists brand_name text,
  add column if not exists confidence double precision,
  add column if not exists operating_status text default 'active',
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists country_code text,
  add column if not exists source_release text,
  add column if not exists seeded_at timestamptz default now();

update public.nooks
set
  overture_id = coalesce(overture_id, place_id, id::text),
  slug = coalesce(
    slug,
    trim(both '-' from regexp_replace(lower(coalesce(name, 'nook') || '-' || left(id::text, 8)), '[^a-z0-9]+', '-', 'g'))
  ),
  location = coalesce(
    location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ),
  operating_status = coalesce(operating_status, 'active'),
  source_release = coalesce(source_release, 'legacy')
where overture_id is null
  or slug is null
  or location is null
  or operating_status is null
  or source_release is null;

alter table public.nooks
  alter column overture_id set not null,
  alter column slug set not null,
  alter column location set not null;

create unique index if not exists nooks_overture_id_key
  on public.nooks (overture_id);

create unique index if not exists nooks_slug_key
  on public.nooks (slug);

create index if not exists nooks_location_gist_idx
  on public.nooks
  using gist (location);

alter table public.nooks
  drop column if exists place_id;

drop policy if exists "nooks_select_authenticated" on public.nooks;
drop policy if exists "nooks_select_public" on public.nooks;
create policy "nooks_select_public"
  on public.nooks for select
  to anon, authenticated
  using (true);

drop policy if exists "nooks_insert_authenticated" on public.nooks;
create policy "nooks_insert_authenticated"
  on public.nooks for insert
  to authenticated
  with check (submitted_by = auth.uid());

-- ---------------------------------------------------------------------------
-- nook_photos - community photo submissions backed by Supabase Storage
-- ---------------------------------------------------------------------------
create table if not exists public.nook_photos (
  id uuid primary key default gen_random_uuid(),
  nook_id uuid not null references public.nooks(id) on delete cascade,
  storage_path text not null,
  submitted_by uuid references auth.users on delete set null,
  caption text,
  is_primary boolean default false,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

alter table public.nook_photos enable row level security;

drop policy if exists "nook_photos_select_approved" on public.nook_photos;
create policy "nook_photos_select_approved"
  on public.nook_photos for select
  to anon, authenticated
  using (status = 'approved');

drop policy if exists "nook_photos_insert_own" on public.nook_photos;
create policy "nook_photos_insert_own"
  on public.nook_photos for insert
  to authenticated
  with check (submitted_by = auth.uid());

create index if not exists nook_photos_nook_id_idx
  on public.nook_photos (nook_id);

-- ---------------------------------------------------------------------------
-- nook_details - supplemental community-maintained details
-- ---------------------------------------------------------------------------
create table if not exists public.nook_details (
  nook_id uuid primary key references public.nooks(id) on delete cascade,
  google_maps_url text,
  community_hours jsonb,
  last_verified_at timestamptz,
  verified_by uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_nook_details_updated_at on public.nook_details;
create trigger set_nook_details_updated_at
  before update on public.nook_details
  for each row
  execute function public.set_updated_at();

alter table public.nook_details enable row level security;

drop policy if exists "nook_details_select_public" on public.nook_details;
create policy "nook_details_select_public"
  on public.nook_details for select
  to anon, authenticated
  using (true);

drop policy if exists "nook_details_insert_authenticated" on public.nook_details;
create policy "nook_details_insert_authenticated"
  on public.nook_details for insert
  to authenticated
  with check (true);

drop policy if exists "nook_details_update_authenticated" on public.nook_details;
create policy "nook_details_update_authenticated"
  on public.nook_details for update
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Community work signals - append-only reports and per-nook summary
-- ---------------------------------------------------------------------------
drop table if exists public.work_signals cascade;

create table public.work_signal_reports (
  id uuid primary key default gen_random_uuid(),
  nook_id uuid not null references public.nooks(id) on delete cascade,
  user_id uuid references auth.users on delete set null,
  stamp_id uuid references public.stamps(id) on delete set null,
  wifi text check (wifi in ('great', 'okay', 'none')),
  outlets text check (outlets in ('plenty', 'few', 'none')),
  noise text check (noise in ('silent', 'quiet', 'moderate', 'loud')),
  laptop_friendly boolean,
  stay_duration text check (stay_duration in ('all_day', 'time_pressured')),
  vibe text check (vibe in ('deep_focus', 'casual', 'calls_okay', 'meetings_okay')),
  seating text check (seating in ('spacious', 'cozy', 'cramped')),
  has_outdoor_seating boolean,
  transit_access text check (transit_access in ('great', 'doable', 'car_only')),
  tags text[],
  created_at timestamptz default now()
);

alter table public.work_signal_reports enable row level security;

drop policy if exists "work_signal_reports_select_public" on public.work_signal_reports;
create policy "work_signal_reports_select_public"
  on public.work_signal_reports for select
  to anon, authenticated
  using (true);

drop policy if exists "work_signal_reports_insert_own" on public.work_signal_reports;
create policy "work_signal_reports_insert_own"
  on public.work_signal_reports for insert
  to authenticated
  with check (user_id = auth.uid());

create index if not exists work_signal_reports_nook_id_created_at_idx
  on public.work_signal_reports (nook_id, created_at desc);

create table public.work_signal_summary (
  nook_id uuid primary key references public.nooks(id) on delete cascade,
  report_count integer default 0,
  wifi_great integer default 0,
  wifi_okay integer default 0,
  wifi_none integer default 0,
  outlets_plenty integer default 0,
  outlets_few integer default 0,
  outlets_none integer default 0,
  noise_silent integer default 0,
  noise_quiet integer default 0,
  noise_moderate integer default 0,
  noise_loud integer default 0,
  laptop_friendly_yes integer default 0,
  laptop_friendly_no integer default 0,
  top_tags text[],
  updated_at timestamptz default now()
);

alter table public.work_signal_summary enable row level security;

drop policy if exists "work_signal_summary_select_public" on public.work_signal_summary;
create policy "work_signal_summary_select_public"
  on public.work_signal_summary for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- stamps - point passport rows at Overture nooks
-- ---------------------------------------------------------------------------
delete from public.stamps
where nook_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table public.stamps
  drop constraint if exists stamps_nook_id_fkey;

alter table public.stamps
  alter column nook_id type uuid using nook_id::uuid;

delete from public.stamps
where not exists (
  select 1
  from public.nooks
  where nooks.id = stamps.nook_id
);

alter table public.stamps
  add constraint stamps_nook_id_fkey
  foreign key (nook_id) references public.nooks(id) on delete cascade;

drop function if exists public.create_passport_check_in(text, integer);

create or replace function public.create_passport_check_in(
  nook_id uuid,
  cooldown_window_minutes integer default 5
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  lock_key bigint;
  effective_cooldown_window_minutes integer := greatest(coalesce(cooldown_window_minutes, 5), 5);
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  lock_key := hashtextextended(current_user_id::text || ':' || $1::text, 0);
  perform pg_advisory_xact_lock(lock_key);

  if exists (
    select 1
    from public.stamps
    where user_id = current_user_id
      and stamps.nook_id = $1
      and stamped_at >= now() - make_interval(mins => effective_cooldown_window_minutes)
  ) then
    return false;
  end if;

  insert into public.stamps (user_id, nook_id)
  values (current_user_id, $1);

  return true;
end;
$$;

grant execute on function public.create_passport_check_in(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Supabase Storage - public nook photo bucket with authenticated uploads
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nook-photos',
  'nook-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nook_photos_storage_public_read" on storage.objects;
create policy "nook_photos_storage_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'nook-photos');

drop policy if exists "nook_photos_storage_authenticated_insert" on storage.objects;
create policy "nook_photos_storage_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'nook-photos');

-- ---------------------------------------------------------------------------
-- seeded_regions - service-role-only seed job tracking
-- ---------------------------------------------------------------------------
create table if not exists public.seeded_regions (
  id uuid primary key default gen_random_uuid(),
  bbox_key text unique not null,
  city_name text,
  status text default 'pending' check (status in ('pending', 'seeding', 'complete', 'failed')),
  venue_count integer default 0,
  triggered_at timestamptz default now(),
  completed_at timestamptz,
  triggered_by_ip text
);

revoke all on table public.seeded_regions from anon, authenticated;
