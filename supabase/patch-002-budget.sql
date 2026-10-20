-- Learning budget: every employee has a monthly budget and buys directly with a company
-- virtual card capped at that budget. Above budget, one click from the direct manager.

create table if not exists budget_settings (
  id int primary key default 1 check (id = 1),
  monthly_amount numeric not null default 250,
  currency text not null default 'ILS',
  rollover boolean not null default false,
  is_placeholder boolean not null default true,   -- L&D sets the real amount
  updated_at timestamptz not null default now()
);
insert into budget_settings (id) values (1) on conflict (id) do nothing;

alter table profiles add column if not exists manager_email text;
alter table items add column if not exists price numeric;      -- null = free
alter table items add column if not exists currency text not null default 'ILS';

create table if not exists purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete set null,
  title text not null,
  url text not null,
  category text not null check (category in ('course','book','tool','event')),
  price numeric not null check (price >= 0),
  currency text not null default 'ILS',
  reason text,
  status text not null check (status in ('auto_approved','pending_manager','approved','declined','purchased')),
  manager_email text,
  approval_token uuid not null default gen_random_uuid(),
  decided_at timestamptz,
  month date not null default date_trunc('month', now())::date,
  is_demo boolean not null default true,  -- no real money moves in the hackathon build
  created_at timestamptz not null default now()
);
create index if not exists purchases_user_month on purchases(user_id, month);

alter table budget_settings enable row level security;
alter table purchases enable row level security;
create policy budget_read on budget_settings for select using (is_zap());
create policy budget_admin on budget_settings for update using (is_admin());
create policy purchases_own on purchases for select using (user_id = auth.uid() or is_admin());

grant insert (manager_email) on public.profiles to authenticated;
grant update (manager_email) on public.profiles to authenticated;

-- Spent = everything approved this month (auto or by the manager). Pending requests don't count yet.
create or replace function public.my_budget() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'monthly_amount', b.monthly_amount,
    'currency', b.currency,
    'is_placeholder', b.is_placeholder,
    'spent', coalesce(sum(p.price) filter (where p.status in ('auto_approved','approved','purchased')), 0),
    'remaining', b.monthly_amount - coalesce(sum(p.price) filter (where p.status in ('auto_approved','approved','purchased')), 0),
    'pending', count(p.id) filter (where p.status = 'pending_manager')
  )
  from budget_settings b
  left join purchases p on p.user_id = auth.uid() and p.month = date_trunc('month', now())::date
  where b.id = 1 and is_zap()
  group by b.monthly_amount, b.currency, b.is_placeholder
$$;

-- Demo prices so the buy flow has something to show (marked demo like the rest of the seed).
update items set price = 89 where is_demo and kind = 'course' and id in (
  select id from items where is_demo and kind = 'course' order by id limit 3);
