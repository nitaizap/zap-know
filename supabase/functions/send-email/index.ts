// Supabase Auth "Send Email Hook": login codes go out through Zapier → Outlook,
// so they come from a real @d.co.il mailbox instead of Supabase's limited SMTP.
import { Webhook } from "npm:standardwebhooks@1.0.0";

type Payload = {
  user: { email: string };
  email_data: { token: string; email_action_type: string };
};

Deno.serve(async (req) => {
  const raw = await req.text();
  const secret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
  let p: Payload;
  try {
    p = new Webhook(secret).verify(raw, Object.fromEntries(req.headers)) as Payload;
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "bad signature" } }), { status: 401 });
  }

  const code = p.email_data.token;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#001c32;font-size:16px;line-height:1.6">
<p style="font-size:22px;font-weight:900;color:#052b7a;margin:0 0 12px">הקוד שלכם ל-zap KNOW</p>
<p style="margin:0 0 16px">מעתיקים את הקוד למסך הכניסה, וזהו, אתם בפנים.</p>
<p style="font-size:32px;font-weight:900;letter-spacing:6px;color:#052b7a;margin:0 0 16px">${code}</p>
<p style="color:#4d6070;font-size:13px;margin:0">הקוד תקף לשעה. לא ביקשתם להיכנס? אפשר פשוט להתעלם מהמייל.</p>
</div>`;

  const r = await fetch(Deno.env.get("EMAIL_ZAP_WEBHOOK")!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: p.user.email, subject: `${code} הוא הקוד שלכם ל-zap KNOW`, html }),
  });
  if (!r.ok) {
    return new Response(JSON.stringify({ error: { http_code: 502, message: "email relay failed" } }), { status: 502 });
  }
  return new Response("{}", { headers: { "Content-Type": "application/json" } });
});
