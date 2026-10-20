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

// Share an item: to a colleague (lands in their feed + a Teams/Outlook ping), to the Teams
// channel, or as a plain link. Every share counts toward the ranking.

const SITE = Deno.env.get("SITE_URL") ?? "https://nitaizap.github.io/zap-know/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);
  const b = await req.json() as { item_id: number; channel: "colleague" | "teams" | "link"; to_user?: string; note?: string };
  if (!["colleague", "teams", "link"].includes(b.channel)) return json({ error: "bad channel" }, 400);
  if (b.channel === "colleague" && !b.to_user) return json({ error: "pick a colleague" }, 400);

  const [{ data: item }, { data: me }, { data: to }] = await Promise.all([
    admin.from("items").select("id,title_he,why_he,source_name,status").eq("id", b.item_id).single(),
    admin.from("profiles").select("email,display_name").eq("user_id", user.id).single(),
    b.to_user ? admin.from("profiles").select("email,display_name").eq("user_id", b.to_user).single() : Promise.resolve({ data: null }),
  ]);
  if (!item || item.status !== "approved") return json({ error: "not found" }, 404);

  await admin.from("shares").insert({
    item_id: item.id, from_user: user.id, to_user: b.to_user ?? null, channel: b.channel, note: b.note?.slice(0, 300) ?? null,
  });
  const { count } = await admin.from("shares").select("id", { count: "exact", head: true }).eq("item_id", item.id);
  await admin.from("items").update({ shares_count: count ?? 0 }).eq("id", item.id);

  const link = `${SITE}#/item/${item.id}`;
  if (b.channel !== "link") {
    const from = me?.display_name ?? me?.email ?? "מישהו מ-zap";
    const lines = [`המלצה מ-${from}: "${item.title_he}"`, ...(item.why_he ? [item.why_he] : []), ...(b.note ? [`בהערה: ${b.note}`] : [])];
    const channelBox = Deno.env.get("CHANNEL_EMAIL") ?? me?.email ?? "";
    await notify({
      kind: "share",
      to: b.channel === "colleague" ? to!.email : channelBox,
      subject: `המלצה מ-${from} ב-zap UP: ${item.title_he}`,
      html: mail("שיתפו איתכם משהו", lines, [{ label: "לפתוח ב-zap UP", url: link }]),
      teams_text: `${lines.join("\n")}
${link}`,
      teams_to: b.channel === "colleague" ? to!.email : "channel",
    });
  }
  await log("share", true, { item: item.id, channel: b.channel });
  return json({ ok: true, link });
});