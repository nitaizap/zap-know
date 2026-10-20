-- Social layer on the external feed: like / dislike (public counters), comments (no moderation,
-- report button), share (to a colleague, to Teams, or a link). Signals feed a team-aware ranking.

alter table items add column if not exists likes int not null default 0;
alter table items add column if not exists dislikes int not null default 0;
alter table items add column if not exists comments_count int not null default 0;
alter table items add column if not exists shares_count int not null default 0;

create table if not exists reactions (
  user_id uuid references auth.users(id) on delete cascade,
  item_id bigint references items(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists comments (
  id bigint generated always as identity primary key,
  item_id bigint not null references items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null check (length(body) between 1 and 1000),
  reported boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists comments_item on comments(item_id, at);

create table if not exists shares (
  id bigint generated always as identity primary key,
  item_id bigint not null references items(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid references auth.users(id) on delete cascade,
  channel text not null check (channel in ('colleague','teams','link')),
  note text,
  seen boolean not null default false,
  at timestamptz not null default now()
);

alter table reactions enable row level security;
alter table comments enable row level security;
alter table shares enable row level security;
drop policy if exists reactions_own on reactions;
create policy reactions_own on reactions for select using (user_id = auth.uid());
drop policy if exists comments_read on comments;
create policy comments_read on comments for select using (is_zap());
drop policy if exists comments_delete_own on comments;
create policy comments_delete_own on comments for delete using (user_id = auth.uid());
drop policy if exists shares_mine on shares;
create policy shares_mine on shares for select using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists shares_seen on shares;
create policy shares_seen on shares for update using (to_user = auth.uid());

-- Colleague picker: name, role and email only.
create or replace function public.people(p_q text default '') returns table (user_id uuid, name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select user_id, coalesce(display_name, split_part(email, '@', 1)), email, role
  from profiles
  where is_zap() and user_id <> auth.uid()
    and (p_q = '' or display_name ilike '%' || p_q || '%' or email ilike '%' || p_q || '%')
  order by 2 limit 20
$$;

-- Toggle a like/dislike; same value again removes it. Returns the item's fresh counters.
create or replace function public.react(p_item bigint, p_value smallint) returns json
language plpgsql security definer set search_path = public as $$
declare old smallint;
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  select value into old from reactions where user_id = auth.uid() and item_id = p_item;
  if old = p_value then
    delete from reactions where user_id = auth.uid() and item_id = p_item;
  else
    insert into reactions(user_id, item_id, value) values (auth.uid(), p_item, p_value)
      on conflict (user_id, item_id) do update set value = excluded.value, at = now();
  end if;
  update items set
    likes = (select count(*) from reactions where item_id = p_item and value = 1),
    dislikes = (select count(*) from reactions where item_id = p_item and value = -1)
  where id = p_item;
  return (select json_build_object('likes', likes, 'dislikes', dislikes,
    'mine', (select value from reactions where user_id = auth.uid() and item_id = p_item))
    from items where id = p_item);
end $$;

create or replace function public.add_comment(p_item bigint, p_body text) returns comments
language plpgsql security definer set search_path = public as $$
declare c comments;
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  insert into comments(item_id, user_id, author_name, body)
  select p_item, auth.uid(), coalesce(display_name, split_part(email, '@', 1)), trim(p_body)
  from profiles where user_id = auth.uid()
  returning * into c;
  update items set comments_count = comments_count + 1 where id = p_item;
  return c;
end $$;

create or replace function public.report_comment(p_comment bigint) returns void
language sql security definer set search_path = public as $$
  update comments set reported = true where id = p_comment and is_zap()
$$;

-- Team-aware ranking. Signals from people in the viewer's role count double; an item a
-- colleague shared with the viewer jumps to the top. popular_with names the role when
-- at least two people in it liked the item.
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
    )::numeric, 3),
    case when coalesce(sig.likes_role, 0) >= 2 then (select role from me) end,
    sh.by_name
  from items i
  left join sig on sig.item_id = i.id
  left join sh on sh.item_id = i.id
  where is_zap() and i.status = 'approved' and i.kind in ('course','news')
    and (p_topic is null or i.topic_slug = p_topic)
    and (p_kind is null or i.kind = p_kind)
  order by 2 desc
  limit p_limit
$$;

-- Collection rotates through sources (the free tier's CPU budget fits ~3 sources per run).
alter table sources add column if not exists last_pulled_at timestamptz;
select cron.alter_job((select jobid from cron.job where jobname = 'zapknow-collect'), schedule := '*/10 * * * *');
