// "ליצור אווטאר": a photo in, a Mii-style character sheet and a square profile avatar out.
// The photo goes to Gemini (gemini-2.5-flash-image, "nano banana") only for this and is never
// stored; the two results go to the public `avatars` bucket. Three tries per person per day,
// counted here, and every call passes the global AI cap in core.ts.
import { admin, cors, json, log, setting, zapUser } from "../_shared/core.ts";

const SHEET_PROMPT = `Transform the provided photo into a charming, expressive 3D cartoon avatar inspired by the classic Nintendo Wii Mii aesthetic, with modern, high-quality animation-style rendering. Preserve the person's recognizable identity and distinctive features, translating them into stylized, rounded, toy-like 3D geometry with an oversized head, compact body, expressive eyes, and sculpted hair. Dress the character in modern, casual everyday clothing suited to the individual. Create a clean white character reference sheet showing full-body front, three-quarter, left profile, right profile, and back views, plus head close-ups and happy, surprised, confused, laughing, and neutral expressions. Maintain identical facial features, proportions, hairstyle, outfit, and colors across all views. Use a neutral A-pose, consistent camera angles, soft studio lighting, and subtle shadows. No text, props, watermarks, or cropped limbs. Prioritize visual consistency and recognizable identity for reusable digital avatars and future AI-assisted animation. Reference sheet only, not an actual 3D model or rig.`;

const AVATAR_PROMPT = "Crop-style render: a square head-and-shoulders portrait of this exact character, front view, neutral happy expression, plain white background, same style";

const TRIES_PER_DAY = 3;

type Img = { mime: string; data: string };

// One image call. The smallest output the model offers: no size option on 2.5 Flash Image,
// so only the aspect ratio is set (16:9 for the sheet, 1:1 for the avatar).
async function generate(model: string, prompt: string, image: Img, aspectRatio: string): Promise<Img> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: image.mime, data: image.data } }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
    }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`gemini ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
  // deno-lint-ignore no-explicit-any
  const parts = (body?.candidates?.[0]?.content?.parts ?? []) as any[];
  const p = parts.find((x) => x.inlineData?.data || x.inline_data?.data);
  const d = p?.inlineData ?? p?.inline_data;
  if (!d?.data) throw new Error("no image in response");
  return { mime: d.mimeType ?? d.mime_type ?? "image/png", data: d.data };
}

function bytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function store(userId: string, name: string, img: Img) {
  const path = `${userId}/${name}.png`;
  const { error } = await admin.storage.from("avatars").upload(path, bytes(img.data), { upsert: true, contentType: img.mime });
  if (error) throw error;
  return `${admin.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("avatar_tries").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("at", since);
  const used = count ?? 0;
  const b = await req.json().catch(() => ({})) as { image?: string; mime?: string; check?: boolean };
  if (b.check) return json({ left: Math.max(0, TRIES_PER_DAY - used) });
  if (used >= TRIES_PER_DAY) return json({ error: "limit", left: 0 }, 429);
  if (!b.image || !/^image\/(jpeg|png|webp)$/.test(b.mime ?? "")) return json({ error: "missing image" }, 400);
  if (b.image.length > 2_500_000) return json({ error: "too big" }, 413);

  // The try counts as soon as it starts, so a failure can't be retried for free forever.
  await admin.from("avatar_tries").insert({ user_id: user.id });
  const left = Math.max(0, TRIES_PER_DAY - used - 1);
  try {
    const model = await setting("image_model", "gemini-2.5-flash-image");
    const sheet = await generate(model, SHEET_PROMPT, { mime: b.mime!, data: b.image }, "16:9");
    const avatar = await generate(model, AVATAR_PROMPT, sheet, "1:1");
    const [sheet_url, avatar_url] = await Promise.all([store(user.id, "sheet", sheet), store(user.id, "avatar", avatar)]);
    await log("avatar", true, { user: user.id });
    return json({ avatar_url, sheet_url, left });
  } catch (e) {
    const msg = String(e);
    await log("avatar", false, { user: user.id, error: msg.slice(0, 300) });
    return json({ error: msg.includes("ai_budget_reached") ? "budget" : "failed", left }, msg.includes("ai_budget_reached") ? 503 : 502);
  }
});
