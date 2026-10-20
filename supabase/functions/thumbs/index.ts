// Thumbnails and video previews for the social feed. Runs after every collection pass,
// for collected items and for internal posts and team docs (see internalArt).
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

// ---- Internal posts and team docs ---------------------------------------------------------------
// The first real image the post itself points to: an image in its text, a YouTube video it links,
// its own source page's og:image (when it's an external page), then the og:image of the first
// outside link in the text. Never our own /#/doc/ pages, never logos, favicons or tracking pixels.
const YT = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/;
const OWN = /zap-know|nitaizap\.github\.io|#\/doc\//i;
const JUNK = /logo|favicon|sprite|pixel|tracking|1x1|spacer|avatar|icon/i;

// Pixel size from the first bytes of an image (PNG, GIF, WebP, JPEG).
async function imageSize(url: string): Promise<[number, number] | null> {
  try {
    const r = await fetch(url, { headers: { ...UA, Range: "bytes=0-65535" }, redirect: "follow", signal: AbortSignal.timeout(7000) });
    if (!r.ok && r.status !== 206) return null;
    if (!(r.headers.get("content-type") ?? "image").startsWith("image")) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    const v = new DataView(b.buffer);
    if (b[0] === 0x89 && b[1] === 0x50) return [v.getUint32(16), v.getUint32(20)];
    if (b[0] === 0x47 && b[1] === 0x49) return [v.getUint16(6, true), v.getUint16(8, true)];
    if (b[8] === 0x57 && b[9] === 0x45 && b[12] === 0x56) {
      const t = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (t === "VP8X") return [1 + (b[24] | b[25] << 8 | b[26] << 16), 1 + (b[27] | b[28] << 8 | b[29] << 16)];
      if (t === "VP8 ") return [v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff];
      if (t === "VP8L") { const n = v.getUint32(21, true); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const m = b[o + 1], len = v.getUint16(o + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [v.getUint16(o + 7), v.getUint16(o + 5)];
        o += 2 + len;
      }
    }
    return null;
  } catch { return null; }
}
async function usable(url: string | null | undefined) {
  if (!url || OWN.test(url) || JUNK.test(url)) return null;
  const u = url.replace(/^http:\/\//i, "https://");
  const d = await imageSize(u);
  return d && d[0] >= 300 && d[1] >= 150 ? u : null;
}

async function internalArt(text: string, sourceUrl: string): Promise<{ thumb: string | null; video: string | null }> {
  const imgs = [
    ...[...text.matchAll(/!\[[^\]]*\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/<img[^>]+src=["'](https?:[^"']+)["']/gi)].map((m) => m[1]),
    ...[...text.matchAll(/https?:\/\/[^\s)<>"']+\.(?:jpe?g|png|webp|gif)(?:\?[^\s)<>"']*)?/gi)].map((m) => m[0]),
  ];
  for (const u of imgs.slice(0, 5)) { const ok = await usable(u); if (ok) return { thumb: ok, video: null }; }
  const vid = text.match(YT)?.[1] ?? sourceUrl.match(YT)?.[1];
  if (vid) return { thumb: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, video: vid };
  if (/^https?:\/\//.test(sourceUrl) && !OWN.test(sourceUrl)) {
    const og = await usable(await ogImage(sourceUrl));
    if (og) return { thumb: og, video: null };
  }
  const links = [...text.matchAll(/https?:\/\/[^\s)<>"']+/g)].map((m) => m[0].replace(/[.,;:!?]+$/, "")).filter((u) => !OWN.test(u));
  for (const u of links.slice(0, 3)) { const og = await usable(await ogImage(u)); if (og) return { thumb: og, video: null }; }
  return { thumb: null, video: null };
}

async function internalPass(max: number, retry: boolean) {
  let q = admin.from("items").select("id,source_url,summary_he,why_he,doc_id,team_docs(body_md,summary_he)").eq("kind", "internal");
  q = retry ? q.or("thumbnail_url.is.null,thumbnail_url.eq.") : q.is("thumbnail_url", null);
  const { data: items } = await q.limit(max);
  let found = 0;
  for (const i of items ?? []) {
    // deno-lint-ignore no-explicit-any
    const d = (i as any).team_docs as { body_md: string | null; summary_he: string | null } | null;
    const text = [d?.body_md, d?.summary_he, i.summary_he, i.why_he].filter(Boolean).join("\n").slice(0, 60_000);
    const { thumb, video } = await internalArt(text, (i.source_url as string) ?? "");
    if (thumb) found++;
    await admin.from("items").update({ thumbnail_url: thumb ?? "", ...(video ? { preview_video_id: video } : {}) }).eq("id", i.id);
  }
  return { checked: items?.length ?? 0, found };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const params = new URL(req.url).searchParams;
  const max = Number(params.get("max") ?? 20);
  // ?internal=1 (re)checks every internal post and team doc, including ones looked at before.
  if (params.get("internal") === "1") {
    const res = await internalPass(Math.min(max, 80), true);
    await log("thumbs-internal", true, res);
    return json(res);
  }
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
  // New internal posts too (the ones never looked at).
  const inner = await internalPass(10, false);
  await log("thumbs", true, { checked: items?.length ?? 0, found, internal: inner });
  return json({ checked: items?.length ?? 0, found, internal: inner });
});
