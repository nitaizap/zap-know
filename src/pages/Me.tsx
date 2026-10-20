import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App'
import { KIND_LABEL, Item, supabase } from '../lib'
import { Empty, Headline, Skeletons, clip } from '../components/ui'
import { PrefsPanel } from '../components/prefs'
import { PointsDashboard } from '../components/points'

type Action = 'open' | 'like' | 'dislike' | 'save' | 'comment' | 'shared_by_me' | 'shared_with_me' | 'progress' | 'purchase'
type Row = {
  item_id: number; action: Action; at: string; detail: string | null
  title_he: string; title_orig: string | null; kind: Item['kind']; topic_slug: string | null
  source_name: string; source_url: string
}
type Stats = { opened: number; saved: number; liked: number; comments: number; shared: number; in_progress: number; completed: number }

const ACTION: Record<Action, { ico: string; label: string }> = {
  open: { ico: '👁', label: 'פתחתם' },
  like: { ico: '👍', label: 'אהבתם' },
  dislike: { ico: '👎', label: 'לא אהבתם' },
  save: { ico: '🔖', label: 'שמרתם' },
  comment: { ico: '💬', label: 'הגבתם' },
  shared_by_me: { ico: '↗', label: 'שיתפתם' },
  shared_with_me: { ico: '↙', label: 'שיתפו איתכם' },
  progress: { ico: '▶', label: 'התקדמתם' },
  purchase: { ico: '₪', label: 'קניתם מהתקציב' },
}

const FILTERS: { key: Action | null; label: string }[] = [
  { key: null, label: 'הכל' },
  { key: 'open', label: 'נפתח' },
  { key: 'save', label: 'נשמר' },
  { key: 'like', label: 'לייק' },
  { key: 'comment', label: 'תגובות' },
  { key: 'shared_with_me', label: 'שיתפו איתי' },
  { key: 'shared_by_me', label: 'שיתפתי' },
  { key: 'progress', label: 'התקדמות' },
  { key: 'purchase', label: 'קניות' },
]

const TILES: { key: keyof Stats; label: string }[] = [
  { key: 'opened', label: 'נפתחו' },
  { key: 'saved', label: 'נשמרו' },
  { key: 'liked', label: 'לייקים' },
  { key: 'comments', label: 'תגובות' },
  { key: 'shared', label: 'שיתופים' },
  { key: 'in_progress', label: 'בתהליך' },
  { key: 'completed', label: 'הושלמו' },
]

const dayKey = (s: string) => new Date(s).toDateString()

function dayLabel(s: string) {
  const d = new Date(s)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - that.getTime()) / 864e5)
  if (diff === 0) return 'היום'
  if (diff === 1) return 'אתמול'
  if (diff < 7) return 'השבוע'
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

const progressPct = (detail: string | null) => {
  const [a, b] = (detail ?? '0/0').split('/').map(Number)
  return b > 0 ? Math.min(1, a / b) : 0
}

export default function Me() {
  const { profile, topics, setProfile } = useApp()
  const [stats, setStats] = useState<Stats | null>(null)
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined)
  const [progress, setProgress] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Action | null>(null)

  useEffect(() => {
    supabase.rpc('my_stats').then(({ data, error }) => setStats(error ? null : (data as Stats)))
    supabase.rpc('my_history', { p_q: '', p_type: 'progress', p_limit: 20 }).then(({ data, error }) => {
      if (!error) setProgress(((data as Row[]) ?? []).filter((r) => progressPct(r.detail) < 1))
    })
  }, [])

  // Debounced search over my own history.
  useEffect(() => {
    const t = setTimeout(() => {
      supabase.rpc('my_history', { p_q: q.trim(), p_type: filter, p_limit: 80 })
        .then(({ data, error }) => setRows(error ? null : ((data as Row[]) ?? [])))
    }, 300)
    return () => clearTimeout(t)
  }, [q, filter])

  // One row per item per day, with every action done on it that day.
  const groups = useMemo(() => {
    const out: { label: string; rows: { key: string; first: Row; actions: Row[] }[] }[] = []
    const seen = new Map<string, { key: string; first: Row; actions: Row[] }>()
    for (const r of rows ?? []) {
      const key = `${dayKey(r.at)}|${r.item_id}`
      const hit = seen.get(key)
      if (hit) { hit.actions.push(r); continue }
      const entry = { key, first: r, actions: [r] }
      seen.set(key, entry)
      const label = dayLabel(r.at)
      const last = out[out.length - 1]
      if (last && last.label === label) last.rows.push(entry)
      else out.push({ label, rows: [entry] })
    }
    return out
  }, [rows])

  const topicName = (slug: string | null) => topics.find((t) => t.slug === slug)?.name_he

  return (
    <div>
      <Headline light="כל מה שראיתם, שמרתם ולמדתם," black="האזור שלי" hand="הכל נשמר" />

      <div className="chips" style={{ marginTop: 4 }}>
        <Link to="/leaderboard" className="chip">🏆 הטבלה</Link>
        <Link to="/internal" className="chip">קורה ב-zap</Link>
        <Link to="/teams" className="chip">איך עובדים פה</Link>
        <Link to="/library" className="chip">המאגר</Link>
        <Link to="/budget" className="chip">התקציב שלי</Link>
        {profile.is_admin && <Link to="/admin" className="chip">אישורים</Link>}
      </div>

      <PointsDashboard />

      {stats && (
        <div className="tiles" style={{ marginTop: 16 }}>
          {TILES.map((t) => (
            <div key={t.key} className="tile">
              <span className="tile-num">{stats[t.key]}</span>
              <span className="tile-label">{t.label}</span>
            </div>
          ))}
        </div>
      )}

      {progress.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className="section" style={{ marginTop: 0 }}>ממשיכים ללמוד</h2>
          <div className="lane">
            {progress.map((r) => (
              <Link key={r.item_id} to={`/item/${r.item_id}`} className="card link">
                <b>{r.title_he}</b>
                <div className="bar" style={{ margin: '10px 0 4px' }}><i style={{ width: `${Math.round(progressPct(r.detail) * 100)}%` }} /></div>
                <span className="small muted">{(r.detail ?? '').replace('/', ' מתוך ')} שיעורים</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <label className="field">
          <span>מה ראיתם?</span>
          <input className="input input-lg" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="למשל GEO, Reels, דאטה" aria-label="חיפוש בהיסטוריה שלי" />
        </label>
        <div className="chips" style={{ marginTop: 10 }}>
          {FILTERS.map((f) => (
            <button key={f.label} className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>

        <Link to={`/ask?q=${encodeURIComponent('ראיתי כתבה ש-GEO הוא הדבר הבא, איפה היא?')}`} className="card link hint-card" style={{ marginTop: 14 }}>
          <b>לא זוכרים איפה זה היה?</b>
          <span className="small">תשאלו את zap UP, למשל: "ראיתי כתבה ש-GEO הוא הדבר הבא". הוא מחפש גם בהיסטוריה שלכם.</span>
        </Link>

        <div style={{ marginTop: 18 }}>
          {rows === undefined && <Skeletons n={3} />}
          {rows !== undefined && rows !== null && rows.length === 0 && (
            <Empty>{q || filter ? 'לא מצאנו משהו כזה בהיסטוריה שלכם. אולי במילה אחרת?' : 'עוד אין כאן כלום. כל מה שתפתחו, תשמרו ותלמדו יחכה לכם פה.'}</Empty>
          )}
          {groups.map((g) => (
            <div key={g.label} className="tl-day">
              <h3 className="tl-label">{g.label}</h3>
              <ul className="timeline">
                {g.rows.map(({ key, first, actions }) => (
                  <li key={key} className="tl-row">
                    <div className="tl-acts">
                      {actions.map((a) => (
                        <span key={a.action} className="badge" title={ACTION[a.action].label}>
                          {ACTION[a.action].ico} {ACTION[a.action].label}
                          {a.action === 'progress' && a.detail ? ` · ${a.detail}` : ''}
                        </span>
                      ))}
                    </div>
                    <Link to={`/item/${first.item_id}`} className="tl-title">{first.title_he}</Link>
                    <div className="small muted">
                      {KIND_LABEL[first.kind]}{topicName(first.topic_slug) ? ` · ${topicName(first.topic_slug)}` : ''} · {first.source_name}
                    </div>
                    {actions.filter((a) => (a.action === 'comment' || a.action.startsWith('shared')) && a.detail).map((a) => (
                      <div key={a.action + 'd'} className="small tl-detail">"{clip(a.detail!, 140)}"</div>
                    ))}
                    {!first.source_url.includes('zap-know.internal') && (
                      <a href={first.source_url} target="_blank" rel="noopener noreferrer" className="small">למקור ↗</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div id="prefs" style={{ marginTop: 32 }}>
        <PrefsPanel profile={profile} topics={topics} onSaved={setProfile} />
      </div>
    </div>
  )
}
