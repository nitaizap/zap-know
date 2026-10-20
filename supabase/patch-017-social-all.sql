-- Everything is a post: team documents join the feed as items (reactions, comments, shares,
-- points for free), every topic and team gets an AI cover, and one mixed feed spans it all.

-- Image generation is priced on its own (real price is ~$30 per 1M image tokens).
insert into app_settings (key, value) values ('price_img_out', '40'), ('image_model', 'gemini-2.5-flash-image')
on conflict (key) do nothing;

-- Covers per topic and per team (generated once, reused as thumbnails).
alter table topics add column if not exists cover_url text;
alter table team_profiles add column if not exists cover_url text;

-- Team docs as feed items. source_url points at the doc page inside zap UP.
alter table items add column if not exists doc_id bigint references team_docs(id) on delete cascade;
insert into items (kind, topic_slug, verticals, title_he, summary_he, why_he, lesson_plan, source_name, source_url,
                   published_at, summarized_at, ai_summarized, status, is_demo, doc_id, tools, lang, minutes)
select 'internal',
       coalesce((select slug from topics t where t.expert_team_id = d.team_id limit 1), 'digital-marketing'),
       '{}', d.title, d.summary_he,
       case d.kind when 'playbook' then 'איך הצוות עושה את זה, צעד אחר צעד'
                   when 'howto' then 'מדריך קצר מהצוות'
                   when 'checklist' then 'צ''קליסט שאפשר להעתיק'
                   else 'תבנית מוכנה לעבודה' end,
       '[]', 'מסמך צוות · ' || tp.team, 'https://nitaizap.github.io/zap-know/#/doc/' || d.id,
       d.updated_at, d.updated_at, false, 'approved', d.is_demo, d.id, d.tools, 'he',
       greatest(3, length(d.body_md) / 900)
from team_docs d join team_profiles tp on tp.id = d.team_id
on conflict (source_url) do nothing;

-- One mixed feed for everyone: my ranking for external items, plus internal posts and docs
-- (my team's first), interleaved so the scroll never feels one-note.
create or replace function public.feed_all(p_limit int default 40)
returns table (id bigint, score numeric, lane text, popular_with text, shared_by text)
language sql stable security definer set search_path = public as $$
  with me as (select role, topics from profiles where user_id = auth.uid()),
  ext as (
    select f.id, f.score, 'external'::text lane, f.popular_with, f.shared_by,
           row_number() over (order by f.score desc) rn
    from feed(p_limit) f
  ),
  inn as (
    select i.id,
      round((
        case when tp.team = (select role from me) then 3 else 0 end
        + case when i.topic_slug = any(coalesce((select topics from me), '{}'::text[])) then 1.5 else 0 end
        + 2 * exp(-extract(epoch from now() - coalesce(i.published_at, i.created_at)) / (10 * 86400))
        + 0.6 * ln(1 + i.likes) + 0.8 * ln(1 + i.comments_count) + 0.5 * ln(1 + i.opens)
      )::numeric, 3) score,
      'internal'::text lane, null::text popular_with, null::text shared_by
    from items i
    left join team_docs d on d.id = i.doc_id
    left join team_profiles tp on tp.id = d.team_id
    where is_zap() and i.status = 'approved' and i.kind = 'internal'
      and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  ),
  inn_r as (select *, row_number() over (order by score desc) rn from inn)
  -- two external, then one internal, repeating
  select id, score, lane, popular_with, shared_by from (
    select id, score, lane, popular_with, shared_by, rn * 1.5 as pos from ext
    union all
    select id, score, lane, popular_with, shared_by, rn * 3.0 - 0.5 as pos from inn_r
  ) x order by pos limit p_limit
$$;

-- Items with no image of their own take their team's cover (docs) or their topic's cover.
create or replace function public.fill_covers() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int;
begin
  update items i set thumbnail_url = tp.cover_url
  from team_docs d join team_profiles tp on tp.id = d.team_id
  where i.doc_id = d.id and coalesce(i.thumbnail_url, '') = '' and tp.cover_url is not null;
  get diagnostics m = row_count; n := n + m;
  update items i set thumbnail_url = t.cover_url
  from topics t where t.slug = i.topic_slug and coalesce(i.thumbnail_url, '') = '' and t.cover_url is not null;
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;
revoke execute on function public.fill_covers() from public, anon, authenticated;
grant execute on function public.fill_covers() to service_role;
