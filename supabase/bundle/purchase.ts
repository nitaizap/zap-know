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

// Learning budget purchases.
//  POST (employee session) {item_id?, title, url, category, price, reason}
//    within the monthly budget → auto_approved: buy now with the zap UP virtual card
//    above it → pending_manager: the direct manager gets a one-click request (Zapier → Teams/Outlook)
//  GET ?id=&t=&d=approve|decline → the manager's one-click link, answers with a small page

const SITE = Deno.env.get("SITE_URL") ?? "https://nitaizap.github.io/zap-know/";
const FN = `${Deno.env.get("SUPABASE_URL")}/functions/v1/purchase`;

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>zap UP</title><body style="font-family:Arial,sans-serif;color:#001c32;background:#f3f3f3;margin:0;padding:40px 16px">
<div style="max-width:420px;margin:auto;background:#fff;border-radius:16px;padding:28px">
<p style="font-size:24px;font-weight:900;color:#052b7a;margin:0 0 12px">${title}</p><p style="font-size:16px;line-height:1.6;margin:0">${body}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function budgetOf(userId: string) {
  const { data: b } = await admin.from("budget_settings").select("*").eq("id", 1).single();
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const { data: rows } = await admin.from("purchases").select("price,status").eq("user_id", userId).eq("month", month);
  const spent = (rows ?? []).filter((r) => ["auto_approved", "approved", "purchased"].includes(r.status))
    .reduce((a, r) => a + Number(r.price), 0);
  // Last month's leaderboard winners get extra budget (set by L&D).
  const { data: bonus } = await admin.rpc("budget_bonus_for", { p_user: userId });
  const total = Number(b.monthly_amount) + Number(bonus ?? 0);
  return { ...b, spent, remaining: total - spent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method === "GET") {
    const u = new URL(req.url);
    const id = Number(u.searchParams.get("id"));
    const decision = u.searchParams.get("d");
    const { data: p } = await admin.from("purchases").select("*").eq("id", id).eq("approval_token", u.searchParams.get("t") ?? "").maybeSingle();
    if (!p) return page("הקישור לא תקף", "אולי הבקשה כבר טופלה, או שהקישור הועתק לא שלם.");
    if (p.status !== "pending_manager") return page("כבר טופל", "הבקשה הזאת כבר קיבלה תשובה. אין צורך לעשות שום דבר נוסף.");
    const status = decision === "approve" ? "approved" : "declined";
    await admin.from("purchases").update({ status, decided_at: new Date().toISOString() }).eq("id", id);
    await log("purchase-decision", true, { id, status });
    const { data: who } = await admin.from("profiles").select("email").eq("user_id", p.user_id).single();
    if (who) {
      const text = status === "approved"
        ? `הבקשה ל"${p.title}" אושרה. אפשר לקנות עכשיו עם הכרטיס של zap UP.`
        : `"${p.title}" לא אושר הפעם. שווה לדבר על זה עם מי שמנהל אתכם, או לחפש חלופה ב-zap UP.`;
      await notify({
        kind: "decision", to: who.email,
        subject: status === "approved" ? `אושר: ${p.title}` : `לא אושר הפעם: ${p.title}`,
        html: mail(status === "approved" ? "אושר, אפשר לקנות" : "לא אושר הפעם", [text], [{ label: "לתקציב שלי", url: `${SITE}#/budget` }]),
        teams_text: text, teams_to: who.email,
      });
    }
    return status === "approved"
      ? page("אישרתם, תודה", `"${p.title}" אושר. שלחנו עדכון, ואפשר כבר לקנות.`)
      : page("קיבלנו, תודה", `שלחנו עדכון ש"${p.title}" לא אושר הפעם.`);
  }

  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);
  const b = await req.json() as { item_id?: number; title: string; url: string; category: string; price: number; reason?: string };
  const price = Number(b.price);
  if (!b.title?.trim() || !b.url?.startsWith("http") || !(price >= 0)) return json({ error: "missing fields" }, 400);
  if (!["course", "book", "tool", "event"].includes(b.category)) return json({ error: "bad category" }, 400);

  const budget = await budgetOf(user.id);
  const { data: me } = await admin.from("profiles").select("email,display_name,manager_email").eq("user_id", user.id).single();
  const within = price <= budget.remaining;
  if (!within && !me?.manager_email) return json({ error: "no_manager", remaining: budget.remaining }, 409);

  const { data: p, error } = await admin.from("purchases").insert({
    user_id: user.id, item_id: b.item_id ?? null, title: b.title.trim(), url: b.url, category: b.category,
    price, currency: budget.currency, reason: b.reason ?? null,
    status: within ? "auto_approved" : "pending_manager",
    manager_email: within ? null : me!.manager_email,
  }).select("id,approval_token,status").single();
  if (error) {
    await log("purchase", false, { error: error.message });
    return json({ error: "failed" }, 500);
  }

  if (!within) {
    const link = (d: string) => `${FN}?id=${p.id}&t=${p.approval_token}&d=${d}`;
    const who = me!.display_name ?? me!.email;
    const lines = [
      `${who} רוצה ללמוד "${b.title}" (${price} ${budget.currency}).`,
      `נשארו בתקציב החודשי ${budget.remaining} ${budget.currency}, אז צריך אישור על ההפרש.`,
      ...(b.reason ? [`למה: ${b.reason}`] : []),
    ];
    await notify({
      kind: "request", to: me!.manager_email!,
      subject: `בקשת אישור ללמידה מ-${who}: ${b.title}`,
      html: mail("בקשת אישור ללמידה", lines, [
        { label: "לאשר", url: link("approve") },
        { label: "לא הפעם", url: link("decline"), primary: false },
        { label: "לראות את הקורס", url: b.url, primary: false },
      ]),
      teams_text: `${lines.join(" ")}
לאשר: ${link("approve")}
לא הפעם: ${link("decline")}`,
      teams_to: me!.manager_email!,
    });
  }
  await log("purchase", true, { id: p.id, status: p.status, price });
  return json({
    status: p.status, purchase_id: p.id,
    remaining: within ? budget.remaining - price : budget.remaining,
    currency: budget.currency,
  });
});