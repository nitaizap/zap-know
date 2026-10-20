import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Shared helpers for zap KNOW edge functions.
// LLM provider is a setting: demo runs on the Gemini free tier (public content and
// demo data only); production switches LLM_PROVIDER=openrouter for internal data.

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
    const pin = await num(tts ? "price_tts_in" : "price_text_in", tts ? 1 : 0.5);
    const pout = await num(tts ? "price_tts_out" : "price_text_out", tts ? 20 : 3);
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

// Unified chat: answers from platform content only (external items + internal team profiles).
// The corpus is small, so we hand the model a compact catalog instead of building a vector index.

type Hist = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);
  const { question, history = [], mode, team_id } = await req.json() as {
    question: string; history?: Hist[]; mode?: "internal" | "external" | "me" | "all"; team_id?: number;
  };
  if (!question?.trim()) return json({ error: "empty question" }, 400);

  const [{ data: items }, { data: teams }, { data: opened }, { data: reacted }, { data: saved }, { data: prog }] = await Promise.all([
    admin.from("items").select("id,kind,topic_slug,verticals,title_he,summary_he,source_name,source_url")
      .eq("status", "approved").order("opens", { ascending: false }).limit(300),
    admin.from("team_profiles").select("id,team,vertical,summary_he,tools,resources,processes_he,contact_name,contact_email,is_demo"),
    // The asker's own history, so "that article I saw about GEO" can be found again.
    admin.from("events").select("item_id,at").eq("user_id", user.id).eq("type", "open").order("at", { ascending: false }).limit(80),
    admin.from("reactions").select("item_id,value,at").eq("user_id", user.id).limit(80),
    admin.from("saves").select("item_id,created_at").eq("user_id", user.id).limit(80),
    admin.from("progress").select("item_id,lessons_done,updated_at").eq("user_id", user.id).limit(40),
  ]);

  const day = (s: string) => new Date(s).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
  const mine = new Map<number, string[]>();
  const add = (id: number, what: string) => mine.set(id, [...(mine.get(id) ?? []), what]);
  const seenOnce = new Set<number>();
  for (const e of opened ?? []) if (!seenOnce.has(e.item_id)) { seenOnce.add(e.item_id); add(e.item_id, `פתחת ב-${day(e.at)}`); }
  for (const r of reacted ?? []) add(r.item_id, r.value === 1 ? "עשית לייק" : "עשית דיסלייק");
  for (const v of saved ?? []) add(v.item_id, "שמרת");
  for (const g of prog ?? []) add(g.item_id, `סימנת ${g.lessons_done.length} שיעורים`);
  const historyText = [...mine.entries()].map(([id, what]) => `[E${id}] ${what.join(", ")}`).join("\n") || "אין עדיין היסטוריה.";

  const catalog = (items ?? []).map((i) =>
    `[E${i.id}] (${i.kind}/${i.topic_slug}) ${i.title_he} — ${(i.summary_he ?? "").slice(0, 220)} | מקור: ${i.source_name}`
  ).join("\n");
  const teamText = (teams ?? []).map((t, n) =>
    `[T${n}] (id ${t.id}) צוות ${t.team}${t.is_demo ? " (נתוני דמו)" : ""}: ${t.summary_he}\nכלים: ${
      (t.tools as { name: string; what_for_he?: string }[]).map((x) => `${x.name}${x.what_for_he ? ` (${x.what_for_he})` : ""}`).join(", ")
    }\nמשאבים: ${(t.resources as { name: string; system?: string }[]).map((x) => `${x.name} [${x.system ?? ""}]`).join(", ")}\nתהליך: ${t.processes_he ?? ""}\nאיש קשר: ${t.contact_name ?? ""}`
  ).join("\n\n");

  // Team documents: the most relevant ones go in with their body, the rest by title only.
  const { data: docs } = await admin.from("team_docs").select("id,team_id,title,kind,summary_he,body_md,tools");
  const words = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  const score = (d: { title: string; summary_he: string; body_md: string; tools: string[]; team_id: number }) => {
    const hay = `${d.title} ${d.summary_he} ${d.tools.join(" ")} ${d.body_md}`.toLowerCase();
    return words.reduce((a, w) => a + (hay.includes(w) ? (d.title.toLowerCase().includes(w) ? 3 : 1) : 0), 0)
      + (team_id && d.team_id === team_id ? 4 : 0);
  };
  const ranked = (docs ?? []).map((d) => ({ d, s: score(d) })).sort((a, b) => b.s - a.s);
  const teamName = (id: number) => (teams ?? []).find((t) => t.id === id)?.team ?? "";
  const docText = ranked.slice(0, 5).filter((x) => x.s > 0).map(({ d }) =>
    `[D${d.id}] (${d.kind}, צוות ${teamName(d.team_id)}) ${d.title}${"\n"}${d.body_md.slice(0, 2200)}`
  ).join("\n\n") || "אין מסמך שמתאים במיוחד.";
  const docIndex = (docs ?? []).map((d) => `[D${d.id}] צוות ${teamName(d.team_id)}: ${d.title} — ${d.summary_he}`).join("\n");
  // Each page has its own agent: same knowledge, a different first place to look.
  const focus = mode === "internal"
    ? "המצב: הסוכן של עמוד הידע מבפנים. השאלה היא על איך צוותים ב-zap עובדים. עונים קודם מהמסמכים ומפרופילי הצוותים, ומוסיפים פריט חיצוני רק אם הוא באמת עוזר."
    : mode === "external"
    ? "המצב: הסוכן של עמוד הידע מבחוץ. ממליצים על 1-3 פריטים מהקטלוג (קורסים, עדכונים, פודקאסטים) שמתאימים לשאלה, ומסבירים במשפט למה. מפרופילי צוותים רק אם זה באמת עוזר."
    : mode === "me"
    ? "המצב: הסוכן של האזור האישי. עונים קודם מההיסטוריה האישית (מה נפתח, נשמר, סומן), ואחר כך מציעים צעד הבא אחד מהקטלוג."
    : "";

  const system = `${VOICE}

אתם העוזר של zap UP. עונים רק מתוך הידע שלמטה. אם אין תשובה בידע, אומרים את זה בפשטות ומציעים למי לפנות או מה לחפש.
- שאלה על איך צוות עובד → עונים מפרופיל הצוות: הכלים, המשאבים, התהליך ואיש הקשר. אם הפרופיל מסומן "נתוני דמו", מציינים את זה במשפט קצר.
- שאלה על למידה → ממליצים על 1-3 פריטים מהקטלוג ומסבירים במשפט למה.
- כשזה מתחבר, מחברים בין העולמות ("צוות ה-PPC עובד עם X, והנה קורס שמסביר אותו").
- שאלה על משהו שהשואלים כבר ראו, קראו או למדו ("ראיתי כתבה ש...", "מה היה הקורס ההוא על...") → מחפשים קודם בהיסטוריה האישית למטה, מתאימים לפי התוכן בקטלוג גם כשהתיאור לא מדויק, ואומרים מתי זה נפתח.
- שאלה על "איך צוות X עושה Y" → עונים מהמסמכים (D) בצעדים קצרים וממוספרים כשזה תהליך, ומפנים למסמך המלא. אם המסמכים מסומנים כנתוני דמו, אומרים את זה במשפט אחד בסוף.
- קצר: עד 150 מילים. בלי להמציא קישורים, כלים או מספרים שלא מופיעים בידע.
${focus}
החזירו JSON בלבד: {"answer_he": string, "refs": string[], "followups": string[], "contact_team_id": number | null}
refs: המזהים שהשתמשתם בהם (למשל "D4", "E12", "T3"). followups: 2-3 שאלות המשך קצרות שהשואלים עשויים לרצות לשאול. contact_team_id: מזהה הצוות (המספר האמיתי, id) שכדאי לפנות אליו, או null.

=== מסמכי צוותים רלוונטיים (ידע פנימי) ===
${docText}

=== כל מסמכי הצוותים (כותרות) ===
${docIndex}

=== פרופילי צוותים (ידע פנימי) ===
${teamText}

=== ההיסטוריה האישית של מי ששואל ===
${historyText}

=== קטלוג תוכן (ידע חיצוני) ===
${catalog}`;

  try {
    const out = parseJson<{ answer_he: string; refs: string[]; followups?: string[]; contact_team_id?: number | null }>(await llm([
      { role: "system", content: system },
      ...history.slice(-6),
      { role: "user", content: question },
    ], true));
    const byId = new Map((items ?? []).map((i) => [`E${i.id}`, i]));
    const sources = (out.refs ?? []).flatMap((ref) => {
      if (ref.startsWith("E") && byId.has(ref)) {
        const i = byId.get(ref)!;
        return [{ type: "external", title: i.title_he, url: `#/item/${i.id}`, source_url: i.source_url }];
      }
      if (ref.startsWith("D")) {
        const d = (docs ?? []).find((x) => `D${x.id}` === ref);
        return d ? [{ type: "doc", title: d.title, url: `#/doc/${d.id}`, snippet: d.summary_he, kind: d.kind, team: teamName(d.team_id) }] : [];
      }
      const t = (teams ?? [])[Number(ref.slice(1))];
      return ref.startsWith("T") && t ? [{ type: "internal", title: `צוות ${t.team}`, url: `#/teams/${t.id}` }] : [];
    });
    const ct = (teams ?? []).find((t) => t.id === (out.contact_team_id ?? team_id));
    return json({
      answer_he: out.answer_he,
      sources,
      followups: (out.followups ?? []).slice(0, 3),
      contact: ct ? { team: ct.team, name: ct.contact_name, email: ct.contact_email } : null,
    });
  } catch (e) {
    await admin.from("run_log").insert({ job: "ask", ok: false, detail: { error: String(e) } });
    return json({ error: "ai_failed" }, 502);
  }
});