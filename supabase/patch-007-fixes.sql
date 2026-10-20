-- Review fixes (run after patch-006 and seed-demo-people).

-- 1. Security-definer helpers meant for the service role were still executable by anyone:
--    Postgres grants EXECUTE to PUBLIC by default (and Supabase also to anon/authenticated),
--    so leaderboard_public() listed employee names + points to anonymous callers with the
--    publishable key, and budget_bonus_for() answered for any user id.
revoke execute on function public.leaderboard_public(text, int) from public, anon, authenticated;
revoke execute on function public.budget_bonus_for(uuid) from public, anon, authenticated;
grant execute on function public.leaderboard_public(text, int) to service_role;
grant execute on function public.budget_bonus_for(uuid) to service_role;
-- my_budget() keeps working: it is security definer, so its inner call runs as the owner.

-- 2. shares_seen let the recipient update every column (e.g. rewrite from_user/note).
--    Only "seen" should be writable.
revoke update on public.shares from anon, authenticated;
grant update (seen) on public.shares to authenticated;

-- 3. One report hid an item from everyone immediately, so a single click during the live demo
--    (or one annoyed colleague) removes content. Now the item is hidden only once two different
--    people report it; a single report still lands in L&D's queue.
create or replace function public.report_item(p_item bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  insert into reports(item_id, user_id, note) values (p_item, auth.uid(), p_note);
  if (select count(distinct user_id) from reports where item_id = p_item and not resolved) >= 2 then
    update items set status = 'pending' where id = p_item and status = 'approved';
  end if;
end $$;

-- 4. add_comment bumped comments_count even when no row was inserted (caller without a profile).
create or replace function public.add_comment(p_item bigint, p_body text) returns comments
language plpgsql security definer set search_path = public as $$
declare c comments;
begin
  if not is_zap() then raise exception 'forbidden'; end if;
  insert into comments(item_id, user_id, author_name, body)
  select p_item, auth.uid(), coalesce(display_name, split_part(email, '@', 1)), trim(p_body)
  from profiles where user_id = auth.uid()
  returning * into c;
  if c.id is null then raise exception 'complete onboarding first'; end if;
  update items set comments_count = comments_count + 1 where id = p_item;
  return c;
end $$;
