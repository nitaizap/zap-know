-- The seeded team docs have no image of their own. Each one shows a real capture of the public
-- product page of the main tool it is about (the tool named in its title, else its first tool tag).
-- Every page was checked from Node and every capture pre-warmed (20.10.2026); docs with no mapped tool keep the poster.
with tool_page(tool, url) as (values
  ('Ahrefs', 'https://ahrefs.com/'),
  ('BigQuery', 'https://cloud.google.com/bigquery'),
  ('Canva', 'https://www.canva.com/'),
  ('CapCut', 'https://www.capcut.com/'),
  ('ChatGPT / Claude', 'https://www.anthropic.com/claude'),
  ('ChatGPT / Gemini / Perplexity', 'https://gemini.google.com/'),
  ('Claude', 'https://www.anthropic.com/claude'),
  ('Confluence', 'https://www.atlassian.com/software/confluence'),
  ('dbt', 'https://www.getdbt.com/'),
  ('Figma', 'https://www.figma.com/'),
  ('GA4', 'https://marketingplatform.google.com/about/analytics/'),
  ('GitHub', 'https://github.com/'),
  ('Glassix', 'https://www.glassix.com/'),
  ('Gong', 'https://www.gong.io/'),
  ('Google Ads', 'https://ads.google.com/home/'),
  ('Google Ads Editor', 'https://ads.google.com/intl/en/home/tools/ads-editor/'),
  ('Google Business Profile', 'https://www.google.com/business/'),
  ('Google Docs', 'https://www.google.com/docs/about/'),
  ('Google Search Console', 'https://search.google.com/search-console/about'),
  ('Grammarly', 'https://www.grammarly.com/'),
  ('Jira', 'https://www.atlassian.com/software/jira'),
  ('Looker Studio', 'https://lookerstudio.google.com/overview'),
  ('Meta Ads Manager', 'https://www.facebook.com/business/tools/ads-manager'),
  ('Meta Business Suite', 'https://www.facebook.com/business/tools/meta-business-suite'),
  ('Mixpanel', 'https://mixpanel.com/'),
  ('monday', 'https://monday.com/'),
  ('Python', 'https://www.python.org/'),
  ('Salesforce', 'https://www.salesforce.com/products/sales-cloud/'),
  ('Screaming Frog', 'https://www.screamingfrog.co.uk/seo-spider/'),
  ('Semrush', 'https://www.semrush.com/'),
  ('WooCommerce', 'https://woocommerce.com/'),
  ('WordPress', 'https://wordpress.org/'),
  ('WordPress + Elementor', 'https://elementor.com/'),
  ('Zendesk', 'https://www.zendesk.com/')
),
pick as (
  select i.id,
    coalesce(
      (select u.t from unnest(d.tools) with ordinality u(t, n) join tool_page p on p.tool = u.t
        where position(lower(split_part(u.t, ' / ', 1)) in lower(d.title)) > 0 order by u.n limit 1),
      (select u.t from unnest(d.tools) with ordinality u(t, n) join tool_page p on p.tool = u.t order by u.n limit 1)
    ) as tool
  from items i join team_docs d on d.id = i.doc_id
  where i.kind = 'internal' and coalesce(i.thumbnail_url, '') = ''
)
update items i set thumbnail_url = 'https://image.thum.io/get/width/1080/crop/1350/viewportWidth/1280/noanimate/' || p.url
from pick k join tool_page p on p.tool = k.tool
where i.id = k.id;

select count(*) filter (where coalesce(thumbnail_url, '') <> '') as with_image, count(*) as internal from items where kind = 'internal';
