-- Run after schema.sql. Closes two gaps the frontend relies on.

-- 1. profiles_own is "for all", so without this a user could upsert is_admin = true on their own row.
--    Employees may only write their own non-privileged columns; is_admin is set by L&D via the dashboard.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (user_id, email, display_name, role, topics) on public.profiles to authenticated;
grant update (user_id, email, display_name, role, topics) on public.profiles to authenticated;

-- 2. The admin screen marks reports resolved when an item is re-approved.
create policy reports_admin_update on public.reports for update using (is_admin());
