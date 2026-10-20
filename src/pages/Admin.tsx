import { useEffect, useState } from 'react'
import { useApp } from '../App'
import { CATEGORY_LABEL, Purchase, Source, fmtDate, fmtMoney, supabase } from '../lib'
import { Empty, Headline } from '../components/ui'
import { StatusChip } from '../components/budget'
import '../calm.css'
import '../adopt.css'

type Report = { id: number; item_id: number; note: string | null; resolved: boolean; at: string }
type Run = { id: number; job: string; ok: boolean; detail: unknown; at: string }
type BudgetSettings = { monthly_amount: number; currency: string; rollover: boolean; is_placeholder: boolean }
type Tab = 'overview' | 'reports' | 'sources' | 'budget' | 'log'
type Reported = { id: number; title_he: string; summary_he: string | null; source_url: string; status: string }
type Kpis = {
  pending: number; collected_week: number; by_source: { source_name: string; n: number }[]; sources_active: number
  broken_week: number; ai_runs_week: number; failures_week: number; reports_open: number
  last_runs: { job: string; ok: boolean; at: string; detail: string }[]
}

// Honest assumptions for the cost line; the real cap is set on the AI key itself.
const COST_PER_AI_RUN = 0.01
const MONTHLY_CAP = 50
const OWNER = 'nitaiz@d.co.il'


// A short human line for a run's details, instead of raw JSON.
function runLine(r: Run) {
  const d = (r.detail ?? {}) as Record<string, unknown>
  if (typeof d.error === 'string') return d.error.slice(0, 140)
  return Object.entries(d)
    .filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && v.length < 40))
    .slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')
}

export default function Admin() {
  const { profile } = useApp()
  const [tab, setTab] = useState<Tab>('overview')
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [kpisFailed, setKpisFailed] = useState(false)
  const [sources, setSources] = useState<Source[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [reported, setReported] = useState<Map<number, Reported>>(new Map())
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState({ title_he: '', summary_he: '' })
  const [settings, setSettings] = useState<BudgetSettings | null>(null)
  const [amount, setAmount] = useState('')
  const [rollover, setRollover] = useState(false)
  const [savedSettings, setSavedSettings] = useState(false)
  const [purchases, setPurchases] = useState<Purchase[]>([])

  async function load() {
    const [s, r, l] = await Promise.all([
      supabase.from('sources').select('*').eq('status', 'proposed').order('score', { ascending: false }),
      supabase.from('reports').select('*').eq('resolved', false).order('at', { ascending: false }).limit(50),
      supabase.from('run_log').select('*').order('at', { ascending: false }).limit(30),
    ])
    setSources((s.data as Source[]) ?? [])
    const reps = (r.data as Report[]) ?? []
    setReports(reps)
    const ids = [...new Set(reps.map((x) => x.item_id))]
    if (ids.length) supabase.from('items').select('id,title_he,summary_he,source_url,status').in('id', ids)
      .then(({ data }) => setReported(new Map(((data as Reported[]) ?? []).map((i) => [i.id, i]))))
    setRuns((l.data as Run[]) ?? [])
    supabase.rpc('admin_kpis').then(({ data, error }) => { if (!error && data) setKpis(data as Kpis); else setKpisFailed(true) })

    // Budget tables may not exist yet; the tab just stays hidden.
    const month = new Date().toISOString().slice(0, 7) + '-01'
    const [bs, pu] = await Promise.all([
      supabase.from('budget_settings').select('monthly_amount,currency,rollover,is_placeholder').eq('id', 1).maybeSingle(),
      supabase.from('purchases').select('id,user_id,title,url,category,price,currency,status,manager_email,created_at,is_demo')
        .eq('month', month).order('created_at', { ascending: false }).limit(200),
    ])
    const b = bs.data as BudgetSettings | null
    if (b) { setSettings(b); setAmount(String(b.monthly_amount)); setRollover(b.rollover) }
    setPurchases((pu.data as Purchase[]) ?? [])
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    const monthly = Number(amount)
    if (!(monthly >= 0)) return
    const { data, error } = await supabase.from('budget_settings')
      .update({ monthly_amount: monthly, rollover, is_placeholder: false, updated_at: new Date().toISOString() })
      .eq('id', 1).select('monthly_amount,currency,rollover,is_placeholder').single()
    if (!error && data) { setSettings(data as BudgetSettings); setSavedSettings(true) }
  }
  useEffect(() => { if (profile.is_admin) load() }, [profile.is_admin])

  if (!profile.is_admin) return <Empty>המסך הזה פתוח לצוות L&amp;D בלבד.</Empty>

  // Publishing is automatic; this is where reported items get fixed, hidden, or closed.
  const resolve = async (itemId: number) => {
    await supabase.from('reports').update({ resolved: true }).eq('item_id', itemId)
    setReports((r) => r.filter((x) => x.item_id !== itemId))
  }
  async function saveFix(itemId: number) {
    await supabase.from('items').update({ title_he: draft.title_he, summary_he: draft.summary_he }).eq('id', itemId)
    setEditing(null)
    resolve(itemId)
  }
  async function hideItem(itemId: number) {
    await supabase.from('items').update({ status: 'rejected' }).eq('id', itemId)
    resolve(itemId)
  }
  function startEdit(it: Reported) {
    setDraft({ title_he: it.title_he, summary_he: it.summary_he ?? '' })
    setEditing(it.id)
  }

  async function setSource(id: number, status: 'active' | 'dropped') {
    setSources((s) => s.filter((x) => x.id !== id))
    await supabase.from('sources').update({ status }).eq('id', id)
  }

  const approvedSum = purchases.filter((p) => ['auto_approved', 'approved', 'purchased'].includes(p.status)).reduce((a, p) => a + Number(p.price), 0)
  const pendingCount = purchases.filter((p) => p.status === 'pending_manager').length
  const failed = runs.filter((r) => !r.ok).length

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'תמונת מצב' },
    { id: 'reports', label: 'דיווחים ותיקונים', count: new Set(reports.map((r) => r.item_id)).size },
    { id: 'sources', label: 'מקורות', count: sources.length },
    ...(settings ? [{ id: 'budget' as Tab, label: 'תקציב' }] : []),
    { id: 'log', label: 'יומן', count: failed || undefined },
  ]

  return (
    <div className="calm">
      <Headline light="15 דקות בשבוע," black="והתוכן באוויר" hand="זאפ קטן וסיימנו" />

      <nav className="calm-tabs" aria-label="ניהול">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}>
            {t.label}{t.count ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </nav>


      {tab === 'overview' && (kpis === null ? (kpisFailed ? <div className="empty-calm"><b>תמונת המצב עוד לא זמינה</b>היא תופיע אחרי עדכון הנתונים הבא. בינתיים אפשר לעבור על הדיווחים.</div> : <div className="skeleton" />) : <Overview k={kpis} onReports={() => setTab('reports')} />)}

      {tab === 'sources' && (sources.length === 0 ? (
        <div className="empty-calm"><b>אין הצעות חדשות</b>ברגע שה-AI ימצא מקור ששווה לבדוק, הוא יופיע כאן.</div>
      ) : (
        <div className="grid two">
          {sources.map((s) => (
            <div key={s.id} className="card">
              <h3>{s.name}</h3>
              {s.reason_he && <p className="small muted" style={{ marginTop: 6 }}>{s.reason_he}</p>}
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => setSource(s.id, 'active')}>להוסיף</button>
                <button className="btn ghost" onClick={() => setSource(s.id, 'dropped')}>לא עכשיו</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {tab === 'reports' && (reports.length === 0 ? (
        <div className="empty-calm"><b>אין דיווחים פתוחים</b>כל מה שנאסף עולה לאוויר לבד. מה שמדווח כטעות מגיע לכאן.</div>
      ) : (
        <ul className="simple-list">
          {[...new Set(reports.map((r) => r.item_id))].map((id) => {
            const it = reported.get(id)
            const notes = reports.filter((r) => r.item_id === id)
            return (
              <li key={id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <span className="grow">
                  <b>{it?.title_he ?? `פריט #${id}`}</b>{it?.status === 'rejected' ? <span className="sub">מוסתר</span> : null}
                  <span className="sub">{notes.map((r) => `"${r.note || 'בלי הערה'}" · ${fmtDate(r.at)}`).join('  ·  ')}</span>
                </span>
                {editing === id && it ? (
                  <div className="card" style={{ padding: 12 }}>
                    <label className="field"><span>כותרת</span><input className="input" value={draft.title_he} onChange={(e) => setDraft({ ...draft, title_he: e.target.value })} /></label>
                    <label className="field" style={{ marginTop: 8 }}><span>תקציר</span><textarea className="input" rows={4} value={draft.summary_he} onChange={(e) => setDraft({ ...draft, summary_he: e.target.value })} /></label>
                    <div className="row" style={{ marginTop: 10 }}>
                      <button className="btn" onClick={() => saveFix(id)}>לשמור תיקון</button>
                      <button className="btn ghost" onClick={() => setEditing(null)}>ביטול</button>
                    </div>
                  </div>
                ) : (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {it && <button className="btn" onClick={() => startEdit(it)}>לתקן טקסט</button>}
                    <button className="btn ghost" onClick={() => hideItem(id)}>להסתיר</button>
                    <button className="linkbtn" onClick={() => resolve(id)}>הכול תקין, לסגור</button>
                    {it && <a className="textlink" href={it.source_url} target="_blank" rel="noopener noreferrer">למקור</a>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ))}

      {tab === 'budget' && settings && (
        <>
          <div className="stat-row">
            <div className="stat"><b>{fmtMoney(approvedSum, settings.currency)}</b><span>אושרו החודש</span></div>
            <div className="stat"><b>{purchases.length}</b><span>רכישות ובקשות</span></div>
            <div className="stat"><b>{pendingCount}</b><span>מחכות לאישור</span></div>
          </div>

          <form className="card" style={{ marginTop: 'var(--s6, 24px)' }} onSubmit={saveSettings}>
            <label className="field"><span>סכום חודשי לכל אחד ואחת (₪)</span>
              <input className="input" type="number" min="0" step="1" dir="ltr" value={amount}
                onChange={(e) => { setAmount(e.target.value); setSavedSettings(false) }} />
            </label>
            <label className="switch">
              <input type="checkbox" checked={rollover} onChange={(e) => { setRollover(e.target.checked); setSavedSettings(false) }} />
              יתרה שלא נוצלה עוברת לחודש הבא
            </label>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn">לשמור</button>
              {savedSettings && <span className="small muted">נשמר. כולם כבר רואים את הסכום החדש.</span>}
              {settings.is_placeholder && !savedSettings && <span className="small muted">זה עדיין סכום לדוגמה.</span>}
            </div>
          </form>

          <section className="calm-section">
            <h2>רכישות החודש</h2>
            {purchases.length === 0 ? <div className="empty-calm"><b>עוד אין רכישות החודש</b></div> : (
              <ul className="simple-list">
                {purchases.map((p) => (
                  <li key={p.id}>
                    <span className="grow">
                      <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>{p.title}</a>
                      <span className="sub">{CATEGORY_LABEL[p.category]} · {fmtDate(p.created_at)}{p.manager_email ? <> · מאשרים: <span dir="ltr">{p.manager_email}</span></> : null}</span>
                    </span>
                    <b style={{ whiteSpace: 'nowrap' }}>{fmtMoney(p.price, p.currency)}</b>
                    <StatusChip status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === 'log' && (runs.length === 0 ? <div className="empty-calm"><b>עוד אין ריצות</b></div> : (
        <ul className="simple-list">
          {runs.map((r) => (
            <li key={r.id}>
              <span className={`dot ${r.ok ? 'ok' : 'fail'}`} title={r.ok ? 'תקין' : 'נכשל'} />
              <span className="grow">
                <b dir="ltr">{r.job}</b>
                <span className="sub" dir="auto" style={{ wordBreak: 'break-word' }}>{runLine(r)}</span>
              </span>
              <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

function Overview({ k, onReports }: { k: Kpis; onReports: () => void }) {
  const cost = k.ai_runs_week * COST_PER_AI_RUN
  const max = Math.max(1, ...k.by_source.map((s) => s.n))
  return (
    <>
      <p className="ov-lead">האוטומציה עושה את העבודה, והכול עולה לאוויר לבד. כאן רק מתקנים מה שדווח.</p>
      <div className="stat-row">
        <button className="stat stat-btn" onClick={onReports}>
          <b>{k.reports_open}</b><span>דיווחים פתוחים</span>
        </button>
        <div className="stat"><b>{k.collected_week}</b><span>נאספו השבוע, מ-{k.sources_active} מקורות</span></div>
        <div className="stat"><b>{k.broken_week}</b><span>קישורים שבורים שירדו</span></div>
        <div className="stat stat-ai">
          <b>{k.ai_runs_week}</b><span>ריצות AI השבוע</span>
          <span className="ov-cost">הערכה: כ-${cost.toFixed(2)} לפי מחירי היום, מתוך תקרה של ${MONTHLY_CAP} בחודש</span>
        </div>
        <div className={`stat${k.failures_week ? ' stat-warn' : ''}`}><b>{k.failures_week}</b><span>כשלים השבוע{k.reports_open ? ` · ${k.reports_open} דיווחים פתוחים` : ''}</span></div>
      </div>

      <div className="ov-grid">
        <section className="card">
          <h2 className="ov-h">מאיפה הגיע התוכן השבוע</h2>
          {k.by_source.length === 0 ? <p className="small muted">השבוע עוד לא נאסף תוכן חדש.</p> : (
            <ul className="ov-bars" aria-label="פריטים שנאספו השבוע לפי מקור">
              {k.by_source.map((s) => (
                <li key={s.source_name} title={`${s.source_name}: ${s.n}`}>
                  <span className="ov-bar-label" dir="auto">{s.source_name}</span>
                  <span className="ov-bar-track"><i style={{ width: `${(s.n / max) * 100}%` }} /></span>
                  <b className="ov-bar-num">{s.n}</b>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="ov-h">יומן ריצות</h2>
          <ul className="ov-runs">
            {k.last_runs.map((r, i) => (
              <li key={i}>
                <span className={`dot ${r.ok ? 'ok' : 'fail'}`} title={r.ok ? 'תקין' : 'נכשל'} />
                <b dir="ltr">{r.job}</b>
                <span className="small muted">{new Date(r.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="ov-h">אחריות</h2>
          <ul className="ov-own">
            <li><span className="dot ok" /> בעלים: L&amp;D/HR. עד שייקבע, <span dir="ltr">{OWNER}</span></li>
            <li><span className="dot ok" /> הכול רץ בחשבונות של zap, וכל כשל שולח התראה לבעלים</li>
            <li><span className="dot wait" /> כלי ה-AI: לאשר מול אבטחת מידע לפני העלייה לאוויר</li>
          </ul>
        </section>
      </div>
    </>
  )
}
