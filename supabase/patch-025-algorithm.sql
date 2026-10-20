-- The zap UP ranking on three levels, all in the database (no AI cost):
--   personal:  an affinity profile learned from my own actions (half-life 21 days) + my onboarding answers
--   team-wide: the same profile over my teammates (profiles.role), my team's own posts, what's hot in my team this week
--   platform:  one "hot at zap" score per item (items.platform_score), refreshed every 30 minutes by pg_cron
-- feed_v2() blends them per lane, adds explore slots and diversity, and says why each item is there.
-- feed() and feed_all() stay as they are for older clients.

-- ---------------------------------------------------------------- signals
-- Every recorded action as (user, item, weight, when). Listening has no per-user record, so it isn't a signal.
create or replace view public.algo_actions as
  select user_id, item_id, 1.0::numeric as w, max(at) as at from events where type = 'open' group by user_id, item_id
  union all
  select user_id, item_id, 2.0, max(at) from events where type = 'click_source' group by user_id, item_id
  union all
  select user_id, item_id, case when value = 1 then 3.0 else -4.0 end, at from reactions
  union all
  select user_id, item_id, 3.0, created_at from saves
  union all
  select user_id, item_id, 3.0, at from listen_later
  union all
  select user_id, item_id, 2.0, max(at) from comments group by user_id, item_id
  union all
  select from_user, item_id, 2.0, max(at) from shares group by from_user, item_id
  union all
  select user_id, item_id, -6.0, at from hides
  union all
  select p.user_id, p.item_id,
    case when jsonb_array_length(i.lesson_plan) > 0
          and coalesce(array_length(p.lessons_done, 1), 0) >= jsonb_array_length(i.lesson_plan) then 4.0 else 1.0 end,
    p.updated_at
  from progress p join items i on i.id = p.item_id;
revoke all on public.algo_actions from public, anon, authenticated;

-- What an item "is about", as feature keys: topic, each tool, source, kind, length bucket, language.
create or replace function public.item_features(i public.items) returns text[]
language sql immutable set search_path = public as $$
  select array_remove(array[
      't:' || i.topic_slug,
      'k:' || i.kind,
      'm:' || case when i.minutes is null then null when i.minutes <= 5 then '5' when i.minutes <= 15 then '15'
                   when i.minutes <= 45 then '45' else 'long' end,
      'l:' || coalesce(i.lang, 'he'),
      's:' || coalesce(i.source_id::text, i.source_name)
    ], null)
    || coalesce((select array_agg(distinct 'tool:' || lower(x)) from unnest(i.tools) x), '{}'::text[])
$$;
revoke execute on function public.item_features(public.items) from public, anon;

-- ---------------------------------------------------------------- platform-wide
alter table items add column if not exists platform_score numeric not null default 0;
alter table items add column if not exists platform_scored_at timestamptz;

-- Hot at zap: time-decayed engagement velocity (half-life 7 days) + a smoothed quality rate + freshness + Hebrew.
create or replace function public.refresh_platform_scores() returns int
language sql security definer set search_path = public as $$
  with sig as (
    select item_id, sum(w * exp(-ln(2) * extract(epoch from now() - at) / (7 * 86400))) as eng
    from (
      select item_id, case when value = 1 then 3.0 else -3.0 end as w, at from reactions
      union all select item_id, 2.0, at from comments
      union all select item_id, 2.0, at from shares
      union all select item_id, 3.0, created_at from saves
      union all select item_id, 2.0, at from listen_later
      union all select item_id, 0.5, at from events where type = 'open'
      union all select item_id, 1.0, at from events where type = 'click_source'
      union all select item_id, -4.0, at from reports
      union all select item_id, -2.0, at from hides
      union all select p.item_id, 4.0, p.updated_at from progress p join items i on i.id = p.item_id
        where jsonb_array_length(i.lesson_plan) > 0
          and coalesce(array_length(p.lessons_done, 1), 0) >= jsonb_array_length(i.lesson_plan)
    ) x group by item_id
  ),
  q as (  -- people who kept it (liked, saved, finished) out of people who opened it, smoothed toward 1/5
    select i.id,
      (select count(distinct u) from (
          select user_id u from reactions r where r.item_id = i.id and r.value = 1
          union select user_id from saves s where s.item_id = i.id
          union select user_id from listen_later l where l.item_id = i.id) k) as kept,
      (select count(distinct user_id) from events e where e.item_id = i.id and e.type = 'open') as opened
    from items i where i.status = 'approved'
  ),
  scored as (
    select i.id,
      round((
        sign(coalesce(s.eng, 0)) * ln(1 + abs(coalesce(s.eng, 0)))
        + 2.0 * (q.kept + 1)::numeric / (greatest(q.opened, q.kept) + 5)
        + 2.0 * exp(-extract(epoch from now() - coalesce(i.published_at, i.created_at)) / (14 * 86400))
        + case when coalesce(i.lang, 'he') = 'he' then 1.5 else 0 end
      )::numeric, 4) as score
    from items i join q on q.id = i.id left join sig s on s.item_id = i.id
  ),
  u as (
    update items i set platform_score = scored.score, platform_scored_at = now()
    from scored where scored.id = i.id
    returning 1
  )
  select count(*)::int from u
$$;
revoke execute on function public.refresh_platform_scores() from public, anon, authenticated;

-- Every 30 minutes, directly in SQL (no edge function, no secret).
do $$ begin
  perform cron.unschedule('zapknow-platform-score');
exception when others then null; end $$;
select cron.schedule('zapknow-platform-score', '*/30 * * * *', 'select public.refresh_platform_scores()');

-- ---------------------------------------------------------------- the blended feed
do $$ begin
  create type public.fv2_cand as (
    id bigint, blend numeric, pn numeric, tn numeric, pln numeric, is_internal boolean, src text, kind text,
    reason_he text, reason_kind text, popular_with text, shared_by text, explore_ok boolean);
exception when duplicate_object then null; end $$;

-- p_lane: for_you (default) | zap (= in, internal) | world (= out, external) | quick (= bites) | trending | team
create or replace function public.feed_v2(p_limit int default 40, p_lane text default 'for_you', p_topic text default null,
                                          p_kind text default null, p_max_minutes int default null)
returns table (id bigint, score numeric, lane text, reason_he text, reason_kind text, popular_with text, shared_by text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_lane text := case lower(coalesce(p_lane, 'for_you'))
    when 'in' then 'zap' when 'internal' then 'zap' when 'out' then 'world' when 'external' then 'world'
    when 'bites' then 'quick' else lower(coalesce(p_lane, 'for_you')) end;
  wp numeric; wt numeric; wpl numeric;
  cands public.fv2_cand[];
  c public.fv2_cand;
  pick public.fv2_cand;
  used bigint[] := '{}';
  srcs text[] := '{}';
  kinds text[] := '{}';
  n int := 0;
  pos int;
  want_explore boolean;
  want_internal boolean;
  is_explore boolean;
  pass int;
begin
  if not is_zap() then return; end if;
  -- weights per lane: personal, team, platform
  select x.wa, x.wb, x.wc into wp, wt, wpl from (values
    ('for_you', 0.55, 0.25, 0.20), ('zap', 0.25, 0.55, 0.20), ('world', 0.65, 0.15, 0.20),
    ('quick', 0.55, 0.25, 0.20), ('trending', 0.0, 0.0, 1.0), ('team', 0.0, 1.0, 0.0)) x(ln, wa, wb, wc)
  where x.ln = v_lane;
  if wp is null then v_lane := 'for_you'; wp := 0.55; wt := 0.25; wpl := 0.20; end if;

  with me as (
    select p.user_id, p.role, p.topics, p.formats, p.weekly_time from profiles p where p.user_id = auth.uid()
  ),
  pool as (  -- ≤ 300 candidates: the newest, plus the hottest
    select i.* from items i
    where i.status = 'approved'
      and i.id in (
        (select x.id from items x where x.status = 'approved' order by coalesce(x.published_at, x.created_at) desc limit 240)
        union (select x.id from items x where x.status = 'approved' order by x.platform_score desc limit 60))
      and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
      and (v_lane <> 'zap' or i.kind = 'internal')
      and (v_lane <> 'world' or i.kind in ('course', 'news', 'podcast'))
      and (v_lane <> 'quick' or (i.minutes is not null and i.minutes <= coalesce(p_max_minutes, 7)))
      and (p_max_minutes is null or v_lane = 'quick' or (i.minutes is not null and i.minutes <= p_max_minutes))
      and (p_topic is null or i.topic_slug = p_topic)
      and (p_kind is null or i.kind = p_kind)
  ),
  feats as (select pool.id, f from pool cross join unnest(item_features(pool)) f),
  -- personal affinity: my actions (half-life 21 days) + onboarding priors
  my_aff as (
    select f, sum(w) as w, sum(npos) as npos, bool_or(prior) as prior from (
      select f, a.w * exp(-ln(2) * extract(epoch from now() - a.at) / (21 * 86400)) as w,
             case when a.w > 0 then 1 else 0 end as npos, false as prior
      from algo_actions a join items i on i.id = a.item_id cross join unnest(item_features(i)) f
      where a.user_id = auth.uid()
      union all select 't:' || t, 2.0, 0, true from me, unnest(me.topics) t
      union all select case fm when 'קורס מלא' then 'k:course' when 'כתבות' then 'k:news'
                               when 'פודקאסט ואודיו' then 'k:podcast' when 'וידאו קצר' then 'm:15' end, 1.0, 0, true
        from me, unnest(me.formats) fm
    ) x where f is not null group by f
  ),
  -- team affinity: my teammates' actions (demo colleagues count half)
  mates as (
    select p.user_id, case when coalesce(p.is_demo, false) then 0.5 else 1.0 end as mw
    from profiles p, me where me.role is not null and p.role = me.role and p.user_id <> me.user_id
  ),
  team_aff as (
    select f, sum(a.w * m.mw * exp(-ln(2) * extract(epoch from now() - a.at) / (21 * 86400))) as w
    from algo_actions a join mates m on m.user_id = a.user_id
    join items i on i.id = a.item_id cross join unnest(item_features(i)) f
    group by f
  ),
  team_pop as (  -- hot in my team this week: positive actions, half-life 7 days
    select a.item_id,
      sum(a.w * m.mw * exp(-ln(2) * extract(epoch from now() - a.at) / (7 * 86400))) filter (where a.w > 0) as pop,
      count(*) filter (where a.w = 3.0 and m.mw = 1.0) as real_keeps
    from algo_actions a join mates m on m.user_id = a.user_id group by a.item_id
  ),
  mine as (  -- what I already did with each item
    select a.item_id, bool_or(a.w = 1.0) as opened, bool_or(a.w = 4.0) as finished,
           bool_or(a.w = 3.0) as kept, bool_or(a.w = -4.0) as disliked
    from algo_actions a where a.user_id = auth.uid() group by a.item_id
  ),
  shared as (
    select distinct on (s.item_id) s.item_id, coalesce(p.display_name, split_part(p.email, '@', 1)) as by_name
    from shares s join profiles p on p.user_id = s.from_user
    where s.to_user = auth.uid() and s.at > now() - interval '14 days' order by s.item_id, s.at desc
  ),
  team_n as (select greatest(count(*), 1) as n from mates),
  raw as (
    select pool.id, pool.kind, pool.minutes, pool.tools, pool.topic_slug, pool.source_name,
      coalesce(pool.source_id::text, pool.source_name) as src,
      pool.platform_score as plat,
      tanh(coalesce((select sum(ma.w) from feats ft join my_aff ma on ma.f = ft.f where ft.id = pool.id), 0) / 6)
        + case when sh.item_id is not null then 1.0 else 0 end
        - case when mi.finished then 0.8 when mi.disliked then 1.2 when mi.kept then 0.25 when mi.opened then 0.35 else 0 end
        - case when me.weekly_time = '15 דקות' and pool.minutes > 20 then 0.25
               when me.weekly_time = 'שעה' and pool.minutes > 90 then 0.15 else 0 end as pers,
      tanh(coalesce((select sum(ta.w) from feats ft join team_aff ta on ta.f = ft.f where ft.id = pool.id), 0)
           / (6 * sqrt((select n from team_n))))
        + case when tp2.team is not null and tp2.team = me.role then 0.8 else 0 end
        + case when au.role is not null and au.role = me.role then 0.5 else 0 end
        + 0.6 * ln(1 + greatest(coalesce(tpp.pop, 0), 0)) as team,
      coalesce(tpp.pop, 0) as tpop,
      coalesce(tpp.real_keeps, 0) as tkeeps,
      (tp2.team is not null and tp2.team = me.role) as own_team_doc,
      sh.by_name as shared_by,
      me.role as my_role,
      (select ma.f from feats ft join my_aff ma on ma.f = ft.f where ft.id = pool.id and ma.w > 0
         order by ma.w desc limit 1) as top_f
    from pool
    cross join me
    left join team_docs td on td.id = pool.doc_id
    left join team_profiles tp2 on tp2.id = td.team_id
    left join profiles au on au.user_id = pool.author_user
    left join team_pop tpp on tpp.item_id = pool.id
    left join mine mi on mi.item_id = pool.id
    left join shared sh on sh.item_id = pool.id
  ),
  normed as (
    select r.*,
      coalesce((r.pers - min(r.pers) over ()) / nullif(max(r.pers) over () - min(r.pers) over (), 0), 0.5)::numeric as pn,
      coalesce((r.team - min(r.team) over ()) / nullif(max(r.team) over () - min(r.team) over (), 0), 0.5)::numeric as tn,
      coalesce((r.plat - min(r.plat) over ()) / nullif(max(r.plat) over () - min(r.plat) over (), 0), 0.5)::numeric as pln
    from raw r
  ),
  labelled as (
    select nm.*, ma.npos, ma.prior,
      case
        when nm.top_f like 't:%' then (select t.name_he from topics t where t.slug = substr(nm.top_f, 3))
        when nm.top_f like 'tool:%' then coalesce((select x from unnest(nm.tools) x where lower(x) = substr(nm.top_f, 6) limit 1),
                                                 substr(nm.top_f, 6))
        when nm.top_f like 's:%' then nm.source_name
        when nm.top_f = 'k:podcast' then 'פודקאסטים' when nm.top_f = 'k:course' then 'קורסים'
        when nm.top_f = 'k:news' then 'כתבות' when nm.top_f = 'k:internal' then 'פוסטים מ-zap'
        when nm.top_f = 'm:5' then 'תוכן קצר' when nm.top_f = 'l:he' then 'תוכן בעברית'
      end as label
    from normed nm left join my_aff ma on ma.f = nm.top_f
  )
  select array_agg(row(
      l.id,
      round(wp * l.pn + wt * l.tn + wpl * l.pln, 4),
      l.pn, l.tn, l.pln,
      l.kind = 'internal', l.src, l.kind,
      -- why it's here: the strongest contributor
      case
        when l.shared_by is not null and v_lane not in ('trending', 'team') then 'נשלח אליכם מ-' || l.shared_by
        when wt * l.tn >= wp * l.pn and wt * l.tn >= wpl * l.pln and wt > 0 then
          case when l.own_team_doc then 'מהצוות שלכם'
               when l.tpop > 0 and l.my_role is not null then 'חם השבוע בצוות ' || l.my_role
               when l.my_role is not null then 'פופולרי בצוות ' || l.my_role
               else 'חם ב-zap' end
        when wpl * l.pln >= wp * l.pn or l.label is null then 'חם ב-zap'
        when l.npos >= 2 and l.top_f like 's:%' then 'כי התעניינתם ב-' || l.npos || ' פוסטים מ-' || l.label
        when l.npos >= 2 and (l.top_f like 't:%' or l.top_f like 'tool:%') then 'כי התעניינתם ב-' || l.npos || ' פוסטים על ' || l.label
        when l.npos >= 2 then 'כי אתם אוהבים ' || l.label
        when l.prior and l.top_f like 't:%' then 'כי בחרתם ב-' || l.label
        else 'מתאים למה שאהבתם'
      end,
      case
        when l.shared_by is not null and v_lane not in ('trending', 'team') then 'share'
        when wt * l.tn >= wp * l.pn and wt * l.tn >= wpl * l.pln and wt > 0 then 'team'
        when wpl * l.pln >= wp * l.pn or l.label is null then 'platform'
        else 'personal'
      end,
      case when l.tkeeps >= 2 then l.my_role end,
      l.shared_by,
      l.pn < 0.35 and l.pln >= 0.55 and l.shared_by is null
    )::public.fv2_cand order by round(wp * l.pn + wt * l.tn + wpl * l.pln, 4) desc, l.id desc)
  into cands
  from labelled l;

  if cands is null then return; end if;

  -- pick in order, with explore slots, the internal interleave and diversity
  while n < p_limit loop
    pos := n + 1;
    want_explore := v_lane in ('for_you', 'world', 'quick') and pos % 7 = 4;
    want_internal := v_lane = 'for_you' and pos % 3 = 0;
    pick := null; is_explore := false;

    if want_explore then
      foreach c in array cands loop
        continue when c.id = any(used) or not c.explore_ok;
        continue when array_length(srcs, 1) >= 2 and srcs[1] = c.src and srcs[2] = c.src;
        pick := c; is_explore := true; exit;
      end loop;
    end if;

    -- pass 1: the wanted lane with diversity, 2: any lane with diversity, 3: anything left
    pass := 1;
    while pick is null and pass <= 3 loop
      foreach c in array cands loop
        continue when c.id = any(used);
        continue when pass = 1 and v_lane = 'for_you' and c.is_internal <> want_internal;
        if pass < 3 then
          continue when array_length(srcs, 1) >= 2 and srcs[1] = c.src and srcs[2] = c.src;
          continue when array_length(kinds, 1) >= 3 and kinds[1] = c.kind and kinds[2] = c.kind and kinds[3] = c.kind
                        and not c.is_internal;
        end if;
        pick := c; exit;
      end loop;
      pass := pass + 1;
    end loop;

    exit when pick is null;
    used := used || pick.id;
    srcs := array_prepend(pick.src, srcs[1:1]);
    kinds := array_prepend(pick.kind, kinds[1:2]);
    n := n + 1;

    id := pick.id;
    score := pick.blend;
    lane := case when pick.is_internal then 'internal' else 'external' end;
    reason_he := case when is_explore then 'אולי יפתיע אתכם' else pick.reason_he end;
    reason_kind := case when is_explore then 'explore' else pick.reason_kind end;
    popular_with := pick.popular_with;
    shared_by := pick.shared_by;
    return next;
  end loop;
end $$;
revoke execute on function public.feed_v2(int, text, text, text, int) from public, anon;
grant execute on function public.feed_v2(int, text, text, text, int) to authenticated;

-- first fill
select public.refresh_platform_scores() as items_scored;
