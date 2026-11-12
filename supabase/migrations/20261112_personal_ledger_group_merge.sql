-- Existing rows retain their household_id for provenance; every row belongs to its creator.
alter table public.ledger_entries alter column household_id drop not null;

create index if not exists ledger_entries_user_date
  on public.ledger_entries (user_id, occurred_on desc);

create policy ledger_entry_personal_read on public.ledger_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy ledger_entry_personal_create on public.ledger_entries
  for insert to authenticated with check
  (user_id = (select auth.uid()) and household_id is null);
create policy ledger_entry_personal_update on public.ledger_entries
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and household_id is null);
create policy ledger_entry_personal_delete on public.ledger_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- A group member may request the combined ledger of that group only.
-- The function does not expose carrier codes or users outside the requested group.
create function public.ledger_group_entries(p_household uuid, p_from date, p_to date)
returns setof public.ledger_entries
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.ledger_is_member(p_household) then
    raise exception 'Not a group member';
  end if;
  return query
  select e.* from public.ledger_entries e
  where e.user_id in
    (select m.user_id from public.ledger_members m where m.household_id = p_household)
    and e.occurred_on >= p_from and e.occurred_on < p_to
  order by e.occurred_on desc, e.created_at desc;
end $$;
revoke all on function public.ledger_group_entries(uuid,date,date) from public, anon;
grant execute on function public.ledger_group_entries(uuid,date,date) to authenticated;
