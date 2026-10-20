import { Link } from 'react-router-dom'
import { Item, KIND_LABEL, fmtDate } from '../lib'
import { ReactionBar } from './social'

// Light setup line + Black punch line with the hand-drawn navy swoosh.
export function Headline({ light, black, hand }: { light: string; black: string; hand?: string }) {
  return (
    <div className="headline">
      <span className="light">{light}</span>
      <span className="black">
        {black}
        <Swoosh />
      </span>
      {hand && <div className="hand" style={{ marginTop: 6 }}>{hand}</div>}
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

// Metro line accent: enters and leaves at the frame edge, one station ring.
export function MetroLine({ color = '#ff5c9e', color2 = '#ffc600', top = 0 }: { color?: string; color2?: string; top?: number }) {
  return (
    <svg className="metro" style={{ top, insetInlineEnd: 0, width: 280, height: 120 }} viewBox="0 0 280 120" aria-hidden="true">
      <path d="M280 20 H190 Q170 20 156 34 L120 70" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <path d="M120 70 L96 94 Q86 104 70 104 H0" fill="none" stroke={color2} strokeWidth="6" strokeLinecap="round" />
      <circle cx="120" cy="70" r="8" fill="#fff" stroke="#052b7a" strokeWidth="5" />
    </svg>
  )
}

export function AiBadge() {
  return <span className="badge ai">סוכם ב-AI</span>
}

export function DemoBadge() {
  return <span className="badge demo">נתוני דמו</span>
}

export function KindBadge({ kind }: { kind: Item['kind'] }) {
  return <span className={`badge ${kind}`}>{KIND_LABEL[kind]}</span>
}

export function ItemMeta({ item }: { item: Item }) {
  return (
    <div className="meta">
      <KindBadge kind={item.kind} />
      <span>{item.source_name}</span>
      <span>·</span>
      <span>{fmtDate(item.published_at || item.created_at)}</span>
      {item.ai_summarized && <AiBadge />}
      {item.is_demo && <DemoBadge />}
    </div>
  )
}

export function ItemCard({ item, progress, reasons }: { item: Item; progress?: number; reasons?: string[] }) {
  return (
    <div className="card itemcard">
      <Link to={`/item/${item.id}`} className="cardlink">
        {reasons && reasons.length > 0 && (
          <div className="chips" style={{ margin: '0 0 4px' }}>
            {reasons.map((r) => <span key={r} className="badge reason">{r}</span>)}
          </div>
        )}
        <h3>{item.title_he}</h3>
        {item.summary_he && <p className="muted small">{clip(item.summary_he, 140)}</p>}
        {progress !== undefined && (
          <div style={{ marginTop: 10 }}>
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="small muted" style={{ marginTop: 4 }}>{Math.round(progress * 100)}% מהשיעורים</div>
          </div>
        )}
        <ItemMeta item={item} />
      </Link>
      <ReactionBar item={item} />
    </div>
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
