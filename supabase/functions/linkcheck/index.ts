// Daily: a course whose link broke or was removed is marked 'broken' and leaves the display.
import { admin, cors, json, log } from "../_shared/core.ts";

async function alive(url: string) {
  if (url.startsWith("https://zap-know.internal/")) return true;
  try {
    // YouTube playlists answer 200 even when deleted; their RSS feed returns 404 instead.
    const list = url.match(/youtube\.com\/playlist\?list=([\w-]+)/)?.[1];
    const target = list ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${list}` : url;
    let r = await fetch(target, { method: "HEAD", redirect: "follow" });
    if (r.status === 405 || r.status === 403) r = await fetch(target, { redirect: "follow" });
    return !(r.status === 404 || r.status === 410);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const { data: items } = await admin.from("items").select("id,source_url")
    .in("status", ["approved", "pending"]).order("link_checked_at", { ascending: true, nullsFirst: true }).limit(60);
  const broken: number[] = [];
  for (const i of items ?? []) {
    const ok = await alive(i.source_url);
    if (!ok) broken.push(i.id);
    await admin.from("items").update({ link_checked_at: new Date().toISOString(), ...(ok ? {} : { status: "broken" }) }).eq("id", i.id);
  }
  await log("linkcheck", true, { checked: items?.length ?? 0, broken });
  return json({ checked: items?.length ?? 0, broken });
});
