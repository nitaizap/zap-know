// "קורה ב-zap" intake. Three doors, one flow:
//  - Teams channel and mail group, via Zapier, authenticated with the x-zap-secret header
//  - the short form on the site, authenticated with the employee's session
// The post is summarized in One Tone and published as a kind='internal' item.
import { admin, cors, json, llm, log, parseJson, VOICE, zapUser } from "../_shared/core.ts";

type Body = { title?: string; team?: string; text: string; link?: string; author?: string; channel?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const viaZapier = req.headers.get("x-zap-secret") === Deno.env.get("INGEST_SECRET");
  const user = viaZapier ? null : await zapUser(req);
  if (!viaZapier && !user) return json({ error: "login required" }, 401);

  const b = await req.json() as Body;
  const text = (b.text ?? "").replace(/<[^>]+>/g, " ").trim();
  if (text.length < 20) return json({ error: "too short" }, 400);
  const channel = b.channel ?? (viaZapier ? "teams" : "form");

  try {
    const { data: topics } = await admin.from("topics").select("slug,name_he");
    const out = parseJson<{ title_he: string; summary_he: string; why_he: string; topic_slug: string; verticals: string[] }>(
      await llm([
        { role: "system", content: VOICE },
        {
          role: "user",
          content: `צוות ב-zap שיתף פרויקט. סכמו אותו לכרטיס "קורה ב-zap".
title_he: כותרת של עד 8 מילים שמתחילה במי שעשה ("צוות ה-PPC בנה...").
summary_he: 2-3 משפטים: מה בנו, איך, ומה יצא מזה.
why_he: משפט אחד, למה שווה לשאר העובדים להכיר.
topic_slug: אחד מ: ${(topics ?? []).map((t) => t.slug).join(", ")}.
verticals: מתוך [zap, zapstore, Wisebuy, דפי זהב, Doctors, משפטי, REST, Weekend, zapX, zap לעסקים], רק אם מוזכר.
JSON בלבד.

צוות: ${b.team ?? "לא צוין"}
כותרת מקורית: ${b.title ?? ""}
טקסט:
${text.slice(0, 6000)}`,
        },
      ], true),
    );
    const auto = (Deno.env.get("INTERNAL_AUTO_APPROVE") ?? "true") === "true";
    const sourceUrl = b.link?.startsWith("http") ? b.link : `https://zap-know.internal/${channel}/${Date.now()}`;
    // The author earns points for the post: the form knows the user, Zapier passes the sender's email.
    let author = user?.id ?? null;
    if (!author && b.author?.includes("@")) {
      const { data: who } = await admin.from("profiles").select("user_id").ilike("email", b.author.trim()).maybeSingle();
      author = who?.user_id ?? null;
    }
    const { data, error } = await admin.from("items").insert({
      kind: "internal",
      author_user: author,
      topic_slug: (topics ?? []).some((t) => t.slug === out.topic_slug) ? out.topic_slug : null,
      verticals: out.verticals ?? [],
      title_he: out.title_he,
      title_orig: b.title ?? null,
      summary_he: out.summary_he,
      why_he: out.why_he,
      source_name: channel === "teams" ? `Teams · ${b.team ?? "קורה ב-zap"}` : channel === "mail" ? "קבוצת המייל" : `טופס · ${user?.email ?? b.author ?? ""}`,
      source_url: sourceUrl,
      published_at: new Date().toISOString(),
      summarized_at: new Date().toISOString(),
      status: auto ? "approved" : "pending",
    }).select("id").single();
    if (error) throw error;
    await log("ingest-internal", true, { id: data.id, channel });
    return json({ ok: true, id: data.id, status: auto ? "approved" : "pending" });
  } catch (e) {
    await log("ingest-internal", false, { error: String(e), channel });
    return json({ error: "failed" }, 500);
  }
});
