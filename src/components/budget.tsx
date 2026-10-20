import { useState } from 'react'
import { useApp } from '../App'
import {
  ALLOWED_DOMAIN, Budget, Profile, PurchaseCategory, PurchaseResult, PurchaseStatus, STATUS_LABEL, callFn, fmtMoney, supabase,
} from '../lib'

export type BuyInput = { item_id?: number; title: string; url: string; category: PurchaseCategory; price: number; reason?: string }
export type BuyOutcome = PurchaseResult | 'no_manager' | 'error'

export async function buy(input: BuyInput): Promise<BuyOutcome> {
  try {
    return await callFn<PurchaseResult>('purchase', input)
  } catch (e) {
    return (e as { status?: number }).status === 409 ? 'no_manager' : 'error'
  }
}

export function StatusChip({ status }: { status: PurchaseStatus }) {
  const tone = status === 'declined' ? 'fail' : status === 'pending_manager' ? 'internal' : 'ok'
  return <span className={`badge ${tone}`}>{STATUS_LABEL[status]}</span>
}

export function BudgetBar({ b }: { b: Budget }) {
  const used = b.monthly_amount > 0 ? Math.min(1, b.spent / b.monthly_amount) : 0
  return (
    <>
      <div className="budget-num">
        <b>{fmtMoney(Math.max(0, b.remaining), b.currency)}</b>
        <span className="muted"> נשארו מתוך {fmtMoney(b.monthly_amount, b.currency)}</span>
      </div>
      <div className="bar"><i style={{ width: `${Math.round((1 - used) * 100)}%` }} /></div>
      {b.pending > 0 && (
        <div className="small muted" style={{ marginTop: 6 }}>
          {b.pending === 1 ? 'בקשה אחת מחכה לאישור' : `${b.pending} בקשות מחכות לאישור`}
        </div>
      )}
      {(b.bonus ?? 0) > 0 && (
        <div className="small" style={{ marginTop: 6, color: 'var(--green)', fontWeight: 700 }}>
          🏆 כולל {fmtMoney(b.bonus!, b.currency)} בונוס, כי סיימתם את החודש שעבר בין המובילים בטבלה.
        </div>
      )}
      {b.is_placeholder && (
        <div className="small muted" style={{ marginTop: 6 }}>סכום לדוגמה. את הסכום האמיתי קובעים ב-L&amp;D.</div>
      )}
    </>
  )
}

// Asked only when a purchase goes above budget and we don't know who approves it yet.
export function ManagerPrompt({ onSaved }: { onSaved: () => void }) {
  const { profile, setProfile } = useApp()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const valid = email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { data, error } = await supabase.from('profiles').update({ manager_email: email.trim().toLowerCase() })
      .eq('user_id', profile.user_id).select('*').single()
    setBusy(false)
    if (error || !data) { setErr('לא הצלחנו לשמור. נסו שוב.'); return }
    setProfile(data as Profile)
    onSaved()
  }

  return (
    <form className="notice info" onSubmit={save} style={{ marginTop: 10 }}>
      <div style={{ marginBottom: 8 }}>
        זה מעל התקציב החודשי, אז צריך אישור מהמנהל/ת הישיר/ה. מה המייל שלהם?
      </div>
      <div className="row">
        <input className="input" style={{ flex: 1, minWidth: 200 }} dir="ltr" placeholder={`name${ALLOWED_DOMAIN}`}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn" disabled={!valid || busy}>{busy ? 'שומרים' : 'לשמור ולשלוח בקשה'}</button>
      </div>
      {err && <div className="small" style={{ marginTop: 6 }}>{err}</div>}
    </form>
  )
}

export function BuyResult({ result, url }: { result: PurchaseResult; url?: string }) {
  if (result.status === 'pending_manager') {
    return <div className="notice info" style={{ marginTop: 10 }}>מעל התקציב, שלחנו בקשה למנהל/ת. נעדכן כשתגיע תשובה.</div>
  }
  return (
    <div className="notice ok" style={{ marginTop: 10 }}>
      אושר אוטומטית. קונים עכשיו באתר עם הכרטיס הווירטואלי של zap UP.
      {' '}נשארו לכם {fmtMoney(result.remaining, result.currency)} החודש.
      {url && <> <a href={url} target="_blank" rel="noopener noreferrer">לאתר הרכישה ←</a></>}
    </div>
  )
}
