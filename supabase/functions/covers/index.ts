// AI covers: one illustration per topic and per team, in the zap visual language, generated once
// and reused as the thumbnail for anything that has no image of its own. Admin-triggered.
import { admin, cors, json, log, setting } from "../_shared/core.ts";

const STYLE = "Flat, friendly editorial illustration, 16:9, bright white background, " +
  "brand palette only: navy #052b7a, yellow #ffc600, pink #ff5c9e, green #00ab12, purple-blue #485cc7, red #ff210d. " +
  "Rounded square shapes with small corner radius, a thin metro-map line with one station ring crossing from the edge. " +
  "No text, no letters, no logos, no people's faces. Simple, modern, joyful, lots of white space.";

async function draw(subject: string) {
  const model = await setting("image_model", "gemini-2.5-flash-image");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLE}\nSubject: ${subject}` }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!r.ok) throw new Error(`image ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const part = (await r.json()).candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData);
  if (!part) throw new Error("no image in response");
  return { bytes: Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0)), mime: part.inlineData.mimeType ?? "image/png" };
}

const TOPIC_SUBJECT: Record<string, string> = {
  "digital-marketing": "digital marketing: a funnel, a megaphone and charts going up",
  "ppc": "paid search ads: a search bar, a cursor clicking an ad, coins",
  "social": "social media: phone with stacked content cards, hearts and comment bubbles",
  "geo-ecommerce": "AI search and ecommerce: a chat bubble answering, a shopping cart, a product card",
  "data-ai": "data and AI: dashboards, a small friendly robot shape, connected nodes",
  "behavioral-econ": "behavioral economics: two choices on a scale, a brain shape, a price tag",
  "decisions": "decision making: a fork in a path, a compass, checklist",
  "cx": "customer experience: a support headset, a smiling chat bubble, a star rating",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
  const max = Number(new URL(req.url).searchParams.get("max") ?? 6);
  const done: string[] = [], failed: string[] = [];

  const { data: topics } = await admin.from("topics").select("slug,name_he").is("cover_url", null);
  const { data: teams } = await admin.from("team_profiles").select("id,team,summary_he").is("cover_url", null);
  const jobs = [
    ...(topics ?? []).map((t) => ({ kind: "topic", key: t.slug, subject: TOPIC_SUBJECT[t.slug] ?? t.name_he })),
    ...(teams ?? []).map((t) => ({ kind: "team", key: String(t.id), subject: `a work team: ${t.summary_he.slice(0, 160)}` })),
  ].slice(0, max);

  for (const j of jobs) {
    try {
      const img = await draw(j.subject);
      const path = `covers/${j.kind}-${j.key}.${img.mime.includes("jpeg") ? "jpg" : "png"}`;
      await admin.storage.from("episodes").upload(path, img.bytes, { contentType: img.mime, upsert: true });
      const url = admin.storage.from("episodes").getPublicUrl(path).data.publicUrl;
      if (j.kind === "topic") await admin.from("topics").update({ cover_url: url }).eq("slug", j.key);
      else await admin.from("team_profiles").update({ cover_url: url }).eq("id", Number(j.key));
      done.push(`${j.kind}:${j.key}`);
    } catch (e) {
      failed.push(`${j.kind}:${j.key} ${String(e).slice(0, 160)}`);
      if (String(e).includes("ai_budget_reached")) break;
    }
  }
  // Items without an image inherit their team's or topic's cover.
  await admin.rpc("fill_covers");
  await log("covers", failed.length === 0, { done, failed });
  return json({ done, failed, remaining: (topics?.length ?? 0) + (teams?.length ?? 0) - done.length });
});
