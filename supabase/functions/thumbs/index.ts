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
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    if (!m) return null;
    return new URL(m[1].replace(/&amp;/g, "&"), r.url).toString();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const max = Number(new URL(req.url).searchParams.get("max") ?? 20);
  const { data: items } = await admin.from("items").select("id,source_url,kind")
    .is("thumbnail_url", null).neq("kind", "internal").limit(max);
  let found = 0;
  for (const i of items ?? []) {
    const u = i.source_url as string;
    let thumb: string | null = null;
    let video: string | null = null;
    const list = u.match(/[?&]list=([\w-]+)/)?.[1];
    const vid = u.match(/(?:v=|youtu\.be\/|\/embed\/)([\w-]{11})/)?.[1];
    if (vid) video = vid;
    else if (list) video = await firstPlaylistVideo(list);
    if (video) thumb = `https://i.ytimg.com/vi/${video}/hqdefault.jpg`;
    else thumb = await ogImage(u);
    if (thumb) found++;
    await admin.from("items").update({ thumbnail_url: thumb ?? "", preview_video_id: video }).eq("id", i.id);
  }
  await log("thumbs", true, { checked: items?.length ?? 0, found });
  return json({ checked: items?.length ?? 0, found });
});
