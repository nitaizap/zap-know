-- Internal knowledge that actually opens: team playbooks, how-tos, checklists and templates live
-- inside zap UP as pages (#/doc/:id), so every resource link in a team profile works end to end.
-- In production these are written/updated through the monthly interview agent or synced from
-- opted-in SharePoint/monday spaces; in the demo they are generated and marked is_demo.

create table if not exists team_docs (
  id bigint generated always as identity primary key,
  team_id bigint not null references team_profiles(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('playbook','howto','checklist','template')),
  summary_he text not null,
  body_md text not null,
  tools text[] not null default '{}',
  is_demo boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (team_id, title)
);
create index if not exists team_docs_trgm on team_docs using gin ((title || ' ' || summary_he || ' ' || body_md) gin_trgm_ops);

alter table team_docs enable row level security;
drop policy if exists team_docs_read on team_docs;
create policy team_docs_read on team_docs for select using (is_zap());

-- Tools get a real link: [{name, what_for_he, url}] (url optional for older rows).
-- Resources point at team_docs pages: [{name, url: "#/doc/<id>", system: "zap UP"}].

-- Swipe-left hides also leave the trending lane.
create or replace function public.trending(p_limit int default 6)
returns table (id bigint, views bigint)
language sql stable security definer set search_path = public as $$
  select i.id, coalesce(w.n, 0) + 0 as views
  from items i
  left join (select item_id, count(*) n from events where type = 'open' and at > now() - interval '7 days' group by item_id) w
    on w.item_id = i.id
  where is_zap() and i.status = 'approved' and i.kind in ('course','news')
    and not exists (select 1 from hides h where h.item_id = i.id and h.user_id = auth.uid())
  order by coalesce(w.n, 0) desc, i.opens desc, i.likes desc
  limit p_limit
$$;
