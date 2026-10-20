import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App'
import { Budget, Purchase, SUPABASE_URL, fmtMinutes, fmtMoney, loadBudget, supabase, STATUS_LABEL } from '../lib'
import { Avatar } from './Avatar'
import { BADGES, useMyPoints, useRankGap, rankLine } from './points'
import { BoardCard } from './board'
import { CHANNEL_OPTIONS, DAY_OPTIONS } from './prefs'
import { fmtWhen } from './Remind'

// האזור שלי opens with my own cards, in the same frame as every post: who I am, the board,
// my wallet, my numbers, what I'm following, my settings. Each one is a summary that fits;
// "לפרטים" opens the full thing in the standard sheet.

export type SheetTab = 'points' | 'budget' | 'settings'
type Open = (t: SheetTab) => void

type Hist = { item_id: number; action: string; at: string; topic_slug: string | null }
let histCache: Promise<Hist[]> | null = null
const myHistory = () => (histCache ??= Promise.resolve(supabase.rpc('my_history', { p_q: '', p_type: null, p_limit: 300 }))
  .then(({ data, error }) => (error ? [] : ((data as Hist[]) ?? []))))

// Days in a row with something opened, counting back from today (or yesterday).
function streakOf(rows: Hist[]) {
  const days = new Set(rows.filter((r) => r.action === 'open').map((r) => new Date(r.at).toDateString()))
  const d = new Date()
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1) }
  return n
}
function useStreak() {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => { myHistory().then((r) => setN(streakOf(r))) }, [])
  return n
}

function Card({ kicker, children, more, onMore }: { kicker: string; children: React.ReactNode; more?: string; onMore?: () => void }) {
  return (
    <div className="mc">
      <span className="mc-kicker">{kicker}</span>
      <div className="mc-body">{children}</div>
      {onMore && <button type="button" className="mc-more" onClick={onMore}>{more ?? 'לפרטים'} ←</button>}
    </div>
  )
}

export function ProfileCard({ onMore, onAvatar }: { onMore: Open; onAvatar: () => void }) {
  const { profile } = useApp()
  const p = useMyPoints()
  const streak = useStreak()
  const name = profile.display_name || profile.email.split('@')[0]
  const pct = p ? (p.level.next === null ? 1 : Math.min(1, (p.all - p.level.from) / Math.max(1, p.level.next - p.level.from))) : 0
  const earned = BADGES.filter((b) => (p?.badges ?? []).includes(b.name))
  return (
    <Card kicker="פרופיל" onMore={() => onMore('points')}>
      <div className="mc-me">
        <Avatar face={{ ...profile, name }} size={96} />
        <div>
          <h2>{name}</h2>
          <p>{profile.role ? `צוות ${profile.role}` : 'zap'}</p>
          <button type="button" className="mc-btn" onClick={onAvatar}>{profile.avatar_style === 'ai' ? 'ליצור אווטאר חדש' : 'ליצור אווטאר'}</button>
        </div>
      </div>
      {p && (
        <div className="mc-level">
          <div className="mc-row"><b>{p.level.name}</b><span>{p.level.next === null ? 'הרמה הכי גבוהה' : `עוד ${(p.level.next - p.all).toLocaleString('he-IL')} לרמה הבאה`}</span></div>
          <div className="mc-bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
        </div>
      )}
      <div className="mc-nums">
        <span><b>{p ? p.month.toLocaleString('he-IL') : '·'}</b>נקודות החודש</span>
        <span><b>{p ? p.all.toLocaleString('he-IL') : '·'}</b>מאז ומעולם</span>
        <span><b>{streak ?? '·'}</b>ימים ברצף</span>
      </div>
      <div className="mc-badges" aria-label={`${earned.length} תגים`}>
        {earned.length ? earned.slice(0, 5).map((b) => <span key={b.name} title={b.name}>{b.ico}</span>) : <small>התג הראשון מחכה לשיעור הראשון</small>}
      </div>
    </Card>
  )
}

export function BoardSlide() {
  const gap = useRankGap()
  return (
    <Card kicker="לוח מובילים">
      <BoardCard />
      {gap?.gap ? <p className="mc-hint">{rankLine(gap)}</p> : null}
    </Card>
  )
}

export function WalletCard({ onMore }: { onMore: Open }) {
  const { profile } = useApp()
  const [b, setB] = useState<Budget | null | undefined>(undefined)
  const [recent, setRecent] = useState<Purchase[]>([])
  useEffect(() => {
    loadBudget().then(setB)
    supabase.from('purchases').select('id,title,price,currency,status,created_at,is_demo').eq('user_id', profile.user_id)
      .order('created_at', { ascending: false }).limit(2).then(({ data }) => setRecent((data as Purchase[]) ?? []))
  }, [profile.user_id])
  const used = b && b.monthly_amount > 0 ? Math.min(1, b.spent / b.monthly_amount) : 0
  return (
    <Card kicker="הארנק שלי" onMore={() => onMore('budget')}>
      {b === null ? <p className="mc-hint">תקציב הלמידה עוד לא הוגדר. ברגע ש-L&amp;D יפעילו אותו, הוא כאן.</p> : (
        <>
          <div className="vcard mc-vcard">
            <div className="vcard-top"><b>zap UP</b><span className="vcard-demo">דמו</span></div>
            <div className="vcard-num">•••• •••• •••• 4821</div>
            <div className="vcard-bottom"><span>{profile.display_name || ''}</span><span>{b ? fmtMoney(Math.max(0, b.remaining), b.currency) : '·'}</span></div>
          </div>
          {b && (
            <>
              <div className="mc-row"><b>{fmtMoney(Math.max(0, b.remaining), b.currency)} נשארו</b><span>מתוך {fmtMoney(b.monthly_amount, b.currency)} · יצאו {fmtMoney(b.spent, b.currency)}</span></div>
              <div className="mc-bar"><i style={{ width: `${Math.round((1 - used) * 100)}%` }} /></div>
              <div className="mc-list">
                {b.pending > 0 && <p>⏳ {b.pending === 1 ? 'בקשה אחת מחכה לאישור' : `${b.pending} בקשות מחכות לאישור`}</p>}
                {(b.bonus ?? 0) > 0 && <p>✨ כולל {fmtMoney(b.bonus!, b.currency)} בונוס מהטבלה</p>}
                {recent.map((r) => <p key={r.id}>{r.title} · {fmtMoney(r.price, r.currency)} · {STATUS_LABEL[r.status]}</p>)}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}

export function StatsCard() {
  const { topics } = useApp()
  const [rows, setRows] = useState<Hist[] | null>(null)
  const [mins, setMins] = useState<{ week: number; month: number } | null>(null)
  const [stats, setStats] = useState<{ completed: number; comments: number; shared: number; liked: number } | null>(null)
  useEffect(() => {
    supabase.rpc('my_stats').then(({ data, error }) => setStats(error ? null : data))
    myHistory().then(async (r) => {
      setRows(r)
      const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0)
      const week = new Date(); week.setDate(week.getDate() - week.getDay()); week.setHours(0, 0, 0, 0)
      const opens = r.filter((x) => x.action === 'open' && new Date(x.at) >= month)
      if (!opens.length) { setMins({ week: 0, month: 0 }); return }
      const { data } = await supabase.from('items').select('id,minutes').in('id', opens.map((x) => x.item_id))
      const m = new Map(((data ?? []) as { id: number; minutes: number | null }[]).map((i) => [i.id, i.minutes ?? 0]))
      setMins({
        week: opens.filter((x) => new Date(x.at) >= week).reduce((a, x) => a + (m.get(x.item_id) ?? 0), 0),
        month: opens.reduce((a, x) => a + (m.get(x.item_id) ?? 0), 0),
      })
    })
  }, [])
  const top = (() => {
    const c = new Map<string, number>()
    for (const r of rows ?? []) if (r.topic_slug) c.set(r.topic_slug, (c.get(r.topic_slug) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => topics.find((t) => t.slug === s)?.name_he ?? s)
  })()
  return (
    <Card kicker="הסטטיסטיקה שלי">
      <div className="mc-nums">
        <span><b>{mins ? fmtMinutes(mins.week) || '0' : '·'}</b>השבוע</span>
        <span><b>{mins ? fmtMinutes(mins.month) || '0' : '·'}</b>החודש</span>
        <span><b>{rows ? streakOf(rows) : '·'}</b>ימים ברצף</span>
      </div>
      <div className="mc-nums">
        <span><b>{stats?.completed ?? '·'}</b>סיימתם</span>
        <span><b>{stats?.comments ?? '·'}</b>תגובות</span>
        <span><b>{stats?.shared ?? '·'}</b>שיתופים</span>
      </div>
      {top.length > 0 && <div className="mc-chips"><small>הכי מעניין אתכם:</small>{top.map((t) => <span key={t}>{t}</span>)}</div>}
    </Card>
  )
}

type Rem = { id: number; item_id: number | null; doc_id: number | null; send_at: string }
export function FollowCard({ onMore }: { onMore: Open }) {
  const { topics } = useApp()
  const [rem, setRem] = useState<(Rem & { title: string })[] | null>(null)
  const [watch, setWatch] = useState<string[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    supabase.from('reminders').select('id,item_id,doc_id,send_at').is('sent_at', null).order('send_at').limit(3).then(async ({ data }) => {
      const list = (data as Rem[]) ?? []
      const ids = list.map((r) => r.item_id).filter((x): x is number => !!x)
      const { data: its } = ids.length ? await supabase.from('items').select('id,title_he').in('id', ids) : { data: [] }
      const t = new Map(((its ?? []) as { id: number; title_he: string }[]).map((i) => [i.id, i.title_he]))
      setRem(list.map((r) => ({ ...r, title: (r.item_id && t.get(r.item_id)) || 'מסמך צוות' })))
    })
    supabase.from('topic_watch').select('topic_slug').then(({ data }) => setWatch(((data ?? []) as { topic_slug: string }[]).map((w) => w.topic_slug)))
    supabase.rpc('my_podcast_token').then(({ data, error }) => { if (!error && data) setToken(String(data)) })
  }, [])
  const rss = token ? `${SUPABASE_URL}/functions/v1/podcast?t=${token}` : null
  return (
    <Card kicker="התזכורות והמעקב" onMore={() => onMore('settings')}>
      <div className="mc-list">
        {rem === null ? null : rem.length === 0 ? <p>אין תזכורות פתוחות. "⋯" בכל כרטיס, ותזכורת במייל.</p>
          : rem.map((r) => <p key={r.id}>⏰ {fmtWhen(new Date(r.send_at))} · {r.title}</p>)}
      </div>
      <div className="mc-chips"><small>עוקבים אחרי:</small>{watch.length ? watch.slice(0, 4).map((w) => <span key={w}>{topics.find((t) => t.slug === w)?.name_he ?? w}</span>) : <span>עוד כלום</span>}</div>
      <div className="mc-actions">
        {rss && <button type="button" className="mc-btn" onClick={async () => { try { await navigator.clipboard.writeText(rss); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { /* ignore */ } }}>
          {copied ? 'הקישור הועתק' : 'להעתיק את הפודקאסט האישי'}</button>}
        <Link className="mc-btn ghost" to="/drive">אני בדרך</Link>
      </div>
    </Card>
  )
}

export function SettingsCard({ onMore }: { onMore: Open }) {
  const { profile, topics, setProfile } = useApp()
  const p = profile as typeof profile & { notify_channel?: string | null; notify_day?: number | null; english_ok?: boolean | null }
  const channel = CHANNEL_OPTIONS.find((c) => c.value === p.notify_channel)?.label ?? 'מייל'
  return (
    <Card kicker="הגדרות" onMore={() => onMore('settings')}>
      <div className="mc-chips"><small>תחומי עניין:</small>{profile.topics.slice(0, 4).map((s) => <span key={s}>{topics.find((t) => t.slug === s)?.name_he ?? s}</span>)}</div>
      <div className="mc-list">
        <p>🔔 הפרק השבועי: {p.notify_channel === 'none' ? 'בלי' : `${channel}, יום ${DAY_OPTIONS[p.notify_day ?? 0] ?? 'א׳'}`}</p>
        <p>⏱ הזמן שלי ללמידה: {profile.weekly_time || 'עוד לא בחרתם'}</p>
        <p>🗣 שפה: {p.english_ok === false ? 'רק עברית' : 'עברית קודם, ואנגלית כשאין'}</p>
      </div>
      <div className="mc-actions">
        <button type="button" className="mc-btn" onClick={() => setProfile({ ...profile, topics: [] })}>לעבור שוב על השאלון</button>
      </div>
    </Card>
  )
}
