import { useEffect, useMemo, useState } from 'react'
import { DetailLink } from '../components/detail'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import Feed from './Feed'
import { Layer } from '../components/Layer'
import { BoardCard } from '../components/board'
import { IClose } from '../components/icons'
import { AiAvatarSheet } from '../components/AiAvatar'
import { AddCard, BoardSlide, FollowCard, MineCarousel, ProfileCard, SettingsCard, StatsCard, WalletCard } from '../components/mine'
import { ContributeFlow } from './Contribute'
import { useApp } from '../App'
import { KIND_LABEL, Item, supabase } from '../lib'
import { Empty, Skeletons, clip } from '../components/ui'
import { PrefsPanel } from '../components/prefs'
import { PointsDashboard, useMyPoints } from '../components/points'
import { Avatar } from '../components/Avatar'
import { PageAgent } from '../components/PageAgent'
import BudgetPage from './Budget'
import '../lean.css'
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

type MeTab = 'history' | 'points' | 'budget' | 'settings'
const ME_TABS: { key: MeTab; label: string }[] = [
  { key: 'history', label: 'היסטוריה' }, { key: 'points', label: 'נקודות וטבלה' }, { key: 'budget', label: 'תקציב' }, { key: 'settings', label: 'הגדרות' },
]
// Old addresses (/me#leaderboard, /me#prefs) land on their tab.
const tabOfHash = (h: string): MeTab =>
  ({ '#points': 'points', '#leaderboard': 'points', '#budget': 'budget', '#prefs': 'settings', '#more': 'settings', '#settings': 'settings' } as Record<string, MeTab>)[h] ?? 'history'

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

// The profile sheet: me, my points and the board, my budget, my settings.
export function MeDetails({ start }: { start?: MeTab }) {
  const { profile, topics, setProfile } = useApp()
  const [stats, setStats] = useState<Stats | null>(null)
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined)
  const [progress, setProgress] = useState<Row[]>([])
  const [q, setQ] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]?.split('#')[0] ?? '').get('q') ?? '')
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
  const [tab, setTab] = useState<MeTab>(start ?? 'points')
  const pts = useMyPoints()
  const name = profile.display_name || profile.email.split('@')[0]

  return (
    <div className="me-page">
      <header className="me-hero">
        <Avatar face={{ ...profile, name }} size={92} className="me-hero-av" />
        <h1>{name}</h1>
        <p className="me-hero-sub">{profile.role ? `צוות ${profile.role}` : 'zap'}{pts ? <> · <b>{pts.level.name}</b></> : null}</p>
        <div className="me-stats">
          <span><b>{pts ? pts.month.toLocaleString('he-IL') : '·'}</b>נקודות החודש</span>
          <span><b>{stats?.saved ?? '·'}</b>נשמרו</span>
          <span><b>{stats?.liked ?? '·'}</b>לייקים</span>
          <span><b>{stats?.comments ?? '·'}</b>תגובות</span>
        </div>
        <Link to="/contribute" className="btn">משתפים משהו</Link>
      </header>
      <AvatarBlock />

      <div className="me-tabs" role="tablist" aria-label="האזור שלי">
        {ME_TABS.filter((t) => t.key !== 'history').map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'history' && <section className="me-panel">
        <PageAgent mode="me" placeholder='שאלו את העמוד, למשל: "ראיתי כתבה ש-GEO הוא הדבר הבא"'
          starters={['ראיתי כתבה ש-GEO הוא הדבר הבא, איפה היא?', 'מה כדאי לי ללמוד עכשיו?', 'איך אני עולה מקום בטבלה?']} />
        {progress.length > 0 && (
          <div className="lane" style={{ marginBottom: 16 }}>
            {progress.slice(0, 3).map((r) => (
              <DetailLink key={r.item_id} kind="item" id={r.item_id} className="card link">
                <span className="small muted">ממשיכים ללמוד</span>
                <b>{r.title_he}</b>
                <div className="bar" style={{ margin: '10px 0 4px' }}><i style={{ width: `${Math.round(progressPct(r.detail) * 100)}%` }} /></div>
                <span className="small muted">{(r.detail ?? '').replace('/', ' מתוך ')} שיעורים</span>
              </DetailLink>
            ))}
          </div>
        )}
        <div className="page-tools" style={{ marginTop: 0 }}>
          <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בהיסטוריה, למשל GEO או Reels" aria-label="חיפוש בהיסטוריה שלי" />
        </div>
        <div className="chips" style={{ marginTop: 4 }}>
          {FILTERS.map((f) => (
            <button key={f.label} className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          {rows === undefined && <Skeletons n={3} />}
          {rows !== undefined && rows !== null && rows.length === 0 && (
            <Empty>{q || filter ? 'לא מצאנו משהו כזה בהיסטוריה שלכם. אולי במילה אחרת, או לשאול את הדף למעלה.' : 'עוד אין כאן כלום. כל מה שתפתחו, תשמרו ותלמדו יחכה לכם פה.'}</Empty>
          )}
          {groups.map((g) => (
            <div key={g.label} className="tl-day">
              <h3 className="tl-label">{g.label}</h3>
              <ul className="timeline">
                {g.rows.map(({ key, first, actions }) => (
                  <li key={key} className="tl-row">
                    <div className="tl-acts">
                      {actions.map((a) => (
                        <span key={a.action} className="badge">
                          {ACTION[a.action].label}{a.action === 'progress' && a.detail ? ` · ${a.detail}` : ''}
                        </span>
                      ))}
                    </div>
                    <DetailLink kind="item" id={first.item_id} className="tl-title">{first.title_he}</DetailLink>
                    <div className="small muted">
                      {KIND_LABEL[first.kind]}{topicName(first.topic_slug) ? ` · ${topicName(first.topic_slug)}` : ''} · {first.source_name}
                    </div>
                    {actions.filter((a) => (a.action === 'comment' || a.action.startsWith('shared')) && a.detail).map((a) => (
                      <div key={a.action + 'd'} className="small tl-detail">"{clip(a.detail!, 140)}"</div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>}

      {tab === 'points' && <section className="me-panel">
        <PointsDashboard />
        <WeekTime goal={(profile as { weekly_time?: string | null }).weekly_time ?? null} />
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
        <h2 className="me-h2">הטבלה</h2>
        <BoardCard />
      </section>}

      {tab === 'budget' && <section className="me-panel"><BudgetPage embedded /></section>}

      {tab === 'settings' && <section className="me-panel">
        <MyReminders />
        <MyPodcast />
        <div id="prefs" style={{ marginTop: 16 }}>
          <PrefsPanel profile={profile} topics={topics} onSaved={setProfile} />
        </div>
        {profile.is_admin && <p style={{ marginTop: 16 }}><Link className="textlink" to="/admin">לניהול</Link></p>}
      </section>}
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
              <DetailLink kind={r.item_id ? 'item' : 'doc'} id={(r.item_id ?? r.doc_id)!}><b>{r.title}</b></DetailLink>
              <div className="small muted">{fmtWhen(r.send_at)}{r.note ? ` · ${r.note}` : ''}</div>
            </div>
            <button className="linkbtn small" onClick={() => cancel(r.id)}>לבטל</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// האזור שלי looks like the rest of zap UP: the same full-screen feed, with my own lanes and a search.
// Profile, points, the board, budget and settings live behind the chip, in a sheet.
const LANES = [
  { key: 'mine', label: 'שלי' }, { key: 'saved', label: 'שמרתי' }, { key: 'later', label: 'אחר כך' }, { key: 'history', label: 'היסטוריה' },
] as const

export default function Me() {
  const { profile } = useApp()
  const loc = useLocation()
  const [params, setParams] = useSearchParams()
  const lane = LANES.find((l) => l.key === params.get('lane'))?.key ?? 'mine'
  const [maker, setMaker] = useState(false)
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [searching, setSearching] = useState(false)
  // Old links (/me#budget, /me#leaderboard, /me#prefs) open the sheet on their tab.
  const [sheet, setSheet] = useState<MeTab | null>(() => {
    const t = loc.hash && loc.hash !== '#' ? tabOfHash(loc.hash) : null
    return t === 'history' ? null : t
  })
  const pts = useMyPoints()
  const name = profile.display_name || profile.email.split('@')[0]

  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    if (!sheet) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [sheet])

  const pick = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('lane', key)
    setParams(next, { replace: true })
  }

  const chip = (
    <button type="button" className="me-chip" onClick={() => setSheet('points')} aria-label={`הפרופיל שלי${pts ? `, ${pts.level.name}, ${pts.month} נקודות החודש` : ''}`}>
      <Avatar face={{ ...profile, name }} size={30} />
      {pts && <span><b>{pts.level.name}</b><small>{pts.month.toLocaleString('he-IL')} נק׳</small></span>}
    </button>
  )
  const head = (
    <>
      {LANES.map((l) => (
        <button key={l.key} role="tab" aria-selected={l.key === lane} aria-label={l.label} className={`tk-tab${l.key === lane ? ' on' : ''}`} onClick={() => pick(l.key)}>
          {l.key === 'later' ? <><span className="lbl-long">{l.label}</span><span className="lbl-short" aria-hidden>אח״כ</span></> : l.label}
        </button>
      ))}
<button type="button" className="tk-publish" onClick={() => openPublish()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        לפרסם
      </button>
      {lane === 'mine' ? null : searching || q ? (
        <input className="tk-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש אצלי"
          aria-label="חיפוש באזור שלי" onBlur={() => { if (!q) setSearching(false) }} onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); setSearching(false) } }} />
      ) : (
        <button type="button" className="tk-ico" aria-label="חיפוש באזור שלי" onClick={() => setSearching(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        </button>
      )}
    </>
  )

  return (
    <>
      {/* "שלי": my own cards first, then what I saved continues below them. */}
      <Feed key={lane} source={lane === 'mine' ? 'saved' : lane} q={dq} head={head} chip={chip}
        carousel={lane === 'mine' ? (
          <MineCarousel cards={[
            { key: 'me', label: 'פרופיל', node: <ProfileCard onMore={setSheet} onAvatar={() => setMaker(true)} /> },
            { key: 'add', label: 'לפרסם פוסט או מקור', node: <AddCard onOpen={() => openPublish()} /> },
            { key: 'board', label: 'לוח מובילים', node: <BoardSlide /> },
            { key: 'wallet', label: 'הארנק שלי', node: <WalletCard onMore={setSheet} /> },
            { key: 'stats', label: 'הסטטיסטיקה שלי', node: <StatsCard /> },
            { key: 'follow', label: 'התזכורות והמעקב', node: <FollowCard onMore={setSheet} /> },
            { key: 'settings', label: 'הגדרות', node: <SettingsCard onMore={setSheet} /> },
          ]} />
        ) : undefined} />
      {maker && <AiAvatarSheet onClose={() => setMaker(false)} />}
      {sheet && (
        <Layer>
          <div className="dt-back" onClick={() => setSheet(null)}>
            <section className="dt-sheet" role="dialog" aria-modal="true" aria-label="הפרופיל שלי" onClick={(e) => e.stopPropagation()}>
              <header className="dt-head">
                <span className="dt-grab" aria-hidden />
                <b>הפרופיל שלי</b>
                <button className="dt-x" onClick={() => setSheet(null)} aria-label="לסגור"><IClose /></button>
              </header>
              <div className="dt-body"><MeDetails start={sheet} /></div>
            </section>
          </div>
        </Layer>
      )}
    </>
  )
}

// "כרטיס הדמות שלכם" and the way to make (or remake) it.
function AvatarBlock() {
  const { profile } = useApp()
  const [open, setOpen] = useState(false)
  const sheet = (profile as typeof profile & { sheet_url?: string | null }).sheet_url
  return (
    <section className="me-avatar-block">
      {sheet && <><h2 className="me-h2">כרטיס הדמות שלכם</h2><img className="me-sheet-img" src={sheet} alt="כרטיס הדמות שלכם" loading="lazy" /></>}
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>{sheet ? 'ליצור אווטאר חדש' : 'ליצור אווטאר'}</button>
      {open && <AiAvatarSheet onClose={() => setOpen(false)} />}
    </section>
  )
}

// The avatar in any header opens the profile sheet in place (no route change); Esc, ✕ or the
// phone's back button closes it and leaves you where you were.
const PROFILE_EVENT = 'zapup:profile'
export const openProfile = (tab: MeTab = 'points') => window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: tab }))

export function ProfileHost() {
  const [tab, setTab] = useState<MeTab | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      try { history.pushState({ ...(history.state ?? {}), zapProfile: 1 }, '') } catch { /* ignore */ }
      setTab((e as CustomEvent<MeTab>).detail)
    }
    const pop = () => setTab(null)
    window.addEventListener(PROFILE_EVENT, on)
    window.addEventListener('popstate', pop)
    return () => { window.removeEventListener(PROFILE_EVENT, on); window.removeEventListener('popstate', pop) }
  }, [])
  const close = () => {
    if ((history.state as { zapProfile?: number } | null)?.zapProfile) history.back()
    else setTab(null)
  }
  useEffect(() => {
    if (!tab) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!tab) return null
  return (
    <Layer>
      <div className="dt-back" onClick={close}>
        <section className="dt-sheet" role="dialog" aria-modal="true" aria-label="הפרופיל שלי" onClick={(e) => e.stopPropagation()}>
          <header className="dt-head">
            <span className="dt-grab" aria-hidden />
            <b>הפרופיל שלי</b>
            <span className="dt-actions">
              <button type="button" className="dt-signout" onClick={() => supabase.auth.signOut()}>לצאת</button>
              <button className="dt-x" onClick={close} aria-label="לסגור"><IClose /></button>
            </span>
          </header>
          <div className="dt-body"><MeDetails start={tab} /></div>
        </section>
      </div>
    </Layer>
  )
}

// "לפרסם": the add-a-post sheet, from anywhere (האזור שלי, the header), over the current page.
const PUBLISH_EVENT = 'zapup:publish'
export const openPublish = () => window.dispatchEvent(new Event(PUBLISH_EVENT))
export function PublishHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(PUBLISH_EVENT, on)
    return () => window.removeEventListener(PUBLISH_EVENT, on)
  }, [])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  if (!open) return null
  return (
    <Layer>
      <div className="dt-back" onClick={() => setOpen(false)}>
        <section className="dt-sheet" role="dialog" aria-modal="true" aria-label="לפרסם פוסט או מקור" onClick={(e) => e.stopPropagation()}>
          <header className="dt-head"><span className="dt-grab" aria-hidden /><b>לפרסם פוסט או מקור</b>
            <button className="dt-x" onClick={() => setOpen(false)} aria-label="לסגור"><IClose /></button></header>
          <div className="dt-body contribute"><ContributeFlow embedded /></div>
        </section>
      </div>
    </Layer>
  )
}
