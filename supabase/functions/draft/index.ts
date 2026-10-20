// "מספרים בקול, ה-AI כותב": turns a voice note, a document or a link into an editable draft
// (title, summary, bullets, topic, tags). Nothing is published here; the person edits and sends.
// Voice and documents go to Gemini as inline data (approved tool), links are read for public metadata only.
import { admin, cors, json, log, parseJson, setting, VOICE, zapUser } from "../_shared/core.ts";

type Body = {
  mode: "voice" | "doc" | "link" | "text";
  purpose: "internal" | "external";
  data?: string;   // base64 for voice/doc
  mime?: string;
  url?: string;
  text?: string;
};

async function pageText(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": "zapUP/1.0" }, redirect: "follow" });
  const html = (await r.text()).slice(0, 400_000);
  const meta = (n: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)`, "i"))?.[1] ?? "";
  const title = html.match(/<title[^>]*>([^<]+)/i)?.[1] ?? "";
  return `כותרת: ${meta("og:title") || title}\nתיאור: ${meta("og:description") || meta("description")}\nכתובת: ${r.url}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);
  const b = await req.json() as Body;
  if ((b.data?.length ?? 0) > 28_000_000) return json({ error: "too big" }, 413);

  const { data: topics } = await admin.from("topics").select("slug,name_he");
  const skeleton = b.purpose === "internal"
    ? 'bullets: 4 נקודות בדיוק, לפי הסדר: "הבעיה: ...", "מה בנינו: ...", "תוצאות ראשונות: ...", "איך מצטרפים או מעתיקים לצוות שלכם: ...". אם משהו לא נאמר, כותבים "עוד לא ידוע".'
    : "bullets: 3-5 נקודות של מה לומדים או מה יש בפנים, רק ממה שמופיע בחומר.";
  const instructions = `${VOICE}
הפכו את החומר לטיוטה לפרסום ב-zap UP (${b.purpose === "internal" ? "קורה ב-zap: פרויקט או השקה פנימית" : "המלצה על תוכן חיצוני"}).
title_he: כותרת קצרה (עד 9 מילים${b.purpose === "internal" ? ", מתחילה במי שעשה" : ""}).
summary_he: 2-3 משפטים.
${skeleton}
topic_slug: אחד מ: ${(topics ?? []).map((t) => t.slug).join(", ")}.
tags: 2-5 תגיות קצרות (כלים, מותגים, נושאים).
${b.mode === "voice" ? "transcript_he: תמלול נקי של ההקלטה." : ""}
בלי להמציא עובדות, מספרים או שמות שלא נאמרו. JSON בלבד.`;

  const parts: Record<string, unknown>[] = [{ text: instructions }];
  try {
    if (b.mode === "voice" || b.mode === "doc") {
      if (!b.data || !b.mime) return json({ error: "missing file" }, 400);
      parts.push({ inline_data: { mime_type: b.mime, data: b.data } });
    } else if (b.mode === "link") {
      if (!b.url?.startsWith("https://")) return json({ error: "https only" }, 400);
      parts.push({ text: `החומר (מידע פומבי מהקישור):\n${await pageText(b.url)}` });
    } else {
      parts.push({ text: `החומר:\n${(b.text ?? "").slice(0, 12000)}` });
    }
    const model = await setting("gemini_model", Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest");
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json" } }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    const out = parseJson<Record<string, unknown>>(d.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}");
    await log("draft", true, { mode: b.mode, purpose: b.purpose });
    return json({ ...out, source_url: b.mode === "link" ? b.url : null });
  } catch (e) {
    await log("draft", false, { mode: b.mode, error: String(e).slice(0, 300) });
    return json({ error: "failed" }, 502);
  }
});
