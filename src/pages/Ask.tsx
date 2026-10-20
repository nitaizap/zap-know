import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { callFn } from '../lib'
import { Headline } from '../components/ui'

type Src = { type: 'internal' | 'external'; title: string; url: string }
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Src[] }

const EXAMPLES = [
  'איך צוות ה-PPC בונה קמפיין חדש?',
  'באילו כלים צוות הדאטה משתמש לדוחות?',
  'איזה קורס שווה לי כדי להבין GEO?',
  'מה חדש השבוע בסושיאל?',
]

export default function Ask() {
  const [params, setParams] = useSearchParams()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const asked = useRef(false)

  async function ask(question: string) {
    const text = question.trim()
    if (!text || busy) return
    const history = msgs.map(({ role, content }) => ({ role, content }))
    setMsgs((m) => [...m, { role: 'user', content: text }])
    setQ(''); setBusy(true)
    try {
      const res = await callFn<{ answer_he: string; sources: Src[] }>('ask', { question: text, history })
      setMsgs((m) => [...m, { role: 'assistant', content: res.answer_he, sources: res.sources ?? [] }])
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'לא הצלחתי לענות כרגע. נסו שוב בעוד רגע.' }])
    }
    setBusy(false)
  }

  useEffect(() => {
    const initial = params.get('q')
    if (initial && !asked.current) {
      asked.current = true
      setParams({}, { replace: true })
      ask(initial)
    }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, busy])

  return (
    <div style={{ maxWidth: 760 }}>
      <Headline light="שאלה על הצוותים או על התחום?" black="שאלו את zap UP" />
      <p className="muted small">התשובות מגיעות רק מהתוכן שב-zap UP: פרופילי הצוותים (פנימי) והקורסים והעדכונים (חיצוני). ליד כל תשובה מופיעים המקורות.</p>

      {msgs.length === 0 && (
        <div className="chips" style={{ marginTop: 14 }}>
          {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => ask(e)}>{e}</button>)}
        </div>
      )}

      <div className="chat" style={{ marginTop: 16 }}>
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'me' : 'bot'}`}>
            {m.content}
            {m.sources && m.sources.length > 0 && (
              <div className="srcs">
                {m.sources.map((s, j) => (
                  <a key={j} href={s.url} target={s.url.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer"
                    className={`badge ${s.type === 'internal' ? 'internal' : 'course'}`}>
                    {s.type === 'internal' ? 'פנימי' : 'חיצוני'} · {s.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble bot muted">מחפשים תשובה</div>}
        <div ref={endRef} />
      </div>

      <form className="chatbox" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
        <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="כתבו שאלה" />
        <button className="btn" disabled={busy || !q.trim()}>שליחה</button>
      </form>
    </div>
  )
}
