// What a card shows, decided once and shared by the feed and scripts/preview-audit.mjs.
// No imports, so node can run this file directly (type stripping) to audit real data.

export type PreviewInput = {
  kind: string
  source_url: string | null
  thumbnail_url?: string | null
  preview_video_id?: string | null
  doc_id?: number | null
}
export type Preview = {
  type: 'video' | 'source image' | 'page capture' | 'podcast art' | 'doc poster' | 'text'
  still?: string        // the image to show (already proxied and sized)
  vid?: string          // a YouTube video id to loop
  list?: string         // a YouTube playlist to loop when there's no single video id
}

export const YT_RE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/
const YT_THUMB = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//
const YT_LIST = /youtube\.com\/(?:playlist|watch|embed\/videoseries)\?(?:[^#]*&)?list=([\w-]+)/

export function ytId(i: PreviewInput): string | null {
  return i.preview_video_id || i.source_url?.match(YT_RE)?.[1] || i.thumbnail_url?.match(YT_THUMB)?.[1] || null
}

// Every external still goes through images.weserv.nl: https always (no mixed content), no
// hotlink blocks, resized for the card, WebP, cached at the edge. `we` = never enlarge, so a
// tiny image still reports its real size.
export function proxied(url: string, w = 1080): string {
  if (!url) return url
  const u = url.replace(/^http:\/\//i, 'https://')
  if (/^https:\/\/(i\.ytimg\.com|images\.weserv\.nl)\//.test(u)) return u
  return `https://images.weserv.nl/?url=${encodeURIComponent(u)}&w=${w}&output=webp&we&il`
}

// A real capture of the page at desktop width, tall enough to scroll through.
export const pageShot = (url: string, w = 1080) =>
  proxied(`https://image.thum.io/get/width/${w}/crop/2200/viewportWidth/1280/noanimate/${url}`, w)

export function choosePreview(i: PreviewInput): Preview {
  const thumb = (i.thumbnail_url ?? '').trim()
  const vid = ytId(i)
  if (i.doc_id || (i.kind === 'internal' && !thumb && !vid)) return { type: 'doc poster' }
  if (i.kind === 'podcast') return thumb ? { type: 'podcast art', still: proxied(thumb, 900) } : { type: 'text' }
  if (vid) return { type: 'video', vid, still: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` }
  const list = i.source_url?.match(YT_LIST)?.[1]
  if (list) return { type: 'video', list, still: thumb ? proxied(thumb) : undefined }
  if (thumb) return { type: 'source image', still: proxied(thumb) }
  if (i.source_url && /^https?:\/\//.test(i.source_url) && !/zap-know/.test(i.source_url)) return { type: 'page capture', still: pageShot(i.source_url) }
  return { type: 'text' }
}
