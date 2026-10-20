-- Demo colleagues for the hackathon demo. Every row is marked: display_name ends with (דמו),
-- emails are on the reserved .invalid domain, and cleanup is one statement at the bottom (commented).
alter table profiles add column if not exists is_demo boolean not null default false;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','a6deca95-bec2-39a4-75b0-124ec6348ff6','authenticated','authenticated','demo01@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('a6deca95-bec2-39a4-75b0-124ec6348ff6','demo01@zap-up.invalid','נועה (דמו)','PPC','{ppc,digital-marketing}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','7b3b7105-366e-b15e-5050-2bccd16ac3b6','authenticated','authenticated','demo02@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('7b3b7105-366e-b15e-5050-2bccd16ac3b6','demo02@zap-up.invalid','עומר (דמו)','PPC','{ppc,digital-marketing}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','cbb7fbcf-dbfc-54d4-a697-e4850ff715a1','authenticated','authenticated','demo03@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('cbb7fbcf-dbfc-54d4-a697-e4850ff715a1','demo03@zap-up.invalid','שירה (דמו)','PPC','{ppc,digital-marketing}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','083212df-25e4-e68b-14f4-ddc07ec5ff12','authenticated','authenticated','demo04@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('083212df-25e4-e68b-14f4-ddc07ec5ff12','demo04@zap-up.invalid','איתי (דמו)','סושיאל','{social,digital-marketing}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','10c440e0-341f-edd2-8223-fbeb52921f4a','authenticated','authenticated','demo05@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('10c440e0-341f-edd2-8223-fbeb52921f4a','demo05@zap-up.invalid','מאיה (דמו)','סושיאל','{social,digital-marketing}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','8e7baf14-171d-8644-6d53-51713f052361','authenticated','authenticated','demo06@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('8e7baf14-171d-8644-6d53-51713f052361','demo06@zap-up.invalid','יונתן (דמו)','דאטה','{data-ai,geo-ecommerce}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','8710ec44-abb2-6ca6-a13c-ad1e38f0f413','authenticated','authenticated','demo07@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('8710ec44-abb2-6ca6-a13c-ad1e38f0f413','demo07@zap-up.invalid','טל (דמו)','דאטה','{data-ai,geo-ecommerce}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','09fb9aff-0cec-0f95-275a-90aa36b30269','authenticated','authenticated','demo08@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('09fb9aff-0cec-0f95-275a-90aa36b30269','demo08@zap-up.invalid','רוני (דמו)','מוצר','{data-ai,geo-ecommerce}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','1d26ae1a-f7a5-4a22-f737-909f28808268','authenticated','authenticated','demo09@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('1d26ae1a-f7a5-4a22-f737-909f28808268','demo09@zap-up.invalid','אביב (דמו)','מוצר','{data-ai,geo-ecommerce}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','772df7da-44f8-8c0c-bff5-05e2be1612a7','authenticated','authenticated','demo10@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('772df7da-44f8-8c0c-bff5-05e2be1612a7','demo10@zap-up.invalid','ליה (דמו)','שיווק','{digital-marketing,social}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','c736afa8-fef6-a2c3-466b-dac0683168ad','authenticated','authenticated','demo11@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('c736afa8-fef6-a2c3-466b-dac0683168ad','demo11@zap-up.invalid','גיא (דמו)','שיווק','{digital-marketing,social}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc','authenticated','authenticated','demo12@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc','demo12@zap-up.invalid','דנה (דמו)','מכירות','{digital-marketing,ppc}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','b6c257d4-eb02-a05a-71d4-a464af89bf78','authenticated','authenticated','demo13@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('b6c257d4-eb02-a05a-71d4-a464af89bf78','demo13@zap-up.invalid','עידו (דמו)','מכירות','{digital-marketing,ppc}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','51b4b29d-fd2c-0114-1733-19c1ba4e2f5b','authenticated','authenticated','demo14@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('51b4b29d-fd2c-0114-1733-19c1ba4e2f5b','demo14@zap-up.invalid','הילה (דמו)','שירות לקוחות','{social,data-ai}',true) on conflict (user_id) do nothing;
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88','authenticated','authenticated','demo15@zap-up.invalid','',now(),'{"provider":"demo"}','{}',now() - interval '40 days',now()) on conflict (id) do nothing;
insert into profiles (user_id,email,display_name,role,topics,is_demo) values ('344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88','demo15@zap-up.invalid','אורי (דמו)','פיתוח','{data-ai,geo-ecommerce}',true) on conflict (user_id) do nothing;

-- activity for demo user 1
insert into events (user_id,item_id,type,at)
  select 'a6deca95-bec2-39a4-75b0-124ec6348ff6', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'a6deca95-bec2-39a4-75b0-124ec6348ff6') limit 10;
delete from events where user_id='a6deca95-bec2-39a4-75b0-124ec6348ff6' and at > now();
insert into reactions (user_id,item_id,value,at)
  select 'a6deca95-bec2-39a4-75b0-124ec6348ff6', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'ra6deca95-bec2-39a4-75b0-124ec6348ff6') limit 5
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select 'a6deca95-bec2-39a4-75b0-124ec6348ff6', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 'sa6deca95-bec2-39a4-75b0-124ec6348ff6') limit 2
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select 'a6deca95-bec2-39a4-75b0-124ec6348ff6', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 2) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'pa6deca95-bec2-39a4-75b0-124ec6348ff6') limit 1
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='a6deca95-bec2-39a4-75b0-124ec6348ff6';
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'a6deca95-bec2-39a4-75b0-124ec6348ff6', (select display_name from profiles where user_id='a6deca95-bec2-39a4-75b0-124ec6348ff6'), 'מתחבר לפרויקט שאנחנו עושים עכשיו', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0a6deca95-bec2-39a4-75b0-124ec6348ff6') limit 1;

-- activity for demo user 2
insert into events (user_id,item_id,type,at)
  select '7b3b7105-366e-b15e-5050-2bccd16ac3b6', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '7b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 22;
delete from events where user_id='7b3b7105-366e-b15e-5050-2bccd16ac3b6' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '7b3b7105-366e-b15e-5050-2bccd16ac3b6', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r7b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 11
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '7b3b7105-366e-b15e-5050-2bccd16ac3b6', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's7b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 4
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '7b3b7105-366e-b15e-5050-2bccd16ac3b6', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 4) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p7b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 3
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='7b3b7105-366e-b15e-5050-2bccd16ac3b6';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '7b3b7105-366e-b15e-5050-2bccd16ac3b6', (select display_name from profiles where user_id='7b3b7105-366e-b15e-5050-2bccd16ac3b6'), 'יש לזה גרסה מעודכנת?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c07b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '7b3b7105-366e-b15e-5050-2bccd16ac3b6', (select display_name from profiles where user_id='7b3b7105-366e-b15e-5050-2bccd16ac3b6'), 'קצר וברור, תודה על הסיכום', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c17b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '7b3b7105-366e-b15e-5050-2bccd16ac3b6', (select display_name from profiles where user_id='7b3b7105-366e-b15e-5050-2bccd16ac3b6'), 'שווה לדבר על זה בישיבת צוות', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c27b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '7b3b7105-366e-b15e-5050-2bccd16ac3b6', '10c440e0-341f-edd2-8223-fbeb52921f4a', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh7b3b7105-366e-b15e-5050-2bccd16ac3b6') limit 2;

-- activity for demo user 3
insert into events (user_id,item_id,type,at)
  select 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1') limit 16;
delete from events where user_id='cbb7fbcf-dbfc-54d4-a697-e4850ff715a1' and at > now();
insert into reactions (user_id,item_id,value,at)
  select 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'rcbb7fbcf-dbfc-54d4-a697-e4850ff715a1') limit 8
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 'scbb7fbcf-dbfc-54d4-a697-e4850ff715a1') limit 3
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 3) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'pcbb7fbcf-dbfc-54d4-a697-e4850ff715a1') limit 2
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='cbb7fbcf-dbfc-54d4-a697-e4850ff715a1';
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', (select display_name from profiles where user_id='cbb7fbcf-dbfc-54d4-a697-e4850ff715a1'), 'מישהו כבר הטמיע את זה בקמפיין?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0cbb7fbcf-dbfc-54d4-a697-e4850ff715a1') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', (select display_name from profiles where user_id='cbb7fbcf-dbfc-54d4-a697-e4850ff715a1'), 'החלק השני קצת בסיסי, אבל הסוף מעולה', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c1cbb7fbcf-dbfc-54d4-a697-e4850ff715a1') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', 'c736afa8-fef6-a2c3-466b-dac0683168ad', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'shcbb7fbcf-dbfc-54d4-a697-e4850ff715a1') limit 1;

-- activity for demo user 4
insert into events (user_id,item_id,type,at)
  select '083212df-25e4-e68b-14f4-ddc07ec5ff12', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 22;
delete from events where user_id='083212df-25e4-e68b-14f4-ddc07ec5ff12' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '083212df-25e4-e68b-14f4-ddc07ec5ff12', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 11
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '083212df-25e4-e68b-14f4-ddc07ec5ff12', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 4
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '083212df-25e4-e68b-14f4-ddc07ec5ff12', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 4) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 3
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='083212df-25e4-e68b-14f4-ddc07ec5ff12';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '083212df-25e4-e68b-14f4-ddc07ec5ff12', (select display_name from profiles where user_id='083212df-25e4-e68b-14f4-ddc07ec5ff12'), 'ניסינו את זה אצלנו בצוות, עובד', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '083212df-25e4-e68b-14f4-ddc07ec5ff12', (select display_name from profiles where user_id='083212df-25e4-e68b-14f4-ddc07ec5ff12'), 'שווה את הזמן, במיוחד החלק על המדידה', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c1083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '083212df-25e4-e68b-14f4-ddc07ec5ff12', (select display_name from profiles where user_id='083212df-25e4-e68b-14f4-ddc07ec5ff12'), 'שמרתי לשבוע הבא', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c2083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '083212df-25e4-e68b-14f4-ddc07ec5ff12', '7b3b7105-366e-b15e-5050-2bccd16ac3b6', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh083212df-25e4-e68b-14f4-ddc07ec5ff12') limit 2;

-- activity for demo user 5
insert into events (user_id,item_id,type,at)
  select '10c440e0-341f-edd2-8223-fbeb52921f4a', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '10c440e0-341f-edd2-8223-fbeb52921f4a') limit 10;
delete from events where user_id='10c440e0-341f-edd2-8223-fbeb52921f4a' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '10c440e0-341f-edd2-8223-fbeb52921f4a', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r10c440e0-341f-edd2-8223-fbeb52921f4a') limit 5
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '10c440e0-341f-edd2-8223-fbeb52921f4a', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's10c440e0-341f-edd2-8223-fbeb52921f4a') limit 2
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '10c440e0-341f-edd2-8223-fbeb52921f4a', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 2) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p10c440e0-341f-edd2-8223-fbeb52921f4a') limit 1
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='10c440e0-341f-edd2-8223-fbeb52921f4a';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '10c440e0-341f-edd2-8223-fbeb52921f4a', (select display_name from profiles where user_id='10c440e0-341f-edd2-8223-fbeb52921f4a'), 'ניסינו את זה אצלנו בצוות, עובד', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c010c440e0-341f-edd2-8223-fbeb52921f4a') limit 1;

-- activity for demo user 6
insert into events (user_id,item_id,type,at)
  select '8e7baf14-171d-8644-6d53-51713f052361', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '8e7baf14-171d-8644-6d53-51713f052361') limit 16;
delete from events where user_id='8e7baf14-171d-8644-6d53-51713f052361' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '8e7baf14-171d-8644-6d53-51713f052361', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r8e7baf14-171d-8644-6d53-51713f052361') limit 8
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '8e7baf14-171d-8644-6d53-51713f052361', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's8e7baf14-171d-8644-6d53-51713f052361') limit 3
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '8e7baf14-171d-8644-6d53-51713f052361', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 3) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p8e7baf14-171d-8644-6d53-51713f052361') limit 2
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='8e7baf14-171d-8644-6d53-51713f052361';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '8e7baf14-171d-8644-6d53-51713f052361', (select display_name from profiles where user_id='8e7baf14-171d-8644-6d53-51713f052361'), 'קצר וברור, תודה על הסיכום', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c08e7baf14-171d-8644-6d53-51713f052361') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '8e7baf14-171d-8644-6d53-51713f052361', (select display_name from profiles where user_id='8e7baf14-171d-8644-6d53-51713f052361'), 'שווה את הזמן, במיוחד החלק על המדידה', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c18e7baf14-171d-8644-6d53-51713f052361') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '8e7baf14-171d-8644-6d53-51713f052361', '772df7da-44f8-8c0c-bff5-05e2be1612a7', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh8e7baf14-171d-8644-6d53-51713f052361') limit 1;

-- activity for demo user 7
insert into events (user_id,item_id,type,at)
  select '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '8710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 28;
delete from events where user_id='8710ec44-abb2-6ca6-a13c-ad1e38f0f413' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r8710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 14
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's8710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 5
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 5) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p8710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 4
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='8710ec44-abb2-6ca6-a13c-ad1e38f0f413';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', (select display_name from profiles where user_id='8710ec44-abb2-6ca6-a13c-ad1e38f0f413'), 'יש לזה גרסה מעודכנת?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c08710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', (select display_name from profiles where user_id='8710ec44-abb2-6ca6-a13c-ad1e38f0f413'), 'יש לזה גרסה מעודכנת?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c18710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', (select display_name from profiles where user_id='8710ec44-abb2-6ca6-a13c-ad1e38f0f413'), 'הכי שימושי שראיתי החודש', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c28710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', (select display_name from profiles where user_id='8710ec44-abb2-6ca6-a13c-ad1e38f0f413'), 'מתחבר לפרויקט שאנחנו עושים עכשיו', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c38710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '8710ec44-abb2-6ca6-a13c-ad1e38f0f413', 'cbb7fbcf-dbfc-54d4-a697-e4850ff715a1', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh8710ec44-abb2-6ca6-a13c-ad1e38f0f413') limit 3;

-- activity for demo user 8
insert into events (user_id,item_id,type,at)
  select '09fb9aff-0cec-0f95-275a-90aa36b30269', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '09fb9aff-0cec-0f95-275a-90aa36b30269') limit 28;
delete from events where user_id='09fb9aff-0cec-0f95-275a-90aa36b30269' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '09fb9aff-0cec-0f95-275a-90aa36b30269', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r09fb9aff-0cec-0f95-275a-90aa36b30269') limit 14
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '09fb9aff-0cec-0f95-275a-90aa36b30269', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's09fb9aff-0cec-0f95-275a-90aa36b30269') limit 5
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '09fb9aff-0cec-0f95-275a-90aa36b30269', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 5) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p09fb9aff-0cec-0f95-275a-90aa36b30269') limit 4
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='09fb9aff-0cec-0f95-275a-90aa36b30269';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '09fb9aff-0cec-0f95-275a-90aa36b30269', (select display_name from profiles where user_id='09fb9aff-0cec-0f95-275a-90aa36b30269'), 'הכי שימושי שראיתי החודש', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c009fb9aff-0cec-0f95-275a-90aa36b30269') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '09fb9aff-0cec-0f95-275a-90aa36b30269', (select display_name from profiles where user_id='09fb9aff-0cec-0f95-275a-90aa36b30269'), 'הכי שימושי שראיתי החודש', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c109fb9aff-0cec-0f95-275a-90aa36b30269') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '09fb9aff-0cec-0f95-275a-90aa36b30269', (select display_name from profiles where user_id='09fb9aff-0cec-0f95-275a-90aa36b30269'), 'קצר וברור, תודה על הסיכום', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c209fb9aff-0cec-0f95-275a-90aa36b30269') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '09fb9aff-0cec-0f95-275a-90aa36b30269', (select display_name from profiles where user_id='09fb9aff-0cec-0f95-275a-90aa36b30269'), 'מישהו כבר הטמיע את זה בקמפיין?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c309fb9aff-0cec-0f95-275a-90aa36b30269') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '09fb9aff-0cec-0f95-275a-90aa36b30269', '10c440e0-341f-edd2-8223-fbeb52921f4a', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh09fb9aff-0cec-0f95-275a-90aa36b30269') limit 3;

-- activity for demo user 9
insert into events (user_id,item_id,type,at)
  select '1d26ae1a-f7a5-4a22-f737-909f28808268', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '1d26ae1a-f7a5-4a22-f737-909f28808268') limit 16;
delete from events where user_id='1d26ae1a-f7a5-4a22-f737-909f28808268' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '1d26ae1a-f7a5-4a22-f737-909f28808268', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r1d26ae1a-f7a5-4a22-f737-909f28808268') limit 8
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '1d26ae1a-f7a5-4a22-f737-909f28808268', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's1d26ae1a-f7a5-4a22-f737-909f28808268') limit 3
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '1d26ae1a-f7a5-4a22-f737-909f28808268', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 3) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p1d26ae1a-f7a5-4a22-f737-909f28808268') limit 2
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='1d26ae1a-f7a5-4a22-f737-909f28808268';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '1d26ae1a-f7a5-4a22-f737-909f28808268', (select display_name from profiles where user_id='1d26ae1a-f7a5-4a22-f737-909f28808268'), 'שווה לדבר על זה בישיבת צוות', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c01d26ae1a-f7a5-4a22-f737-909f28808268') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '1d26ae1a-f7a5-4a22-f737-909f28808268', (select display_name from profiles where user_id='1d26ae1a-f7a5-4a22-f737-909f28808268'), 'הכי שימושי שראיתי החודש', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c11d26ae1a-f7a5-4a22-f737-909f28808268') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '1d26ae1a-f7a5-4a22-f737-909f28808268', '09fb9aff-0cec-0f95-275a-90aa36b30269', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh1d26ae1a-f7a5-4a22-f737-909f28808268') limit 1;

-- activity for demo user 10
insert into events (user_id,item_id,type,at)
  select '772df7da-44f8-8c0c-bff5-05e2be1612a7', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '772df7da-44f8-8c0c-bff5-05e2be1612a7') limit 16;
delete from events where user_id='772df7da-44f8-8c0c-bff5-05e2be1612a7' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '772df7da-44f8-8c0c-bff5-05e2be1612a7', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r772df7da-44f8-8c0c-bff5-05e2be1612a7') limit 8
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '772df7da-44f8-8c0c-bff5-05e2be1612a7', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's772df7da-44f8-8c0c-bff5-05e2be1612a7') limit 3
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '772df7da-44f8-8c0c-bff5-05e2be1612a7', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 3) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p772df7da-44f8-8c0c-bff5-05e2be1612a7') limit 2
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='772df7da-44f8-8c0c-bff5-05e2be1612a7';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '772df7da-44f8-8c0c-bff5-05e2be1612a7', (select display_name from profiles where user_id='772df7da-44f8-8c0c-bff5-05e2be1612a7'), 'קצר וברור, תודה על הסיכום', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0772df7da-44f8-8c0c-bff5-05e2be1612a7') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '772df7da-44f8-8c0c-bff5-05e2be1612a7', (select display_name from profiles where user_id='772df7da-44f8-8c0c-bff5-05e2be1612a7'), 'שווה את הזמן, במיוחד החלק על המדידה', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c1772df7da-44f8-8c0c-bff5-05e2be1612a7') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '772df7da-44f8-8c0c-bff5-05e2be1612a7', '344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh772df7da-44f8-8c0c-bff5-05e2be1612a7') limit 1;

-- activity for demo user 11
insert into events (user_id,item_id,type,at)
  select 'c736afa8-fef6-a2c3-466b-dac0683168ad', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c736afa8-fef6-a2c3-466b-dac0683168ad') limit 10;
delete from events where user_id='c736afa8-fef6-a2c3-466b-dac0683168ad' and at > now();
insert into reactions (user_id,item_id,value,at)
  select 'c736afa8-fef6-a2c3-466b-dac0683168ad', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'rc736afa8-fef6-a2c3-466b-dac0683168ad') limit 5
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select 'c736afa8-fef6-a2c3-466b-dac0683168ad', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 'sc736afa8-fef6-a2c3-466b-dac0683168ad') limit 2
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select 'c736afa8-fef6-a2c3-466b-dac0683168ad', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 2) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'pc736afa8-fef6-a2c3-466b-dac0683168ad') limit 1
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='c736afa8-fef6-a2c3-466b-dac0683168ad';
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'c736afa8-fef6-a2c3-466b-dac0683168ad', (select display_name from profiles where user_id='c736afa8-fef6-a2c3-466b-dac0683168ad'), 'קצר וברור, תודה על הסיכום', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0c736afa8-fef6-a2c3-466b-dac0683168ad') limit 1;

-- activity for demo user 12
insert into events (user_id,item_id,type,at)
  select 'c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc') limit 10;
delete from events where user_id='c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc' and at > now();
insert into reactions (user_id,item_id,value,at)
  select 'c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'rc78cdf0e-34cf-2b1a-c9a0-6c29f96951dc') limit 5
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select 'c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 'sc78cdf0e-34cf-2b1a-c9a0-6c29f96951dc') limit 2
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select 'c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 2) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'pc78cdf0e-34cf-2b1a-c9a0-6c29f96951dc') limit 1
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc';
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc', (select display_name from profiles where user_id='c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc'), 'יש לזה גרסה מעודכנת?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0c78cdf0e-34cf-2b1a-c9a0-6c29f96951dc') limit 1;

-- activity for demo user 13
insert into events (user_id,item_id,type,at)
  select 'b6c257d4-eb02-a05a-71d4-a464af89bf78', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'b6c257d4-eb02-a05a-71d4-a464af89bf78') limit 22;
delete from events where user_id='b6c257d4-eb02-a05a-71d4-a464af89bf78' and at > now();
insert into reactions (user_id,item_id,value,at)
  select 'b6c257d4-eb02-a05a-71d4-a464af89bf78', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'rb6c257d4-eb02-a05a-71d4-a464af89bf78') limit 11
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select 'b6c257d4-eb02-a05a-71d4-a464af89bf78', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 'sb6c257d4-eb02-a05a-71d4-a464af89bf78') limit 4
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select 'b6c257d4-eb02-a05a-71d4-a464af89bf78', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 4) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'pb6c257d4-eb02-a05a-71d4-a464af89bf78') limit 3
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='b6c257d4-eb02-a05a-71d4-a464af89bf78';
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'b6c257d4-eb02-a05a-71d4-a464af89bf78', (select display_name from profiles where user_id='b6c257d4-eb02-a05a-71d4-a464af89bf78'), 'שמרתי לשבוע הבא', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0b6c257d4-eb02-a05a-71d4-a464af89bf78') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'b6c257d4-eb02-a05a-71d4-a464af89bf78', (select display_name from profiles where user_id='b6c257d4-eb02-a05a-71d4-a464af89bf78'), 'מישהו כבר הטמיע את זה בקמפיין?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c1b6c257d4-eb02-a05a-71d4-a464af89bf78') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, 'b6c257d4-eb02-a05a-71d4-a464af89bf78', (select display_name from profiles where user_id='b6c257d4-eb02-a05a-71d4-a464af89bf78'), 'שווה את הזמן, במיוחד החלק על המדידה', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c2b6c257d4-eb02-a05a-71d4-a464af89bf78') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, 'b6c257d4-eb02-a05a-71d4-a464af89bf78', '7b3b7105-366e-b15e-5050-2bccd16ac3b6', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'shb6c257d4-eb02-a05a-71d4-a464af89bf78') limit 2;

-- activity for demo user 14
insert into events (user_id,item_id,type,at)
  select '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 28;
delete from events where user_id='51b4b29d-fd2c-0114-1733-19c1ba4e2f5b' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r51b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 14
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's51b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 5
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 5) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p51b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 4
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='51b4b29d-fd2c-0114-1733-19c1ba4e2f5b';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', (select display_name from profiles where user_id='51b4b29d-fd2c-0114-1733-19c1ba4e2f5b'), 'מישהו כבר הטמיע את זה בקמפיין?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c051b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', (select display_name from profiles where user_id='51b4b29d-fd2c-0114-1733-19c1ba4e2f5b'), 'שווה לדבר על זה בישיבת צוות', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c151b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', (select display_name from profiles where user_id='51b4b29d-fd2c-0114-1733-19c1ba4e2f5b'), 'יש לזה גרסה מעודכנת?', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c251b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 1;
insert into comments (item_id,user_id,author_name,body,at)
  select id, '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', (select display_name from profiles where user_id='51b4b29d-fd2c-0114-1733-19c1ba4e2f5b'), 'שווה לדבר על זה בישיבת צוות', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c351b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 1;
insert into shares (item_id,from_user,to_user,channel,note,at)
  select id, '51b4b29d-fd2c-0114-1733-19c1ba4e2f5b', '772df7da-44f8-8c0c-bff5-05e2be1612a7', 'colleague', 'זה בדיוק מה שדיברנו עליו', now() - (random() * interval '20 days')
  from items where status='approved' order by md5(id::text || 'sh51b4b29d-fd2c-0114-1733-19c1ba4e2f5b') limit 3;

-- activity for demo user 15
insert into events (user_id,item_id,type,at)
  select '344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88', id, 'open', date_trunc('month', now()) - interval '25 days' + (random() * interval '50 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || '344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88') limit 10;
delete from events where user_id='344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88' and at > now();
insert into reactions (user_id,item_id,value,at)
  select '344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88', id, case when random() < 0.85 then 1 else -1 end, now() - (random() * interval '30 days')
  from items where status='approved' order by md5(id::text || 'r344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88') limit 5
  on conflict do nothing;
insert into saves (user_id,item_id,created_at)
  select '344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88', id, now() - (random() * interval '30 days')
  from items where status='approved' and kind='course' order by md5(id::text || 's344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88') limit 2
  on conflict do nothing;
insert into progress (user_id,item_id,lessons_done,updated_at)
  select '344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88', id, (select coalesce(array_agg(g), '{}') from generate_series(0, least(jsonb_array_length(lesson_plan), 2) - 1) g),
         date_trunc('month', now()) - interval '20 days' + (random() * interval '40 days')
  from items where status='approved' and kind='course' and jsonb_array_length(lesson_plan) > 0
  order by md5(id::text || 'p344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88') limit 1
  on conflict do nothing;
update progress set updated_at = least(updated_at, now()) where user_id='344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88';
insert into comments (item_id,user_id,author_name,body,at)
  select id, '344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88', (select display_name from profiles where user_id='344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88'), 'שווה את הזמן, במיוחד החלק על המדידה', now() - (random() * interval '28 days')
  from items where status='approved' and kind in ('course','news') order by md5(id::text || 'c0344e6398-cb01-9bc7-e0e6-9d6bcc2f4d88') limit 1;

-- refresh public counters
update items i set
  likes = (select count(*) from reactions r where r.item_id = i.id and r.value = 1),
  dislikes = (select count(*) from reactions r where r.item_id = i.id and r.value = -1),
  comments_count = (select count(*) from comments c where c.item_id = i.id),
  shares_count = (select count(*) from shares s where s.item_id = i.id),
  opens = greatest(opens, (select count(*) from events e where e.item_id = i.id and e.type = 'open')),
  saves = (select count(*) from saves s where s.item_id = i.id);

select (select count(*) from profiles where is_demo) demo_people, (select count(*) from points_ledger) ledger_rows;

-- CLEANUP after the hackathon (removes demo people and everything they did):
-- delete from auth.users where email like '%@zap-up.invalid';