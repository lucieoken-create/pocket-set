-- Pocket Set: run this complete file in the Supabase SQL editor.
-- Safe for a fresh project or the existing Pocket Set table; never deletes rows.
-- user_id stays text to preserve older installations. Supabase Auth UUIDs are
-- compared as text by RLS. Use only the publishable key in the browser.

create table if not exists public.pocket_set_weights (
  user_id text not null check (length(user_id) between 1 and 200),
  area text not null check (area in ('Chest','Back','Shoulders','Arms','Lower Body')),
  weight numeric not null check (weight between 0 and 300),
  date timestamptz not null,
  primary key (user_id, area)
);
alter table public.pocket_set_weights enable row level security;
revoke all on public.pocket_set_weights from public, anon, authenticated;
grant select, insert, update on public.pocket_set_weights to authenticated;
grant all on public.pocket_set_weights to service_role;

drop policy if exists pocket_set_select_own on public.pocket_set_weights;
create policy pocket_set_select_own on public.pocket_set_weights
for select to authenticated using (user_id = (select auth.uid())::text);
drop policy if exists pocket_set_insert_own on public.pocket_set_weights;
create policy pocket_set_insert_own on public.pocket_set_weights
for insert to authenticated with check (
  user_id = (select auth.uid())::text
  and weight between 0 and 200 and mod(weight, 0.5) = 0
  and isfinite(date) and date >= '1970-01-01T00:00:00Z'::timestamptz
  and date <= now() + interval '5 minutes'
);
drop policy if exists pocket_set_update_own on public.pocket_set_weights;
create policy pocket_set_update_own on public.pocket_set_weights
for update to authenticated using (user_id = (select auth.uid())::text)
with check (
  user_id = (select auth.uid())::text
  and weight between 0 and 200 and mod(weight, 0.5) = 0
  and isfinite(date) and date >= '1970-01-01T00:00:00Z'::timestamptz
  and date <= now() + interval '5 minutes'
);

-- RPC argument: {p_entries: [{area: "Chest", weight: 20.5, date: ISO_STRING}]}
-- [] fetches current rows. Equal/older timestamps leave cloud values unchanged.
create or replace function public.merge_my_pocket_set_weights(p_entries jsonb)
returns setof public.pocket_set_weights
language plpgsql security invoker set search_path = ''
as $function$
declare
  v_user_id text := auth.uid()::text;
  v_entry jsonb;
  v_area text;
  v_weight numeric;
  v_date timestamptz;
  v_seen text[] := array[]::text[];
begin
  if v_user_id is null then
    raise exception 'Sign in to sync weights' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Entries must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 5 then
    raise exception 'At most five entries are allowed' using errcode = '22023';
  end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry->'area') is distinct from 'string'
      or jsonb_typeof(v_entry->'weight') is distinct from 'number'
      or jsonb_typeof(v_entry->'date') is distinct from 'string'
      or (v_entry - 'area' - 'weight' - 'date') <> '{}'::jsonb then
      raise exception 'Each entry must contain only area, numeric weight and date' using errcode = '22023';
    end if;
    v_area := v_entry->>'area';
    if v_area not in ('Chest','Back','Shoulders','Arms','Lower Body')
      or v_area = any(v_seen) then
      raise exception 'Invalid or duplicate area' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_area);
    v_weight := (v_entry->>'weight')::numeric;
    if v_weight < 0 or v_weight > 200 or mod(v_weight, 0.5) <> 0 then
      raise exception 'Weight must be 0 to 200 in half-pound steps' using errcode = '22023';
    end if;
    if (v_entry->>'date') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
      raise exception 'Date must be an ISO timestamp with timezone' using errcode = '22023';
    end if;
    v_date := (v_entry->>'date')::timestamptz;
    if not isfinite(v_date) or v_date < '1970-01-01T00:00:00Z'::timestamptz
      or v_date > now() + interval '5 minutes' then
      raise exception 'Date is outside the permitted range' using errcode = '22023';
    end if;
    insert into public.pocket_set_weights as current_weights(user_id,area,weight,date)
    values (v_user_id,v_area,v_weight,v_date)
    on conflict (user_id,area) do update
      set weight=excluded.weight,date=excluded.date
      where excluded.date > current_weights.date;
  end loop;
  return query select w.* from public.pocket_set_weights as w
    where w.user_id = v_user_id order by w.area;
end;
$function$;
revoke all on function public.merge_my_pocket_set_weights(jsonb) from public, anon;
grant execute on function public.merge_my_pocket_set_weights(jsonb) to authenticated;

-- Preserve the old server-only RPC if this project already has it.
do $block$
begin
  if to_regprocedure('public.merge_pocket_set_weights(text,jsonb)') is not null then
    execute 'revoke all on function public.merge_pocket_set_weights(text,jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.merge_pocket_set_weights(text,jsonb) to service_role';
  end if;
end;
$block$;

