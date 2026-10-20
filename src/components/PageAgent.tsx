import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { callFn } from '../lib'
import { DOC_KIND_HE, teamColor, teamInitials, type AgentTeam, type DocKind } from '../pages/Doc'
import '../agent.css'

// Every page has its own agent: tailored by default, ask it for anything specific.
// Same answer shape everywhere (sources, follow-ups, contact); the mode picks where to look first.
export type AgentMode = 'all' | 'external' | 'internal' | 'me'

type Src = { type: 'internal' | 'external' | 'doc'; title: string; url: string; snippet?: string; kind?: DocKind }
type Contact = { team: string; name: string | null; email: string | null }
type AskReply = { answer_he: string; sources?: Src[]; followups?: string[]; contact?: Contact | null }
type Msg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; sources: Src[]; followups: string[]; contact: Contact | null; error?: boolean; shown: number }

// The header search sends questions to the agent of the page you're on.
export const ASK_EVENT = 'zapup:ask'
export function askThisPage(q: string) { window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: q })) }

const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function SourceCard({ s }: { s: Src }) {
  const external = !s.url.startsWith('#')
  const chip = s.type === 'doc'
    ? <span className="ag-chip">{s.kind ? DOC_KIND_HE[s.kind] : 'מסמך צוות'}</span>
    : s.type === 'internal' ? <span className="ag-chip int">מה קורה ב-zap</span> : <span className="ag-chip ext">מה קורה בעולם</span>
  const body = (<>{chip}<b>{s.title}</b>{s.snippet && <small>{s.snippet}</small>}</>)
  return external
    ? <a className="ag-src" href={s.url} target="_blank" rel="noopener noreferrer">{body}</a>
    : <Link className="ag-src" to={s.url.replace(/^#/, '')}>{body}</Link>
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  )
}

export function PageAgent({ mode, placeholder, starters, teams, defaultTeamId }: {
  mode: AgentMode
  placeholder: string
  starters: string[]
  teams?: AgentTeam[]              // internal page: optional team chips to scope the question
  defaultTeamId?: number | null
}) {
  const [params] = useSearchParams()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const [teamId, setTeamId] = useState<number | null>(params.get('team') ? Number(params.get('team')) : (defaultTeamId ?? null))
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const open = msgs.length > 0 || busy

  // "לשאול את הצוות" links land here with ?team=; follow it while staying on the page.
  const teamParam = params.get('team')
  useEffect(() => {
    if (teamParam) setTeamId(Number(teamParam))
    else if (defaultTeamId) setTeamId(defaultTeamId)
    if (teamParam) setTimeout(() => inputRef.current?.focus(), 50)
  }, [teamParam, defaultTeamId])

  // Typewriter reveal of the latest answer.
  useEffect(() => {
    const last = msgs[msgs.length - 1]
    if (!last || last.role !== 'assistant' || last.shown >= last.content.length) return
    const step = Math.max(2, Math.ceil(last.content.length / 90))
    const t = setTimeout(() => {
      setMsgs((m) => m.map((x, i) => (i === m.length - 1 && x.role === 'assistant' ? { ...x, shown: Math.min(x.content.length, x.shown + step) } : x)))
    }, 16)
    return () => clearTimeout(t)
  }, [msgs])

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }) }, [msgs, busy, open])

  const send = useCallback(async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    const history = msgs.filter((m) => !(m.role === 'assistant' && m.error)).slice(-6).map((m) => ({ role: m.role, content: m.content }))
    setMsgs((m) => [...m, { role: 'user', content: q }])
    setInput('')
    setBusy(true)
    try {
      const res = await callFn<AskReply>('ask', { question: q, history, mode, ...(teamId ? { team_id: teamId } : {}) })
      // The model cites sources as [T0]/[E4]; the source cards already show them.
      const content = (res.answer_he ?? '').replace(/\s*\[[A-Z]\d+\]/g, '').trim() || 'לא מצאנו תשובה הפעם. שווה לנסח אחרת.'
      setMsgs((m) => [...m, {
        role: 'assistant', content, sources: res.sources ?? [], followups: (res.followups ?? []).slice(0, 3),
        contact: res.contact ?? null, shown: reduceMotion ? content.length : 0,
      }])
    } catch (e) {
      const status = (e as { status?: number }).status
      const content = status === 401 ? 'צריך להתחבר מחדש. מרעננים את הדף ונכנסים עם מייל העבודה.' : 'לא הצלחנו לענות כרגע. שווה לנסות שוב בעוד רגע.'
      setMsgs((m) => [...m, { role: 'assistant', content, sources: [], followups: [], contact: null, error: true, shown: content.length }])
    } finally {
      setBusy(false)
    }
  }, [busy, msgs, mode, teamId])

  // ?ask= deep links go to the one AI sheet (AiSheet), not to page agents.

  useEffect(() => {
    const on = (e: Event) => send(String((e as CustomEvent).detail ?? ''))
    window.addEventListener(ASK_EVENT, on)
    return () => window.removeEventListener(ASK_EVENT, on)
  }, [send])

  const team = teams?.find((t) => t.id === teamId) ?? null

  return (
    <section className={`pa${open ? ' open' : ''}`} aria-label="שאלו את הדף הזה">
      <form className="pa-box" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <span className="pa-spark" aria-hidden="true"><IconSpark /></span>
        <textarea
          ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) } }}
          placeholder={team ? `מה תרצו לדעת על צוות ${team.team}?` : placeholder} aria-label="השאלה שלכם"
        />
        <button className="pa-send" type="submit" disabled={busy || !input.trim()} aria-label="לשאול"><IconSend /></button>
      </form>

      {teams && teams.length > 0 && (focused || open) && (
        <div className="pa-teams" role="toolbar" aria-label="לשאול צוות מסוים">
          <button type="button" className={`chip${teamId === null ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setTeamId(null)}>כל הצוותים</button>
          {teams.map((t) => (
            <button key={t.id} type="button" className={`chip${teamId === t.id ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setTeamId(t.id)}>
              <span className="pa-dot" style={{ background: teamColor(t.id) }} aria-hidden="true">{teamInitials(t.team)}</span>{t.team}
            </button>
          ))}
        </div>
      )}

      {!open && focused && (
        <div className="pa-starters">
          {starters.slice(0, 3).map((q) => (
            <button key={q} type="button" className="pa-starter" onMouseDown={(e) => e.preventDefault()} onClick={() => send(q)}>{q}</button>
          ))}
        </div>
      )}

      {open && (
        <div className="pa-thread ag-thread" aria-live="polite">
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="ag-msg me"><div className="ag-bubble">{m.content}</div></div>
          ) : (
            <div key={i} className="ag-msg bot">
              <div className={`ag-bubble${m.error ? ' err' : ''}`}>
                {m.content.slice(0, m.shown)}
                {m.shown < m.content.length && <span className="ag-caret" />}
              </div>
              {m.shown >= m.content.length && (
                <>
                  {m.sources.length > 0 && <div className="ag-sources">{m.sources.map((s, j) => <SourceCard key={j} s={s} />)}</div>}
                  {m.contact && (m.contact.email
                    ? <a className="ag-contact" href={`mailto:${m.contact.email}`}>לפנות ל{m.contact.name ?? `צוות ${m.contact.team}`}</a>
                    : <span className="ag-hint">רוצים לדבר עם מישהו? {m.contact.name ?? `צוות ${m.contact.team}`} ישמחו לעזור.</span>)}
                  {m.followups.length > 0 && (
                    <div className="ag-follow">{m.followups.map((f) => <button key={f} type="button" onClick={() => send(f)} disabled={busy}>{f}</button>)}</div>
                  )}
                </>
              )}
            </div>
          ))}
          {busy && <div className="ag-msg bot"><div className="ag-bubble ag-typing" aria-label="מחפשים תשובה"><i /><i /><i /></div></div>}
          <div ref={endRef} />
          {!busy && <button type="button" className="ag-reset pa-close" onClick={() => setMsgs([])}>לסגור את השיחה</button>}
        </div>
      )}
    </section>
  )
}

export { teamColor, teamInitials }
