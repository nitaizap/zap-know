// Supabase Auth "Send Email Hook": login codes go out through Zapier → Outlook,
// so they come from a real @d.co.il mailbox instead of Supabase's limited SMTP.
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { mail, notify } from "../_shared/core.ts";

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
  const ok = await notify({
    kind: "login",
    to: p.user.email,
    subject: `${code} הוא הקוד שלכם ל-zap KNOW`,
    html: mail("הקוד שלכם ל-zap KNOW", [
      "מעתיקים את הקוד למסך הכניסה, וזהו, אתם בפנים.",
      code,
      "הקוד תקף לשעה. לא ביקשתם להיכנס? אפשר פשוט להתעלם מהמייל.",
    ]),
  });
  if (!ok) {
    return new Response(JSON.stringify({ error: { http_code: 502, message: "email relay failed" } }), { status: 502 });
  }
  return new Response("{}", { headers: { "Content-Type": "application/json" } });
});
