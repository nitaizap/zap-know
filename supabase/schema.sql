-- zap KNOW schema. Pipelines write with the service role (bypasses RLS);
-- employees read/write only their own rows, and only with a @d.co.il login.

create extension if not exists pg_trgm;

create or replace function public.is_zap() returns boolean
language sql stable as $$
  select coalesce(auth.jwt()->>'email', '') ilike '%@d.co.il'
$$;


-- Topics (skills) are the main navigation; verticals are tags on items.
create table if not exists topics (
  slug text primary key,
  name_he text not null,
  blurb_he text,
  status text not null default 'soon' check (status in ('live','soon')),
  sort int not null default 0
);

-- Where content comes from. The engine proposes new ones; L&D approves.
create table if not exists sources (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null check (kind in ('youtube_playlist','youtube_channel','rss','edx','skillshop','linkedin_learning','udemy_business')),
  ref text not null,               -- playlist id / feed url / catalog id
  topic_slug text references topics(slug),
  status text not null default 'active' check (status in ('active','proposed','dropped')),
  score numeric not null default 0,
  reason_he text,                  -- why the engine proposed/dropped it
  created_at timestamptz not null default now(),
  unique (kind, ref)
);

-- One row per course / news item / internal project.
create table if not exists items (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('course','news','internal')),
  topic_slug text references topics(slug),
  verticals text[] not null default '{}',
  title_he text not null,
  title_orig text,
  summary_he text,
  why_he text,                     -- "למה זה שווה לך" one-liner
  lesson_plan jsonb not null default '[]',  -- [{title_he, title_orig, minutes}]
  source_id bigint references sources(id),
  source_name text not null,
  source_url text not null,
  published_at timestamptz,
  summarized_at timestamptz,
  ai_summarized boolean not null default true,
  status text not null default 'pending' check (status in ('pending','approved','rejected','broken')),
  hot_week date,                   -- set when chosen as one of the week's top 3
  link_checked_at timestamptz,
  opens int not null default 0,
  saves int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_url)
);
create index if not exists items_topic on items(topic_slug, status);
create index if not exists items_trgm on items using gin ((title_he || ' ' || coalesce(title_orig,'') || ' ' || coalesce(summary_he,'')) gin_trgm_ops);

-- Internal knowledge: how each team actually works.
create table if not exists team_profiles (
  id bigint generated always as identity primary key,
  team text not null unique,
  vertical text,
  summary_he text not null,
  tools jsonb not null default '[]',      -- [{name, what_for_he}]
  resources jsonb not null default '[]',  -- [{name, url, system}]  name+link only
  processes_he text,
  contact_name text,
  contact_email text,
  is_demo boolean not null default true,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text,
  topics text[] not null default '{}',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and is_admin)
$$;

create table if not exists saves (
  user_id uuid references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Lesson ticks: our only progress signal (courses live on external sites).
create table if not exists progress (
  user_id uuid references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  lessons_done int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  type text not null check (type in ('open','save','click_source')),
  at timestamptz not null default now()
);

create table if not exists reports (
  id bigint generated always as identity primary key,
  item_id bigint references items(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  note text,
  resolved boolean not null default false,
  at timestamptz not null default now()
);

-- Action log for every pipeline run; failures also alert the owner.
create table if not exists run_log (
  id bigint generated always as identity primary key,
  job text not null,
  ok boolean not null,
  detail jsonb,
  at timestamptz not null default now()
);

create table if not exists episodes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  week date not null,
  body_he text not null,
  item_ids bigint[] not null default '{}',
  audio_url text,
  sent_at timestamptz,
  unique (user_id, week)
);

-- RLS
alter table topics enable row level security;
alter table sources enable row level security;
alter table items enable row level security;
alter table team_profiles enable row level security;
alter table profiles enable row level security;
alter table saves enable row level security;
alter table progress enable row level security;
alter table events enable row level security;
alter table reports enable row level security;
alter table run_log enable row level security;
alter table episodes enable row level security;

create policy topics_read on topics for select using (is_zap());
create policy sources_read on sources for select using (is_zap());
create policy sources_admin on sources for update using (is_admin());
create policy items_read on items for select using (is_zap() and (status = 'approved' or is_admin()));
create policy items_admin on items for update using (is_admin());
create policy teams_read on team_profiles for select using (is_zap());
create policy profiles_own on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_zap());
create policy saves_own on saves for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy progress_own on progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy events_insert on events for insert with check (user_id = auth.uid());
create policy reports_insert on reports for insert with check (user_id = auth.uid());
create policy reports_admin on reports for select using (is_admin());
create policy runlog_admin on run_log for select using (is_admin());
create policy episodes_own on episodes for select using (user_id = auth.uid());

-- A reported item is hidden from everyone until L&D looks at it again.
create or replace function public.report_item(p_item bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  insert into reports(item_id, user_id, note) values (p_item, auth.uid(), p_note);
  update items set status = 'pending' where id = p_item;
end $$;

create or replace function public.track(p_item bigint, p_type text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  insert into events(user_id, item_id, type) values (auth.uid(), p_item, p_type);
  if p_type = 'open' then update items set opens = opens + 1 where id = p_item;
  elsif p_type = 'save' then update items set saves = saves + 1 where id = p_item;
  end if;
end $$;

insert into topics(slug, name_he, blurb_he, status, sort) values
  ('digital-marketing','שיווק דיגיטלי','איך מביאים אנשים, ואיך יודעים שזה עבד','live',1),
  ('ppc','PPC','קמפיינים ממומנים שמביאים פניות, לא רק קליקים','live',2),
  ('social','סושיאל','תוכן שעוצר את הגלילה, ומה עושים איתו אחר כך','live',3),
  ('geo-ecommerce','GEO ואיקומרס','איך מופיעים בתשובות של AI, ואיך מוכרים אונליין','live',4),
  ('data-ai','דאטה ו-AI','מהגיליון ועד הסוכן, בלי לפחד מהמספרים','live',5),
  ('behavioral-econ','כלכלה התנהגותית','למה אנשים בוחרים מה שהם בוחרים','soon',6),
  ('decisions','קבלת החלטות','לבחור מהר יותר, ולטעות פחות','soon',7),
  ('cx','חוויית לקוח','מה קורה מהרגע שמישהו פונה אלינו','soon',8)
on conflict (slug) do nothing;
