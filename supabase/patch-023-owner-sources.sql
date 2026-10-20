-- The owner's source list (20.10): recurring Hebrew sources for the external lane, plus two
-- one-time posts for "קורה ב-zap". Every feed below was fetched and checked before it was added.
-- Instagram, LinkedIn and Facebook pages have no public feed and aren't scraped (needs the
-- official APIs with a page admin's token). The WeTransfer link waits for the owner.

insert into sources (name, kind, ref, topic_slug, status, score, reason_he) values
  ('מנהלי שיווק מצייצים · אבי זיתן', 'podcast', 'https://www.omnycontent.com/d/playlist/178d72a7-a889-4132-8008-a5cc014ed109/7a62778d-d37b-405f-bed5-a823004b5077/ecc90fcf-a532-4177-9780-a823004c877f/podcast.rss', 'digital-marketing', 'active', 0, 'מקור שהוסיפו בצוות'),
  ('שיווק דיגיטלי עם איתי ורצ''יק', 'podcast', 'https://anchor.fm/s/194a3418/podcast/rss', 'ppc', 'active', 0, 'מקור שהוסיפו בצוות'),
  ('מוצרלה · פודקאסט על ניהול מוצר', 'podcast', 'http://feeds.feedburner.com/Mozzarella-AProductManagementPodcast', 'data-ai', 'active', 0, 'מקור שהוסיפו בצוות'),
  ('איש השיווק הכי טוב בעולם · יעקב צדק', 'podcast', 'https://anchor.fm/s/9662d1a8/podcast/rss', 'digital-marketing', 'active', 0, 'מקור שהוסיפו בצוות'),
  ('המגדלור · איתי צמיר', 'podcast', 'https://anchor.fm/s/1034a3c84/podcast/rss', 'digital-marketing', 'active', 0, 'מקור שהוסיפו בצוות'),
  ('ניהול מוצר · גרסת הבמאי', 'podcast', 'https://anchor.fm/s/fa4e7e24/podcast/rss', 'data-ai', 'active', 0, 'מקור שהוסיפו בצוות (הפרק האחרון מ-2024)'),
  ('Let''s AI · בינה מלאכותית', 'rss', 'https://letsai.co.il/feed/', 'data-ai', 'active', 0, 'מקור שהוסיפו בצוות'),
  ('Goodpoint · הבלוג', 'rss', 'https://goodpoint.co.il/feed/', 'social', 'active', 0, 'מקור שהוסיפו בצוות'),
  ('GoodPoint · Creative Storytelling', 'youtube_channel', 'UCAEdoPUt0V1hdiF81Cx27Sw', 'social', 'active', 0, 'מקור שהוסיפו בצוות (הסרטון האחרון מ-2019)'),
  ('קמפוס IL', 'youtube_channel', 'UCx-_jbNcgaZJ2OlPmyuGTSg', 'digital-marketing', 'active', 0, 'מקור שהוסיפו בצוות')
on conflict (kind, ref) do nothing;

-- Never-pulled sources get their first pull on the collector's next runs; after that, once a day.
update sources set last_pulled_at = null
where reason_he like 'מקור שהוסיפו בצוות%';

-- One-time posts for "קורה ב-zap" (internal lane). source_url matches what the collector
-- would use, so the podcast episode isn't added twice.
insert into items (kind, topic_slug, verticals, title_he, summary_he, why_he, lesson_plan, source_name, source_url,
                   thumbnail_url, audio_url, minutes, published_at, status, is_demo, lang)
values
  ('internal', 'digital-marketing', '{}',
   'פרק 427: אושרת כהן, סמנכ״לית חטיבת לקוחות קבוצת זאפ',
   'אושרת כהן, סמנכ״לית חטיבת הלקוחות בקבוצת זאפ, מתארחת בפודקאסט מנהלי שיווק מצייצים של אבי זיתן.',
   'קורה ב-zap: מישהי מאיתנו מדברת על השיווק שלנו',
   '[]', 'מנהלי שיווק מצייצים', 'https://omny.fm/shows/shivuk-on-the-go/426-1',
   'https://www.omnycontent.com/d/clips/178d72a7-a889-4132-8008-a5cc014ed109/7a62778d-d37b-405f-bed5-a823004b5077/3905c236-eeaf-4e0e-9c1a-b4e40134e6c8/image.jpg?size=Large',
   'https://traffic.omny.fm/d/clips/178d72a7-a889-4132-8008-a5cc014ed109/7a62778d-d37b-405f-bed5-a823004b5077/3905c236-eeaf-4e0e-9c1a-b4e40134e6c8/audio.mp3',
   26, '2026-10-15 18:47:26+00', 'approved', false, 'he'),
  ('internal', 'social', '{}',
   'סרטוני ה-AI של zap',
   'תיק עבודות של סרטוני AI שכבר עלו ברשתות: בעלי מקצוע, מסעדות, אסתטיקה וביוטי, וסרטונים בסגנון פודקאסט.',
   'קורה ב-zap: מה כבר יוצא לאוויר עם AI',
   '[]', 'zap AI Video Portfolio', 'http://www.shakad.co.il/zap-ai',
   null, null, 5, now(), 'approved', false, 'he')
on conflict (source_url) do nothing;
