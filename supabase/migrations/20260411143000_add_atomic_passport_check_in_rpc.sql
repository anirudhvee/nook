-- =============================================================================
-- Atomically enforce passport check-in cooldowns
-- =============================================================================

create or replace function public.create_passport_check_in(
  place_id text,
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

  lock_key := hashtextextended(current_user_id::text || ':' || place_id, 0);
  perform pg_advisory_xact_lock(lock_key);

  if exists (
    select 1
    from public.stamps
    where user_id = current_user_id
      and nook_id = place_id
      and stamped_at >= now() - make_interval(mins => effective_cooldown_window_minutes)
  ) then
    return false;
  end if;

  insert into public.stamps (user_id, nook_id)
  values (current_user_id, place_id);

  return true;
end;
$$;

grant execute on function public.create_passport_check_in(text, integer) to authenticated;
