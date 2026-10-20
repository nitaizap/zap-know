-- Listening counts as a personal and team signal (+2): the app records a 'listen' event after 30s of audio (patch-026).
-- feed_v2 reads algo_actions, so both affinities pick it up with no other change.
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
  from progress p join items i on i.id = p.item_id
  union all
  select user_id, item_id, 2.0, max(at) from events where type = 'listen' group by user_id, item_id;
revoke all on public.algo_actions from public, anon, authenticated;
