// Collection + AI processing. Runs on a schedule (pg_cron) and pulls only from allowed,
// public sources: YouTube RSS, publisher RSS, the edX catalog API and the Skillshop catalog.
// Only public metadata (title, description, lesson titles) is summarized, never course content.
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { admin, cors, json, llm, log, mail, notify, parseJson, setting, VOICE } from "../_shared/core.ts";

type Source = { id: number; name: string; kind: string; ref: string; topic_slug: string };
type Raw = {
  kind: "course" | "news" | "podcast";
  audio?: string;
  minutes?: number;
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
    case "podcast": {
      const raw = await fetchText(s.ref);
      const blocks = raw.match(/<item[\s>][\s\S]*?<\/item>/g)?.slice(0, 4) ?? [];
      return blocks.map((b) => {
        const e = xml.parse(b.replace(/<content:encoded>[\s\S]*?<\/content:encoded>/g, "")).item ?? {};
        const dur = String(e["itunes:duration"] ?? "");
        const parts = dur.split(":").map(Number).filter((n) => !Number.isNaN(n));
        const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts.length === 2 ? parts[0] * 60 + parts[1] : Number(dur) || 0;
        return {
          kind: "podcast" as const,
          title: strip(e.title),
          description: strip(e.description ?? e["itunes:summary"]).slice(0, 1500),
          lessons: [],
          url: typeof e.link === "string" && e.link.startsWith("http") ? e.link : e.enclosure?.url,
          audio: e.enclosure?.url,
          minutes: secs ? Math.max(1, Math.round(secs / 60)) : undefined,
          published: e.pubDate,
        };
      }).filter((r: Raw) => r.url);
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
      content: `סכמו את ה${r.kind === "course" ? "קורס" : r.kind === "podcast" ? "פרק" : "עדכון"} הזה לעובדי zap. מבוסס רק על המידע הפומבי שלמטה.
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
    // Automatic publishing: no approval queue. Reports ("דווח על טעות") are the safety net.
    status: (await setting("auto_publish", "true")) === "true" ? "approved" : "pending",
    ...(r.audio ? { audio_url: r.audio } : {}),
    ...(r.minutes ? { minutes: r.minutes } : {}),
  });
  if (error && !String(error.message).includes("duplicate")) throw error;
}

async function sendDueReminders() {
  const site = Deno.env.get("SITE_URL") ?? "https://nitaizap.github.io/zap-know/";
  const { data: due } = await admin.from("reminders").select("id,user_id,item_id,doc_id,note")
    .is("sent_at", null).lte("send_at", new Date().toISOString()).limit(50);
  for (const r of due ?? []) {
    const [{ data: who }, { data: item }, { data: doc }] = await Promise.all([
      admin.from("profiles").select("email,display_name").eq("user_id", r.user_id).single(),
      r.item_id ? admin.from("items").select("title_he,why_he").eq("id", r.item_id).single() : Promise.resolve({ data: null }),
      r.doc_id ? admin.from("team_docs").select("title,summary_he").eq("id", r.doc_id).single() : Promise.resolve({ data: null }),
    ]);
    const title = item?.title_he ?? doc?.title ?? "משהו ששמרתם";
    const link = r.item_id ? `${site}#/item/${r.item_id}` : `${site}#/doc/${r.doc_id}`;
    if (who?.email) {
      await notify({
        kind: "reminder", to: who.email, subject: `תזכורת מ-zap UP: ${title}`,
        html: mail("ביקשתם שנזכיר", [title, item?.why_he ?? doc?.summary_he ?? "", ...(r.note ? [`הערה שלכם: ${r.note}`] : [])].filter(Boolean),
          [{ label: "לפתוח עכשיו", url: link }]),
      });
    }
    await admin.from("reminders").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
  }
  if (due?.length) await log("reminders", true, { sent: due.length });

  // "עדכנו אותי כשזה באוויר": topics that went live since someone asked to be told.
  const { data: watch } = await admin.from("topic_watch").select("user_id,topic_slug,topics(name_he,status)").is("notified_at", null).limit(100);
  for (const w of (watch ?? []) as unknown as { user_id: string; topic_slug: string; topics: { name_he: string; status: string } }[]) {
    if (w.topics?.status !== "live") continue;
    const { data: who } = await admin.from("profiles").select("email").eq("user_id", w.user_id).single();
    if (who?.email) {
      await notify({
        kind: "topic-live", to: who.email, subject: `התחום ${w.topics.name_he} עלה ל-zap UP`,
        html: mail(`${w.topics.name_he} באוויר`, ["ביקשתם שנעדכן, אז הנה: יש תכנים חדשים בתחום, מסוכמים בעברית."],
          [{ label: "לתחום", url: `${site}#/topic/${w.topic_slug}` }]),
      });
    }
    await admin.from("topic_watch").update({ notified_at: new Date().toISOString() }).eq("user_id", w.user_id).eq("topic_slug", w.topic_slug);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const max = Number(new URL(req.url).searchParams.get("max") ?? 10);
  await sendDueReminders().catch((e) => log("reminders", false, { error: String(e) }));
  const perRun = Number(new URL(req.url).searchParams.get("sources") ?? 3);
  // Each source is pulled once a day: the 10-minute cron keeps reminders on time and picks up
  // new sources right away, but skips any source pulled in the last `pull_every_hours` (default 24).
  const everyH = Number(await setting("pull_every_hours", "24"));
  const since = new Date(Date.now() - everyH * 3600_000).toISOString();
  const { data: sources } = await admin.from("sources").select("id,name,kind,ref,topic_slug").eq("status", "active")
    .or(`last_pulled_at.is.null,last_pulled_at.lt.${since}`)
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
