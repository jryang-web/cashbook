-- Family group creator is the administrator. Personal entries stay owned by their author.
create table public.ledger_admin_audit (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.ledger_households(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
alter table public.ledger_admin_audit enable row level security;
create policy ledger_admin_audit_owner_read on public.ledger_admin_audit
  for select to authenticated using (
    exists (select 1 from public.ledger_households h
      where h.id = household_id and h.created_by = (select auth.uid()))
  );
grant select on public.ledger_admin_audit to authenticated;

create function public.ledger_admin_group(p_household uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 60 then raise exception 'Invalid name'; end if;
  select h.name into old_name from public.ledger_households h
  where h.id = p_household and h.created_by = auth.uid() for update;
  if not found then raise exception 'Administrator access required'; end if;
  update public.ledger_households set name = trim(p_name) where id = p_household;
  insert into public.ledger_admin_audit(household_id,actor_id,action,before_data,after_data)
  values (p_household,auth.uid(),'rename_group',jsonb_build_object('name',old_name),jsonb_build_object('name',trim(p_name)));
end $$;

create function public.ledger_admin_member(p_household uuid, p_user uuid, p_name text, p_remove boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.ledger_households h where h.id=p_household and h.created_by=auth.uid()
  ) then raise exception 'Administrator access required'; end if;
  if p_user = auth.uid() and p_remove then raise exception 'Creator cannot be removed'; end if;
  select m.display_name into old_name from public.ledger_members m
    where m.household_id=p_household and m.user_id=p_user for update;
  if not found then raise exception 'Member not found'; end if;
  if p_remove then
    delete from public.ledger_members where household_id=p_household and user_id=p_user;
  else
    if p_name is null or length(trim(p_name)) not between 1 and 40 then raise exception 'Invalid name'; end if;
    update public.ledger_members set display_name=trim(p_name)
      where household_id=p_household and user_id=p_user;
  end if;
  insert into public.ledger_admin_audit(household_id,actor_id,action,target_id,before_data,after_data)
  values (p_household,auth.uid(),case when p_remove then 'remove_member' else 'rename_member' end,
    p_user,jsonb_build_object('display_name',old_name),
    case when p_remove then null else jsonb_build_object('display_name',trim(p_name)) end);
end $$;

create function public.ledger_admin_entry(p_household uuid, p_entry uuid, p_kind text,
  p_amount integer, p_category text, p_note text, p_occurred_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.ledger_entries;
begin
  if auth.uid() is null or not exists (
    select 1 from public.ledger_households h where h.id=p_household and h.created_by=auth.uid()
  ) then raise exception 'Administrator access required'; end if;
  select e.* into previous from public.ledger_entries e
    join public.ledger_members m on m.user_id=e.user_id and m.household_id=p_household
    where e.id=p_entry for update of e;
  if not found then raise exception 'Entry not found in group'; end if;
  if p_kind not in ('expense','income') or p_amount is null or p_amount not between 1 and 1000000000
    or p_category is null or length(trim(p_category)) not between 1 and 40
    or p_note is null or length(p_note)>300 or p_occurred_on is null then
    raise exception 'Invalid entry';
  end if;
  update public.ledger_entries set kind=p_kind,amount=p_amount,category=trim(p_category),
    note=p_note,occurred_on=p_occurred_on where id=p_entry;
  insert into public.ledger_admin_audit(household_id,actor_id,action,target_id,before_data,after_data)
  values (p_household,auth.uid(),'edit_entry',p_entry,
    jsonb_build_object('kind',previous.kind,'amount',previous.amount,'category',previous.category,'note',previous.note,'occurred_on',previous.occurred_on),
    jsonb_build_object('kind',p_kind,'amount',p_amount,'category',trim(p_category),'note',p_note,'occurred_on',p_occurred_on));
end $$;

revoke all on function public.ledger_admin_group(uuid,text) from public,anon;
revoke all on function public.ledger_admin_member(uuid,uuid,text,boolean) from public,anon;
revoke all on function public.ledger_admin_entry(uuid,uuid,text,integer,text,text,date) from public,anon;
grant execute on function public.ledger_admin_group(uuid,text),
  public.ledger_admin_member(uuid,uuid,text,boolean),
  public.ledger_admin_entry(uuid,uuid,text,integer,text,text,date) to authenticated;
