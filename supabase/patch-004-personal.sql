-- Personalization: onboarding asks what interests you AND what you need (goals at work).
-- Three home lanes: "מה מעניין אותי" (feed), "מה יכול לעניין אותך" (discover), "טרנדים" (trending).

alter table profiles add column if not exists needs text[] not null default '{}';
alter table profiles add column if not exists needs_note text;
grant insert (needs, needs_note) on public.profiles to authenticated;
grant update (needs, needs_note) on public.profiles to authenticated;

-- Outside my topics, ranked by what people in my role (then everyone) engage with.
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
  order by 2 desc limit p_limit
$$;

-- Most viewed in the last 7 days (falls back to all-time opens while events are sparse).
create or replace function public.trending(p_limit int default 6)
returns table (id bigint, views bigint)
language sql stable security definer set search_path = public as $$
  select i.id, coalesce(w.n, 0) + 0 as views
  from items i
  left join (select item_id, count(*) n from events where type = 'open' and at > now() - interval '7 days' group by item_id) w
    on w.item_id = i.id
  where is_zap() and i.status = 'approved' and i.kind in ('course','news')
  order by coalesce(w.n, 0) desc, i.opens desc, i.likes desc
  limit p_limit
$$;
