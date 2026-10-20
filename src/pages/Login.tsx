import { useState } from 'react'
import { ALLOWED_DOMAIN, supabase } from '../lib'
import { Headline, MetroLine } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'info'; text: string } | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!clean.endsWith(ALLOWED_DOMAIN)) {
      setMsg({ kind: 'err', text: `zap UP פתוח לעובדי zap. נכנסים עם כתובת המייל של העבודה (${ALLOWED_DOMAIN}).` })
      return
    }
    setBusy(true); setMsg(null)
    // The redirect makes the email's sign-in link work too (Supabase's default template sends a link).
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setBusy(false)
    if (error) { setMsg({ kind: 'err', text: 'לא הצלחנו לשלוח קוד. נסו שוב בעוד דקה.' }); return }
    setEmail(clean); setStep('code')
    setMsg({ kind: 'info', text: `שלחנו מייל ל-${clean}. מעתיקים את הקוד, או פשוט לוחצים על הקישור במייל. שווה להציץ גם בספאם.` })
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMsg({ kind: 'err', text: 'הקוד לא עבד. בדקו שהעתקתם את כולו, או בקשו קוד חדש.' })
  }

  return (
    <div className="login-wrap">
      <div className="texture" />
      <MetroLine top={40} />
      <div className="login-card">
        <img src="/zap-know/img/zap-group.svg" alt="zap group" style={{ height: 34 }} />
        <p className="wordmark">zap <span className="swoosh-word">UP</span></p>
        <p className="small muted" style={{ margin: '0 0 8px' }}>
          <bdi dir="ltr" className="sub-line">Learn. Level Up. zap.</bdi>
          <span className="sub-line"><bdi dir="ltr">zap KNOW</bdi>, מרכז הלמידה והידע של zap</span>
        </p>
        <Headline light="כל מה שצריך כדי להשתדרג," black="במקום אחד" hand="בלי לחפש" />
        <p className="muted">קורסים, עדכונים מהתעשייה ומה שקורה אצלנו, בעברית ובקצרה. נכנסים עם מייל העבודה.</p>
        <div className="card" style={{ marginTop: 18 }}>
          {step === 'email' ? (
            <form onSubmit={sendCode}>
              <label className="field">
                <span>מייל עבודה</span>
                <input className="input" type="email" dir="ltr" placeholder={`name${ALLOWED_DOMAIN}`} value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </label>
              <button className="btn block" disabled={busy}>{busy ? 'שולחים' : 'שלחו לי קוד'}</button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <label className="field">
                <span>הקוד מהמייל</span>
                <input className="input" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code}
                  onChange={(e) => setCode(e.target.value)} required autoFocus />
              </label>
              <button className="btn block" disabled={busy}>{busy ? 'בודקים' : 'כניסה'}</button>
              <button type="button" className="btn ghost block" style={{ marginTop: 8 }}
                onClick={() => { setStep('email'); setCode(''); setMsg(null) }}>החלפת מייל</button>
            </form>
          )}
          {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}
        </div>
      </div>
    </div>
  )
}
