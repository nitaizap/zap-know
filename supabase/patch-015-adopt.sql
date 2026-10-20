-- Good ideas adopted from a teammate's prototype: notes, report reasons, topic watch,
-- tools + language + level dimensions, experts per topic, testimonials, admin KPIs, rank gap.

-- Private notes per item ("ההערות שלי").
create table if not exists notes (
  user_id uuid references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table notes enable row level security;
drop policy if exists notes_own on notes;
create policy notes_own on notes for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_zap());

-- Report reasons (chips) on "דווח על טעות".
alter table reports add column if not exists reason text;
create or replace function public.report_item_reason(p_item bigint, p_reason text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  insert into reports(item_id, user_id, note, reason) values (p_item, auth.uid(), p_note, p_reason);
  -- A broken link is checked right away by the nightly job; two different reporters hide the item.
  if (select count(distinct user_id) from reports where item_id = p_item and not resolved) >= 2 then
    update items set status = 'pending' where id = p_item and status = 'approved';
  end if;
end $$;

-- "עדכנו אותי כשזה באוויר" for topics marked בקרוב.
create table if not exists topic_watch (
  user_id uuid references auth.users(id) on delete cascade,
  topic_slug text references topics(slug) on delete cascade,
  notified_at timestamptz,
  at timestamptz not null default now(),
  primary key (user_id, topic_slug)
);
alter table topic_watch enable row level security;
drop policy if exists topic_watch_own on topic_watch;
create policy topic_watch_own on topic_watch for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_zap());

-- Who at zap knows this topic best: a link to a team profile (and its agent).
alter table topics add column if not exists expert_team_id bigint references team_profiles(id);
update topics t set expert_team_id = tp.id from team_profiles tp
where t.expert_team_id is null and (
  (t.slug = 'ppc' and tp.team = 'PPC') or
  (t.slug = 'social' and tp.team = 'סושיאל') or
  (t.slug = 'geo-ecommerce' and tp.team like 'SEO%') or
  (t.slug = 'data-ai' and tp.team like 'דאטה%') or
  (t.slug = 'digital-marketing' and tp.team = 'תוכן') or
  (t.slug = 'cx' and tp.team = 'שירות לקוחות')
);

-- Work tools, source language and level as browse dimensions.
alter table items add column if not exists tools text[] not null default '{}';
alter table items add column if not exists lang text;
alter table items add column if not exists level text check (level in ('beginner','intermediate','advanced'));

create or replace function public.detect_tools(p_text text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(t), '{}') from unnest(array[
    'Google Ads','GA4','Google Analytics','Looker Studio','Search Console','Merchant Center','Tag Manager',
    'Meta','TikTok','LinkedIn','YouTube','Semrush','Ahrefs','HubSpot','Canva','Figma','monday',
    'Claude','ChatGPT','Gemini','NotebookLM','Excel','BigQuery','WordPress','Elementor'
  ]) t where p_text ilike '%' || t || '%'
$$;
create or replace function public.detect_level(p_text text) returns text
language sql immutable as $$
  select case
    when p_text ~* '(beginner|basics|101|for beginners|introduction|getting started|למתחילים|מבוא|יסודות|בסיס)' then 'beginner'
    when p_text ~* '(advanced|expert|deep dive|masterclass|מתקדם|מתקדמים|לעומק)' then 'advanced'
    else 'intermediate' end
$$;
create or replace function public.items_fill_dims() returns trigger language plpgsql as $$
declare txt text := coalesce(new.title_orig,'') || ' ' || new.title_he || ' ' || coalesce(new.summary_he,'');
begin
  if new.tools = '{}' then new.tools := detect_tools(txt); end if;
  if new.level is null then new.level := detect_level(txt); end if;
  if new.lang is null then new.lang := case when new.kind = 'internal' or coalesce(new.title_orig,'') ~ '[א-ת]' then 'he' else 'en' end; end if;
  return new;
end $$;
drop trigger if exists items_dims on items;
create trigger items_dims before insert or update of title_he, summary_he on items for each row execute function items_fill_dims();
update items set tools = detect_tools(coalesce(title_orig,'') || ' ' || title_he || ' ' || coalesce(summary_he,'')) where tools = '{}';
update items set level = detect_level(coalesce(title_orig,'') || ' ' || title_he || ' ' || coalesce(summary_he,'')) where level is null;
update items set lang = case when kind = 'internal' or coalesce(title_orig,'') ~ '[א-ת]' then 'he' else 'en' end where lang is null;

-- Tool tiles: how much there is per tool (items + team docs).
create or replace function public.tool_counts() returns table (tool text, items bigint, docs bigint)
language sql stable security definer set search_path = public as $$
  with i as (select unnest(tools) t from items where status = 'approved'),
       d as (select unnest(tools) t from team_docs)
  select t, (select count(*) from i where i.t = x.t), (select count(*) from d where d.t ilike '%' || x.t || '%')
  from unnest(array['Google Ads','GA4','Looker Studio','Meta','TikTok','Canva','Figma','monday','Claude','ChatGPT','Gemini','NotebookLM','Semrush','HubSpot','Excel']) x(t)
  where is_zap()
$$;

-- "עובדים מספרים": what colleagues wrote about things they learned.
create or replace function public.testimonials(p_limit int default 6)
returns table (comment_id bigint, item_id bigint, item_title text, body text, author text, user_id uuid, team text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, i.id, i.title_he, c.body, c.author_name, c.user_id, p.role, c.at
  from comments c join items i on i.id = c.item_id and i.status = 'approved'
  left join profiles p on p.user_id = c.user_id
  where is_zap() and length(c.body) >= 25 and not c.reported
  order by c.at desc limit p_limit
$$;

-- Leaderboard framing: "מקום 12 · עוד X נקודות למקום 11".
create or replace function public.my_rank_gap() returns json
language sql stable security definer set search_path = public as $$
  with m as (
    select user_id, sum(pts)::bigint points from points_ledger
    where at >= date_trunc('month', now() at time zone 'Asia/Jerusalem') group by user_id
  ), r as (select user_id, points, rank() over (order by points desc) rk from m)
  select json_build_object(
    'rank', (select rk from r where user_id = auth.uid()),
    'points', coalesce((select points from r where user_id = auth.uid()), 0),
    'gap', (select min(points) from r where points > coalesce((select points from r where user_id = auth.uid()), 0))
           - coalesce((select points from r where user_id = auth.uid()), 0),
    'total', (select count(*) from r)
  ) where is_zap()
$$;

-- Admin overview: the automation, made visible.
create or replace function public.admin_kpis() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'pending', (select count(*) from items where status = 'pending'),
    'collected_week', (select count(*) from items where created_at > now() - interval '7 days' and kind <> 'internal'),
    'by_source', (select coalesce(json_agg(x), '[]') from (
        select source_name, count(*) n from items where created_at > now() - interval '7 days' and kind <> 'internal'
        group by source_name order by 2 desc limit 8) x),
    'sources_active', (select count(*) from sources where status = 'active'),
    'broken_week', (select count(*) from items where status = 'broken' and link_checked_at > now() - interval '7 days'),
    'ai_runs_week', (select count(*) from items where summarized_at > now() - interval '7 days')
                  + (select count(*) from listens where created_at > now() - interval '7 days'),
    'failures_week', (select count(*) from run_log where not ok and at > now() - interval '7 days'),
    'reports_open', (select count(*) from reports where not resolved),
    'last_runs', (select coalesce(json_agg(x), '[]') from (
        select job, ok, at, left(detail::text, 160) detail from run_log order by at desc limit 12) x)
  ) where is_admin()
$$;

-- Approve everything left in the queue (the swipe screen's "אישור כל מה שנשאר").
create or replace function public.approve_all_pending() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  update items set status = 'approved' where status = 'pending';
  get diagnostics n = row_count;
  return n;
end $$;
