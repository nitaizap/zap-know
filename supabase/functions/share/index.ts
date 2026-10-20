// Share an item: to a colleague (lands in their feed + a Teams/Outlook ping), to the Teams
// channel, or as a plain link. Every share counts toward the ranking.
import { admin, cors, json, log, mail, notify, zapUser } from "../_shared/core.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://nitaizap.github.io/zap-know/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await zapUser(req);
  if (!user) return json({ error: "login required" }, 401);
  const b = await req.json() as { item_id: number; channel: "colleague" | "teams" | "link"; to_user?: string; note?: string };
  if (!["colleague", "teams", "link"].includes(b.channel)) return json({ error: "bad channel" }, 400);
  if (b.channel === "colleague" && !b.to_user) return json({ error: "pick a colleague" }, 400);

  const [{ data: item }, { data: me }, { data: to }] = await Promise.all([
    admin.from("items").select("id,title_he,why_he,source_name,status").eq("id", b.item_id).single(),
    admin.from("profiles").select("email,display_name").eq("user_id", user.id).single(),
    b.to_user ? admin.from("profiles").select("email,display_name").eq("user_id", b.to_user).single() : Promise.resolve({ data: null }),
  ]);
  if (!item || item.status !== "approved") return json({ error: "not found" }, 404);

  await admin.from("shares").insert({
    item_id: item.id, from_user: user.id, to_user: b.to_user ?? null, channel: b.channel, note: b.note?.slice(0, 300) ?? null,
  });
  const { count } = await admin.from("shares").select("id", { count: "exact", head: true }).eq("item_id", item.id);
  await admin.from("items").update({ shares_count: count ?? 0 }).eq("id", item.id);

  const link = `${SITE}#/item/${item.id}`;
  if (b.channel !== "link") {
    const from = me?.display_name ?? me?.email ?? "מישהו מ-zap";
    const lines = [`המלצה מ-${from}: "${item.title_he}"`, ...(item.why_he ? [item.why_he] : []), ...(b.note ? [`בהערה: ${b.note}`] : [])];
    const channelBox = Deno.env.get("CHANNEL_EMAIL") ?? me?.email ?? "";
    await notify({
      kind: "share",
      to: b.channel === "colleague" ? to!.email : channelBox,
      subject: `המלצה מ-${from} ב-zap UP: ${item.title_he}`,
      html: mail("שיתפו איתכם משהו", lines, [{ label: "לפתוח ב-zap UP", url: link }]),
      teams_text: `${lines.join("\n")}
${link}`,
      teams_to: b.channel === "colleague" ? to!.email : "channel",
    });
  }
  await log("share", true, { item: item.id, channel: b.channel });
  return json({ ok: true, link });
});
