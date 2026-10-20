// Thumbnails and video previews for the social feed. Runs after every collection pass.
// YouTube: the video thumbnail (and the video id for an inline muted preview).
// Articles: the page's own og:image / twitter:image. "" marks "looked, found nothing".
import { admin, cors, json, log } from "../_shared/core.ts";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; zapUP/1.0; +https://nitaizap.github.io/zap-know/)" };

async function firstPlaylistVideo(list: string) {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`, { headers: UA });
  if (!r.ok) return null;
  return (await r.text()).match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1] ?? null;
}

async function ogImage(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await r.text()).slice(0, 300_000);
    // Real images only, in order of trust: og/twitter image, image_src, JSON-LD image/thumbnailUrl,
    // then the first sizeable <img> in the page body.
    const pick = (re: RegExp) => html.match(re)?.[1];
    const found = pick(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i)
      ?? pick(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i)
      ?? pick(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)
      ?? pick(/"(?:thumbnailUrl|image)"\s*:\s*"(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)
      ?? pick(/<img[^>]+src=["'](https?:[^"']+\.(?:jpe?g|png|webp)[^"']*)["'][^>]*(?:width=["']?(?:[3-9]\d\d|\d{4}))/i);
    const m = found ? [found, found] : null;
    if (!m) return null;
    return new URL(m[1].replace(/&amp;/g, "&"), r.url).toString();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Podcast artwork: the episode's own itunes:image, else the show's.
async function podcastArt(feedUrl: string, episodeUrl: string, audio: string | null) {
  try {
    const xml = (await (await fetch(feedUrl, { headers: UA })).text()).slice(0, 2_000_000);
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
    const mine = items.find((b) => (audio && b.includes(audio)) || b.includes(episodeUrl));
    const ep = mine?.match(/<itunes:image[^>]+href=["']([^"']+)["']/i)?.[1];
    const show = xml.match(/<itunes:image[^>]+href=["']([^"']+)["']/i)?.[1]
      ?? xml.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/i)?.[1];
    return ep ?? show ?? null;
  } catch { return null; }
}

// Google Skillshop: the course's own catalog thumbnail.
async function skillshopArt(url: string, catalog: string) {
  const id = url.match(/\/course\/(\d+)/)?.[1];
  if (!id) return null;
  try {
    const d = await (await fetch(`https://skillshop.docebosaas.com/learn/v1/catalog/${catalog}?page_size=200`)).json();
    const it = (d.data?.items ?? []).find((x: Record<string, unknown>) => String(x.item_id) === id);
    return (it?.item_thumbnail as string) || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const max = Number(new URL(req.url).searchParams.get("max") ?? 20);
  const { data: items } = await admin.from("items").select("id,source_url,kind,audio_url,source_id,sources(kind,ref)")
    .is("thumbnail_url", null).is("doc_id", null).limit(max);
  let found = 0;
  for (const i of items ?? []) {
    const u = i.source_url as string;
    let thumb: string | null = null;
    let video: string | null = null;
    const list = u.match(/[?&]list=([\w-]+)/)?.[1];
    const vid = u.match(/(?:v=|youtu\.be\/|\/embed\/)([\w-]{11})/)?.[1];
    if (vid) video = vid;
    else if (list) video = await firstPlaylistVideo(list);
    // deno-lint-ignore no-explicit-any
    const src = (i as any).sources as { kind: string; ref: string } | null;
    if (video) thumb = `https://i.ytimg.com/vi/${video}/hqdefault.jpg`;
    else if (i.kind === "podcast" && src) thumb = await podcastArt(src.ref, u, i.audio_url);
    else if (src?.kind === "skillshop") thumb = await skillshopArt(u, src.ref);
    if (!thumb && u.startsWith("http") && !u.includes("zap-know.internal")) thumb = await ogImage(u);
    if (thumb) found++;
    await admin.from("items").update({ thumbnail_url: thumb ?? "", preview_video_id: video }).eq("id", i.id);
  }
  await log("thumbs", true, { checked: items?.length ?? 0, found });
  return json({ checked: items?.length ?? 0, found });
});
