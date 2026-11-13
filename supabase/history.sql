-- Pocket Set: weight history.
-- Run after schema.sql. Additive only: it does not change pocket_set_weights,
-- its policies, or merge_my_pocket_set_weights, and it never deletes rows.
-- Every time a body area's weight changes (from any device), a row is copied
-- into pocket_set_weight_history. Saving the same weight again adds nothing.

create table if not exists public.pocket_set_weight_history (
  id bigint generated always as identity primary key,
  user_id text not null check (length(user_id) between 1 and 200),
  area text not null check (area in ('Chest','Back','Shoulders','Arms','Lower Body')),
  weight numeric not null check (weight between 0 and 300),
  date timestamptz not null,
  recorded_at timestamptz not null default now()
);
create index if not exists pocket_set_weight_history_user_area_date
  on public.pocket_set_weight_history (user_id, area, date);

-- Users can read only their own history. Nobody writes to it through the API;
-- only the trigger below adds rows.
alter table public.pocket_set_weight_history enable row level security;
revoke all on public.pocket_set_weight_history from public, anon, authenticated;
grant select on public.pocket_set_weight_history to authenticated;
grant all on public.pocket_set_weight_history to service_role;

drop policy if exists pocket_set_history_select_own on public.pocket_set_weight_history;
create policy pocket_set_history_select_own on public.pocket_set_weight_history
  for select to authenticated using (user_id = (select auth.uid())::text);

-- Security definer so the trigger can insert even though users have no insert grant.
-- It is a trigger function, so it cannot be called directly through the API.
create or replace function public.pocket_set_log_weight_history()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' or new.weight is distinct from old.weight then
    insert into public.pocket_set_weight_history (user_id, area, weight, date)
    values (new.user_id, new.area, new.weight, new.date);
  end if;
  return new;
end;
$fn$;
revoke all on function public.pocket_set_log_weight_history() from public, anon, authenticated;

drop trigger if exists pocket_set_log_weight_history on public.pocket_set_weights;
create trigger pocket_set_log_weight_history
  after insert or update on public.pocket_set_weights
  for each row execute function public.pocket_set_log_weight_history();

-- One-time starting point: the weights saved today.
insert into public.pocket_set_weight_history (user_id, area, weight, date)
select w.user_id, w.area, w.weight, w.date
from public.pocket_set_weights w
where not exists (
  select 1 from public.pocket_set_weight_history h
  where h.user_id = w.user_id and h.area = w.area
);

-- To undo:
--   drop trigger if exists pocket_set_log_weight_history on public.pocket_set_weights;
--   drop function if exists public.pocket_set_log_weight_history();
--   drop table if exists public.pocket_set_weight_history;
