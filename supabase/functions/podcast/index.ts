// A private podcast feed per person: subscribe once in Spotify / Apple Podcasts / any player
// with ?t=<podcast_token>. It carries the weekly episode, the "להאזנה" conversations of things
// they saved or marked "listen later", and real podcast episodes they queued.
import { admin } from "../_shared/core.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("not found", { status: 404 });
  const { data: me } = await admin.from("profiles").select("user_id,display_name,email").eq("podcast_token", token).maybeSingle();
  if (!me) return new Response("not found", { status: 404 });
  const site = Deno.env.get("SITE_URL") ?? "https://nitaizap.github.io/zap-know/";

  const [{ data: eps }, { data: later }, { data: saved }] = await Promise.all([
    admin.from("episodes").select("week,body_he,audio_url").eq("user_id", me.user_id).not("audio_url", "is", null)
      .order("week", { ascending: false }).limit(12),
    admin.from("listen_later").select("item_id,at").eq("user_id", me.user_id).order("at", { ascending: false }).limit(50),
    admin.from("saves").select("item_id,created_at").eq("user_id", me.user_id).order("created_at", { ascending: false }).limit(50),
  ]);
  const ids = [...new Set([...(later ?? []).map((x) => x.item_id), ...(saved ?? []).map((x) => x.item_id)])];
  const [{ data: items }, { data: listens }] = await Promise.all([
    ids.length ? admin.from("items").select("id,title_he,summary_he,kind,audio_url,created_at").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("listens").select("ref_id,audio_url,created_at").eq("kind", "item").in("ref_id", ids).not("audio_url", "is", null) : Promise.resolve({ data: [] }),
  ]);
  const when = new Map([...(saved ?? []).map((x) => [x.item_id, x.created_at]), ...(later ?? []).map((x) => [x.item_id, x.at])]);

  const entries: { title: string; desc: string; url: string; date: string; guid: string; link: string }[] = [];
  for (const e of eps ?? []) entries.push({
    title: `הפרק השבועי · ${e.week}`, desc: e.body_he, url: e.audio_url!, date: e.week, guid: `ep-${e.week}`, link: site,
  });
  for (const i of items ?? []) {
    const conv = (listens ?? []).find((l) => l.ref_id === i.id)?.audio_url;
    const url = i.kind === "podcast" ? i.audio_url : conv;
    if (url) entries.push({
      title: i.kind === "podcast" ? i.title_he : `שיחה על: ${i.title_he}`, desc: i.summary_he ?? "", url,
      date: when.get(i.id) ?? i.created_at, guid: `item-${i.id}`, link: `${site}#/item/${i.id}`,
    });
  }
  entries.sort((a, b) => +new Date(b.date) - +new Date(a.date));

  const name = me.display_name ?? me.email.split("@")[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
<title>${esc(`zap UP · הפודקאסט של ${name}`)}</title>
<link>${site}</link>
<language>he</language>
<description>הפרק השבועי ושיחות על מה ששמרתם ב-zap UP. פרטי ואישי.</description>
<itunes:author>zap UP</itunes:author>
<itunes:explicit>false</itunes:explicit>
<itunes:block>Yes</itunes:block>
${entries.map((e) => `<item>
<title>${esc(e.title)}</title>
<description>${esc(e.desc.slice(0, 600))}</description>
<link>${esc(e.link)}</link>
<guid isPermaLink="false">${esc(e.guid)}</guid>
<pubDate>${new Date(e.date).toUTCString()}</pubDate>
<enclosure url="${esc(e.url)}" type="${e.url.endsWith(".wav") ? "audio/wav" : "audio/mpeg"}" length="0"/>
</item>`).join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "private, max-age=300" } });
});
