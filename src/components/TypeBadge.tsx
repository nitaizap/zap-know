import { Item, fmtMinutes } from '../lib'

// One clear answer to "what is this?" on every card, list row, panel and AI result:
// an icon, a Hebrew label and a colour per type, with the length when there is one.

export type ResType = 'course' | 'article' | 'podcast' | 'video' | 'news' | 'doc' | 'bite'
type Typed = Pick<Item, 'kind'> & Partial<Pick<Item, 'doc_id' | 'preview_video_id' | 'minutes' | 'source_url'>>

export function typeOf(i: Typed, bite?: boolean): ResType {
  if (i.doc_id) return 'doc'
  if (i.kind === 'podcast') return 'podcast'
  if (bite) return 'bite'
  if (i.preview_video_id || /youtube\.com|youtu\.be/.test(i.source_url ?? '')) return 'video'
  if (i.kind === 'course') return 'course'
  if (i.kind === 'news' && (i.minutes ?? 0) >= 6) return 'article'
  return 'news'
}

const P = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const ICON: Record<ResType, React.ReactNode> = {
  course: <svg {...P}><path d="M2 9l10-5 10 5-10 5L2 9z" /><path d="M6 11v5c3 2.5 9 2.5 12 0v-5" /></svg>,
  article: <svg {...P}><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7M9 7h3" /></svg>,
  podcast: <svg {...P}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
  video: <svg {...P}><path d="M8 5v14l11-7z" fill="currentColor" /></svg>,
  news: <svg {...P}><path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2" /><path d="M8 9h5M8 13h5" /></svg>,
  doc: <svg {...P}><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>,
  bite: <svg {...P}><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" /></svg>,
}
export const TYPE_LABEL: Record<ResType, string> = {
  course: 'קורס', article: 'מאמר', podcast: 'פודקאסט', video: 'סרטון', news: 'חדשות', doc: 'מסמך צוות', bite: 'בקצרה',
}

export function TypeBadge({ item, bite, className }: { item: Typed; bite?: boolean; className?: string }) {
  const t = typeOf(item, bite)
  const len = item.minutes ? fmtMinutes(item.minutes) : ''
  return (
    <span className={`tbadge t-${t}${className ? ` ${className}` : ''}`}>
      {ICON[t]}<b>{TYPE_LABEL[t]}</b>{len && <span>· {len}</span>}
    </span>
  )
}
