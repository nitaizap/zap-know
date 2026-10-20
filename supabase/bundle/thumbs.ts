// Shared helpers for zap KNOW edge functions.
// LLM provider is a setting: demo runs on the Gemini free tier (public content and
// demo data only); production switches LLM_PROVIDER=openrouter for internal data.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Hard AI spending cap. Every request to Gemini, from any function, passes through here:
// it is refused once recorded spend reaches app_settings.ai_cap_usd, and every response's
// token usage is recorded at deliberately high prices, so the real bill stays under the cap.
const realFetch = globalThis.fetch.bind(globalThis);
async function num(key: string, fallback: number) {
  const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
  const cap = await num("ai_cap_usd", 4.5);
  const { data: spent } = await admin.rpc("ai_spent");
  if (Number(spent ?? 0) >= cap) throw new Error(`ai_budget_reached: ${spent} >= ${cap} USD`);
  const res = await realFetch(input, init);
  try {
    const body = await res.clone().json();
    const u = body?.usageMetadata ?? {};
    const model = url.match(/models\/([^:]+)/)?.[1] ?? "";
    const tts = model.includes("tts");
    const image = model.includes("image");
    const pin = await num(tts ? "price_tts_in" : "price_text_in", tts ? 1 : 0.5);
    const pout = image ? await num("price_img_out", 40) : await num(tts ? "price_tts_out" : "price_text_out", tts ? 20 : 3);
    const inT = Number(u.promptTokenCount ?? 0);
    const outT = Number(u.candidatesTokenCount ?? 0) + Number(u.thoughtsTokenCount ?? 0);
    await admin.from("ai_usage").insert({
      fn: Deno.env.get("SB_FUNCTION_NAME") ?? new URL(url).pathname.split("/").pop(),
      model, in_tokens: inT, out_tokens: outT, cost_usd: (inT * pin + outT * pout) / 1_000_000,
    });
  } catch { /* non-JSON or error body: nothing to record */ }
  return res;
};

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Returns the caller if they hold a valid @d.co.il session, else null.
export async function zapUser(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  const email = data.user?.email ?? "";
  return email.toLowerCase().endsWith("@d.co.il") ? data.user : null;
}

// Delivery without any M365 admin consent: email goes straight out through Brevo (sender verified
// by its owner), channel posts go to a Teams "Workflows" webhook. NOTIFY_WEBHOOK (Zapier) stays
// as a fallback for when the company connects M365 properly.
export type Notice = {
  kind: string;
  to: string;
  subject: string;
  html: string;
  teams_text?: string;
  teams_to?: string; // an email for a personal chat, or "channel" for קורה ב-zap
};

// Plain (non-secret) settings live in app_settings so they can change without a redeploy.
const settingsCache = new Map<string, string>();
export async function setting(key: string, fallback: string) {
  if (settingsCache.has(key)) return settingsCache.get(key)!;
  const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  const value = data?.value || fallback;
  settingsCache.set(key, value);
  return value;
}

export async function notify(n: Notice) {
  const brevo = Deno.env.get("BREVO_API_KEY");
  const teams = Deno.env.get("TEAMS_WEBHOOK");
  const hook = Deno.env.get("NOTIFY_WEBHOOK");
  let ok = false;

  // Demo colleagues live on the reserved .invalid domain and never get mail.
  if (brevo && n.to && !n.to.endsWith(".invalid")) {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevo, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "zap UP", email: await setting("sender_email", Deno.env.get("SENDER_EMAIL") ?? Deno.env.get("OWNER_EMAIL") ?? "") },
        to: [{ email: n.to }],
        subject: n.subject,
        htmlContent: n.html,
      }),
    }).catch(() => null);
    ok = !!r?.ok;
  } else if (hook) {
    const r = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams_text: "", teams_to: "", ...n }),
    }).catch(() => null);
    ok = !!r?.ok;
  }

  // Channel posts (shares to the channel, new "קורה ב-zap" items) also land in Teams.
  if (teams && n.teams_to === "channel" && n.teams_text) {
    await fetch(teams, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        attachments: [{
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            rtl: true,
            body: [
              { type: "TextBlock", text: n.subject, weight: "Bolder", size: "Medium", wrap: true },
              { type: "TextBlock", text: n.teams_text, wrap: true },
            ],
          },
        }],
      }),
    }).catch(() => null);
  }
  return ok;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A small RTL email in the brand colors: title, paragraphs, and up to two buttons.
export function mail(title: string, lines: string[], buttons: { label: string; url: string; primary?: boolean }[] = []) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;color:#001c32;font-size:16px;line-height:1.6;max-width:520px">
<p style="font-size:22px;font-weight:900;color:#052b7a;margin:0 0 12px">${esc(title)}</p>
${lines.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("")}
${buttons.map((b) => `<a href="${b.url}" style="display:inline-block;margin:8px 0 0 8px;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:700;${b.primary === false ? "background:#e6eaf2;color:#052b7a" : "background:#052b7a;color:#fff"}">${esc(b.label)}</a>`).join("")}
<p style="color:#73828e;font-size:12px;margin:18px 0 0">zap UP · מרכז הלמידה והידע של zap</p></div>`;
}

// Every run lands in run_log; failures also alert the owner.
export async function log(job: string, ok: boolean, detail: unknown) {
  await admin.from("run_log").insert({ job, ok, detail });
  const owner = Deno.env.get("OWNER_EMAIL");
  if (!ok && owner) {
    await notify({
      kind: "alert",
      to: owner,
      subject: `zap UP: משהו נתקע ב-${job}`,
      html: mail(`משהו נתקע ב-${job}`, [
        "אחת האוטומציות לא הצליחה לרוץ עד הסוף. הפרטים ביומן הפעולות, במסך הניהול.",
        JSON.stringify(detail).slice(0, 600),
      ]),
    });
  }
}

export const VOICE = `כותבים בשם zap UP (zap KNOW), מרכז הלמידה והידע של עובדי zap, בעברית זאפית (zap One Tone, עולם פנים ארגוני).
- פשוטה, חכמה, ישירה, אנושית, מקדמת. מדברים כמו קולגה, לא כמו HR.
- העיקר קודם: מה זה → מה זה נותן לכם → מה עושים עכשיו.
- בתוכן ידע: בהירות לפני שובבות. רעיון אחד במשפט, קול פעיל, בלי סלנג כשהדיוק חשוב.
- zap תמיד באותיות קטנות. בלי "..." בכלל, לכל היותר "!" אחד. בלי מילים גדולות ובלי הבטחות.
- פנייה ברבים או ניטרלית מגדרית ("מי שרוצה", "כולם מוזמנים").
- לא ממציאים עובדות: כותבים רק מה שמופיע בחומר שקיבלת.`;

type Msg = { role: "system" | "user" | "assistant"; content: string };

// Calls the configured LLM; with asJson the model must return a JSON object.
export async function llm(messages: Msg[], asJson = false): Promise<string> {
  const provider = Deno.env.get("LLM_PROVIDER") ?? "gemini";
  if (provider === "openrouter") {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENROUTER_MODEL") ?? "anthropic/claude-sonnet-5.5",
        messages,
        ...(asJson ? { response_format: { type: "json_object" } } : {}),
        provider: { data_collection: "deny" },
      }),
    });
    if (!r.ok) throw new Error(`openrouter ${r.status}: ${await r.text()}`);
    return (await r.json()).choices[0].message.content;
  }
  const model = await setting("gemini_model", Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: asJson ? { responseMimeType: "application/json" } : {},
        }),
      },
    );
    // Free tier is rate limited; back off and retry.
    if (r.status === 429 || r.status === 503) {
      lastError = `${r.status}: ${(await r.text()).slice(0, 300)}`;
      await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  }
  throw new Error(`gemini rate limited ${lastError}`);
}

export function parseJson<T>(s: string): T {
  const m = s.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : s);
}

export function weekStart(d = new Date()) {
  // Israeli week starts on Sunday.
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - x.getUTCDay());
  return x.toISOString().slice(0, 10);
}

// ---- thumbs ----
// Thumbnails and video previews for the social feed. Runs after every collection pass,
// for collected items and for internal posts and team docs (see internalArt).
// YouTube: the video thumbnail (and the video id for an inline muted preview).
// Articles: the page's own og:image / twitter:image. "" marks "looked, found nothing".

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
