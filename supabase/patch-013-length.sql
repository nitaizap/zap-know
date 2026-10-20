-- Length: every item gets an estimated time in minutes, so people can filter/sort by it,
-- and "quick bites" (up to 10 minutes) get their own lane.
alter table items add column if not exists minutes int;

-- Estimate: lesson minutes when the plan has them, else ~8 per lesson; news is a ~4 minute read;
-- a course with no syllabus defaults to 30. Collection keeps new items filled the same way.
create or replace function public.estimate_minutes(p_kind text, p_plan jsonb) returns int
language sql immutable as $$
  select case
    when p_kind = 'news' then 4
    when p_kind = 'internal' then 3
    when jsonb_array_length(coalesce(p_plan, '[]')) = 0 then 30
    else greatest(5, coalesce(
      nullif((select sum(coalesce((l->>'minutes')::int, 0)) from jsonb_array_elements(p_plan) l), 0),
      8 * jsonb_array_length(p_plan)))::int
  end
$$;

update items set minutes = estimate_minutes(kind, lesson_plan) where minutes is null;

create or replace function public.items_fill_minutes() returns trigger language plpgsql as $$
begin
  if new.minutes is null then new.minutes := estimate_minutes(new.kind, new.lesson_plan); end if;
  return new;
end $$;
drop trigger if exists items_minutes on items;
create trigger items_minutes before insert or update of lesson_plan on items
  for each row execute function items_fill_minutes();

-- Quick bites: up to 10 minutes, ranked for me (my topics first, then what's popular).
create or replace function public.quick_bites(p_limit int default 12)
returns table (id bigint, minutes int)
language sql stable security definer set search_path = public as $$
  select i.id, i.minutes from items i
  where is_zap() and i.status = 'approved' and i.kind in ('course','news') and i.minutes <= 10
    and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  order by (i.topic_slug = any(coalesce((select topics from profiles where user_id = auth.uid()), '{}'::text[]))) desc,
           i.likes + i.opens desc, coalesce(i.published_at, i.created_at) desc
  limit p_limit
$$;

select minutes, count(*) from items group by minutes order by minutes;
