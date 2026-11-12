create table if not exists public.ledger_carriers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  carrier_code text not null check (carrier_code ~ '^/[0-9A-Z.+-]{7}$'),
  updated_at timestamptz not null default now()
);

alter table public.ledger_carriers enable row level security;

create policy "Users read own carrier" on public.ledger_carriers
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own carrier" on public.ledger_carriers
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own carrier" on public.ledger_carriers
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.ledger_carriers to authenticated;
