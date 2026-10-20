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

// ---- weekly ----
// Weekly run (Sunday morning):
//  1. picks the 3 most important updates per topic (hot_week)
//  2. the self-running engine: scores sources by what employees open/save, proposes new RSS
//     feeds (validated before they're suggested) and flags weak ones; L&D decides in the swipe screen
//  3. writes each employee's hyper-personal episode from a context pack of their own week,
//     voices it (Gemini TTS) and sends it on Teams + email
// ?only=hot|engine|episodes runs one step; ?email=x@d.co.il limits episodes to one person (demo).
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

const week = weekStart();
const SITE = Deno.env.get("SITE_URL") ?? "https://nitaizap.github.io/zap-know/";

async function hot() {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: topics } = await admin.from("topics").select("slug,name_he").eq("status", "live");
  const picked: Record<string, number[]> = {};
  for (const t of topics ?? []) {
    const { data: cands } = await admin.from("items").select("id,title_he,summary_he,opens,saves,likes,dislikes,comments_count,shares_count")
      .eq("topic_slug", t.slug).eq("status", "approved").gte("created_at", since).limit(25);
    if (!cands?.length) continue;
    let ids = cands.slice(0, 3).map((c) => c.id);
    if (cands.length > 3) {
      const out = parseJson<{ ids: number[] }>(await llm([
        { role: "system", content: VOICE },
        {
          role: "user",
          content: `בחרו את 3 העדכונים החשובים השבוע בתחום ${t.name_he} לאנשי שיווק ודיגיטל ב-zap. העדיפו מה שמשנה עבודה בפועל, ושקללו גם את התגובות של העובדים (פתיחות, שמירות, לייקים, דיסלייקים, תגובות ושיתופים). JSON: {"ids":[...]}\n` +
            cands.map((c) => `${c.id}: ${c.title_he} — ${c.summary_he} (opens ${c.opens}, saves ${c.saves}, likes ${c.likes}, dislikes ${c.dislikes}, comments ${c.comments_count}, shares ${c.shares_count})`).join("\n"),
        },
      ], true));
      ids = out.ids.filter((id) => cands.some((c) => c.id === id)).slice(0, 3);
    }
    await admin.from("items").update({ hot_week: week }).in("id", ids);
    picked[t.slug] = ids;
  }
  return picked;
}

async function engine() {
  const { data: sources } = await admin.from("sources").select("id,name,kind,ref,topic_slug,status");
  const { data: items } = await admin.from("items").select("source_id,opens,saves,likes,dislikes,comments_count,shares_count,status").not("source_id", "is", null);
  const flagged: string[] = [];
  for (const s of sources ?? []) {
    const mine = (items ?? []).filter((i) => i.source_id === s.id && i.status === "approved");
    const score = mine.length ? mine.reduce((a, i) => a + i.opens + 3 * i.saves + 2 * i.likes - 2 * i.dislikes + i.comments_count + 2 * i.shares_count, 0) / mine.length : 0;
    const weak = s.status === "active" && mine.length >= 5 && score < 0.5;
    await admin.from("sources").update({
      score,
      ...(weak ? { reason_he: `מתוך ${mine.length} פריטים כמעט אף אחד לא נפתח. אולי שווה לוותר על המקור הזה?` } : {}),
    }).eq("id", s.id);
    if (weak) flagged.push(s.name);
  }

  // Propose up to 2 new feeds for the thinnest live topic, and only keep ones that really parse.
  const { data: topics } = await admin.from("topics").select("slug,name_he").eq("status", "live");
  const counts = (topics ?? []).map((t) => ({
    ...t, n: (sources ?? []).filter((s) => s.topic_slug === t.slug && s.status === "active").length,
  })).sort((a, b) => a.n - b.n);
  const thin = counts[0];
  const proposed: string[] = [];
  if (thin) {
    const out = parseJson<{ feeds: { name: string; url: string; reason_he: string }[] }>(await llm([
      { role: "system", content: VOICE },
      {
        role: "user",
        content: `הציעו 4 פידים של RSS מקצועיים, ציבוריים ומוכרים, בתחום ${thin.name_he}. רק כתובות RSS/Atom אמיתיות שאתם בטוחים בהן. reason_he: משפט אחד למה זה יעזור לעובדי zap. JSON: {"feeds":[{"name","url","reason_he"}]}\nכבר יש: ${(sources ?? []).map((s) => s.ref).join(", ")}`,
      },
    ], true));
    const parser = new XMLParser();
    for (const f of out.feeds ?? []) {
      if (proposed.length >= 2) break;
      try {
        const r = await fetch(f.url, { headers: { "User-Agent": "zapKNOW/1.0" } });
        const doc = parser.parse(await r.text());
        if (!r.ok || !(doc.rss || doc.feed)) continue;
        const { error } = await admin.from("sources").insert({
          name: f.name, kind: "rss", ref: f.url, topic_slug: thin.slug, status: "proposed", reason_he: f.reason_he,
        });
        if (!error) proposed.push(f.name);
      } catch { /* not a working feed, skip */ }
    }
  }
  return { flagged, proposed };
}

function wav(pcm: Uint8Array, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true);
  h.setUint16(34, 16, true); w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}

async function voice(text: string, path: string) {
  const model = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-2.5-flash-preview-tts";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `קראו בעברית, בקול חם וקליל של קולגה, בקצב רגוע:\n${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: Deno.env.get("TTS_VOICE") ?? "Kore" } } },
      },
    }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const b64 = (await r.json()).candidates[0].content.parts[0].inlineData.data as string;
  const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  await admin.storage.from("episodes").upload(path, wav(pcm), { contentType: "audio/wav", upsert: true });
  return admin.storage.from("episodes").getPublicUrl(path).data.publicUrl;
}

// ---- The personal weekly episode ----------------------------------------------------------------
// Each person gets a card (≤120 words) and ~2–3 minutes of audio, built from a context pack of
// their own week: who they are, their numbers, what's waiting for them, what happened around them
// and on zap UP, and picks with a personal why. Platform-wide facts are gathered once for everyone;
// the personal ones in one batch per person. One LLM call + one TTS call per person, as before.

type Row = Record<string, unknown>
const DAY = 86_400_000
const ilDay = (d: string | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" })
const LEVELS: [number, string][] = [[1500, "zapper על"], [700, "zapper מוביל"], [300, "zapper פעיל"], [100, "zapper סקרן"], [0, "zapper מתחיל"]]
const levelOf = (p: number) => {
  const i = LEVELS.findIndex(([from]) => p >= from)
  return { name: LEVELS[i][1], next: i > 0 ? LEVELS[i - 1][0] : null }
}
const firstName = (n?: string | null) => (n ?? "").replace(/\(דמו\)/g, "").trim().split(/\s+/)[0] || null

// Supabase returns at most 1000 rows per request: page through.
async function all<T = Row>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) throw new Error(JSON.stringify(error))
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// Month ranks from a set of ledger rows: user → [rank, points].
function ranks(rows: { user_id: string; pts: number }[]) {
  const sum = new Map<string, number>()
  for (const r of rows) sum.set(r.user_id, (sum.get(r.user_id) ?? 0) + r.pts)
  const sorted = [...sum.entries()].sort((a, b) => b[1] - a[1])
  const m = new Map<string, { rank: number; pts: number; above: number | null }>()
  sorted.forEach(([u, p], i) => m.set(u, { rank: i + 1, pts: p, above: i > 0 ? sorted[i - 1][1] : null }))
  return m
}

async function platformWeek() {
  const since = new Date(`${week}T00:00:00+03:00`).toISOString()
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
  const [profiles, monthLedger, weekLedger, opens, likes, comments, docs, teams, budget] = await Promise.all([
    all((a, b) => admin.from("profiles").select("user_id,display_name,role,is_demo").range(a, b)),
    all((a, b) => admin.from("points_ledger").select("user_id,at,kind,pts").gte("at", monthStart).range(a, b)),
    all((a, b) => admin.from("points_ledger").select("user_id,at,kind,pts").gte("at", since).range(a, b)),
    all((a, b) => admin.from("events").select("user_id,item_id,at").eq("type", "open").gte("at", since).range(a, b)),
    all((a, b) => admin.from("reactions").select("user_id,item_id,at").eq("value", 1).gte("at", since).range(a, b)),
    all((a, b) => admin.from("comments").select("user_id,item_id,at").gte("at", since).range(a, b)),
    admin.from("team_docs").select("id,title,team_id,updated_at,is_demo").gte("updated_at", since).order("updated_at", { ascending: false }).limit(20),
    admin.from("team_profiles").select("id,team"),
    admin.from("budget_settings").select("monthly_amount,currency,is_placeholder").eq("id", 1).maybeSingle(),
  ])
  const ml = monthLedger as { user_id: string; at: string; pts: number }[]
  const rankNow = ranks(ml)
  const rankBefore = ranks(ml.filter((r) => r.at < since))
  // What zap UP talked about this week: opens + likes×2 + comments×3.
  const score = new Map<number, number>()
  const bump = (rows: Row[], w: number) => { for (const r of rows) score.set(r.item_id as number, (score.get(r.item_id as number) ?? 0) + w) }
  bump(opens, 1); bump(likes, 2); bump(comments, 3)
  const commentCount = new Map<number, number>()
  for (const c of comments) commentCount.set(c.item_id as number, (commentCount.get(c.item_id as number) ?? 0) + 1)
  const hotIds = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([id]) => id)
  const [{ data: hot }, { data: freshHe }] = await Promise.all([
    hotIds.length ? admin.from("items").select("id,title_he,why_he,topic_slug,lang,kind,minutes,doc_id,status").in("id", hotIds) : Promise.resolve({ data: [] }),
    admin.from("items").select("id,title_he,why_he,topic_slug,lang,kind,minutes").eq("status", "approved").eq("lang", "he")
      .neq("kind", "internal").gte("created_at", since).order("likes", { ascending: false }).limit(3),
  ])
  const hotItems = ((hot ?? []) as Row[]).filter((i) => i.status === "approved").sort((a, b) => (score.get(b.id as number) ?? 0) - (score.get(a.id as number) ?? 0))
  const mostDiscussed = [...commentCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const { data: md } = mostDiscussed ? await admin.from("items").select("id,title_he").eq("id", mostDiscussed[0]).maybeSingle() : { data: null }
  const teamName = new Map(((teams.data ?? []) as { id: number; team: string }[]).map((t) => [t.id, t.team]))
  return {
    since, monthStart,
    people: new Map((profiles as { user_id: string; display_name: string | null; role: string | null; is_demo: boolean }[]).map((p) => [p.user_id, p])),
    weekLedger: weekLedger as { user_id: string; kind: string; pts: number }[],
    rankNow, rankBefore,
    opens: opens as { user_id: string; item_id: number; at: string }[],
    likes: likes as { user_id: string; item_id: number }[],
    hotItems,
    topHebrew: hotItems.find((i) => i.lang === "he" && i.kind !== "internal") ?? ((freshHe ?? []) as Row[])[0] ?? null,
    mostDiscussed: md ? { title: (md as Row).title_he as string, comments: mostDiscussed![1] } : null,
    docs: ((docs.data ?? []) as { id: number; title: string; team_id: number; is_demo: boolean }[]).map((d) => ({ ...d, team: teamName.get(d.team_id) ?? "" })),
    budget: budget.data as { monthly_amount: number; currency: string; is_placeholder: boolean } | null,
  }
}
type Week = Awaited<ReturnType<typeof platformWeek>>

// One person's context pack. Only facts that exist; empty and zero values are left out.
async function pack(p: Row, w: Week) {
  const uid = p.user_id as string
  const topics = (p.topics as string[] | null)?.length ? (p.topics as string[]) : []
  const team = (p.role as string | null) ?? null
  const [allPts, recentOpens, saves, later, prog, rem, watch, buys, bonus, mine, hotTopic] = await Promise.all([
    all((a, b) => admin.from("points_ledger").select("pts").eq("user_id", uid).range(a, b)),
    admin.from("events").select("item_id,at").eq("user_id", uid).eq("type", "open").gte("at", new Date(Date.now() - 45 * DAY).toISOString()).limit(1000),
    admin.from("saves").select("item_id,created_at,items(title_he,status)").eq("user_id", uid).order("created_at", { ascending: false }).limit(30),
    admin.from("listen_later").select("item_id,items(title_he,status)").eq("user_id", uid).limit(20),
    admin.from("progress").select("item_id,lessons_done,updated_at,items(title_he,lesson_plan)").eq("user_id", uid).order("updated_at", { ascending: false }).limit(5),
    admin.from("reminders").select("send_at,items(title_he),team_docs(title)").eq("user_id", uid).is("sent_at", null).lte("send_at", new Date(Date.now() + 7 * DAY).toISOString()).order("send_at").limit(5),
    admin.from("topic_watch").select("topic_slug").eq("user_id", uid),
    admin.from("purchases").select("price,status").eq("user_id", uid).eq("month", w.monthStart.slice(0, 10)),
    admin.rpc("budget_bonus_for", { p_user: uid }),
    admin.from("items").select("id,title_he").eq("author_user", uid).eq("status", "approved").limit(50),
    topics.length ? admin.from("items").select("id,title_he,why_he,topic_slug,kind,minutes").in("topic_slug", topics).eq("status", "approved").eq("hot_week", week).limit(4) : Promise.resolve({ data: [] }),
  ])

  // Their week, in numbers.
  const total = (allPts as { pts: number }[]).reduce((a, r) => a + r.pts, 0)
  const lvl = levelOf(total)
  const weekRows = w.weekLedger.filter((r) => r.user_id === uid)
  const weekPts = weekRows.reduce((a, r) => a + r.pts, 0)
  const now = w.rankNow.get(uid), before = w.rankBefore.get(uid)
  const days = new Set(((recentOpens.data ?? []) as Row[]).map((r) => ilDay(r.at as string)))
  let streak = 0
  const d = new Date(); if (!days.has(ilDay(d))) d.setTime(d.getTime() - DAY)
  while (days.has(ilDay(d))) { streak++; d.setTime(d.getTime() - DAY) }
  const weekOpenIds = [...new Set(w.opens.filter((o) => o.user_id === uid).map((o) => o.item_id))]
  const { data: mins } = weekOpenIds.length ? await admin.from("items").select("id,minutes").in("id", weekOpenIds) : { data: [] }
  const minutes = ((mins ?? []) as { minutes: number | null }[]).reduce((a, i) => a + (i.minutes ?? 0), 0)
  const progRows = (prog.data ?? []) as { item_id: number; lessons_done: number[]; updated_at: string; items: { title_he: string; lesson_plan: unknown[] } }[]
  const finished = progRows.filter((r) => r.updated_at >= w.since && r.items?.lesson_plan?.length && r.lessons_done.length >= r.items.lesson_plan.length).map((r) => r.items.title_he)
  const spent = ((buys.data ?? []) as { price: number; status: string }[]).filter((b) => ["auto_approved", "approved", "purchased"].includes(b.status)).reduce((a, b) => a + Number(b.price), 0)
  const bonusAmt = Number(bonus.data ?? 0)

  // Waiting for them.
  const opened = new Set(((recentOpens.data ?? []) as Row[]).map((r) => r.item_id as number))
  const savedUnopened = ((saves.data ?? []) as { item_id: number; items: { title_he: string; status: string } | null }[])
    .filter((s) => s.items?.status === "approved" && !opened.has(s.item_id)).slice(0, 3).map((s) => s.items!.title_he)
  const laterList = ((later.data ?? []) as { items: { title_he: string; status: string } | null }[]).filter((l) => l.items?.status === "approved").slice(0, 2).map((l) => l.items!.title_he)
  const cont = progRows.find((r) => r.items?.lesson_plan?.length && r.lessons_done.length < r.items.lesson_plan.length)
  const watched = ((watch.data ?? []) as { topic_slug: string }[]).map((x) => x.topic_slug)
  const { data: watchNew } = watched.length
    ? await admin.from("items").select("title_he").in("topic_slug", watched).eq("status", "approved").gte("created_at", w.since).limit(2) : { data: [] }

  // Around them: reactions to their posts, their team, what their team published.
  const postLikes = weekRows.filter((r) => r.kind === "post_liked").length
  const postComments = weekRows.filter((r) => r.kind === "post_commented").length
  const nameOf = (u: string) => { const x = w.people.get(u); return x ? `${firstName(x.display_name) ?? "עמית"}${x.is_demo ? " (דמו)" : ""}` : null }
  const teammates = team ? [...w.people.values()].filter((x) => x.role === team && x.user_id !== uid).map((x) => x.user_id) : []
  const teamLikes = w.likes.filter((l) => teammates.includes(l.user_id)).slice(0, 3)
  const { data: tl } = teamLikes.length ? await admin.from("items").select("id,title_he").in("id", teamLikes.map((l) => l.item_id)) : { data: [] }
  const tlTitle = new Map(((tl ?? []) as { id: number; title_he: string }[]).map((i) => [i.id, i.title_he]))
  const teamDocs = w.docs.filter((x) => team && (x.team === team || x.team.includes(team) || team.includes(x.team))).slice(0, 2)
  const otherDoc = w.docs.find((x) => !teamDocs.includes(x)) ?? null

  // Picks: hot in their topics, plus one from outside them.
  const inTopics = ((hotTopic.data ?? []) as Row[]).slice(0, 3)
  const outside = w.hotItems.find((i) => !topics.includes(i.topic_slug as string) && !i.doc_id && !inTopics.some((x) => x.id === i.id))
  const picks = [...inTopics, ...(outside ? [{ ...outside, outside: true }] : [])].slice(0, 5)
  if (picks.length < 3) for (const i of w.hotItems) { if (picks.length >= 3) break; if (!picks.some((x) => x.id === i.id) && !i.doc_id) picks.push(i) }

  const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== "" && !(Array.isArray(v) && !v.length)))
  const ctx = {
    who: clean({
      first_name: firstName(p.display_name as string), team, level: lvl.name,
      interests: topics, needs: p.needs as string[] | null, needs_note: p.needs_note as string | null,
      minutes_available: p.weekly_time as string | null, language: p.english_ok === false ? "עברית בלבד" : "עברית קודם",
    }),
    their_week: clean({
      points_this_week: weekPts, rank_this_month: now?.rank ?? null,
      rank_change: now && before ? before.rank - now.rank : null,
      points_to_next_place: now?.above != null ? now.above - now.pts + 1 : null,
      points_to_next_level: lvl.next !== null ? lvl.next - total : null,
      streak_days: streak > 1 ? streak : null, minutes_learned: minutes, finished: finished,
      budget_left: w.budget && !w.budget.is_placeholder ? Math.max(0, w.budget.monthly_amount + bonusAmt - spent) : null,
      budget_bonus: bonusAmt || null, currency: w.budget?.currency,
    }),
    waiting: clean({
      saved_not_opened: savedUnopened, listen_later: laterList,
      continue_course: cont ? `${cont.items.title_he} (${cont.lessons_done.length} מתוך ${cont.items.lesson_plan.length} שיעורים)` : null,
      reminders_this_week: ((rem.data ?? []) as Row[]).map((r) => ((r.items as Row | null)?.title_he ?? (r.team_docs as Row | null)?.title) as string).filter(Boolean),
      new_in_watched_topics: ((watchNew ?? []) as Row[]).map((x) => x.title_he as string),
    }),
    around: clean({
      likes_on_my_posts: postLikes, comments_on_my_posts: postComments, my_posts_count: ((mine.data ?? []) as Row[]).length || null,
      team_liked: teamLikes.map((l) => `${nameOf(l.user_id)} אהבו את "${tlTitle.get(l.item_id) ?? ""}"`).filter((x) => !x.includes('""')),
      team_published: teamDocs.map((x) => `${x.title}${x.is_demo ? " (דמו)" : ""}`),
    }),
    zap_this_week: clean({
      trending: w.hotItems.filter((i) => !i.doc_id).slice(0, 3).map((i) => i.title_he as string),
      top_hebrew: (w.topHebrew?.title_he as string) ?? null,
      most_discussed: w.mostDiscussed ? `${w.mostDiscussed.title} (${w.mostDiscussed.comments} תגובות)` : null,
      new_team_doc: otherDoc ? `${otherDoc.title} (צוות ${otherDoc.team})` : null,
    }),
    picks: picks.map((i) => clean({ title: i.title_he, why: i.why_he, minutes: i.minutes, outside_my_topics: (i as Row).outside ? true : null })),
  }
  return { ctx, picks: picks.map((i) => i.id as number) }
}

const SEGMENTS = ["הכי מעניין השבוע", "ההמלצות שלכם", "מה קורה ב-zap", "מה מחכה לכם", "המספרים", "המובילים", "מה עושים עכשיו"]

async function episodes(onlyEmail?: string) {
  // Demo colleagues never get an episode: it would only burn AI/TTS quota and the 150s budget.
  let q = admin.from("profiles").select("user_id,email,display_name,role,topics,needs,needs_note,weekly_time,english_ok").eq("is_demo", false)
  if (onlyEmail) q = q.eq("email", onlyEmail)
  const { data: people } = await q
  const audio = (Deno.env.get("EPISODE_AUDIO") ?? "true") === "true"
  const w = await platformWeek()
  // Shout-out: the month's leading people and team, mentioned in every episode.
  const lead = await admin.rpc("leaderboard_public", { p_scope: "people", p_limit: 3 })
  const leadTeam = await admin.rpc("leaderboard_public", { p_scope: "teams", p_limit: 1 })
  const shout = ((lead.data ?? []) as { name: string; points: number }[]).map((x) => `${x.name} (${x.points} נק')`).join(", ")
  const shoutTeam = ((leadTeam.data ?? []) as { name: string }[])[0]?.name
  const sent: string[] = []
  for (const p of people ?? []) {
    const { ctx, picks } = await pack(p as Row, w)
    if (!picks.length && !Object.keys(ctx.their_week).length) continue
    const out = parseJson<{ card_he: string; script_he: string; segments: string[] }>(await llm([
      { role: "system", content: VOICE },
      {
        role: "user",
        content: `כתבו את הפרק השבועי האישי של zap UP, היפר-אישי, מתוך חבילת ההקשר (JSON) שלמטה בלבד.
פונים ${ctx.who.first_name ? `בשם הפרטי "${ctx.who.first_name}" (פעם אחת, בפתיחה)` : 'בלי שם ("היי,")'}. לשון רבים או ניטרלית, zap באותיות קטנות, בלי "...", לכל היותר "!" אחד.
ישר לעניין, בלי הקדמות ובלי רשימות מספרים:
1. שורה קצרה אחת עם השם, ומיד הדבר הכי מעניין להם השבוע: ההמלצה הכי טובה מ-picks או החדשות מהצוות (around), והמשפט למה זה בשבילם.
2. שאר ההמלצות וההיילייטים (picks, zap_this_week), שורה אחת לכל אחד. פריט עם outside_my_topics מוצג כ"אולי יפתיע אתכם".
3. מה מחכה להם (waiting), רק אם יש.
4. מספרים: לכל היותר שורה אחת, קרוב לסוף, ורק אם יש משהו בולט (עלו מקום, קרובים למקום הבא או לרמה הבאה). אחרת לא מזכירים מספרים בכלל.
5. פרגון של חצי שורה למובילים, ושורת קריאה לפעולה אחת.
- מדלגים על כל מה שאין לו נתונים. לעולם לא ממציאים מספרים, שמות או פריטים.
- שמות עם "(דמו)" הם עמיתי דמו: אם מזכירים אותם, משאירים את הסימון.
card_he: כרטיס לטימס ולמייל, עד 90 מילים ("• ..." לפריטים).
script_he: תסריט לאודיו, 220-260 מילים, משפטים קצרים לדיבור, בלי סימנים, בלי קישורים ובלי כותרות.
segments: רשימת שמות החלקים שנכללו בפועל, מתוך: ${SEGMENTS.join(", ")}.
JSON בלבד: {"card_he","script_he","segments"}

${shout ? `המובילים החודש: ${shout}${shoutTeam ? `; הצוות המוביל: ${shoutTeam}` : ""}.` : ""}
חבילת ההקשר:
${JSON.stringify(ctx)}`,
      },
    ], true))
    let audioUrl: string | null = null
    if (audio) {
      try { audioUrl = await voice(out.script_he, `${week}/${p.user_id}.wav`) } catch (e) {
        await log("weekly-tts", false, { email: p.email, error: String(e) })
      }
    }
    const segments = (out.segments ?? []).filter((s) => SEGMENTS.includes(s))
    const row = { user_id: p.user_id, week, body_he: out.card_he, item_ids: picks, audio_url: audioUrl }
    // segments needs patch-020; without it the episode is still saved.
    const { error } = await admin.from("episodes").upsert({ ...row, segments }, { onConflict: "user_id,week" })
    if (error) await admin.from("episodes").upsert(row, { onConflict: "user_id,week" })
    const ok = await notify({
      kind: "episode", to: p.email,
      subject: ctx.who.first_name ? `${ctx.who.first_name}, הפרק השבועי שלכם ב-zap UP` : "הפרק השבועי שלכם ב-zap UP",
      html: mail("הפרק השבועי שלכם", out.card_he.split("\n").filter(Boolean), [
        ...(audioUrl ? [{ label: "להאזנה (2 דקות)", url: audioUrl }] : []),
        { label: "לפתוח את zap UP", url: SITE, primary: !audioUrl },
      ]),
      teams_text: `${out.card_he}${audioUrl ? `\nלהאזנה: ${audioUrl}` : ""}\n${SITE}`,
      teams_to: p.email,
    })
    if (ok) {
      await admin.from("episodes").update({ sent_at: new Date().toISOString() }).eq("user_id", p.user_id).eq("week", week)
      sent.push(p.email)
    }
  }
  return { sent }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const u = new URL(req.url);
  const only = u.searchParams.get("only");
  const report: Record<string, unknown> = { week };
  try {
    if (!only || only === "hot") report.hot = await hot();
    if (!only || only === "engine") report.engine = await engine();
    if (!only || only === "episodes") report.episodes = await episodes(u.searchParams.get("email") ?? undefined);
    await log("weekly", true, report);
    return json(report);
  } catch (e) {
    report.error = String(e);
    await log("weekly", false, report);
    return json(report, 500);
  }
});
