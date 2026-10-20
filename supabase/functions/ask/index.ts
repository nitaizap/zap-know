// Unified chat: answers from platform content only (external items + internal team profiles).
// The corpus is small, so we hand the model a compact catalog instead of building a vector index.
import { admin, cors, json, llm, parseJson, VOICE, zapUser } from "../_shared/core.ts";

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
