import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App'
import {
  Budget, CATEGORY_LABEL, Purchase, PurchaseCategory, PurchaseResult, fmtDate, fmtMoney, loadBudget, supabase,
} from '../lib'
import { Empty, Headline } from '../components/ui'
import { BuyResult, ManagerPrompt, StatusChip, buy } from '../components/budget'
import '../calm.css'

const EMPTY = { title: '', url: '', category: 'course' as PurchaseCategory, price: '', reason: '' }

export default function BudgetPage({ embedded }: { embedded?: boolean } = {}) {
  const { profile } = useApp()
  const [budget, setBudget] = useState<Budget | null | undefined>(undefined)
  const [list, setList] = useState<Purchase[]>([])
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ r: PurchaseResult; url: string } | null>(null)
  const [needManager, setNeedManager] = useState(false)
  const [err, setErr] = useState('')

  async function refresh() {
    const [b, p] = await Promise.all([
      loadBudget(),
      supabase.from('purchases').select('id,title,url,category,price,currency,status,manager_email,created_at,is_demo')
        .eq('user_id', profile.user_id).order('created_at', { ascending: false }).limit(50),
    ])
    setBudget(b)
    setList((p.data as Purchase[]) ?? [])
  }
  useEffect(() => { refresh() }, [profile.user_id])

  const price = Number(form.price)
  const valid = form.title.trim() && /^https?:\/\//.test(form.url.trim()) && form.price !== '' && price >= 0

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!valid) return
    setBusy(true); setErr(''); setNeedManager(false); setResult(null)
    const url = form.url.trim()
    const r = await buy({
      title: form.title.trim(), url, category: form.category, price, reason: form.reason.trim() || undefined,
    })
    setBusy(false)
    if (r === 'no_manager') { setNeedManager(true); return }
    if (r === 'error') { setErr('משהו נתקע בדרך. שווה לנסות שוב עוד רגע.'); return }
    setResult({ r, url })
    setForm(EMPTY)
    refresh()
  }

  if (budget === undefined) return <div style={{ marginTop: 28 }}><div className="skeleton" /></div>
  if (budget === null) return <Empty>תקציב הלמידה עוד לא הוגדר. ברגע ש-L&amp;D יפעילו אותו, הוא יופיע כאן.</Empty>

  const used = budget.monthly_amount > 0 ? Math.min(1, budget.spent / budget.monthly_amount) : 0
  const name = profile.display_name || profile.email.split('@')[0]

  return (
    <div className={embedded ? "" : "calm-narrow"}>
      {!embedded && <Headline light="קורס, ספר או כנס," black="בלי טפסים ובלי לחכות" hand="פשוט ככה" />}

      <div className="bcard" aria-label="כרטיס הלמידה">
        <div className="vc-top">
          <span>zap UP</span>
          <span className="vc-demo">כרטיס דמו, בלי כסף אמיתי</span>
        </div>
        <div>
          <div className="vc-amount">{fmtMoney(Math.max(0, budget.remaining), budget.currency)}</div>
          <div className="vc-sub">נשארו החודש מתוך {fmtMoney(budget.monthly_amount, budget.currency)}</div>
          <div className="meter"><i style={{ width: `${Math.round((1 - used) * 100)}%` }} /></div>
        </div>
        <div className="vc-top">
          <span>{name}</span>
          <span className="vc-num" dir="ltr">•••• 4821</span>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        עד גובה התקציב קונים ישר עם הכרטיס. מעל התקציב, הבקשה הולכת ישר למי שמנהל אתכם, לאישור בקליק אחד.
        {budget.pending > 0 && <> · {budget.pending === 1 ? 'בקשה אחת מחכה' : `${budget.pending} בקשות מחכות`}</>}
        {(budget.bonus ?? 0) > 0 && <> · כולל {fmtMoney(budget.bonus!, budget.currency)} בונוס מהטבלה</>}
        {budget.is_placeholder && <> · סכום לדוגמה</>}
      </p>

      <section className="calm-section">
        <h2>לקנות משהו שלא מצאתם כאן</h2>
        <form className="card" onSubmit={submit}>
          <div className="formgrid">
            <label className="field"><span>מה זה?</span>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="למשל: קורס Google Ads מתקדם" />
            </label>
            <label className="field"><span>קישור</span>
              <input className="input" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://" />
            </label>
            <div className="formgrid two">
              <label className="field"><span>סוג</span>
                <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PurchaseCategory })}>
                  {(Object.keys(CATEGORY_LABEL) as PurchaseCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </select>
              </label>
              <label className="field"><span>מחיר (₪)</span>
                <input className="input" type="number" min="0" step="1" inputMode="decimal" dir="ltr" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </label>
            </div>
            <label className="field"><span>למה זה שווה? <small className="muted">לא חובה, עוזר כשצריך אישור</small></span>
              <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </label>
          </div>
          <button className="btn block" style={{ marginTop: 'var(--s4, 16px)' }} disabled={!valid || busy}>
            {busy ? 'בודקים תקציב' : valid && price > budget.remaining ? 'לשלוח בקשת אישור' : 'לקנות מהתקציב'}
          </button>
          {needManager && <ManagerPrompt onSaved={() => submit()} />}
          {err && <div className="notice err" style={{ marginTop: 12 }}>{err}</div>}
          {result && <BuyResult result={result.r} url={result.url} />}
        </form>
      </section>

      <section className="calm-section">
        <h2>מה קניתם ומה ביקשתם</h2>
        {list.length === 0 ? (
          <div className="empty-calm"><b>עוד לא קניתם מהתקציב</b>שווה להתחיל מקורס אחד.</div>
        ) : (
          <ul className="simple-list">
            {list.map((p) => (
              <li key={p.id}>
                <span className="grow">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>{p.title}</a>
                  <span className="sub">
                    {CATEGORY_LABEL[p.category]} · {fmtDate(p.created_at)}
                    {p.status === 'pending_manager' && p.manager_email && <> · אצל <span dir="ltr">{p.manager_email}</span></>}
                  </span>
                </span>
                <b style={{ whiteSpace: 'nowrap' }}>{fmtMoney(p.price, p.currency)}</b>
                <StatusChip status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {!embedded && (
        <p className="small muted" style={{ marginTop: 'var(--s8, 32px)' }}>
          ההעדפות נמצאות <Link className="textlink" to="/me">באזור שלי</Link>.
        </p>
      )}
    </div>
  )
}
