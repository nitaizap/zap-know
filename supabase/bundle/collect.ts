import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Shared helpers for zap KNOW edge functions.
// LLM provider is a setting: demo runs on the Gemini free tier (public content and
// demo data only); production switches LLM_PROVIDER=openrouter for internal data.

export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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

// One Zapier hook (NOTIFY_WEBHOOK) delivers everything: it always sends the email
// (Outlook) and, when teams_text is set, also posts to Teams (a person, or the channel).
export type Notice = {
  kind: string;
  to: string;
  subject: string;
  html: string;
  teams_text?: string;
  teams_to?: string; // an email for a personal chat, or "channel" for קורה ב-zap
};

export async function notify(n: Notice) {
  const hook = Deno.env.get("NOTIFY_WEBHOOK");
  if (!hook) return false;
  const r = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teams_text: "", teams_to: "", ...n }),
  }).catch(() => null);
  return !!r?.ok;
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

export const VOICE = `את/ה כותב/ת בשם zap UP (zap KNOW), מרכז הלמידה והידע של עובדי zap, בעברית זאפית (zap One Tone, עולם פנים ארגוני).
- פשוטה, חכמה, ישירה, אנושית, מקדמת. מדברים כמו קולגה, לא כמו HR.
- העיקר קודם: מה זה → מה זה נותן לך → מה עושים עכשיו.
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
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
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

// Collection + AI processing. Runs on a schedule (pg_cron) and pulls only from allowed,
// public sources: YouTube RSS, publisher RSS, the edX catalog API and the Skillshop catalog.
// Only public metadata (title, description, lesson titles) is summarized, never course content.

type Source = { id: number; name: string; kind: string; ref: string; topic_slug: string };
type Raw = {
  kind: "course" | "news";
  title: string;
  description: string;
  lessons: string[];
  url: string;
  published?: string;
};

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const asArray = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
const strip = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function fetchText(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "zapKNOW/1.0 (internal learning hub)" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
}

async function pull(s: Source): Promise<Raw[]> {
  switch (s.kind) {
    case "youtube_playlist": {
      // One playlist = one course; the video titles are its syllabus.
      const feed = xml.parse(await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=${s.ref}`)).feed;
      const entries = asArray(feed.entry);
      return [{
        kind: "course",
        title: strip(feed.title),
        description: strip(entries[0]?.["media:group"]?.["media:description"]).slice(0, 1500),
        lessons: entries.map((e: { title: string }) => strip(e.title)).reverse(),
        url: `https://www.youtube.com/playlist?list=${s.ref}`,
        published: feed.published,
      }];
    }
    case "youtube_channel": {
      const feed = xml.parse(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${s.ref}`)).feed;
      return asArray(feed.entry).slice(0, 5).map((e: Record<string, any>) => ({
        kind: "news" as const,
        title: strip(e.title),
        description: strip(e["media:group"]?.["media:description"]).slice(0, 1500),
        lessons: [],
        url: e.link?.href ?? `https://www.youtube.com/watch?v=${e["yt:videoId"]}`,
        published: e.published,
      }));
    }
    case "rss": {
      // Cut out the first 8 entries before parsing: full feeds can blow the CPU budget.
      const raw = await fetchText(s.ref);
      const blocks = raw.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/g)?.slice(0, 8) ?? [];
      const items = blocks.map((b) => xml.parse(b.replace(/<content:encoded>[\s\S]*?<\/content:encoded>/g, "")))
        .map((d: Record<string, any>) => d.item ?? d.entry);
      return items.map((e: Record<string, any>) => ({
        kind: "news" as const,
        title: strip(e.title?.["#text"] ?? e.title),
        description: strip(e.description ?? e.summary ?? e["content:encoded"]).slice(0, 1500),
        lessons: [],
        url: typeof e.link === "string" ? e.link : e.link?.href ?? asArray(e.link)[0]?.href,
        published: e.pubDate ?? e.published ?? e.updated,
      })).filter((r: Raw) => r.url);
    }
    case "edx": {
      const c = await (await fetch(`https://courses.edx.org/api/courses/v1/courses/${encodeURIComponent(s.ref)}/`)).json();
      return [{
        kind: "course",
        title: c.name,
        description: strip(c.short_description) + (c.effort ? ` | effort: ${c.effort}` : ""),
        lessons: [],
        url: `https://www.edx.org/course/${c.course_id ?? s.ref}`,
        published: c.start,
      }];
    }
    case "skillshop": {
      // Undocumented guest catalog: wrapped so a break never stops the run.
      const d = await (await fetch(`https://skillshop.docebosaas.com/learn/v1/catalog/${s.ref}?page_size=40`)).json();
      return asArray(d.data?.items).filter((i: Record<string, any>) => i.item_language_code === "en").slice(0, 6).map((i: Record<string, any>) => ({
        kind: "course" as const,
        title: i.item_name,
        description: strip(i.item_description).slice(0, 1500),
        lessons: [],
        url: `https://skillshop.docebosaas.com/learn/course/${i.item_id}/${i.item_slug ?? ""}`,
      }));
    }
    default:
      return []; // linkedin_learning / udemy_business: wired when admin API keys arrive
  }
}

async function process(s: Source, r: Raw) {
  const out = parseJson<{
    title_he: string; summary_he: string; why_he: string; verticals: string[];
    lesson_plan: { title_he: string; title_orig?: string; minutes?: number }[];
  }>(await llm([
    { role: "system", content: VOICE },
    {
      role: "user",
      content: `סכמו את ה${r.kind === "course" ? "קורס" : "עדכון"} הזה לעובדי zap. מבוסס רק על המידע הפומבי שלמטה.
title_he: כותרת בעברית, עד 9 מילים (שמות כלים ומוצרים נשארים באנגלית).
summary_he: ${r.kind === "course" ? "3 משפטים: על מה הקורס, למי הוא מתאים, מה יוצאים איתו" : "2 משפטים: מה חדש ומה זה אומר בפועל"}.
why_he: משפט אחד, למה שווה לעובד ב-zap (שיווק, השוואת מחירים, עסקים קטנים).
verticals: מתוך [zap, zapstore, Wisebuy, דפי זהב, Doctors, משפטי, REST, Weekend, zapX, zap לעסקים], רק מה שבאמת רלוונטי, יכול להיות ריק.
lesson_plan: ${r.lessons.length ? "תרגום של רשימת השיעורים, באותו סדר, עם title_orig" : r.kind === "course" ? "3-6 שלבי למידה שנגזרים רק מהתיאור, בלי להמציא תוכן" : "[]"}.
JSON בלבד.

כותרת: ${r.title}
תיאור: ${r.description}
${r.lessons.length ? `שיעורים:\n${r.lessons.map((l, i) => `${i + 1}. ${l}`).join("\n")}` : ""}`,
    },
  ], true));
  const { error } = await admin.from("items").insert({
    kind: r.kind,
    topic_slug: s.topic_slug,
    verticals: out.verticals ?? [],
    title_he: out.title_he,
    title_orig: r.title,
    summary_he: out.summary_he,
    why_he: out.why_he,
    lesson_plan: out.lesson_plan ?? [],
    source_id: s.id,
    source_name: s.name,
    source_url: r.url,
    published_at: r.published ? new Date(r.published).toISOString() : null,
    summarized_at: new Date().toISOString(),
    status: "pending",
  });
  if (error && !String(error.message).includes("duplicate")) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const max = Number(new URL(req.url).searchParams.get("max") ?? 10);
  const perRun = Number(new URL(req.url).searchParams.get("sources") ?? 3);
  const { data: sources } = await admin.from("sources").select("id,name,kind,ref,topic_slug").eq("status", "active")
    .order("last_pulled_at", { ascending: true, nullsFirst: true }).limit(perRun);
  const report = { sources: 0, new_items: 0, failures: [] as string[] };

  for (const s of (sources ?? []) as Source[]) {
    if (report.new_items >= max) break;
    try {
      await admin.from("sources").update({ last_pulled_at: new Date().toISOString() }).eq("id", s.id);
      const raws = await pull(s);
      report.sources++;
      const urls = raws.map((r) => r.url);
      const { data: known } = await admin.from("items").select("source_url").in("source_url", urls);
      const seen = new Set((known ?? []).map((k) => k.source_url));
      for (const r of raws.filter((r) => !seen.has(r.url))) {
        if (report.new_items >= max) break;
        await process(s, r);
        report.new_items++;
      }
    } catch (e) {
      report.failures.push(`${s.name}: ${String(e).slice(0, 200)}`);
    }
  }
  await log("collect", report.failures.length === 0, report);
  return json(report);
});