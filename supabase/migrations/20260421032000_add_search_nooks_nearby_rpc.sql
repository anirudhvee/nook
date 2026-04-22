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
    nooks.address,
    nooks.type,
    nooks.city,
    nooks.region,
    nooks.country,
    nooks.website,
    nooks.phone,
    nooks.operating_status,
    nooks.seed_run_id,
    ST_Distance(nooks.location, origin.point) as distance_meters
  from public.nooks
  cross join origin
  where ST_DWithin(
    nooks.location,
    origin.point,
    least(greatest(coalesce(p_radius_meters, 1500), 1), 50000)
  )
    and coalesce(nooks.operating_status, '') != 'permanently_closed'
    and (p_type is null or p_type = 'all' or nooks.type = p_type)
  order by distance_meters asc, nooks.name asc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

grant execute on function public.search_nooks_nearby(
  double precision,
  double precision,
  integer,
  text,
  integer
) to anon, authenticated;
