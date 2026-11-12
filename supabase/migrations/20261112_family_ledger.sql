-- Dedicated family-ledger tables. Existing public tables are untouched.
create table public.ledger_households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  invite_code uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.ledger_members (
  household_id uuid not null references public.ledger_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.ledger_households(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('expense','income')),
  amount integer not null check (amount > 0 and amount <= 1000000000),
  category text not null check (length(trim(category)) between 1 and 40),
  note text not null default '' check (length(note) <= 300),
  occurred_on date not null,
  created_at timestamptz not null default now()
);
create index ledger_entries_household_date on public.ledger_entries (household_id, occurred_on desc);

alter table public.ledger_households enable row level security;
alter table public.ledger_members enable row level security;
alter table public.ledger_entries enable row level security;

create function public.ledger_is_member(p_household uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.ledger_members where household_id = p_household and user_id = (select auth.uid())) $$;
revoke all on function public.ledger_is_member(uuid) from public, anon;
grant execute on function public.ledger_is_member(uuid) to authenticated;

create policy ledger_household_read on public.ledger_households for select to authenticated
using (public.ledger_is_member(id));
create policy ledger_member_read on public.ledger_members for select to authenticated
using (public.ledger_is_member(household_id));
create policy ledger_entry_read on public.ledger_entries for select to authenticated
using (public.ledger_is_member(household_id));
create policy ledger_entry_create on public.ledger_entries for insert to authenticated
with check (user_id = (select auth.uid()) and public.ledger_is_member(household_id));
create policy ledger_entry_update on public.ledger_entries for update to authenticated
using (user_id = (select auth.uid()) and public.ledger_is_member(household_id))
with check (user_id = (select auth.uid()) and public.ledger_is_member(household_id));
create policy ledger_entry_delete on public.ledger_entries for delete to authenticated
using (user_id = (select auth.uid()) and public.ledger_is_member(household_id));

create function public.ledger_create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if length(trim(p_name)) not between 1 and 60 or length(trim(p_display_name)) not between 1 and 40 then
    raise exception 'Invalid name';
  end if;
  insert into public.ledger_households(name, created_by) values (trim(p_name), auth.uid()) returning id into v_id;
  insert into public.ledger_members(household_id,user_id,display_name) values (v_id,auth.uid(),trim(p_display_name));
  return v_id;
end $$;

create function public.ledger_join_household(p_code uuid, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if length(trim(p_display_name)) not between 1 and 40 then raise exception 'Invalid name'; end if;
  select id into v_id from public.ledger_households where invite_code = p_code;
  if v_id is null then raise exception 'Invalid invitation code'; end if;
  insert into public.ledger_members(household_id,user_id,display_name)
  values (v_id,auth.uid(),trim(p_display_name))
  on conflict (household_id,user_id) do nothing;
  return v_id;
end $$;
revoke all on function public.ledger_create_household(text,text) from public, anon;
revoke all on function public.ledger_join_household(uuid,text) from public, anon;
grant execute on function public.ledger_create_household(text,text), public.ledger_join_household(uuid,text) to authenticated;
grant select on public.ledger_households, public.ledger_members to authenticated;
grant select, insert, update, delete on public.ledger_entries to authenticated;
