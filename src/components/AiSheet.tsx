import { useCallback, useEffect, useRef, useState } from 'react'
import { openDetail } from './detail'
import { useSearchParams } from 'react-router-dom'
import { callFn, supabase } from '../lib'
import { DocPreview, previewLines } from './ui'
import { DOC_KIND_HE, type DocKind } from '../pages/Doc'
import { IClose } from './icons'
import '../ai.css'

// One AI for all of zap UP: any question, from any page, answered across ידע מבחוץ and ידע מבפנים,
// with the resources it used as swipeable cards (their real thumbnails or the document itself).

type Src = { type: 'internal' | 'external' | 'doc'; title: string; url: string; snippet?: string; kind?: DocKind; team?: string }
type Contact = { team: string; name: string | null; email: string | null }
type AskReply = { answer_he: string; sources?: Src[]; followups?: string[]; contact?: Contact | null }
type Card = Src & { thumb: string | null; lines: string[]; label: string }
type Msg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; cards: Card[]; followups: string[]; contact: Contact | null; error?: boolean }

const EVENT = 'zapup:ai'
/** Opens the AI sheet from anywhere; with a question, asks it right away. */
export function openAi(q?: string, opts: { teamId?: number | null } = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { q: q ?? '', teamId: opts.teamId ?? null } }))
}

const STARTERS = ['מאיפה מתחילים עם GEO?', 'איך צוות ה-PPC עובד עם GA4?', 'מה חדש השבוע ב-AI לשיווק?']
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

// Real images for the sources: the item's own thumbnail or YouTube preview; documents show their text.
async function toCards(sources: Src[]): Promise<Card[]> {
  const idOf = (url: string, kind: string) => { const m = url.match(new RegExp(`#/${kind}/(\\d+)`)); return m ? Number(m[1]) : null }
  const itemIds = sources.map((s) => idOf(s.url, 'item')).filter((x): x is number => !!x)
  const docIds = sources.map((s) => idOf(s.url, 'doc')).filter((x): x is number => !!x)
  const [its, docs] = await Promise.all([
    itemIds.length ? supabase.from('items').select('id,thumbnail_url,preview_video_id,summary_he,kind,source_name').in('id', itemIds) : Promise.resolve({ data: [] }),
    docIds.length ? supabase.from('team_docs').select('id,body_md,summary_he').in('id', docIds) : Promise.resolve({ data: [] }),
  ])
  type It = { id: number; thumbnail_url: string | null; preview_video_id: string | null; summary_he: string | null; kind: string; source_name: string }
  const im = new Map(((its.data ?? []) as It[]).map((i) => [i.id, i]))
  const dm = new Map(((docs.data ?? []) as { id: number; body_md: string | null; summary_he: string | null }[]).map((d) => [d.id, d]))
  const KIND: Record<string, string> = { course: 'קורס', news: 'עדכון', podcast: 'פודקאסט', internal: 'קורה ב-zap' }
  return sources.map((s) => {
    const it = im.get(idOf(s.url, 'item') ?? -1)
    const d = dm.get(idOf(s.url, 'doc') ?? -1)
    const thumb = it?.thumbnail_url || (it?.preview_video_id ? ytThumb(it.preview_video_id) : null)
    const label = s.type === 'doc' ? (s.kind ? DOC_KIND_HE[s.kind] : 'מסמך צוות') : s.type === 'internal' ? 'צוות' : KIND[it?.kind ?? ''] ?? 'מבחוץ'
    return { ...s, thumb, label, lines: previewLines(d?.body_md || s.snippet || it?.summary_he || '', 3) }
  })
}

export function AiButton({ fab }: { fab?: boolean }) {
  const [fresh] = useState(() => { try { return !localStorage.getItem('zapup.ai.seen') } catch { return false } })
  return (
    <button type="button" className={`ai-pill${fab ? ' ai-fab' : ''}${fresh ? ' pulse' : ''}`} aria-label="לשאול את ה-AI" aria-keyshortcuts="/"
      onClick={() => openAi()}>
      <Spark /> AI
    </button>
  )
}

export function AiSheet() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [teamId, setTeamId] = useState<number | null>(null)
  const [teamName, setTeamName] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inRef = useRef<HTMLTextAreaElement>(null)

  const send = useCallback(async (text: string, team: number | null) => {
    const q = text.trim()
    if (!q) return
    const history = msgs.filter((m) => !(m.role === 'assistant' && m.error)).slice(-6).map((m) => ({ role: m.role, content: m.content }))
    setMsgs((m) => [...m, { role: 'user', content: q }])
    setInput(''); setBusy(true)
    try {
      const res = await callFn<AskReply>('ask', { question: q, history, mode: 'all', ...(team ? { team_id: team } : {}) })
      const content = (res.answer_he ?? '').replace(/\s*\[[A-Z]\d+\]/g, '').trim() || 'לא מצאנו תשובה הפעם. שווה לנסח אחרת.'
      const cards = await toCards(res.sources ?? []).catch(() => [])
      setMsgs((m) => [...m, { role: 'assistant', content, cards, followups: (res.followups ?? []).slice(0, 3), contact: res.contact ?? null }])
    } catch (e) {
      const status = (e as { status?: number }).status
      const content = status === 401 ? 'צריך להתחבר מחדש. מרעננים את הדף ונכנסים עם מייל העבודה.' : 'לא הצלחנו לענות כרגע. שווה לנסות שוב בעוד רגע.'
      setMsgs((m) => [...m, { role: 'assistant', content, cards: [], followups: [], contact: null, error: true }])
    } finally {
      setBusy(false)
    }
  }, [msgs])

  const show = useCallback((q: string, team: number | null) => {
    setOpen(true)
    try { localStorage.setItem('zapup.ai.seen', '1') } catch { /* fine */ }
    document.querySelectorAll('.ai-pill.pulse').forEach((el) => el.classList.remove('pulse'))
    setTeamId(team)
    if (team) supabase.from('team_profiles').select('team').eq('id', team).maybeSingle().then(({ data }) => setTeamName((data as { team: string } | null)?.team ?? ''))
    else setTeamName('')
    if (q.trim()) send(q, team)
    else setTimeout(() => inRef.current?.focus(), 60)
  }, [send])

  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ q: string; teamId: number | null }>).detail; show(d.q, d.teamId) }
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !t.closest('input, textarea, [contenteditable="true"]')) { e.preventDefault(); show('', null) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener(EVENT, on)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('keydown', key) }
  }, [show])

  // Deep links (?ask=, old /agent and /ask addresses) open the sheet with the question.
  useEffect(() => {
    const q = params.get('ask')
    if (!q) return
    const team = params.get('team') ? Number(params.get('team')) : null
    const next = new URLSearchParams(params); next.delete('ask'); next.delete('team')
    setParams(next, { replace: true })
    show(q, team)
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy, open])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null
  return (
    <div className="ai-back" onClick={() => setOpen(false)}>
      <section className="ai-sheet" role="dialog" aria-modal="true" aria-label="לשאול את ה-AI" onClick={(e) => e.stopPropagation()}>
        <header className="ai-head">
          <span className="ai-badge"><Spark /> AI</span>
          <b>{teamName ? `שואלים את צוות ${teamName}` : 'כל הידע של zap, בשאלה אחת'}</b>
          {msgs.length > 0 && <button className="ai-new" onClick={() => setMsgs([])}>שיחה חדשה</button>}
          <button className="ai-x" aria-label="לסגור" onClick={() => setOpen(false)}><IClose /></button>
        </header>

        <div className="ai-thread" aria-live="polite">
          {msgs.length === 0 && (
            <div className="ai-empty">
              <p>שואלים כמו שמדברים. עונים מהקורסים, מהעדכונים ומהמסמכים של הצוותים.</p>
              <div className="ai-follow">{STARTERS.map((s) => <button key={s} onClick={() => send(s, teamId)}>{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="ai-msg me"><div className="ai-bubble">{m.content}</div></div>
          ) : (
            <div key={i} className="ai-msg bot">
              <div className={`ai-bubble${m.error ? ' err' : ''}`}>{m.content}</div>
              {m.cards.length > 0 && (
                <div className="ai-cards" role="list" aria-label="המקורות">
                  {m.cards.map((c, j) => {
                    const inner = (
                      <>
                        <span className="ai-card-media">
                          {c.thumb
                            ? <img src={c.thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            : <DocPreview title={c.title} lines={c.lines} by={c.team ? `צוות ${c.team}` : undefined} />}
                        </span>
                        <span className="ai-card-body"><span className="ai-card-kind">{c.label}</span><b>{c.title}</b></span>
                      </>
                    )
                    return c.url.startsWith('#')
                      ? <a key={j} role="listitem" className="ai-card" href={c.url}
                          onClick={(e) => {
                            const m = c.url.match(/^#\/(item|doc)\/(\d+)/)
                            if (!m || e.metaKey || e.ctrlKey) { setOpen(false); return }
                            e.preventDefault(); setOpen(false); openDetail({ kind: m[1] as 'item' | 'doc', id: Number(m[2]) })
                          }}>{inner}</a>
                      : <a key={j} role="listitem" className="ai-card" href={c.url} target="_blank" rel="noopener noreferrer">{inner}</a>
                  })}
                </div>
              )}
              {m.contact && (m.contact.email
                ? <a className="ai-contact" href={`mailto:${m.contact.email}`}>לפנות ל{m.contact.name ?? `צוות ${m.contact.team}`}</a>
                : <p className="ai-hint">רוצים לדבר עם מישהו? {m.contact.name ?? `צוות ${m.contact.team}`} ישמחו לעזור.</p>)}
              {m.followups.length > 0 && (
                <div className="ai-follow">{m.followups.map((f) => <button key={f} onClick={() => send(f, teamId)} disabled={busy}>{f}</button>)}</div>
              )}
            </div>
          ))}
          {busy && <div className="ai-msg bot"><div className="ai-bubble ai-typing" aria-label="מחפשים תשובה"><i /><i /><i /></div></div>}
          <div ref={endRef} />
        </div>

        <form className="ai-form" onSubmit={(e) => { e.preventDefault(); if (!busy) send(input, teamId) }}>
          <textarea ref={inRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} aria-label="השאלה שלכם"
            placeholder={teamName ? `מה תרצו לדעת על צוות ${teamName}?` : 'שאלו את ה-AI, למשל: איך מודדים GEO?'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) send(input, teamId) } }} />
          <button type="submit" disabled={busy || !input.trim()} aria-label="לשאול">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6" /></svg>
          </button>
        </form>
      </section>
    </div>
  )
}

export function Spark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.1 6.2 6.4 2.3-6.4 2.3L12 19.5l-2.1-6.2L3.5 11l6.4-2.3z" /><path d="M19 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
    </svg>
  )
}
