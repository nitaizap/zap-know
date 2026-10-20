import { Link } from 'react-router-dom'
import { Item, KIND_LABEL, fmtDate, fmtMinutes } from '../lib'
import { ReactionBar } from './social'
import '../adopt.css'
import { DetailLink } from './detail'
import { TypeBadge } from './TypeBadge'
import { IHeadphones, ISpark } from './icons'

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
      <DetailLink kind="item" id={item.id} className="cardlink">
        <Thumb item={item} />
        {item.kind === 'podcast' && <span className="pod-badge" aria-label="פודקאסט"><IHeadphones size={16} /></span>}
        <div className="card-top">
          <TypeBadge item={item} />
          {reasons?.map((r) => <span key={r} className="reason">{r}</span>)}
        </div>
        <h3>{item.title_he}</h3>
        {item.summary_he && <p className="summary">{item.summary_he}</p>}
        {progress !== undefined && (
          <div className="card-progress">
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <span>{Math.round(progress * 100)}% הושלם · להמשיך</span>
          </div>
        )}
        <div className="card-src">
          <span className="meta-src">{item.source_name}</span>
          <span className="meta-dot" aria-hidden="true">·</span>
          <span>{fmtDate(item.published_at || item.created_at)}</span>
          {item.minutes ? <span className="card-len">{fmtMinutes(item.minutes)}</span> : null}
        </div>
      </DetailLink>
      <ReactionBar item={item} compact />
    </article>
  )
}

// 16:9 card image: the real source image, or a preview of the item's own text.
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

// No source image: a "document preview" made from the item's own words (title + first lines),
// like a screenshot of the page itself. Never generated or decorative art.
export function previewLines(text: string | null | undefined, n = 3): string[] {
  return (text ?? '').split(/\n+|(?<=[.!?])\s+/)
    .map((l) => l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^#+\s*|^[-*>\d.)\s]+|\*\*|__|`/g, '').trim())
    .filter((l) => l.length > 3).slice(0, n)
}

// Looks like a screenshot of the document itself: a page with its header, the title and the
// first lines, the key ones highlighted as if someone marked them.
export function DocPreview({ title, lines, by, big, badge }: {
  title: string; lines: string[]; by?: string | null; big?: boolean; badge?: { color: string; initials: string } | null
}) {
  return (
    <div className={`docpv${big ? ' big' : ''}`} aria-hidden="true">
      <div className="docpv-page">
        {(by || badge) && (
          <span className="docpv-head">
            {badge && <span className="docpv-badge" style={{ background: badge.color }}>{badge.initials}</span>}
            {by && <span className="docpv-by">{by}</span>}
            {big && <span className="docpv-dots"><i /><i /><i /></span>}
          </span>
        )}
        <b className="docpv-title">{title}</b>
        <ul>{lines.map((l, i) => <li key={i}>{big && i < 2 ? <mark>{l}</mark> : l}</li>)}</ul>
      </div>
    </div>
  )
}

function ThumbFallback({ item }: { item: Item }) {
  return <DocPreview title={item.title_he} lines={previewLines(item.summary_he, 2)} by={item.source_name} />
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

// "ביס קטן": one compact horizontal row of ≤10-minute items.
export function BitesRow({ items, extra }: { items: Item[]; extra?: React.ReactNode }) {
  if (!items.length && !extra) return null
  return (
    <section className="bites">
      <div className="bites-head">
        <h2 className="section">ביס קטן <small>עד 10 דקות</small></h2>
        {extra}
      </div>
      <div className="bites-row">
        {items.map((i) => (
          <DetailLink key={i.id} kind="item" id={i.id} className="bite">
            <span className="bite-len">{fmtMinutes(i.minutes)}</span>
            <b>{i.title_he}</b>
          </DetailLink>
        ))}
      </div>
    </section>
  )
}

// The personal weekly episode, as the home page's lead card.
export function EpisodeCard({ items, loading, audioUrl, sent }: { items: Item[]; loading: boolean; audioUrl?: string | null; sent: boolean }) {
  return (
    <section className="episode">
      <div className="episode-head">
        <span className="hand">הפרק השבועי שלכם</span>
        <h2>מה שווה להכיר השבוע</h2>
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
      <p className="episode-foot">{sent ? 'הפרק הזה נשלח גם במייל.' : 'כל יום ראשון מגיע פרק חדש במייל, לפי הנושאים שבחרתם.'}</p>
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
