import { useState } from 'react'
import { callFn } from '../lib'
import '../listen.css'

type Line = { speaker: string; text: string }
type Result = { script: Line[]; audio_url: string | null }

// "להאזנה": turns any written resource into a short two-host conversation (audio + transcript).
// The first listener waits ~20-40 seconds while it's made; everyone after gets it instantly.
export function Listen({ kind, id }: { kind: 'item' | 'doc'; id: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [res, setRes] = useState<Result | null>(null)
  const [showText, setShowText] = useState(false)

  async function make() {
    setState('loading')
    try {
      setRes(await callFn<Result>('listen', { kind, id }))
      setState('ready')
    } catch {
      setState('error')
    }
  }

  if (state === 'idle' || state === 'error') {
    return (
      <div className="listen">
        <button className="listen-btn" onClick={make}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" />
          </svg>
          להאזנה, כשיחה של 2 דקות
        </button>
        {state === 'error' && <p className="listen-note">לא הצלחנו להכין את השיחה הפעם. שווה לנסות שוב בעוד דקה.</p>}
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div className="listen">
        <div className="listen-loading" role="status">
          <span className="listen-wave" aria-hidden="true"><i /><i /><i /><i /></span>
          נועה ועידו מתכוננים לשיחה, זה לוקח בערך חצי דקה
        </div>
      </div>
    )
  }

  return (
    <div className="listen listen-ready">
      {res?.audio_url
        ? <audio className="listen-audio" controls autoPlay src={res.audio_url} />
        : <p className="listen-note">ההקלטה עוד לא מוכנה, אבל אפשר לקרוא את השיחה.</p>}
      <button className="listen-toggle" onClick={() => setShowText((v) => !v)}>
        {showText ? 'להסתיר את התמליל' : 'לקרוא את התמליל'}
      </button>
      {showText && (
        <ol className="listen-script">
          {res?.script.map((l, i) => (
            <li key={i} className={l.speaker === 'נועה' ? 'a' : 'b'}>
              <b>{l.speaker}</b> {l.text}
            </li>
          ))}
        </ol>
      )}
      <p className="listen-note">נוצר ב-AI מתוך הסיכום שלנו, לא מתוך התוכן המקורי.</p>
    </div>
  )
}
