// Unified chat: answers from platform content only (external items + internal team profiles).
// The corpus is small, so we hand the model a compact catalog instead of building a vector index.
import { admin, cors, json, llm, parseJson, VOICE, zapUser } from "../_shared/core.ts";

type Hist = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);
  const { question, history = [] } = await req.json() as { question: string; history?: Hist[] };
  if (!question?.trim()) return json({ error: "empty question" }, 400);

  const [{ data: items }, { data: teams }, { data: opened }, { data: reacted }, { data: saved }, { data: prog }] = await Promise.all([
    admin.from("items").select("id,kind,topic_slug,verticals,title_he,summary_he,source_name,source_url")
      .eq("status", "approved").order("opens", { ascending: false }).limit(300),
    admin.from("team_profiles").select("id,team,vertical,summary_he,tools,resources,processes_he,contact_name,is_demo"),
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
    `[T${n}] צוות ${t.team}${t.is_demo ? " (נתוני דמו)" : ""}: ${t.summary_he}\nכלים: ${
      (t.tools as { name: string; what_for_he?: string }[]).map((x) => `${x.name}${x.what_for_he ? ` (${x.what_for_he})` : ""}`).join(", ")
    }\nמשאבים: ${(t.resources as { name: string; system?: string }[]).map((x) => `${x.name} [${x.system ?? ""}]`).join(", ")}\nתהליך: ${t.processes_he ?? ""}\nאיש קשר: ${t.contact_name ?? ""}`
  ).join("\n\n");

  const system = `${VOICE}

את/ה העוזר של zap UP. עונים רק מתוך הידע שלמטה. אם אין תשובה בידע, אומרים את זה בפשטות ומציעים למי לפנות או מה לחפש.
- שאלה על איך צוות עובד → עונים מפרופיל הצוות: הכלים, המשאבים, התהליך ואיש הקשר. אם הפרופיל מסומן "נתוני דמו", מציינים את זה במשפט קצר.
- שאלה על למידה → ממליצים על 1-3 פריטים מהקטלוג ומסבירים במשפט למה.
- כשזה מתחבר, מחברים בין העולמות ("צוות ה-PPC עובד עם X, והנה קורס שמסביר אותו").
- שאלה על משהו שהעובד/ת כבר ראו, קראו או למדו ("ראיתי כתבה ש...", "מה היה הקורס ההוא על...") → מחפשים קודם בהיסטוריה האישית למטה, מתאימים לפי התוכן בקטלוג גם כשהתיאור לא מדויק, ואומרים מתי זה נפתח.
- קצר: עד 120 מילים. בלי להמציא קישורים.
החזירו JSON בלבד: {"answer_he": string, "refs": string[]} כש-refs הם המזהים שהשתמשתם בהם (למשל "E12", "T3").

=== פרופילי צוותים (ידע פנימי) ===
${teamText}

=== ההיסטוריה האישית של מי ששואל/ת ===
${historyText}

=== קטלוג תוכן (ידע חיצוני) ===
${catalog}`;

  try {
    const out = parseJson<{ answer_he: string; refs: string[] }>(await llm([
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
      const t = (teams ?? [])[Number(ref.slice(1))];
      return ref.startsWith("T") && t ? [{ type: "internal", title: `צוות ${t.team}`, url: `#/teams/${t.id}` }] : [];
    });
    return json({ answer_he: out.answer_he, sources });
  } catch (e) {
    await admin.from("run_log").insert({ job: "ask", ok: false, detail: { error: String(e) } });
    return json({ error: "ai_failed" }, 502);
  }
});
