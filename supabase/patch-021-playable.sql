-- More that plays: video ids for the three YouTube-channel courses (their channel's most relevant
-- recent video, resolved from the public channel RSS on 20.10.2026), and eight active Hebrew
-- YouTube channels as sources (each checked: Hebrew titles, posting in 2026).
update items set preview_video_id = 'Cnj7oQwVDXo', thumbnail_url = 'https://i.ytimg.com/vi/Cnj7oQwVDXo/hqdefault.jpg' where id = 16 and preview_video_id is null;
update items set preview_video_id = 'NpPmidwdZPU', thumbnail_url = 'https://i.ytimg.com/vi/NpPmidwdZPU/hqdefault.jpg' where id = 17 and preview_video_id is null;
update items set preview_video_id = 'HaoMqRGlmp8', thumbnail_url = 'https://i.ytimg.com/vi/HaoMqRGlmp8/hqdefault.jpg' where id = 2 and preview_video_id is null;

insert into sources (name, kind, ref, topic_slug, status, score, reason_he) values
  ('יוסי לוי · שיווק דיגיטלי ופרסום', 'youtube_channel', 'UCIQuub-pifkws3e0HZEnfPA', 'digital-marketing', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית'),
  ('Affiliate & Digital Marketing (עברית)', 'youtube_channel', 'UCUtECROWQfyTDLuJQVc1UpA', 'digital-marketing', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית'),
  ('המיתוג הדיגיטלי', 'youtube_channel', 'UCC0NbmNOgFgxQ6tC_te9A4w', 'social', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית'),
  ('SEO RUSH · קידום אתרים', 'youtube_channel', 'UCqOYtio_ezzJKO71wNybkzw', 'geo-ecommerce', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית'),
  ('בינה מלאכותית בגובה העיניים · בר שאלתיאל', 'youtube_channel', 'UCDm80mJqJRrSvu4zM71lIUw', 'data-ai', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית'),
  ('בינטק · בינה מלאכותית עם הנרי', 'youtube_channel', 'UCA4LQVMTiRVXfQLf-6LzIdA', 'data-ai', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית'),
  ('צרות בהייטק', 'youtube_channel', 'UCZCbLxKXfQNAfyZpF9vUiAQ', 'decisions', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית'),
  ('הבריף · שיווק, תוכן ומשפיענים', 'youtube_channel', 'UCc8asMft_k01KvzgvZXNadw', 'social', 'active', 0, 'ערוץ עברי פעיל, נוסף כדי שיהיה יותר וידאו בעברית')
on conflict (kind, ref) do nothing;

select
  (select count(*) from items where status = 'approved') as approved,
  (select count(*) from items where status = 'approved' and preview_video_id is not null) as with_video,
  (select count(*) from sources where kind = 'youtube_channel' and status = 'active') as yt_channels;
