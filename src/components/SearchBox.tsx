import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Topic } from '../lib'
import { openAi } from './AiSheet'
import '../contribute.css'

// One box for both intents, scoped to the page you're on: a question goes to that page's agent,
// a keyword filters that page. Pages without their own list (home, items) search ידע מבחוץ.
// \b doesn't treat Hebrew letters as word characters, so the question word must end in a space or the end.
const QUESTION = /[?？]|^\s*(איך|מה|למה|מאיפה|מי|האם|כמה|מתי|איפה|באיזה)(?=\s|$)/
const POPULAR = ['Google Ads', 'GA4', 'רילס', 'GEO', 'NotebookLM', 'פרומפטים', 'Looker Studio', 'Canva', 'Claude']

export function looksLikeQuestion(q: string) { return QUESTION.test(q.trim()) }

const scopeOf = (path: string) => (path.startsWith('/internal') ? '/internal' : path.startsWith('/me') ? '/me' : path === '/' ? '/' : '/external')
const LABEL: Record<string, string> = { '/internal': 'במה קורה ב-zap', '/me': 'בהיסטוריה שלכם', '/': 'במה קורה בעולם', '/external': 'במה קורה בעולם' }

export function SearchBox({ topics }: { topics: Topic[] }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const scope = scopeOf(loc.pathname)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey) }
  }, [open])

  function go(term: string) {
    const t = term.trim()
    if (!t) return
    setOpen(false); setQ('')
    const enc = encodeURIComponent(t)
    if (looksLikeQuestion(t)) {
      openAi(t)
      return
    }
    if (scope === '/me') { nav(`/me?q=${enc}#history`); return }
    nav(`${scope === '/' ? '/external' : scope}?q=${enc}`)
  }

  return (
    <div className="sbox" ref={wrap}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(q) }}>
        <svg className="sbox-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
        <input className="sbox-in" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)}
          placeholder="שאלו את ה-AI או חפשו" aria-label="שאלו את ה-AI או חפשו" />
        {q.trim() && <span className="sbox-hint small">{looksLikeQuestion(q) ? 'נשאל את ה-AI' : `נחפש ${LABEL[scope]}`}</span>}
      </form>
      {open && (
        <div className="sbox-drop" role="dialog" aria-label="הצעות">
          <div className="small muted">נושאים</div>
          <div className="chips" style={{ margin: '6px 0 12px' }}>
            {topics.filter((t) => t.status === 'live').map((t) => (
              <button key={t.slug} className="chip" onClick={() => { setOpen(false); nav(`/external?topic=${t.slug}`) }}>{t.name_he}</button>
            ))}
          </div>
          <div className="small muted">מה מחפשים עכשיו</div>
          <div className="chips" style={{ margin: '6px 0 0' }}>
            {POPULAR.map((k) => <button key={k} className="chip" onClick={() => go(k)}><bdi>{k}</bdi></button>)}
          </div>
          <div className="small muted sbox-tip">טיפ: שאלה, כמו "איך מתחילים עם GEO?", הולכת ישר ל-AI. מקש / פותח אותו מכל מקום.</div>
        </div>
      )}
    </div>
  )
}
