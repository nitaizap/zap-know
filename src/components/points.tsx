import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../lib'
import { IBolt } from './icons'

// Mirrors points_ledger in supabase/patch-006-points.sql. The server is the source of truth;
// these are only for the rules panel and the instant "+N" feedback.
export type EarnKind = 'lesson' | 'course_done' | 'share' | 'comment' | 'post' | 'open' | 'save' | 'react'

const EARN: Record<EarnKind, { pts: number; cap: number | null; label: string }> = {
  lesson: { pts: 5, cap: null, label: 'שיעור' },
  course_done: { pts: 30, cap: null, label: 'קורס שהושלם' },
  share: { pts: 4, cap: 5, label: 'שיתוף' },
  comment: { pts: 3, cap: 5, label: 'תגובה' },
  post: { pts: 20, cap: 3, label: 'פרסום ב"קורה ב-zap"' },
  open: { pts: 1, cap: 10, label: 'פתיחה' },
  save: { pts: 1, cap: 5, label: 'שמירה' },
  react: { pts: 1, cap: 5, label: 'לייק או דיסלייק' },
}

export const RULES: { what: string; pts: number; cap: string | null }[] = [
  { what: 'שיעור שסימנתם', pts: 5, cap: null },
  { what: 'קורס שהשלמתם', pts: 30, cap: null },
  { what: 'פרסום ב"קורה ב-zap"', pts: 20, cap: 'עד 3 ביום' },
  { what: 'שיתוף', pts: 4, cap: 'עד 5 ביום' },
  { what: 'תגובה', pts: 3, cap: 'עד 5 ביום' },
  { what: 'לייק או תגובה של עמיתים על פוסט שלכם', pts: 2, cap: 'עד 20 ביום' },
  { what: 'פתיחת קורס או עדכון', pts: 1, cap: 'עד 10 ביום' },
  { what: 'שמירה', pts: 1, cap: 'עד 5 ביום' },
  { what: 'לייק או דיסלייק', pts: 1, cap: 'עד 5 ביום' },
]

export const LEVELS = [
  { name: 'zapper מתחיל', from: 0 },
  { name: 'zapper סקרן', from: 100 },
  { name: 'zapper פעיל', from: 300 },
  { name: 'zapper מוביל', from: 700 },
  { name: 'zapper על', from: 1500 },
]

export const BADGES: { name: string; how: string; ico: string }[] = [
  { name: 'קורס ראשון', how: 'משלימים קורס אחד עד הסוף', ico: '🎓' },
  { name: '5 קורסים', how: 'משלימים 5 קורסים', ico: '🏅' },
  { name: 'משתפים ידע', how: '5 שיתופים עם עמיתים', ico: '↗' },
  { name: 'קול בשיחה', how: '10 תגובות', ico: '💬' },
  { name: 'קורה אצלי', how: 'מפרסמים פרויקט ב"קורה ב-zap"', ico: '⚑' },
  { name: 'מגיבים ראשונים', how: 'מגיבים ראשונים על 3 קורסים או עדכונים', ico: '⚡' },
]

const LEDGER_LABEL: Record<string, string> = {
  lessons: 'שיעורים', course_done: 'קורס שהושלם', share: 'שיתוף', comment: 'תגובה', post: 'פרסום ב"קורה ב-zap"',
  post_liked: 'לייק על פוסט שלכם', post_commented: 'תגובה על פוסט שלכם', open: 'פתיחת קורס או עדכון', save: 'שמירה', react: 'לייק או דיסלייק',
}

export type MyPoints = {
  all: number
  month: number
  level: { name: string; from: number; next: number | null }
  rank_month: number | null
  recent: { kind: string; pts: number; at: string }[]
  badges: string[] | null
}

export type BoardRow = {
  rank: number; name: string; team: string; points: number; members: number; is_me: boolean
  user_id?: string | null; avatar_url?: string | null; avatar_style?: string | null; avatar_color?: string | null
}

const EVENT = 'zapup:points'

// Client-side caps, so the toast doesn't promise points the server won't give.
function underCap(kind: EarnKind) {
  const cap = EARN[kind].cap
  if (cap === null) return true
  const key = `zapup-earn-${kind}-${new Date().toDateString()}`
  try {
    const n = Number(localStorage.getItem(key) ?? 0)
    if (n >= cap) return false
    localStorage.setItem(key, String(n + 1))
  } catch { /* storage blocked: still show the toast */ }
  return true
}

/** Call right after an action that earns points: shows "+N" and refreshes the header pill. */
export function earn(kind: EarnKind) {
  if (!underCap(kind)) return
  const { pts, label } = EARN[kind]
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { pts, label } }))
}

export function useMyPoints() {
  const [p, setP] = useState<MyPoints | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    let t: ReturnType<typeof setTimeout> | undefined
    const load = () => supabase.rpc('my_points').then(({ data, error }) => {
      if (alive) setP(error || !data ? null : (data as MyPoints))
    })
    load()
    // Re-read shortly after an action, once the server has recorded it.
    const onEarn = () => { clearTimeout(t); t = setTimeout(load, 1200) }
    window.addEventListener(EVENT, onEarn)
    return () => { alive = false; clearTimeout(t); window.removeEventListener(EVENT, onEarn) }
  }, [])
  return p
}

export function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; pts: number; label: string }[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ pts: number; label: string }>).detail
      const id = Date.now() + Math.random()
      setToasts((t) => [...t.slice(-2), { id, ...d }])
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
    }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast"><b>+{t.pts}</b> {t.label}</div>
      ))}
    </div>
  )
}

export function PointsPill() {
  const p = useMyPoints()
  if (!p) return null
  return (
    <NavLink to="/me" className="pts-pill" aria-label={`${p.month} נקודות החודש, ${p.level.name}`}>
      <IBolt size={16} className="pts-bolt" />
      <b>{p.month.toLocaleString('he-IL')}</b>
      <span className="pts-level">{p.level.name}</span>
    </NavLink>
  )
}

function LevelBar({ p }: { p: MyPoints }) {
  const span = p.level.next === null ? 1 : p.level.next - p.level.from
  const pct = p.level.next === null ? 1 : Math.min(1, (p.all - p.level.from) / span)
  return (
    <div>
      <div className="lvl-row">
        <b className="lvl-name">{p.level.name}</b>
        <span className="small muted">
          {p.level.next === null ? 'הגעתם לרמה הכי גבוהה' : `עוד ${(p.level.next - p.all).toLocaleString('he-IL')} נקודות לרמה הבאה`}
        </span>
      </div>
      <div className="bar lvl-bar" title={`${p.all} מתוך ${p.level.next ?? p.all}`}><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
    </div>
  )
}

export type RankGap = { rank: number | null; points: number; gap: number | null; total: number }

export function useRankGap() {
  const [g, setG] = useState<RankGap | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => supabase.rpc('my_rank_gap').then(({ data, error }) => { if (alive && !error && data) setG(data as RankGap) })
    load()
    const on = () => setTimeout(load, 1500)
    window.addEventListener(EVENT, on)
    return () => { alive = false; window.removeEventListener(EVENT, on) }
  }, [])
  return g
}

// "מקום 12 · עוד X נקודות למקום 11": the next step, not the whole table.
export function rankLine(g: RankGap | null) {
  if (!g) return ''
  if (!g.points || !g.rank) return 'עוד לא צברתם החודש. פעולה אחת ואתם בטבלה.'
  if (g.rank === 1) return 'אתם במקום הראשון החודש'
  if (g.gap === null || g.gap <= 0) return `מקום ${g.rank} החודש`
  const pts = g.gap === 1 ? 'נקודה אחת' : `${g.gap.toLocaleString('he-IL')} נקודות`
  return `מקום ${g.rank} · עוד ${pts} למקום ${g.rank - 1}`
}

// Yellow is always points. The ring shows progress to the next level.
export function PointsRing({ p, small }: { p: MyPoints; small?: boolean }) {
  const span = p.level.next === null ? 1 : p.level.next - p.level.from
  const pct = p.level.next === null ? 1 : Math.max(0, Math.min(1, (p.all - p.level.from) / span))
  return (
    <div className={`pts-ring${small ? ' sm' : ''}`} style={{ ['--p' as string]: pct } as React.CSSProperties}
      role="img" aria-label={`${p.all} נקודות, ${Math.round(pct * 100)}% מהדרך לרמה הבאה`}>
      <div><b>{p.month.toLocaleString('he-IL')}</b>{!small && <span>החודש</span>}</div>
    </div>
  )
}

export function RulesPanel() {
  return (
    <details className="card rules">
      <summary><b>איך צוברים נקודות</b></summary>
      <table className="rules-table">
        <tbody>
          {RULES.map((r) => (
            <tr key={r.what}>
              <td>{r.what}</td>
              <td className="num">+{r.pts}</td>
              <td className="small muted">{r.cap ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        הכי הרבה נקודות מקבלים על למידה ועל שיתוף ידע. דיסלייק אף פעם לא מוריד נקודות לאף אחד.
      </p>
      <p className="small" style={{ margin: '8px 0 0' }}>
        <b>מה זה נותן:</b> רמות ותגים, שלושת המובילים של החודש מקבלים תוספת לתקציב הלמידה, והמובילים מקבלים קרדיט בפרק השבועי.
      </p>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        רמות: {LEVELS.map((l) => `${l.name} (${l.from})`).join(' · ')}
      </p>
    </details>
  )
}

export function PointsDashboard() {
  const p = useMyPoints()
  const gap = useRankGap()
  if (!p) return null
  const earned = new Set(p.badges ?? [])
  return (
    <section className="card pts-dash" style={{ marginTop: 16 }}>
      <h2 className="section" style={{ marginTop: 0 }}>הנקודות שלי</h2>
      <div className="pts-head">
        <PointsRing p={p} />
        <div className="grow">
          <LevelBar p={p} />
          <div className="rank-gap">{rankLine(gap)}</div>
        </div>
      </div>
      <div className="tiles" style={{ marginTop: 14 }}>
        <div className="tile"><span className="tile-num">{p.month.toLocaleString('he-IL')}</span><span className="tile-label">נקודות החודש</span></div>
        <div className="tile"><span className="tile-num">{p.all.toLocaleString('he-IL')}</span><span className="tile-label">מאז שהתחלתם</span></div>
        <Link to="/me#leaderboard" className="tile tile-link">
          <span className="tile-num">{p.rank_month ? `#${p.rank_month}` : '–'}</span>
          <span className="tile-label">{p.rank_month ? `מקום ${p.rank_month} החודש` : 'עוד לא בטבלה'}</span>
        </Link>
      </div>

      <h3 className="sub">תגים</h3>
      <div className="badges">
        {BADGES.map((b) => {
          const on = earned.has(b.name)
          return (
            <div key={b.name} className={`bdg${on ? ' on' : ''}`} title={on ? 'הרווחתם' : b.how}>
              <span className="bdg-ico" aria-hidden>{b.ico}</span>
              <b>{b.name}</b>
              <span className="small">{on ? 'הרווחתם' : b.how}</span>
            </div>
          )
        })}
      </div>

      {p.recent.length > 0 && (
        <>
          <h3 className="sub">מה הכניס נקודות לאחרונה</h3>
          <ul className="earn-list">
            {p.recent.map((r, i) => (
              <li key={i}><b className="num">+{r.pts}</b> {LEDGER_LABEL[r.kind] ?? r.kind}
                <span className="small muted"> · {new Date(r.at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div style={{ marginTop: 14 }}><RulesPanel /></div>
    </section>
  )
}

export function LeaderTeaser() {
  const p = useMyPoints()
  const gap = useRankGap()
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  useEffect(() => {
    supabase.rpc('leaderboard', { p_period: 'month', p_scope: 'people', p_limit: 3 })
      .then(({ data, error }) => setRows(error ? null : ((data as BoardRow[]) ?? [])))
  }, [])
  if (!rows) return null
  return (
    <Link to="/me#leaderboard" className="card link teaser">
      <div className="teaser-head">
        <div className="hand">מי מוביל החודש</div>
        {p && <PointsRing p={p} small />}
      </div>
      {rows.length === 0 ? (
        <p className="small" style={{ margin: 0 }}>הטבלה עוד ריקה. המקום הראשון מחכה למי שיתחיל.</p>
      ) : (
        <ol className="teaser-list">
          {rows.map((r) => (
            <li key={r.rank + r.name} className={r.is_me ? 'me' : ''}>
              <span className="medal">{r.rank}</span>
              {r.user_id && <Avatar face={{ ...r, user_id: r.user_id }} size={26} />} {r.name} <span className="small muted">{r.team}</span>
              <b className="num">{r.points.toLocaleString('he-IL')}</b>
            </li>
          ))}
        </ol>
      )}
      <div className="small" style={{ marginTop: 8 }}>
        {gap ? `${rankLine(gap)}. ` : ''}לטבלה המלאה ←
      </div>
    </Link>
  )
}
