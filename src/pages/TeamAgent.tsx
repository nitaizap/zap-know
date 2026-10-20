import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { callFn, supabase } from '../lib'
import { DemoNote, DOC_KIND_HE, IconExternal, teamColor, teamInitials, toolUrl, type AgentTeam, type DocKind } from './Doc'
import '../agent.css'

type Src = { type: 'internal' | 'external' | 'doc'; title: string; url: string; snippet?: string; kind?: DocKind }
type Contact = { team: string; name: string | null; email: string | null }
type AskReply = { answer_he: string; sources?: Src[]; followups?: string[]; contact?: Contact | null }
type Msg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; sources: Src[]; followups: string[]; contact: Contact | null; error?: boolean; shown: number }

// Starter questions: a few per known team, and generic ones for "כל הצוותים".
const STARTERS: Record<string, string[]> = {
  PPC: ['איך צוות ה-PPC עובד עם GA4?', 'מה הצ׳קליסט לפני שמעלים קמפיין?', 'איך בונים דוח ביצועים ללקוח?'],
  'SEO ו-GEO': ['איך מופיעים בתשובות של AI?', 'מה בודקים באודיט SEO ראשון?', 'באילו כלים הצוות משתמש?'],
  סושיאל: ['איך מתכננים חודש תוכן?', 'איך מודדים קמפיין ממומן במטא?', 'מי מאשר קריאייטיב לפני עלייה?'],
  תוכן: ['איך כותבים לפי One Tone?', 'מה תהליך הבריף לכתבה?', 'איפה התבניות של הצוות?'],
  'דאטה ואנליטיקס': ['איך מחברים מקור דאטה ל-Looker Studio?', 'מה ההגדרה שלנו להמרה?', 'למי פונים עם בקשת דוח?'],
}
const GENERIC = ['איך צוות ה-PPC עובד עם GA4?', 'מי אחראי על הדשבורדים בחברה?', 'באילו כלי AI הצוותים משתמשים?', 'איך מתחילים פרויקט עם צוות פיתוח?']

function starterFor(team: AgentTeam | null) {
  if (!team) return GENERIC
  const list = STARTERS[team.team]
  if (list) return list
  const tool = team.tools?.[0]?.name
  return [
    `איך צוות ${team.team} עובד ביום-יום?`,
    tool ? `איך צוות ${team.team} משתמש ב-${tool}?` : `באילו כלים צוות ${team.team} משתמש?`,
    `למי בצוות ${team.team} פונים, ועל מה?`,
  ]
}

function IconSend() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12H5M11 6l-6 6 6 6" />
    </svg>
  )
}
function IconSpark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  )
}
function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
    </svg>
  )
}
function IconAll() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M11 19c0-3 2.2-5 5-5s5 2 5 5" />
    </svg>
  )
}

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function SourceCard({ s }: { s: Src }) {
  const external = !s.url.startsWith('#')
  const chip = s.type === 'doc'
    ? <span className="ag-chip">{s.kind ? DOC_KIND_HE[s.kind] : 'מסמך צוות'}</span>
    : s.type === 'internal'
      ? <span className="ag-chip int">פנימי</span>
      : <span className="ag-chip ext">חיצוני</span>
  const body = (<>{chip}<b>{s.title}</b>{s.snippet && <small>{s.snippet}</small>}</>)
  return external
    ? <a className="ag-src" href={s.url} target="_blank" rel="noopener noreferrer">{body}</a>
    : <Link className="ag-src" to={s.url.replace(/^#/, '')}>{body}</Link>
}

export default function TeamAgent() {
  const [params, setParams] = useSearchParams()
  const [teams, setTeams] = useState<AgentTeam[]>([])
  const [teamId, setTeamId] = useState<number | null>(params.get('team') ? Number(params.get('team')) : null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoAsked = useRef(false)

  useEffect(() => {
    supabase.from('team_profiles').select('*').order('team').then(({ data }) => setTeams((data as AgentTeam[]) ?? []))
  }, [])

  const team = teams.find((t) => t.id === teamId) ?? null

  // Typewriter: reveal the latest answer progressively.
  useEffect(() => {
    const last = msgs[msgs.length - 1]
    if (!last || last.role !== 'assistant' || last.shown >= last.content.length) return
    const step = Math.max(2, Math.ceil(last.content.length / 90))
    const t = setTimeout(() => {
      setMsgs((m) => m.map((x, i) => (i === m.length - 1 && x.role === 'assistant' ? { ...x, shown: Math.min(x.content.length, x.shown + step) } : x)))
    }, 16)
    return () => clearTimeout(t)
  }, [msgs])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' }) }, [msgs, busy])

  const send = useCallback(async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    const history = msgs.filter((m) => !(m.role === 'assistant' && m.error)).slice(-6).map((m) => ({ role: m.role, content: m.content }))
    setMsgs((m) => [...m, { role: 'user', content: q }])
    setInput('')
    setBusy(true)
    try {
      const res = await callFn<AskReply>('ask', { question: q, history, mode: 'internal', ...(teamId ? { team_id: teamId } : {}) })
      const content = res.answer_he || 'לא מצאנו תשובה הפעם. שווה לנסח אחרת, או לפנות לצוות ישירות.'
      setMsgs((m) => [...m, {
        role: 'assistant', content, sources: res.sources ?? [], followups: (res.followups ?? []).slice(0, 4),
        contact: res.contact ?? null, shown: reduceMotion ? content.length : 0,
      }])
    } catch (e) {
      const status = (e as { status?: number }).status
      const content = status === 401
        ? 'צריך להתחבר מחדש כדי לשאול. מרעננים את הדף ונכנסים עם מייל העבודה.'
        : 'לא הצלחנו לענות כרגע. שווה לנסות שוב בעוד רגע.'
      setMsgs((m) => [...m, { role: 'assistant', content, sources: [], followups: [], contact: null, error: true, shown: content.length }])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }, [busy, msgs, teamId])

  // ?q= from a doc page or a link: ask once the teams are loaded.
  useEffect(() => {
    const q = params.get('q')
    if (!q || autoAsked.current || (params.get('team') && teams.length === 0)) return
    autoAsked.current = true
    const next = new URLSearchParams(params)
    next.delete('q')
    setParams(next, { replace: true })
    send(q)
  }, [params, teams, send, setParams])

  const pickTeam = (id: number | null) => {
    setTeamId(id)
    const next = new URLSearchParams(params)
    if (id) next.set('team', String(id)); else next.delete('team')
    setParams(next, { replace: true })
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) }
  }

  return (
    <div className="ag">
      <section className="ag-hero">
        <p className="ag-light">איך הצוותים אצלנו עובדים באמת?</p>
        <h1>שאלו את הצוותים</h1>
        <p>הכלים, התהליכים והמסמכים של כל צוות, במקום אחד. בוחרים צוות, או שואלים את כולם.</p>
      </section>

      <div className="ag-teams" role="toolbar" aria-label="בחירת צוות">
        <button type="button" className="ag-team" aria-pressed={teamId === null} onClick={() => pickTeam(null)}>
          <span className="ag-avatar" style={{ background: 'var(--dark, #001c32)' }}><IconAll /></span>
          <span>כל הצוותים</span>
        </button>
        {teams.map((t) => (
          <button key={t.id} type="button" className="ag-team" aria-pressed={teamId === t.id} onClick={() => pickTeam(t.id)}>
            <span className="ag-avatar" style={{ background: teamColor(t.id) }} aria-hidden="true">{teamInitials(t.team)}</span>
            <span>{t.team}</span>
          </button>
        ))}
      </div>

      {team && (
        <div className="ag-teamcard">
          <h2>צוות {team.team} {team.is_demo && <DemoNote />}</h2>
          <p>{team.summary_he}</p>
          {(team.tools?.length ?? 0) > 0 && (
            <div className="ag-tools">
              {team.tools.map((tool) => {
                const url = toolUrl(team, tool.name)
                return url
                  ? <a key={tool.name} className="ag-tool" href={url} target="_blank" rel="noopener noreferrer" title={tool.what_for_he}>{tool.name} <IconExternal /></a>
                  : <span key={tool.name} className="ag-tool" title={tool.what_for_he}>{tool.name}</span>
              })}
            </div>
          )}
        </div>
      )}

      {msgs.length === 0 && (
        <div className="ag-starters">
          {starterFor(team).map((q) => (
            <button key={q} type="button" className="ag-starter" onClick={() => send(q)}>
              <IconSpark /><span>{q}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ag-thread" aria-live="polite">
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} className="ag-msg me"><div className="ag-bubble">{m.content}</div></div>
        ) : (
          <div key={i} className="ag-msg bot">
            <span className="ag-who">zap UP{team ? ` · צוות ${team.team}` : ''}</span>
            <div className={`ag-bubble${m.error ? ' err' : ''}`}>
              {m.content.slice(0, m.shown)}
              {m.shown < m.content.length && <span className="ag-caret" />}
            </div>
            {m.shown >= m.content.length && (
              <>
                {m.sources.length > 0 && <div className="ag-sources">{m.sources.map((s, j) => <SourceCard key={j} s={s} />)}</div>}
                {m.contact && (m.contact.email
                  ? <a className="ag-contact" href={`mailto:${m.contact.email}`}><IconMail /> לפנות ל{m.contact.name ?? `צוות ${m.contact.team}`}</a>
                  : <span className="ag-hint">רוצים לדבר עם מישהו? {m.contact.name ?? `צוות ${m.contact.team}`} ישמחו לעזור.</span>)}
                {m.followups.length > 0 && (
                  <div className="ag-follow">
                    {m.followups.map((f) => <button key={f} type="button" onClick={() => send(f)} disabled={busy}>{f}</button>)}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {busy && <div className="ag-msg bot"><div className="ag-bubble ag-typing" aria-label="מחפשים תשובה"><i /><i /><i /></div></div>}
        <div ref={endRef} />
      </div>

      <form className="ag-composer" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <textarea
          ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
          placeholder={team ? `מה תרצו לדעת על צוות ${team.team}?` : 'למשל: איך צוות ה-PPC עובד עם GA4?'}
          aria-label="השאלה שלכם"
        />
        <button className="ag-send" type="submit" disabled={busy || !input.trim()} aria-label="לשלוח"><IconSend /></button>
      </form>
      {msgs.length > 0 && (
        <p style={{ textAlign: 'center', marginTop: 10 }}>
          <button type="button" className="ag-reset" onClick={() => setMsgs([])}>להתחיל שיחה חדשה</button>
        </p>
      )}
    </div>
  )
}
