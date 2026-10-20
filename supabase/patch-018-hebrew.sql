-- Hebrew first: Israeli podcasts and news join the sources, and Hebrew items rank higher.
insert into sources (name, kind, ref, topic_slug, status) values
  ('Ear Catcher · פרסום, שיווק וקריאייטיב', 'podcast', 'https://www.omnycontent.com/d/playlist/178d72a7-a889-4132-8008-a5cc014ed109/afa263c2-43fe-47d6-90ea-a790010b74d2/dc4d1e18-a21c-4f1a-87d9-a79300969977/podcast.rss', 'digital-marketing', 'active'),
  ('לבן על שחור · שיווק, אסטרטגיה ומיתוג', 'podcast', 'https://anchor.fm/s/25287da8/podcast/rss', 'digital-marketing', 'active'),
  ('הפיצוח · שיווק דיגיטלי מזווית אחרת', 'podcast', 'https://anchor.fm/s/b1600138/podcast/rss', 'digital-marketing', 'active'),
  ('משחקי הפרסום עם אהוד טייץ', 'podcast', 'https://feeds.simplecast.com/KfuBnBSn', 'ppc', 'active'),
  ('מדברים דיגיטל והרבה מעבר', 'podcast', 'https://anchor.fm/s/881b04e4/podcast/rss', 'social', 'active'),
  ('ביס דיגיטלי · שיווק במנות קטנות', 'podcast', 'https://anchor.fm/s/e903fbd0/podcast/rss', 'social', 'active'),
  ('דאטה בפיתה · Microsoft Data Analysts Club', 'podcast', 'https://anchor.fm/s/f013de2c/podcast/rss', 'data-ai', 'active'),
  ('Hands-On AI · בינה מלאכותית בארגונים', 'podcast', 'https://anchor.fm/s/f747c85c/podcast/rss', 'data-ai', 'active'),
  ('פייזק · SEO ו-GEO', 'podcast', 'https://anchor.fm/s/1090907f4/podcast/rss', 'geo-ecommerce', 'active'),
  ('הכוח של חוויית לקוח', 'podcast', 'https://feed.podbean.com/kerenshaked/feed.xml', 'cx', 'active'),
  ('Geektime', 'rss', 'https://www.geektime.co.il/feed/', 'data-ai', 'active')
on conflict (kind, ref) do nothing;

-- Hebrew sources are pulled first.
update sources set last_pulled_at = null where ref like '%anchor.fm%' or ref like '%omnycontent%' or ref like '%geektime%' or ref like '%simplecast.com/KfuBnBSn%' or ref like '%kerenshaked%';

-- Hebrew items get a lift in the personal ranking.
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
      + case when i.lang = 'he' then 1.5 else 0 end
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
