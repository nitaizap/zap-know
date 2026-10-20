// Collection + AI processing. Runs on a schedule (pg_cron) and pulls only from allowed,
// public sources: YouTube RSS, publisher RSS, the edX catalog API and the Skillshop catalog.
// Only public metadata (title, description, lesson titles) is summarized, never course content.
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { admin, cors, json, llm, log, parseJson, VOICE } from "../_shared/core.ts";

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
  // New items get their thumbnails right away (fire and forget).
  if (report.new_items > 0) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/thumbs?max=${report.new_items}`, {
      method: "POST", headers: { "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
    }).catch(() => {});
  }
  return json(report);
});
