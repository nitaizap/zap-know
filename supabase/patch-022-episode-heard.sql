-- The weekly-episode bell: an episode counts as heard once 80% of it played or the person
-- marked it. Only the heard flag can change, and only on one's own episodes.
alter table episodes add column if not exists heard_at timestamptz;

create or replace function public.mark_episode_heard(p_week date)
returns timestamptz
language sql volatile security definer set search_path = public as $$
  update episodes set heard_at = coalesce(heard_at, now())
  where user_id = auth.uid() and week = p_week and is_zap()
  returning heard_at
$$;
revoke execute on function public.mark_episode_heard(date) from public, anon;
grant execute on function public.mark_episode_heard(date) to authenticated;

select
  (select count(*) from episodes) as episodes_total,
  (select count(*) from episodes e join profiles p on p.user_id = e.user_id where lower(p.email) = 'nitaiz@d.co.il') as owner_episodes,
  (select string_agg(e.week::text || case when e.audio_url is null then ' (no audio)' else '' end, ', ' order by e.week desc)
     from episodes e join profiles p on p.user_id = e.user_id where lower(p.email) = 'nitaiz@d.co.il') as owner_weeks;
