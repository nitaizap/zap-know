-- Plain settings the functions read at runtime (no secrets here).
create table if not exists app_settings (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table app_settings enable row level security;  -- no policies: service role only
insert into app_settings (key, value) values ('sender_email', 'zweig.nitai@gmail.com')
  on conflict (key) do update set value = excluded.value, updated_at = now();
