// Preview audit: what does each kind of zap UP card actually show, and does it load?
//
// The items table is behind RLS (signed-in @d.co.il only), so this rebuilds a realistic sample
// the same way the collector does: it reads our real sources (supabase/seed.sql + patch-018),
// pulls a couple of entries from each, derives the fields `collect` + `thumbs` would store, then
// runs the card's preview chain twice: BEFORE (round 4 logic) and AFTER (the fixed chain), and
// actually fetches every chosen URL (status, content type, bytes, pixel size).
//
//   node scripts/preview-audit.mjs            # table + counts
//   node scripts/preview-audit.mjs --json     # raw rows
import fs from 'node:fs'

const UA = { 'User-Agent': 'Mozilla/5.0 (zap UP preview audit)' }
const sql = ['supabase/seed.sql', 'supabase/patch-018-hebrew.sql'].map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const SOURCES = [...sql.matchAll(/\('([^']+)',\s*'(youtube_playlist|youtube_channel|rss|podcast|skillshop)',\s*'([^']+)'/g)]
  .map((m) => ({ name: m[1], kind: m[2], ref: m[3] }))

const text = async (url) => { const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${r.status}`); return r.text() }
const tag = (b, t) => b.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`, 'i'))?.[1]?.trim() ?? null
const attr = (b, t, a) => b.match(new RegExp(`<${t}[^>]*\\s${a}=["']([^"']+)["']`, 'i'))?.[1] ?? null

async function ogImage(url) {
  try {
    const html = (await text(url)).slice(0, 300000)
    return html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i)?.[1] ?? null
  } catch { return null }
}
async function firstPlaylistVideo(list) {
  try { return (await text(`https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`)).match(/<yt:videoId>([\w-]{11})</)?.[1] ?? null } catch { return null }
}

// The rows collect + thumbs would produce, a few per source.
async function sample(s) {
  try {
    if (s.kind === 'youtube_playlist') {
      const url = `https://www.youtube.com/playlist?list=${s.ref}`
      const vid = await firstPlaylistVideo(s.ref)
      return [{ src: s.name, kind: 'course', source_url: url, preview_video_id: vid, thumbnail_url: vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '' }]
    }
    if (s.kind === 'youtube_channel') {
      const x = await text(`https://www.youtube.com/feeds/videos.xml?channel_id=${s.ref}`)
      return [...x.matchAll(/<yt:videoId>([\w-]{11})</g)].slice(0, 2).map((m) => ({ src: s.name, kind: 'news', source_url: `https://www.youtube.com/watch?v=${m[1]}`, preview_video_id: m[1], thumbnail_url: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` }))
    }
    if (s.kind === 'rss') {
      const x = await text(s.ref)
      const blocks = (x.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/g) ?? []).slice(0, 2)
      return Promise.all(blocks.map(async (b) => {
        const link = tag(b, 'link') || attr(b, 'link', 'href')
        return { src: s.name, kind: 'news', source_url: link, preview_video_id: null, thumbnail_url: (link && await ogImage(link)) ?? '' }
      }))
    }
    if (s.kind === 'podcast') {
      const x = await text(s.ref)
      const show = attr(x, 'itunes:image', 'href')
      const blocks = (x.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []).slice(0, 2)
      return blocks.map((b) => {
        const link = tag(b, 'link'); const enc = attr(b, 'enclosure', 'url')
        return { src: s.name, kind: 'podcast', source_url: link?.startsWith('http') ? link : enc, audio_url: enc, preview_video_id: null, thumbnail_url: attr(b, 'itunes:image', 'href') ?? show ?? '' }
      })
    }
    if (s.kind === 'skillshop') {
      const d = await (await fetch(`https://skillshop.docebosaas.com/learn/v1/catalog/${s.ref}?page_size=40`, { headers: UA })).json()
      return (d.data?.items ?? []).filter((i) => i.item_language_code === 'en').slice(0, 2).map((i) => ({
        src: s.name, kind: 'course', source_url: `https://skillshop.docebosaas.com/learn/course/${i.item_id}/${i.item_slug ?? ''}`, preview_video_id: null, thumbnail_url: i.item_thumbnail ?? '' }))
    }
  } catch (e) { return [{ src: s.name, kind: s.kind, source_url: null, error: String(e) }] }
  return []
}

// --- the card's chain -------------------------------------------------------------------------
const YT_RE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/
const pageShotBefore = (u) => `https://image.thum.io/get/width/1400/crop/2400/viewportWidth/1280/noanimate/${u}`
const ytIdBefore = (i) => i.preview_video_id || i.source_url?.match(YT_RE)?.[1] || i.thumbnail_url?.match(/i\.ytimg\.com\/vi\/([\w-]{11})\//)?.[1] || null
function before(i) {
  if (i.kind === 'podcast') return i.thumbnail_url ? ['podcast art', i.thumbnail_url] : ['text', null]
  const vid = ytIdBefore(i)
  if (vid) return ['video', `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`]
  if (i.thumbnail_url) return ['source image', i.thumbnail_url]
  if (i.source_url?.startsWith('http')) return ['page capture', pageShotBefore(i.source_url)]
  return ['text', null]
}
// The fixed chain: the very file the app uses.
const { choosePreview } = await import('../src/preview.ts')

// Fetch a candidate and read its pixel size from the header bytes (PNG, JPEG, WebP, GIF).
function dims(buf) {
  const b = Buffer.from(buf)
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  if (b[0] === 0x47 && b[1] === 0x49) return [b.readUInt16LE(6), b.readUInt16LE(8)]
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') {
    const t = b.slice(12, 16).toString()
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
    if (t === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)] }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o < b.length) {
      if (b[o] !== 0xff) { o++; continue }
      const m = b[o + 1]; const len = b.readUInt16BE(o + 2)
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)]
      o += 2 + len
    }
  }
  return null
}
async function probe(url) {
  if (!url) return { ok: false, why: 'none' }
  if (url.startsWith('http://')) return { ok: false, why: 'http (mixed content)' }
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    const ct = r.headers.get('content-type') ?? ''
    const buf = await r.arrayBuffer()
    const d = dims(buf)
    if (!r.ok) return { ok: false, why: `HTTP ${r.status}` }
    if (!ct.startsWith('image/')) return { ok: false, why: `type ${ct.split(';')[0] || '?'}` }
    if (!d) return { ok: false, why: 'unreadable' }
    if (d[0] < 200 || d[1] < 200) return { ok: false, why: `tiny ${d[0]}x${d[1]}` }
    return { ok: true, why: `${d[0]}x${d[1]} ${Math.round(buf.byteLength / 1024)}KB` }
  } catch (e) { return { ok: false, why: String(e.name ?? e).slice(0, 30) } }
}

const rows = (await Promise.all(SOURCES.map(sample))).flat().filter((r) => r.source_url)
const out = []
for (const i of rows) {
  const [bt, bu] = before(i)
  const a = choosePreview(i)
  const [pb, pa] = await Promise.all([probe(bu), a.still ? probe(a.still) : Promise.resolve({ ok: a.type !== 'text', why: a.type === 'video' && a.list ? 'playlist embed' : 'n/a' })])
  out.push({ src: i.src.slice(0, 34), kind: i.kind, before: bt, beforeOk: pb.ok, beforeWhy: pb.why, after: a.type, afterOk: pa.ok, afterWhy: pa.why })
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }
console.table(out)
const count = (k, okk) => out.reduce((m, r) => { const key = `${r[k]}${r[okk] ? '' : ' (broken)'}`; m[key] = (m[key] ?? 0) + 1; return m }, {})
console.log('BEFORE', count('before', 'beforeOk'))
console.log('AFTER ', count('after', 'afterOk'))
console.log(`working previews: before ${out.filter((r) => r.beforeOk && r.before !== 'text').length}/${out.length}, after ${out.filter((r) => r.afterOk && r.after !== 'text').length}/${out.length}`)
