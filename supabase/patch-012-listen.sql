-- "להאזנה": cached two-host audio conversations for items and team docs.
create table if not exists listens (
  kind text not null check (kind in ('item','doc')),
  ref_id bigint not null,
  title text,
  script jsonb not null,
  audio_url text,
  created_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
alter table listens enable row level security;
drop policy if exists listens_read on listens;
create policy listens_read on listens for select using (is_zap());
