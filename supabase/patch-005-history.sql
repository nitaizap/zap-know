-- Personal zone ("האזור שלי"): everything I did on the platform, searchable.
-- "I saw an article that said GEO is the next big thing" → search my own history.

drop policy if exists events_own on events;
create policy events_own on events for select using (user_id = auth.uid());

-- One row per (item, action), newest first. p_q searches title/summary in Hebrew and English.
create or replace function public.my_history(p_q text default '', p_type text default null, p_limit int default 60)
returns table (item_id bigint, action text, at timestamptz, detail text,
  title_he text, title_orig text, kind text, topic_slug text, source_name text, source_url text)
language sql stable security definer set search_path = public as $$
  with acts as (
    select item_id, 'open'::text as action, max(at) as at, count(*)::text || ' פעמים' as detail
      from events where user_id = auth.uid() and type = 'open' group by item_id
    union all
    select item_id, case when value = 1 then 'like' else 'dislike' end, at, null from reactions where user_id = auth.uid()
    union all
    select item_id, 'save', created_at, null from saves where user_id = auth.uid()
    union all
    select item_id, 'comment', at, left(body, 140) from comments where user_id = auth.uid()
    union all
    select item_id, 'shared_by_me', at, note from shares where from_user = auth.uid()
    union all
    select item_id, 'shared_with_me', at, note from shares where to_user = auth.uid()
    union all
    select p.item_id, 'progress', p.updated_at,
      coalesce(array_length(p.lessons_done, 1), 0)::text || '/' || jsonb_array_length(i.lesson_plan)::text
      from progress p join items i on i.id = p.item_id where p.user_id = auth.uid()
    union all
    select item_id, 'purchase', created_at, status from purchases where user_id = auth.uid() and item_id is not null
  )
  select a.item_id, a.action, a.at, a.detail, i.title_he, i.title_orig, i.kind, i.topic_slug, i.source_name, i.source_url
  from acts a join items i on i.id = a.item_id
  where is_zap()
    and (p_type is null or a.action = p_type)
    and (coalesce(p_q, '') = '' or
         (i.title_he || ' ' || coalesce(i.title_orig, '') || ' ' || coalesce(i.summary_he, '') || ' ' || coalesce(i.why_he, '')) ilike '%' || p_q || '%')
  order by a.at desc
  limit p_limit
$$;

-- Counters for the top of the personal zone.
create or replace function public.my_stats() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'opened', (select count(distinct item_id) from events where user_id = auth.uid() and type = 'open'),
    'saved', (select count(*) from saves where user_id = auth.uid()),
    'liked', (select count(*) from reactions where user_id = auth.uid() and value = 1),
    'comments', (select count(*) from comments where user_id = auth.uid()),
    'shared', (select count(*) from shares where from_user = auth.uid()),
    'in_progress', (select count(*) from progress p join items i on i.id = p.item_id
       where p.user_id = auth.uid() and coalesce(array_length(p.lessons_done,1),0) < jsonb_array_length(i.lesson_plan)),
    'completed', (select count(*) from progress p join items i on i.id = p.item_id
       where p.user_id = auth.uid() and jsonb_array_length(i.lesson_plan) > 0
         and coalesce(array_length(p.lessons_done,1),0) >= jsonb_array_length(i.lesson_plan))
  ) where is_zap()
$$;
