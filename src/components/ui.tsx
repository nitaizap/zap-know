import { Link } from 'react-router-dom'
import { Item, KIND_LABEL, fmtDate } from '../lib'
import { ReactionBar } from './social'
import { IBook, IHeadphones, INews, ISpark } from './icons'

// Page hero: Light setup line + Black punch line with the hand-drawn navy swoosh.
// The rounded-square texture lives only here, fading out before the content starts.
export function Headline({ light, black, hand, children }: { light: string; black: string; hand?: string; children?: React.ReactNode }) {
  return (
    <div className="hero">
      <div className="hero-texture" aria-hidden="true" />
      <div className="headline">
        <span className="light">{light}</span>
        <span className="black">
          {black}
          <Swoosh />
        </span>
        {hand && <div className="hand">{hand}</div>}
      </div>
      {children}
    </div>
  )
}

export function Swoosh() {
  // Filled tapered brush stroke, thick in the middle, thin at both ends.
  return (
    <svg className="swoosh" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 10 C 50 4, 120 2, 198 5 C 130 6, 60 9, 4 12 Z" fill="#052b7a" />
    </svg>
  )
}

// Metro line accent: enters and leaves at the frame edge, one station ring. Hero only.
export function MetroLine({ color = '#ff5c9e', color2 = '#ffc600', top = 0 }: { color?: string; color2?: string; top?: number }) {
  return (
    <svg className="metro" style={{ top }} viewBox="0 0 280 120" aria-hidden="true">
      <path d="M280 20 H190 Q170 20 156 34 L120 70" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <path d="M120 70 L96 94 Q86 104 70 104 H0" fill="none" stroke={color2} strokeWidth="6" strokeLinecap="round" />
      <circle cx="120" cy="70" r="8" fill="#fff" stroke="#052b7a" strokeWidth="5" />
    </svg>
  )
}

// A quiet line for the item page, not a badge on every card.
export function AiBadge() {
  return <span className="ai-note"><ISpark size={14} />סוכם ב-AI מתוך מידע פומבי</span>
}

// Honest but quiet: a small corner marker with an explanation on hover/focus.
export function DemoBadge() {
  return <span className="demo-mark" tabIndex={0} title="נתוני דמו להאקתון">דמו</span>
}

export function KindBadge({ kind }: { kind: Item['kind'] }) {
  return <span className={`kind kind-${kind}`}>{KIND_LABEL[kind]}</span>
}

export function ItemMeta({ item }: { item: Item }) {
  return (
    <div className="meta">
      <KindBadge kind={item.kind} />
      <span className="meta-src">{item.source_name}</span>
      <span className="meta-dot" aria-hidden="true">·</span>
      <span>{fmtDate(item.published_at || item.created_at)}</span>
      {item.ai_summarized && <AiBadge />}
      {item.is_demo && <DemoBadge />}
    </div>
  )
}

export function ItemCard({ item, progress, reasons }: { item: Item; progress?: number; reasons?: string[] }) {
  return (
    <article className="card itemcard">
      {item.is_demo && <DemoBadge />}
      <Link to={`/item/${item.id}`} className="cardlink">
        <Thumb item={item} />
        <div className="card-top">
          <KindBadge kind={item.kind} />
          {reasons?.map((r) => <span key={r} className="reason">{r}</span>)}
        </div>
        <h3>{item.title_he}</h3>
        {item.summary_he && <p className="summary">{item.summary_he}</p>}
        {progress !== undefined && (
          <div className="card-progress">
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <span>{Math.round(progress * 100)}% מהשיעורים</span>
          </div>
        )}
        <div className="card-src">
          <span className="meta-src">{item.source_name}</span>
          <span className="meta-dot" aria-hidden="true">·</span>
          <span>{fmtDate(item.published_at || item.created_at)}</span>
        </div>
      </Link>
      <ReactionBar item={item} />
    </article>
  )
}

// Topic → brand color, for fallback tiles when an item has no image.
const TOPIC_TONE: Record<string, string> = {
  'digital-marketing': 'navy', ppc: 'yellow', social: 'pink', 'geo-ecommerce': 'green', 'data-ai': 'purple',
  'behavioral-econ': 'red', decisions: 'purple', cx: 'pink',
}
const toneOf = (item: Item) => TOPIC_TONE[item.topic_slug ?? ''] ?? (item.kind === 'internal' ? 'yellow' : 'navy')

// 16:9 card image: the item's thumbnail, or a brand-colored tile with the kind icon.
export function Thumb({ item }: { item: Item }) {
  if (item.thumbnail_url) {
    return (
      <div className="thumb">
        <img src={item.thumbnail_url} alt="" loading="lazy" decoding="async"
          onError={(e) => { (e.currentTarget.parentElement as HTMLElement).classList.add('thumb-fail') }} />
        <ThumbFallback item={item} />
      </div>
    )
  }
  return <div className="thumb thumb-fail"><ThumbFallback item={item} /></div>
}

function ThumbFallback({ item }: { item: Item }) {
  const Icon = item.kind === 'news' ? INews : IBook
  return (
    <div className={`thumb-tile tone-${toneOf(item)}`} aria-hidden="true">
      <Icon size={34} />
    </div>
  )
}

// Item page media: an embedded YouTube player when there is one, else a large hero image.
export function MediaHero({ item }: { item: Item }) {
  if (item.preview_video_id) {
    return (
      <div className="media-hero video">
        <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.preview_video_id)}`}
          title={item.title_orig ?? item.title_he} loading="lazy" allowFullScreen
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    )
  }
  if (item.thumbnail_url) {
    return <div className="media-hero"><img src={item.thumbnail_url} alt="" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} /></div>
  }
  return null
}

// The personal weekly episode, as the home page's lead card.
export function EpisodeCard({ items, loading, audioUrl, sent }: { items: Item[]; loading: boolean; audioUrl?: string | null; sent: boolean }) {
  return (
    <section className="episode">
      <div className="episode-head">
        <span className="hand">הפרק השבועי שלכם</span>
        <h2>3 דברים ששווה להכיר השבוע</h2>
      </div>
      {loading ? <p className="episode-empty">אוספים בשבילכם</p> : items.length === 0 ? (
        <p className="episode-empty">עוד אין תוכן מאושר בנושאים שבחרתם. הוא מגיע עם האיסוף הבא.</p>
      ) : (
        <ol className="episode-list">
          {items.map((i, n) => (
            <li key={i.id}>
              <span className="episode-n">{n + 1}</span>
              <Link to={`/item/${i.id}`}>
                <b>{i.title_he}</b>
                {i.why_he && <span>{i.why_he}</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {audioUrl && (
        <div className="episode-audio"><IHeadphones size={18} /><audio controls src={audioUrl} /></div>
      )}
      <p className="episode-foot">{sent ? 'הפרק הזה נשלח גם ב-Teams ובמייל.' : 'כל שבוע מגיע פרק חדש ב-Teams ובמייל, לפי הנושאים שבחרתם.'}</p>
    </section>
  )
}

export function Skeletons({ n = 3 }: { n?: number }) {
  return (
    <div className="grid three">
      {Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty card">{children}</div>
}

export function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' ←' : s
}
