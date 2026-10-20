-- "להוסיף כמקור קבוע" from a post: admins add an active source, everyone else a suggestion
-- (status 'proposed') that L&D approves in the admin screen.
drop policy if exists sources_insert on sources;
create policy sources_insert on sources for insert to authenticated
  with check (is_zap() and (status = 'proposed' or is_admin()));
select count(*) as sources from sources;
