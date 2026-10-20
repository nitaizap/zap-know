-- The weekly episode's segments (פתיחה אישית, השבוע שלכם, מה מחכה לכם, ...), shown as chips on
-- the episode card in the home feed. The weekly function still saves episodes without it.
alter table episodes add column if not exists segments text[] not null default '{}';
