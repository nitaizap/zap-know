-- Hard AI spending cap. Every Gemini call is recorded with a conservative cost estimate;
-- once the total reaches the cap, every function stops calling the AI (no exceptions).
create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  fn text not null,
  model text,
  in_tokens int not null default 0,
  out_tokens int not null default 0,
  cost_usd numeric not null default 0
);
alter table ai_usage enable row level security;  -- service role only

-- Cap and conservative prices (USD per 1M tokens). Real prices are lower, so the cap trips early.
insert into app_settings (key, value) values
  ('ai_cap_usd', '4.5'),
  ('price_text_in', '0.5'),
  ('price_text_out', '3'),
  ('price_tts_in', '1'),
  ('price_tts_out', '20')
on conflict (key) do nothing;

create or replace function public.ai_spent() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from ai_usage
$$;
revoke execute on function public.ai_spent() from public, anon, authenticated;
grant execute on function public.ai_spent() to service_role;
