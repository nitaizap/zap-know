// "להאזנה": any written resource (a course/news item or a team document) becomes a short
// two-host Hebrew audio conversation, NotebookLM style, plus its transcript.
// Built from the public summary we already hold (never the course content itself), made once, cached.
import { admin, cors, json, llm, log, parseJson, VOICE, zapUser } from "../_shared/core.ts";

const HOSTS = [
  { name: "נועה", voice: Deno.env.get("TTS_VOICE_A") ?? "Kore" },
  { name: "עידו", voice: Deno.env.get("TTS_VOICE_B") ?? "Puck" },
];

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

async function speak(script: { speaker: string; text: string }[]) {
  const model = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-2.5-flash-preview-tts";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: "קראו בעברית שיחה קלילה וחמה בין שני קולגות, בקצב טבעי:\n" +
            script.map((l) => `${l.speaker}: ${l.text}`).join("\n"),
        }],
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: HOSTS.map((h) => ({
              speaker: h.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: h.voice } },
            })),
          },
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const b64 = (await r.json()).candidates[0].content.parts[0].inlineData.data as string;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Voice a saved transcript and attach the audio; runs after the response (it can take a while).
async function voiceAndStore(kind: string, id: number, lines: { speaker: string; text: string }[]) {
  try {
    const path = `listen/${kind}-${id}-${Date.now()}.wav`;
    await admin.storage.from("episodes").upload(path, wav(await speak(lines)), { contentType: "audio/wav", upsert: true });
    const url = admin.storage.from("episodes").getPublicUrl(path).data.publicUrl;
    await admin.from("listens").update({ audio_url: url }).eq("kind", kind).eq("ref_id", id);
  } catch (e) {
    await log("listen-tts", false, { kind, id, error: String(e).slice(0, 400) });
  }
}

function background(p: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);
  const { kind, id } = await req.json() as { kind: "item" | "doc"; id: number };
  if (!["item", "doc"].includes(kind) || !id) return json({ error: "bad request" }, 400);

  const { data: cached } = await admin.from("listens").select("script,audio_url,created_at").eq("kind", kind).eq("ref_id", id).maybeSingle();
  if (cached?.audio_url) return json({ script: cached.script, audio_url: cached.audio_url, cached: true });
  if (cached) {
    // Voicing failed or is still running; retry if it has been quiet for a few minutes.
    if (Date.now() - new Date(cached.created_at).getTime() > 180_000) {
      await admin.from("listens").update({ created_at: new Date().toISOString() }).eq("kind", kind).eq("ref_id", id);
      background(voiceAndStore(kind, id, cached.script));
    }
    return json({ script: cached.script, audio_url: null, pending: true, cached: true });
  }

  // Source material: public metadata for items, the document itself for team docs.
  let title = "", material = "";
  if (kind === "item") {
    const { data: i } = await admin.from("items").select("title_he,summary_he,why_he,lesson_plan,source_name,status").eq("id", id).single();
    if (!i || i.status !== "approved") return json({ error: "not found" }, 404);
    title = i.title_he;
    material = `${i.title_he}\n${i.summary_he ?? ""}\nלמה זה שווה: ${i.why_he ?? ""}\nמקור: ${i.source_name}\n` +
      (i.lesson_plan as { title_he: string }[]).map((l, n) => `שיעור ${n + 1}: ${l.title_he}`).join("\n");
  } else {
    const { data: d } = await admin.from("team_docs").select("title,summary_he,body_md").eq("id", id).single();
    if (!d) return json({ error: "not found" }, 404);
    title = d.title;
    material = `${d.title}\n${d.summary_he}\n${d.body_md.slice(0, 6000)}`;
  }

  try {
    const out = parseJson<{ lines: { speaker: string; text: string }[] }>(await llm([
      { role: "system", content: VOICE },
      {
        role: "user",
        content: `כתבו שיחת פודקאסט קצרה (כדקה וחצי, 8-10 תורות קצרות) בין ${HOSTS[0].name} ל${HOSTS[1].name}, שני קולגות ב-zap, על החומר שלמטה.
- פותחים במה זה ולמה זה מעניין, עוברים על 2-3 הנקודות החשובות, וסוגרים במה עושים עם זה מחר בבוקר.
- שפה מדוברת, משפטים קצרים, הומור קל אם מתאים. בלי להמציא עובדות, מספרים או שמות שלא מופיעים בחומר.
- כל תור: speaker הוא "${HOSTS[0].name}" או "${HOSTS[1].name}".
JSON בלבד: {"lines":[{"speaker","text"}]}

החומר:
${material}`,
      },
    ], true));
    const lines = (out.lines ?? []).filter((l) => l.text?.trim()).map((l) => ({
      speaker: HOSTS.some((h) => h.name === l.speaker) ? l.speaker : HOSTS[0].name, text: l.text.trim(),
    }));
    if (!lines.length) throw new Error("empty script");

    // Save the transcript now and voice it in the background (voicing can outlast a request).
    await admin.from("listens").upsert({ kind, ref_id: id, title, script: lines, audio_url: null, created_at: new Date().toISOString() }, { onConflict: "kind,ref_id" });
    background(voiceAndStore(kind, id, lines));
    const audioUrl: string | null = null;
    return json({ script: lines, audio_url: audioUrl, pending: true, cached: false });
  } catch (e) {
    await log("listen", false, { kind, id, error: String(e).slice(0, 400) });
    return json({ error: "failed" }, 502);
  }
});
