import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App'
import { KIND_LABEL, Item, supabase } from '../lib'
import { Empty, Headline, Skeletons, clip } from '../components/ui'
import { PrefsPanel } from '../components/prefs'
import { PointsDashboard } from '../components/points'
import { SUPABASE_URL, fmtMinutes } from '../lib'
import { fmtWhen } from '../components/Remind'
import { ICopy, IHeadphones } from '../components/icons'

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
  { key: null, label: 'הכול' },
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
      <Headline light="כל מה שראיתם, שמרתם ולמדתם," black="האזור שלי" hand="הכול נשמר" />

      <div className="chips" style={{ marginTop: 4 }}>
        <Link to="/leaderboard" className="chip">הטבלה</Link>
        <Link to="/internal" className="chip">קורה ב-zap</Link>
        <Link to="/teams" className="chip">הצוותים</Link>
        <Link to="/library" className="chip">חיפוש</Link>
        <Link to="/budget" className="chip">התקציב שלי</Link>
        {profile.is_admin && <Link to="/admin" className="chip">ניהול</Link>}
      </div>

      <PointsDashboard />

      <WeekTime goal={(profile as { weekly_time?: string | null }).weekly_time ?? null} />
      <MyPodcast />
      <MyReminders />

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
          <span className="small">שאלו את zap UP, למשל: "ראיתי כתבה ש-GEO הוא הדבר הבא". הוא מחפש גם בהיסטוריה שלכם.</span>
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

// The weekly goal from onboarding, against minutes opened this week.
const GOAL_MIN: Record<string, number> = { '15 דקות': 15, 'שעה': 60, '2-3 שעות': 150, 'יותר': 240 }
function WeekTime({ goal }: { goal: string | null }) {
  const [mins, setMins] = useState<number | null>(null)
  useEffect(() => {
    const since = new Date(); since.setDate(since.getDate() - since.getDay()); since.setHours(0, 0, 0, 0)
    supabase.rpc('my_history', { p_q: '', p_type: 'open', p_limit: 200 }).then(async ({ data, error }) => {
      if (error) return
      const ids = ((data as Row[]) ?? []).filter((r) => new Date(r.at) >= since).map((r) => r.item_id)
      if (!ids.length) { setMins(0); return }
      const { data: its } = await supabase.from('items').select('id,minutes').in('id', ids)
      setMins(((its as { minutes: number | null }[] | null) ?? []).reduce((a, i) => a + (i.minutes ?? 0), 0))
    })
  }, [])
  const target = goal ? GOAL_MIN[goal] : null
  if (mins === null || !target) return null
  const pct = Math.min(1, mins / target)
  return (
    <section className="card weektime" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>הזמן שלכם ללמידה השבוע</b>
        <span className="small muted">{fmtMinutes(mins) || '0 דק׳'} מתוך {goal}</span>
      </div>
      <div className="bar" style={{ margin: '10px 0 6px' }}><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
      <span className="small muted">{pct >= 1 ? 'עמדתם ביעד של השבוע. כל הכבוד.' : 'כל ביס קטן נספר. אפשר להשלים גם בנסיעה, עם "אני בדרך".'}</span>
    </section>
  )
}

// The private podcast feed: subscribe once, and saved items keep arriving as audio.
function MyPodcast() {
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    supabase.rpc('my_podcast_token').then(({ data, error }) => { if (!error && data) setToken(String(data)) })
  }, [])
  if (!token) return null
  const url = `${SUPABASE_URL}/functions/v1/podcast?t=${token}`
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { /* the field is selectable */ }
  }
  return (
    <section className="card podcast-card" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 4px' }}><IHeadphones size={20} /> הפודקאסט האישי שלכם</h3>
      <p className="small muted" style={{ margin: '0 0 10px' }}>
        הפרק השבועי, השיחות על מה ששמרתם, ופרקים שסימנתם "להאזין אחר כך". מוסיפים פעם אחת לאפליקציית פודקאסטים, וזה מתעדכן לבד.
      </p>
      <div className="row">
        <input className="input" dir="ltr" readOnly value={url} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0 }} />
        <button className="btn" onClick={copy}><ICopy size={18} /> {copied ? 'הועתק' : 'להעתיק'}</button>
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        ב-Apple Podcasts, Pocket Casts או Overcast בוחרים "הוספה לפי קישור" ומדביקים. Spotify לא תומך בפידים פרטיים. הקישור אישי, אל תשתפו אותו.
      </p>
    </section>
  )
}

type Reminder = { id: number; item_id: number | null; doc_id: number | null; send_at: string; note: string | null }
function MyReminders() {
  const [list, setList] = useState<(Reminder & { title: string })[] | null>(null)
  useEffect(() => {
    supabase.from('reminders').select('id,item_id,doc_id,send_at,note').is('sent_at', null).order('send_at').then(async ({ data, error }) => {
      if (error) return
      const rs = (data as Reminder[]) ?? []
      const itemIds = rs.flatMap((r) => (r.item_id ? [r.item_id] : []))
      const docIds = rs.flatMap((r) => (r.doc_id ? [r.doc_id] : []))
      const [its, docs] = await Promise.all([
        itemIds.length ? supabase.from('items').select('id,title_he').in('id', itemIds) : Promise.resolve({ data: [] }),
        docIds.length ? supabase.from('team_docs').select('id,title').in('id', docIds) : Promise.resolve({ data: [] }),
      ])
      const it = new Map(((its.data as { id: number; title_he: string }[] | null) ?? []).map((x) => [x.id, x.title_he]))
      const dc = new Map(((docs.data as { id: number; title: string }[] | null) ?? []).map((x) => [x.id, x.title]))
      setList(rs.map((r) => ({ ...r, title: (r.item_id ? it.get(r.item_id) : dc.get(r.doc_id!)) ?? 'משהו ששמרתם' })))
    })
  }, [])
  if (!list || list.length === 0) return null
  async function cancel(id: number) {
    setList((l) => (l ?? []).filter((r) => r.id !== id))
    await supabase.from('reminders').delete().eq('id', id)
  }
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 8px' }}>תזכורות שלי</h3>
      <ul className="reminders">
        {list.map((r) => (
          <li key={r.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={r.item_id ? `/item/${r.item_id}` : `/doc/${r.doc_id}`}><b>{r.title}</b></Link>
              <div className="small muted">{fmtWhen(r.send_at)}{r.note ? ` · ${r.note}` : ''}</div>
            </div>
            <button className="linkbtn small" onClick={() => cancel(r.id)}>לבטל</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
