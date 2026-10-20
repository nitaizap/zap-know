-- Richer onboarding: where people sit, how they like to learn, their goal and how to reach them.
-- patch-001 revoked table-level insert/update on profiles, so each new column is granted explicitly.

alter table profiles add column if not exists vertical text;
alter table profiles add column if not exists seniority text;
alter table profiles add column if not exists formats text[] not null default '{}';
alter table profiles add column if not exists weekly_time text;
alter table profiles add column if not exists english_ok boolean;
alter table profiles add column if not exists goal text;
alter table profiles add column if not exists notify_channel text;
alter table profiles add column if not exists notify_day int check (notify_day between 0 and 6);
alter table profiles add column if not exists avatar_color text;
alter table profiles add column if not exists onboarded_at timestamptz;

grant insert (vertical, seniority, formats, weekly_time, english_ok, goal, notify_channel, notify_day, avatar_color, onboarded_at)
  on public.profiles to authenticated;
grant update (vertical, seniority, formats, weekly_time, english_ok, goal, notify_channel, notify_day, avatar_color, onboarded_at)
  on public.profiles to authenticated;
