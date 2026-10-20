-- Social-media layer: thumbnails, inline video previews, and "לא בשבילי" (swipe left).
alter table items add column if not exists thumbnail_url text;
alter table items add column if not exists preview_video_id text;

create table if not exists hides (
  user_id uuid references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table hides enable row level security;
drop policy if exists hides_own on hides;
create policy hides_own on hides for select using (user_id = auth.uid());

-- Swipe left: gone from my feed, and a quiet negative signal (never a public dislike).
create or replace function public.hide_item(p_item bigint) returns void
language sql security definer set search_path = public as $$
  insert into hides(user_id, item_id) select auth.uid(), p_item where is_zap() on conflict do nothing
$$;
create or replace function public.unhide_item(p_item bigint) returns void
language sql security definer set search_path = public as $$
  delete from hides where user_id = auth.uid() and item_id = p_item
$$;

-- Hidden items leave the personal lanes.
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
  where is_zap() and i.status = 'approved' and i.kind in ('course','news')
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
  where is_zap() and i.status = 'approved' and i.kind in ('course','news')
    and not (i.topic_slug = any(coalesce((select topics from me), '{}'::text[])))
    and not exists (select 1 from reactions r where r.item_id = i.id and r.user_id = auth.uid() and r.value = -1)
    and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  order by 2 desc limit p_limit
$$;
