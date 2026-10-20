-- Five more ideas from the team: avatars, podcasts, learning time, drive mode, "send me this at".

-- 1. Podcasts are a content kind with real audio.
alter table items drop constraint if exists items_kind_check;
alter table items add constraint items_kind_check check (kind in ('course','news','internal','podcast'));
alter table items add column if not exists audio_url text;
alter table sources drop constraint if exists sources_kind_check;
alter table sources add constraint sources_kind_check check (kind in ('youtube_playlist','youtube_channel','rss','podcast','edx','skillshop','linkedin_learning','udemy_business'));

insert into sources (name, kind, ref, topic_slug, status) values
  ('Marketing School · Neil Patel & Eric Siu', 'podcast', 'https://feeds.megaphone.fm/ESHO5419936864', 'digital-marketing', 'active'),
  ('PPC Daily', 'podcast', 'https://rss.buzzsprout.com/157044.rss', 'ppc', 'active'),
  ('Search with LLM Visibility', 'podcast', 'https://rss.buzzsprout.com/2019013.rss', 'geo-ecommerce', 'active'),
  ('Ecommerce Marketing School · Privy', 'podcast', 'https://feeds.transistor.fm/ecommerce-marketing-school', 'geo-ecommerce', 'active'),
  ('Decoding AI for Marketing', 'podcast', 'https://feeds.simplecast.com/Rz_NWJDG', 'data-ai', 'active'),
  ('Social Media Marketing for Small Businesses', 'podcast', 'https://feed.podbean.com/socialmediamarketingforsmallbusiness/feed.xml', 'social', 'active'),
  ('The Customer Experience Podcast', 'podcast', 'https://www.spreaker.com/show/5718631/episodes/feed', 'cx', 'active')
on conflict (kind, ref) do nothing;

-- Podcasts join every lane.
create or replace function public.feed(p_limit int default 30, p_topic text default null, p_kind text default null)
returns table (id bigint, score numeric, popular_with text, shared_by text)
language sql stable security definer set search_path = public as $$
  with me as (select role, topics from profiles where user_id = auth.uid()),
  sig as (
    select r.item_id,
      count(*) filter (where r.value = 1 and p.role = (select role from me)) as likes_role,
      count(*) filter (where r.value = -1 and p.role = (select role from me)) as dislikes_role
    from reactions r join profiles p on p.user_id = r.user_id group by r.item_id
  ),
  sh as (
    select distinct on (s.item_id) s.item_id, coalesce(p.display_name, split_part(p.email,'@',1)) as by_name
    from shares s join profiles p on p.user_id = s.from_user
    where s.to_user = auth.uid() and s.at > now() - interval '14 days' order by s.item_id, s.at desc
  )
  select i.id,
    round((
      case when i.topic_slug = any(coalesce((select topics from me), '{}'::text[])) then 3 else 0 end
      + 2 * exp(-extract(epoch from now() - coalesce(i.published_at, i.created_at)) / (14 * 86400))
      + 0.5 * ln(1 + i.likes) - 0.5 * ln(1 + i.dislikes)
      + 1.0 * ln(1 + coalesce(sig.likes_role, 0)) - 1.0 * ln(1 + coalesce(sig.dislikes_role, 0))
      + 0.7 * ln(1 + i.comments_count) + 0.8 * ln(1 + i.shares_count)
      + 0.3 * ln(1 + i.opens) + 0.6 * ln(1 + i.saves)
      + case when sh.item_id is not null then 5 else 0 end
    )::numeric, 3),
    case when coalesce(sig.likes_role, 0) >= 2 then (select role from me) end,
    sh.by_name
  from items i
  left join sig on sig.item_id = i.id
  left join sh on sh.item_id = i.id
  where is_zap() and i.status = 'approved' and i.kind in ('course','news','podcast')
    and (p_topic is null or i.topic_slug = p_topic)
    and (p_kind is null or i.kind = p_kind)
    and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  order by 2 desc
  limit p_limit
$$;

create or replace function public.discover(p_limit int default 9)
returns table (id bigint, score numeric, reason text)
language sql stable security definer set search_path = public as $$
  with me as (select role, topics from profiles where user_id = auth.uid()),
  peers as (select user_id from profiles where role = (select role from me) and user_id <> auth.uid()),
  eng as (
    select item_id, count(*) as n from (
      select item_id from reactions where value = 1 and user_id in (select user_id from peers)
      union all select item_id from saves where user_id in (select user_id from peers)
      union all select item_id from events where type = 'open' and user_id in (select user_id from peers) and at > now() - interval '30 days'
    ) x group by item_id
  )
  select i.id,
    round((2 * ln(1 + coalesce(eng.n, 0)) + 0.5 * ln(1 + i.likes) - 0.5 * ln(1 + i.dislikes) + 0.3 * ln(1 + i.opens)
      + exp(-extract(epoch from now() - coalesce(i.published_at, i.created_at)) / (21 * 86400)))::numeric, 3),
    case when coalesce(eng.n, 0) >= 2 then 'אנשים בתפקיד שלך מתעניינים בזה' else 'משהו מחוץ לנושאים שבחרת' end
  from items i left join eng on eng.item_id = i.id
  where is_zap() and i.status = 'approved' and i.kind in ('course','news','podcast')
    and not (i.topic_slug = any(coalesce((select topics from me), '{}'::text[])))
    and not exists (select 1 from reactions r where r.item_id = i.id and r.user_id = auth.uid() and r.value = -1)
    and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  order by 2 desc limit p_limit
$$;

create or replace function public.trending(p_limit int default 6)
returns table (id bigint, views bigint)
language sql stable security definer set search_path = public as $$
  select i.id, coalesce(w.n, 0) + 0 as views
  from items i
  left join (select item_id, count(*) n from events where type = 'open' and at > now() - interval '7 days' group by item_id) w
    on w.item_id = i.id
  where is_zap() and i.status = 'approved' and i.kind in ('course','news','podcast')
    and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  order by coalesce(w.n, 0) desc, i.opens desc, i.likes desc
  limit p_limit
$$;

create or replace function public.quick_bites(p_limit int default 12)
returns table (id bigint, minutes int)
language sql stable security definer set search_path = public as $$
  select i.id, i.minutes from items i
  where is_zap() and i.status = 'approved' and i.kind in ('course','news','podcast') and i.minutes <= 10
    and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  order by (i.topic_slug = any(coalesce((select topics from profiles where user_id = auth.uid()), '{}'::text[]))) desc,
           i.likes + i.opens desc, coalesce(i.published_at, i.created_at) desc
  limit p_limit
$$;

-- 2. Avatars: an uploaded picture or a generated character (style), plus the brand color.
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists avatar_style text;
grant insert (avatar_url, avatar_style) on public.profiles to authenticated;
grant update (avatar_url, avatar_style) on public.profiles to authenticated;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Faces for any list of people (leaderboard, comments, shares).
create or replace function public.faces(p_ids uuid[])
returns table (user_id uuid, name text, avatar_url text, avatar_style text, avatar_color text, team text)
language sql stable security definer set search_path = public as $$
  select p.user_id, coalesce(p.display_name, split_part(p.email, '@', 1)), p.avatar_url, p.avatar_style, p.avatar_color, p.role
  from profiles p where is_zap() and p.user_id = any(p_ids)
$$;

-- 3. Learning time: "יש לי X דקות" packs the best items that fit, optionally audio only (drive mode).
create or replace function public.fit_time(p_minutes int, p_audio_only boolean default false)
returns table (id bigint, minutes int)
language plpgsql stable security definer set search_path = public as $$
declare left_min int := p_minutes; r record;
begin
  if not is_zap() then return; end if;
  for r in
    select f.id, i.minutes, f.score from feed(120) f join items i on i.id = f.id
    where i.minutes is not null and i.minutes <= p_minutes
      and (not p_audio_only or i.kind in ('podcast','news') or i.audio_url is not null)
    order by (i.kind = 'podcast' and p_audio_only) desc, f.score desc
  loop
    if r.minutes <= left_min then
      id := r.id; minutes := r.minutes; left_min := left_min - r.minutes; return next;
    end if;
    exit when left_min < 3;
  end loop;
end $$;

-- 4. Personal podcast feed: a private link per person for Spotify / Apple Podcasts.
alter table profiles add column if not exists podcast_token uuid not null default gen_random_uuid();
create or replace function public.my_podcast_token() returns uuid
language sql stable security definer set search_path = public as $$
  select podcast_token from profiles where user_id = auth.uid() and is_zap()
$$;
create table if not exists listen_later (
  user_id uuid references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table listen_later enable row level security;
drop policy if exists listen_later_own on listen_later;
create policy listen_later_own on listen_later for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_zap());

-- 5. "שלחו לי את זה ב..." — a link by email at the time I chose (checked every few minutes).
create table if not exists reminders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  doc_id bigint references team_docs(id) on delete cascade,
  send_at timestamptz not null,
  note text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table reminders enable row level security;
drop policy if exists reminders_own on reminders;
create policy reminders_own on reminders for select using (user_id = auth.uid());
drop policy if exists reminders_delete on reminders;
create policy reminders_delete on reminders for delete using (user_id = auth.uid() and sent_at is null);
create or replace function public.schedule_reminder(p_item bigint, p_doc bigint, p_at timestamptz, p_note text default null)
returns reminders language plpgsql security definer set search_path = public as $$
declare r reminders;
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  if p_at < now() - interval '1 minute' then raise exception 'time in the past'; end if;
  insert into reminders(user_id, item_id, doc_id, send_at, note) values (auth.uid(), p_item, p_doc, p_at, p_note) returning * into r;
  return r;
end $$;

-- Leaderboard rows carry faces too.
drop function if exists public.leaderboard(text, text, int);
create or replace function public.leaderboard(p_period text default 'month', p_scope text default 'people', p_limit int default 20)
returns table (rank bigint, name text, team text, points bigint, members bigint, is_me boolean,
  user_id uuid, avatar_url text, avatar_style text, avatar_color text)
language sql stable security definer set search_path = public as $$
  with pts as (
    select l.user_id, sum(l.pts)::bigint as points from points_ledger l
    where p_period = 'all' or l.at >= date_trunc('month', now() at time zone 'Asia/Jerusalem')
    group by l.user_id
  ),
  people as (
    select coalesce(pr.display_name, split_part(pr.email, '@', 1)) as name, coalesce(pr.role, 'אחר') as team,
           p.points, 1::bigint as members, pr.user_id = auth.uid() as is_me,
           pr.user_id, pr.avatar_url, pr.avatar_style, pr.avatar_color
    from pts p join profiles pr on pr.user_id = p.user_id
  ),
  teams as (
    select team as name, team, round(avg(points))::bigint as points, count(*)::bigint as members,
           bool_or(is_me) as is_me, null::uuid as user_id, null::text as avatar_url, null::text as avatar_style, null::text as avatar_color
    from people group by team
  )
  select rank() over (order by points desc), x.name, x.team, x.points, x.members, x.is_me, x.user_id, x.avatar_url, x.avatar_style, x.avatar_color
  from (select * from people where p_scope = 'people' union all select * from teams where p_scope = 'teams') x
  where is_zap()
  order by x.points desc limit p_limit
$$;

-- Demo colleagues get generated characters.
update profiles set avatar_style = 'character' where is_demo and avatar_style is null;
