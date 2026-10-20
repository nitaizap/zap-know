-- Gamification. Points are derived from what people already do (no separate counter to fake).
-- Learning and sharing knowledge weigh the most; light actions are worth little and capped per day.
-- Dislikes never cost the target anything. Team = the role chosen at onboarding.

alter table items add column if not exists author_user uuid references auth.users(id) on delete set null;
alter table budget_settings add column if not exists winner_bonus numeric not null default 100;  -- placeholder, L&D sets
alter table budget_settings add column if not exists winners int not null default 3;

-- Every point-earning action, one row each, with per-day caps applied.
create or replace view public.points_ledger with (security_invoker = false) as
with raw as (
  -- learning
  select p.user_id, p.updated_at as at, 'lessons'::text as kind,
         5 * coalesce(array_length(p.lessons_done, 1), 0) as pts, 1000 as cap
    from progress p
  union all
  select p.user_id, p.updated_at, 'course_done', 30, 1000
    from progress p join items i on i.id = p.item_id
   where jsonb_array_length(i.lesson_plan) > 0 and coalesce(array_length(p.lessons_done, 1), 0) >= jsonb_array_length(i.lesson_plan)
  -- sharing knowledge
  union all select from_user, at, 'share', 4, 5 from shares
  union all select user_id, at, 'comment', 3, 5 from comments
  union all select author_user, created_at, 'post', 20, 3 from items where kind = 'internal' and author_user is not null and status = 'approved'
  -- what colleagues think of my contributions (likes on my posts, comments on my posts)
  union all select i.author_user, r.at, 'post_liked', 2, 20 from reactions r join items i on i.id = r.item_id
     where r.value = 1 and i.author_user is not null and r.user_id <> i.author_user
  union all select i.author_user, c.at, 'post_commented', 2, 20 from comments c join items i on i.id = c.item_id
     where i.author_user is not null and c.user_id <> i.author_user
  -- light actions
  union all select user_id, at, 'open', 1, 10 from events where type = 'open'
  union all select user_id, created_at, 'save', 1, 5 from saves
  union all select user_id, at, 'react', 1, 5 from reactions
),
ranked as (
  select *, row_number() over (partition by user_id, kind, (at at time zone 'Asia/Jerusalem')::date order by at) as n
  from raw where user_id is not null
)
select user_id, at, kind, pts from ranked where n <= cap;

revoke all on public.points_ledger from anon, authenticated;

create or replace function public.level_for(p int) returns json language sql immutable as $$
  select case
    when p >= 1500 then json_build_object('name', 'zapper על', 'from', 1500, 'next', null)
    when p >= 700 then json_build_object('name', 'zapper מוביל', 'from', 700, 'next', 1500)
    when p >= 300 then json_build_object('name', 'zapper פעיל', 'from', 300, 'next', 700)
    when p >= 100 then json_build_object('name', 'zapper סקרן', 'from', 100, 'next', 300)
    else json_build_object('name', 'zapper מתחיל', 'from', 0, 'next', 100) end
$$;

-- Leaderboard. p_period: 'month' (resets on the 1st) or 'all'. p_scope: 'people' or 'teams'.
-- Teams are ranked by average points per active member, so a small team can win.
create or replace function public.leaderboard(p_period text default 'month', p_scope text default 'people', p_limit int default 20)
returns table (rank bigint, name text, team text, points bigint, members bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with pts as (
    select l.user_id, sum(l.pts)::bigint as points from points_ledger l
    where p_period = 'all' or l.at >= date_trunc('month', now() at time zone 'Asia/Jerusalem')
    group by l.user_id
  ),
  people as (
    select coalesce(pr.display_name, split_part(pr.email, '@', 1)) as name, coalesce(pr.role, 'אחר') as team,
           p.points, 1::bigint as members, pr.user_id = auth.uid() as is_me
    from pts p join profiles pr on pr.user_id = p.user_id
  ),
  teams as (
    select team as name, team, round(avg(points))::bigint as points, count(*)::bigint as members,
           bool_or(is_me) as is_me
    from people group by team
  )
  select rank() over (order by points desc), name, team, points, members, is_me
  from (select * from people where p_scope = 'people' union all select * from teams where p_scope = 'teams') x
  where is_zap()
  order by points desc limit p_limit
$$;

-- My dashboard: points, level, rank, recent earning, badges.
create or replace function public.my_points() returns json
language sql stable security definer set search_path = public as $$
  with mine as (select * from points_ledger where user_id = auth.uid()),
  month_rank as (
    select user_id, rank() over (order by sum(pts) desc) as r from points_ledger
    where at >= date_trunc('month', now() at time zone 'Asia/Jerusalem') group by user_id
  ),
  stats as (
    select
      (select count(*) from progress p join items i on i.id = p.item_id where p.user_id = auth.uid()
         and jsonb_array_length(i.lesson_plan) > 0 and coalesce(array_length(p.lessons_done,1),0) >= jsonb_array_length(i.lesson_plan)) as courses,
      (select count(*) from shares where from_user = auth.uid()) as shares,
      (select count(*) from comments where user_id = auth.uid()) as comments,
      (select count(*) from items where author_user = auth.uid() and kind = 'internal') as posts,
      (select count(*) from comments c where c.user_id = auth.uid()
         and c.at = (select min(c2.at) from comments c2 where c2.item_id = c.item_id)) as first_comments
  )
  select json_build_object(
    'all', coalesce((select sum(pts) from mine), 0),
    'month', coalesce((select sum(pts) from mine where at >= date_trunc('month', now() at time zone 'Asia/Jerusalem')), 0),
    'level', level_for(coalesce((select sum(pts) from mine), 0)::int),
    'rank_month', (select r from month_rank where user_id = auth.uid()),
    'recent', coalesce((select json_agg(x) from (select kind, pts, at from mine order by at desc limit 8) x), '[]'::json),
    'badges', (select json_agg(b) from (
        select 'קורס ראשון' as b from stats where courses >= 1
        union all select '5 קורסים' from stats where courses >= 5
        union all select 'משתפים ידע' from stats where shares >= 5
        union all select 'קול בשיחה' from stats where comments >= 10
        union all select 'קורה אצלי' from stats where posts >= 1
        union all select 'מגיבים ראשונים' from stats where first_comments >= 3
      ) bb)
  ) where is_zap()
$$;

-- Last month's top people get extra learning budget this month (amount set by L&D).
create or replace function public.budget_bonus_for(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  with last_month as (
    select user_id, rank() over (order by sum(pts) desc) as r from points_ledger
    where at >= date_trunc('month', now() at time zone 'Asia/Jerusalem') - interval '1 month'
      and at < date_trunc('month', now() at time zone 'Asia/Jerusalem')
    group by user_id
  )
  select case when exists (select 1 from last_month where user_id = p_user and r <= b.winners) then b.winner_bonus else 0 end
  from budget_settings b where b.id = 1
$$;

create or replace function public.my_budget() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'monthly_amount', b.monthly_amount + budget_bonus_for(auth.uid()),
    'bonus', budget_bonus_for(auth.uid()),
    'currency', b.currency,
    'is_placeholder', b.is_placeholder,
    'spent', coalesce(sum(p.price) filter (where p.status in ('auto_approved','approved','purchased')), 0),
    'remaining', b.monthly_amount + budget_bonus_for(auth.uid())
                 - coalesce(sum(p.price) filter (where p.status in ('auto_approved','approved','purchased')), 0),
    'pending', count(p.id) filter (where p.status = 'pending_manager')
  )
  from budget_settings b
  left join purchases p on p.user_id = auth.uid() and p.month = date_trunc('month', now())::date
  where b.id = 1 and is_zap()
  group by b.monthly_amount, b.currency, b.is_placeholder
$$;

-- Service-side leaderboard for the weekly episode (no viewer session there).
create or replace function public.leaderboard_public(p_scope text default 'people', p_limit int default 3)
returns table (name text, points bigint)
language sql stable security definer set search_path = public as $$
  with pts as (
    select user_id, sum(pts)::bigint as points from points_ledger
    where at >= date_trunc('month', now() at time zone 'Asia/Jerusalem') group by user_id
  ),
  people as (
    select coalesce(pr.display_name, split_part(pr.email, '@', 1)) as name, coalesce(pr.role, 'אחר') as team, p.points
    from pts p join profiles pr on pr.user_id = p.user_id
  )
  select name, points from (
    select name, points from people where p_scope = 'people'
    union all
    select team, round(avg(points))::bigint from people where p_scope = 'teams' group by team
  ) x order by points desc limit p_limit
$$;
revoke execute on function public.leaderboard_public(text, int) from anon, authenticated;
