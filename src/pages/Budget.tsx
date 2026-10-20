import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../App'
import {
  Budget, CATEGORY_LABEL, Purchase, PurchaseCategory, PurchaseResult, fmtDate, fmtMoney, loadBudget, supabase,
} from '../lib'
import { Empty, Headline } from '../components/ui'
import { BudgetBar, BuyResult, ManagerPrompt, StatusChip, buy } from '../components/budget'

const EMPTY = { title: '', url: '', category: 'course' as PurchaseCategory, price: '', reason: '' }

export default function BudgetPage() {
  const { profile } = useApp()
  const loc = useLocation()
  const prefsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if ((loc.state as { prefs?: boolean } | null)?.prefs) prefsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [loc.key])
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
    if (r === 'error') { setErr('משהו נתקע בדרך. נסו שוב עוד רגע.'); return }
    setResult({ r, url })
    setForm(EMPTY)
    refresh()
  }

  if (budget === undefined) return <div style={{ marginTop: 28 }}><div className="skeleton" /></div>
  if (budget === null) return <Empty>תקציב הלמידה עוד לא הוגדר. ברגע ש-L&amp;D יפעילו אותו, הוא יופיע כאן.</Empty>

  return (
    <div style={{ maxWidth: 760 }}>
      <Headline light="קורס, ספר או כנס," black="בלי טפסים ובלי לחכות" hand="פשוט ככה" />

      <div className="grid two">
        <div className="vcard" aria-label="כרטיס דמו">
          <div className="vcard-top">
            <img src="/zap-know/img/zap-group-white.svg" alt="zap group" />
            <b>UP</b>
          </div>
          <div className="vcard-num" dir="ltr">•••• •••• •••• 4821</div>
          <div className="vcard-bottom">
            <span>{profile.display_name || profile.email.split('@')[0]}</span>
            <span className="vcard-demo">כרטיס דמו, בלי כסף אמיתי</span>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>החודש</h3>
          <BudgetBar b={budget} />
          <p className="small muted" style={{ marginTop: 10 }}>
            עד גובה התקציב, קונים ישר באתר עם הכרטיס. מעל התקציב, הבקשה הולכת ישר למנהל/ת, לאישור בקליק אחד.
          </p>
        </div>
      </div>

      <h2 className="section">משהו שלא מצאתם ב-zap UP?</h2>
      <form className="card" onSubmit={submit}>
        <label className="field"><span>מה זה?</span>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="למשל: קורס Google Ads מתקדם" />
        </label>
        <label className="field"><span>קישור</span>
          <input className="input" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://" />
        </label>
        <div className="grid two">
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
        <label className="field"><span>למה זה שווה לכם? <small className="muted">לא חובה, אבל עוזר אם צריך אישור</small></span>
          <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
        <button className="btn green" disabled={!valid || busy}>
          {busy ? 'בודקים תקציב' : valid && price > budget.remaining ? 'לשלוח בקשה לאישור' : 'לקנות מהתקציב'}
        </button>
        {needManager && <ManagerPrompt onSaved={() => submit()} />}
        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
        {result && <BuyResult result={result.r} url={result.url} />}
      </form>

      <h2 className="section">מה קניתם ומה ביקשתם</h2>
      {list.length === 0 ? <Empty>עוד לא קניתם כלום מהתקציב. שווה להתחיל מקורס אחד.</Empty> : (
        <div className="card">
          <ul className="plist">
            {list.map((p) => (
              <li key={p.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>{p.title}</a>
                  <div className="small muted">
                    {CATEGORY_LABEL[p.category]} · {fmtDate(p.created_at)}
                    {p.status === 'pending_manager' && p.manager_email && <> · אצל <span dir="ltr">{p.manager_email}</span></>}
                  </div>
                </div>
                <b style={{ whiteSpace: 'nowrap' }}>{fmtMoney(p.price, p.currency)}</b>
                <StatusChip status={p.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div ref={prefsRef} className="card" style={{ marginTop: 24 }}>
        <b>ההעדפות שלי עברו לאזור שלי</b>
        <p className="small muted" style={{ margin: '4px 0 10px' }}>שם אפשר לעדכן תפקיד, נושאים ומה אתם צריכים עכשיו, ולראות את כל מה שראיתם ולמדתם.</p>
        <Link to="/me" className="btn ghost">לאזור שלי</Link>
      </div>
    </div>
  )
}
