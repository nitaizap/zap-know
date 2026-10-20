// Weekly run (Sunday morning):
//  1. picks the 3 most important updates per topic (hot_week)
//  2. the self-running engine: scores sources by what employees open/save, proposes new RSS
//     feeds (validated before they're suggested) and flags weak ones; L&D decides in the swipe screen
//  3. writes each employee's personal episode, voices it (Gemini TTS) and hands it to Zapier
//     for delivery on Teams + email
// ?only=hot|engine|episodes runs one step; ?email=x@d.co.il limits episodes to one person (demo).
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { admin, cors, json, llm, log, mail, notify, parseJson, VOICE, weekStart } from "../_shared/core.ts";

const week = weekStart();
const SITE = Deno.env.get("SITE_URL") ?? "https://nitaizap.github.io/zap-know/";

async function hot() {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: topics } = await admin.from("topics").select("slug,name_he").eq("status", "live");
  const picked: Record<string, number[]> = {};
  for (const t of topics ?? []) {
    const { data: cands } = await admin.from("items").select("id,title_he,summary_he,opens,saves,likes,dislikes,comments_count,shares_count")
      .eq("topic_slug", t.slug).eq("status", "approved").gte("created_at", since).limit(25);
    if (!cands?.length) continue;
    let ids = cands.slice(0, 3).map((c) => c.id);
    if (cands.length > 3) {
      const out = parseJson<{ ids: number[] }>(await llm([
        { role: "system", content: VOICE },
        {
          role: "user",
          content: `בחרו את 3 העדכונים החשובים השבוע בתחום ${t.name_he} לאנשי שיווק ודיגיטל ב-zap. העדיפו מה שמשנה עבודה בפועל, ושקללו גם את התגובות של העובדים (פתיחות, שמירות, לייקים, דיסלייקים, תגובות ושיתופים). JSON: {"ids":[...]}\n` +
            cands.map((c) => `${c.id}: ${c.title_he} — ${c.summary_he} (opens ${c.opens}, saves ${c.saves}, likes ${c.likes}, dislikes ${c.dislikes}, comments ${c.comments_count}, shares ${c.shares_count})`).join("\n"),
        },
      ], true));
      ids = out.ids.filter((id) => cands.some((c) => c.id === id)).slice(0, 3);
    }
    await admin.from("items").update({ hot_week: week }).in("id", ids);
    picked[t.slug] = ids;
  }
  return picked;
}

async function engine() {
  const { data: sources } = await admin.from("sources").select("id,name,kind,ref,topic_slug,status");
  const { data: items } = await admin.from("items").select("source_id,opens,saves,likes,dislikes,comments_count,shares_count,status").not("source_id", "is", null);
  const flagged: string[] = [];
  for (const s of sources ?? []) {
    const mine = (items ?? []).filter((i) => i.source_id === s.id && i.status === "approved");
    const score = mine.length ? mine.reduce((a, i) => a + i.opens + 3 * i.saves + 2 * i.likes - 2 * i.dislikes + i.comments_count + 2 * i.shares_count, 0) / mine.length : 0;
    const weak = s.status === "active" && mine.length >= 5 && score < 0.5;
    await admin.from("sources").update({
      score,
      ...(weak ? { reason_he: `מתוך ${mine.length} פריטים כמעט אף אחד לא נפתח. אולי שווה לוותר על המקור הזה?` } : {}),
    }).eq("id", s.id);
    if (weak) flagged.push(s.name);
  }

  // Propose up to 2 new feeds for the thinnest live topic, and only keep ones that really parse.
  const { data: topics } = await admin.from("topics").select("slug,name_he").eq("status", "live");
  const counts = (topics ?? []).map((t) => ({
    ...t, n: (sources ?? []).filter((s) => s.topic_slug === t.slug && s.status === "active").length,
  })).sort((a, b) => a.n - b.n);
  const thin = counts[0];
  const proposed: string[] = [];
  if (thin) {
    const out = parseJson<{ feeds: { name: string; url: string; reason_he: string }[] }>(await llm([
      { role: "system", content: VOICE },
      {
        role: "user",
        content: `הציעו 4 פידים של RSS מקצועיים, ציבוריים ומוכרים, בתחום ${thin.name_he}. רק כתובות RSS/Atom אמיתיות שאתם בטוחים בהן. reason_he: משפט אחד למה זה יעזור לעובדי zap. JSON: {"feeds":[{"name","url","reason_he"}]}\nכבר יש: ${(sources ?? []).map((s) => s.ref).join(", ")}`,
      },
    ], true));
    const parser = new XMLParser();
    for (const f of out.feeds ?? []) {
      if (proposed.length >= 2) break;
      try {
        const r = await fetch(f.url, { headers: { "User-Agent": "zapKNOW/1.0" } });
        const doc = parser.parse(await r.text());
        if (!r.ok || !(doc.rss || doc.feed)) continue;
        const { error } = await admin.from("sources").insert({
          name: f.name, kind: "rss", ref: f.url, topic_slug: thin.slug, status: "proposed", reason_he: f.reason_he,
        });
        if (!error) proposed.push(f.name);
      } catch { /* not a working feed, skip */ }
    }
  }
  return { flagged, proposed };
}

function wav(pcm: Uint8Array, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true);
  h.setUint16(34, 16, true); w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}

async function voice(text: string, path: string) {
  const model = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-2.5-flash-preview-tts";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `קראו בעברית, בקול חם וקליל של קולגה, בקצב רגוע:\n${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: Deno.env.get("TTS_VOICE") ?? "Kore" } } },
      },
    }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const b64 = (await r.json()).candidates[0].content.parts[0].inlineData.data as string;
  const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  await admin.storage.from("episodes").upload(path, wav(pcm), { contentType: "audio/wav", upsert: true });
  return admin.storage.from("episodes").getPublicUrl(path).data.publicUrl;
}

async function episodes(onlyEmail?: string) {
  // Demo colleagues never get an episode: it would only burn AI/TTS quota and the 150s budget.
  let q = admin.from("profiles").select("user_id,email,display_name,role,topics").eq("is_demo", false);
  if (onlyEmail) q = q.eq("email", onlyEmail);
  const { data: people } = await q;
  const audio = (Deno.env.get("EPISODE_AUDIO") ?? "true") === "true";
  // Shout-out: the month's leading people and team, mentioned in every episode.
  const lead = await admin.rpc("leaderboard_public", { p_scope: "people", p_limit: 3 });
  const leadTeam = await admin.rpc("leaderboard_public", { p_scope: "teams", p_limit: 1 });
  const shout = [
    ...((lead.data ?? []) as { name: string; points: number }[]).map((x) => `${x.name} (${x.points} נק')`),
  ].join(", ");
  const shoutTeam = ((leadTeam.data ?? []) as { name: string }[])[0]?.name;
  const sent: string[] = [];
  for (const p of people ?? []) {
    const topics = p.topics?.length ? p.topics : ["digital-marketing"];
    const [{ data: hotItems }, { data: inside }, { data: prog }] = await Promise.all([
      admin.from("items").select("id,title_he,why_he,topic_slug").in("topic_slug", topics).eq("status", "approved")
        .eq("hot_week", week).limit(3),
      admin.from("items").select("id,title_he,why_he").eq("kind", "internal").eq("status", "approved")
        .order("created_at", { ascending: false }).limit(1),
      admin.from("progress").select("item_id,lessons_done,items(title_he,lesson_plan)").eq("user_id", p.user_id)
        .order("updated_at", { ascending: false }).limit(1),
    ]);
    const picks = [...(hotItems ?? []), ...(inside ?? [])];
    if (!picks.length) continue;
    const cont = prog?.[0] as unknown as { item_id: number; lessons_done: number[]; items: { title_he: string; lesson_plan: unknown[] } } | undefined;
    const out = parseJson<{ card_he: string; script_he: string }>(await llm([
      { role: "system", content: VOICE },
      {
        role: "user",
        content: `כתבו את הפרק השבועי האישי של zap UP${p.display_name ? ` ל${p.display_name}` : ""} (תפקיד: ${p.role ?? "לא צוין"}).
card_he: כרטיס קצר לטימס ולמייל. פתיח של שורה, ואז שורה לכל פריט ("• כותרת: למה זה שווה לכם"). ${cont ? `בסוף שורה שמזמינה להמשיך את "${cont.items.title_he}" (סיימו ${cont.lessons_done.length} מתוך ${cont.items.lesson_plan.length} שיעורים).` : ""} עד 90 מילים.
script_he: אותו תוכן כתסריט לאודיו של כ-2 דקות, משפטים קצרים לדיבור, בלי סימנים ובלי קישורים.
JSON בלבד.

פריטים:
${picks.map((i) => `- ${i.title_he}: ${i.why_he ?? ""}`).join("\n")}
${shout ? `שורת סיום קצרה וחמה שמפרגנת למובילים של החודש בטבלת הנקודות: ${shout}${shoutTeam ? `, והצוות המוביל: ${shoutTeam}` : ""}.` : ""}`,
      },
    ], true));
    let audioUrl: string | null = null;
    if (audio) {
      try { audioUrl = await voice(out.script_he, `${week}/${p.user_id}.wav`); } catch (e) {
        await log("weekly-tts", false, { email: p.email, error: String(e) });
      }
    }
    await admin.from("episodes").upsert({
      user_id: p.user_id, week, body_he: out.card_he, item_ids: picks.map((i) => i.id), audio_url: audioUrl,
    }, { onConflict: "user_id,week" });
    const ok = await notify({
      kind: "episode", to: p.email,
      subject: "הפרק השבועי שלכם ב-zap UP",
      html: mail("הפרק השבועי שלכם", out.card_he.split("\n").filter(Boolean), [
        ...(audioUrl ? [{ label: "להאזנה (2 דקות)", url: audioUrl }] : []),
        { label: "לפתוח את zap UP", url: SITE, primary: !audioUrl },
      ]),
      teams_text: `${out.card_he}${audioUrl ? `
להאזנה: ${audioUrl}` : ""}
${SITE}`,
      teams_to: p.email,
    });
    if (ok) {
      await admin.from("episodes").update({ sent_at: new Date().toISOString() }).eq("user_id", p.user_id).eq("week", week);
      sent.push(p.email);
    }
  }
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const u = new URL(req.url);
  const only = u.searchParams.get("only");
  const report: Record<string, unknown> = { week };
  try {
    if (!only || only === "hot") report.hot = await hot();
    if (!only || only === "engine") report.engine = await engine();
    if (!only || only === "episodes") report.episodes = await episodes(u.searchParams.get("email") ?? undefined);
    await log("weekly", true, report);
    return json(report);
  } catch (e) {
    report.error = String(e);
    await log("weekly", false, report);
    return json(report, 500);
  }
});
