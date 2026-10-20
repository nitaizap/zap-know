-- AI avatars: a Mii-style character sheet and a square avatar made from a photo by the `avatar`
-- edge function. The photo itself is never stored; only the two results, in the public bucket.

-- Where the results live (the bucket exists since patch-014; make sure it's public).
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- People write only inside their own folder (<user_id>/...). The function writes with the service role.
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- The character sheet next to the avatar.
alter table profiles add column if not exists sheet_url text;
grant update (avatar_url, avatar_style, sheet_url) on public.profiles to authenticated;

-- Three tries per person per day, counted server side.
create table if not exists avatar_tries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists avatar_tries_user_at on avatar_tries (user_id, at);
alter table avatar_tries enable row level security;  -- service role only

-- The image model ("nano banana"); price_img_out (patch-017) meters it under the AI cap.
insert into app_settings (key, value) values ('image_model', 'gemini-2.5-flash-image')
on conflict (key) do update set value = excluded.value;

-- Social proof on every card: who liked it (my team first, me first, then most recent), batched
-- for a whole feed page in one call. Demo colleagues are included and flagged.
create or replace function public.item_likers(p_item_ids bigint[], p_per int default 3)
returns table (item_id bigint, user_id uuid, display_name text, avatar_url text, avatar_style text, avatar_color text,
               team text, is_demo boolean, liked_at timestamptz, total int)
language sql stable security definer set search_path = public as $$
  with me as (select role from profiles where user_id = auth.uid()),
  r as (
    select x.item_id, x.user_id, x.at,
      count(*) over (partition by x.item_id) as total,
      row_number() over (partition by x.item_id
        order by (x.user_id = auth.uid()) desc, (p.role is not distinct from (select role from me)) desc, x.at desc) as rn
    from reactions x join profiles p on p.user_id = x.user_id
    where is_zap() and x.value = 1 and x.item_id = any(p_item_ids)
  )
  select r.item_id, r.user_id, coalesce(p.display_name, split_part(p.email, '@', 1)), p.avatar_url, p.avatar_style, p.avatar_color,
         p.role, coalesce(p.is_demo, false), r.at, r.total::int
  from r join profiles p on p.user_id = r.user_id
  where r.rn <= greatest(1, least(coalesce(p_per, 3), 50))
  order by r.item_id, r.rn
$$;
revoke execute on function public.item_likers(bigint[], int) from public, anon;
grant execute on function public.item_likers(bigint[], int) to authenticated;
