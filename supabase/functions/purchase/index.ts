// Learning budget purchases.
//  POST (employee session) {item_id?, title, url, category, price, reason}
//    within the monthly budget → auto_approved: buy now with the zap UP virtual card
//    above it → pending_manager: the direct manager gets a one-click request (Zapier → Teams/Outlook)
//  GET ?id=&t=&d=approve|decline → the manager's one-click link, answers with a small page
import { admin, cors, json, log, mail, notify, zapUser } from "../_shared/core.ts";

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
  return { ...b, spent, remaining: Number(b.monthly_amount) - spent };
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
        ? `המנהל/ת אישר/ה את "${p.title}". אפשר לקנות עכשיו עם הכרטיס של zap UP.`
        : `"${p.title}" לא אושר הפעם. שווה לדבר עם המנהל/ת, או לחפש חלופה ב-zap UP.`;
      await notify({
        kind: "decision", to: who.email,
        subject: status === "approved" ? `אושר: ${p.title}` : `לא אושר הפעם: ${p.title}`,
        html: mail(status === "approved" ? "אושר, אפשר לקנות" : "לא אושר הפעם", [text], [{ label: "לתקציב שלי", url: `${SITE}#/budget` }]),
        teams_text: text, teams_to: who.email,
      });
    }
    return status === "approved"
      ? page("אישרתם, תודה", `"${p.title}" אושר. העובד/ת מקבל/ת הודעה ויכול/ה לקנות עכשיו.`)
      : page("סירבתם, תודה", `העובד/ת יקבל/תקבל הודעה ש"${p.title}" לא אושר הפעם.`);
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
      `נשארו בתקציב החודשי ${budget.remaining} ${budget.currency}, אז צריך את האישור שלך על ההפרש.`,
      ...(b.reason ? [`למה: ${b.reason}`] : []),
    ];
    await notify({
      kind: "request", to: me!.manager_email!,
      subject: `${who} מבקש/ת אישור ללמידה: ${b.title}`,
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
