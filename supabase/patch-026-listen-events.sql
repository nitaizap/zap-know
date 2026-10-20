-- Listens as a signal: the app records a 'listen' event once 30 seconds of an item's audio have
-- played (the conversation "להאזנה" or a podcast snippet). feed_v2 can read it like the others.
alter table events drop constraint if exists events_type_check;
alter table events add constraint events_type_check check (type in ('open', 'save', 'click_source', 'listen'));
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'events'::regclass and contype = 'c';
