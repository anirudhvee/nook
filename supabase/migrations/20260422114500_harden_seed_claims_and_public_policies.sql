-- ---------------------------------------------------------------------------
-- Seed claim refreshes and public policy hardening
-- ---------------------------------------------------------------------------

drop function if exists public.claim_seeded_region(text, text, text, interval);

create or replace function public.claim_seeded_region(
  p_bbox_key text,
  p_city_name text default null,
  p_triggered_by_ip text default null,
  p_active_window interval default interval '30 minutes',
  p_force boolean default false
)
returns table (
  bbox_key text,
  status text,
  venue_count integer,
  triggered_at timestamptz,
  should_dispatch boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_row public.seeded_regions%rowtype;
  now_utc timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bbox_key, 0));

  select *
  into current_row
  from public.seeded_regions
  where seeded_regions.bbox_key = p_bbox_key
  for update;

  if not found then
    insert into public.seeded_regions (
      bbox_key,
      city_name,
      status,
      venue_count,
      triggered_at,
      completed_at,
      triggered_by_ip
    )
    values (
      p_bbox_key,
      p_city_name,
      'seeding',
      0,
      now_utc,
      null,
      p_triggered_by_ip
    )
    returning * into current_row;

    return query
    select current_row.bbox_key, current_row.status, current_row.venue_count, current_row.triggered_at, true;
    return;
  end if;

  if current_row.status in ('pending', 'seeding')
    and current_row.triggered_at is not null
    and current_row.triggered_at >= now_utc - p_active_window then
    return query
    select current_row.bbox_key, current_row.status, current_row.venue_count, current_row.triggered_at, false;
    return;
  end if;

  if current_row.status = 'complete' and not p_force then
    return query
    select current_row.bbox_key, current_row.status, current_row.venue_count, current_row.triggered_at, false;
    return;
  end if;

  update public.seeded_regions
  set
    city_name = coalesce(p_city_name, city_name),
    status = 'seeding',
    triggered_at = now_utc,
    completed_at = null,
    triggered_by_ip = p_triggered_by_ip
  where id = current_row.id
  returning * into current_row;

  return query
  select current_row.bbox_key, current_row.status, current_row.venue_count, current_row.triggered_at, true;
end;
$$;

-- Community write flows are not shipped yet. Keep direct table writes private
-- until moderation/ownership APIs exist, while service-role seeding still works.
drop policy if exists "nook_details_insert_authenticated" on public.nook_details;
drop policy if exists "nook_details_update_authenticated" on public.nook_details;

drop policy if exists "work_signal_reports_select_public" on public.work_signal_reports;
drop policy if exists "work_signal_reports_select_own" on public.work_signal_reports;
create policy "work_signal_reports_select_own"
  on public.work_signal_reports for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "nook_overrides_select_public" on public.nook_overrides;
drop policy if exists "nook_overrides_select_own" on public.nook_overrides;
create policy "nook_overrides_select_own"
  on public.nook_overrides for select
  to authenticated
  using (updated_by = auth.uid());

update storage.buckets
set public = false
where id = 'nook-photos';

drop policy if exists "nook_photos_storage_public_read" on storage.objects;
drop policy if exists "nook_photos_storage_authenticated_insert" on storage.objects;
