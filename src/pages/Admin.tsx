import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App'
import { CATEGORY_LABEL, ITEM_COLS, Item, Purchase, Source, fmtDate, fmtMoney, supabase } from '../lib'
import { Empty, Headline, ItemMeta } from '../components/ui'
import { StatusChip } from '../components/budget'
import '../calm.css'
import '../adopt.css'

type Report = { id: number; item_id: number; note: string | null; resolved: boolean; at: string }
type Run = { id: number; job: string; ok: boolean; detail: unknown; at: string }
type BudgetSettings = { monthly_amount: number; currency: string; rollover: boolean; is_placeholder: boolean }
type Tab = 'overview' | 'queue' | 'sources' | 'reports' | 'budget' | 'log'
type Kpis = {
  pending: number; collected_week: number; by_source: { source_name: string; n: number }[]; sources_active: number
  broken_week: number; ai_runs_week: number; failures_week: number; reports_open: number
  last_runs: { job: string; ok: boolean; at: string; detail: string }[]
}

// Honest assumptions for the cost line; the real cap is set on the AI key itself.
const COST_PER_AI_RUN = 0.01
const MONTHLY_CAP = 50
const OWNER = 'nitaiz@d.co.il'

const SECONDS_PER_ITEM = 30

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
  const [confirmAll, setConfirmAll] = useState(false)
  const [approvedAll, setApprovedAll] = useState<number | null>(null)
  const [queue, setQueue] = useState<Item[] | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ title_he: '', summary_he: '' })
  const [dx, setDx] = useState(0)
  const startX = useRef<number | null>(null)
  const [settings, setSettings] = useState<BudgetSettings | null>(null)
  const [amount, setAmount] = useState('')
  const [rollover, setRollover] = useState(false)
  const [savedSettings, setSavedSettings] = useState(false)
  const [purchases, setPurchases] = useState<Purchase[]>([])

  async function load() {
    const [q, s, r, l] = await Promise.all([
      supabase.from('items').select(ITEM_COLS).eq('status', 'pending').order('created_at').limit(100),
      supabase.from('sources').select('*').eq('status', 'proposed').order('score', { ascending: false }),
      supabase.from('reports').select('*').eq('resolved', false).order('at', { ascending: false }).limit(50),
      supabase.from('run_log').select('*').order('at', { ascending: false }).limit(30),
    ])
    setQueue((q.data as Item[]) ?? [])
    setSources((s.data as Source[]) ?? [])
    setReports((r.data as Report[]) ?? [])
    setRuns((l.data as Run[]) ?? [])
    supabase.rpc('admin_kpis').then(({ data, error }) => { if (!error && data) setKpis(data as Kpis) })

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

  const current = queue?.[0]

  async function decide(status: 'approved' | 'rejected', patch?: Partial<Item>) {
    if (!current) return
    setQueue((q) => (q ? q.slice(1) : q))
    setEditing(false); setDx(0)
    await supabase.from('items').update({ status, ...(patch ?? {}) }).eq('id', current.id)
    if (status === 'approved') {
      await supabase.from('reports').update({ resolved: true }).eq('item_id', current.id)
      setReports((r) => r.filter((x) => x.item_id !== current.id))
    }
  }

  async function approveAll() {
    setConfirmAll(false)
    const { data, error } = await supabase.rpc('approve_all_pending')
    if (!error) { setApprovedAll(Number(data ?? 0)); setQueue([]) }
  }

  function startEdit() {
    if (!current) return
    setDraft({ title_he: current.title_he, summary_he: current.summary_he ?? '' })
    setEditing(true)
  }

  async function setSource(id: number, status: 'active' | 'dropped') {
    setSources((s) => s.filter((x) => x.id !== id))
    await supabase.from('sources').update({ status }).eq('id', id)
  }

  const onDown = (x: number) => { if (!editing) startX.current = x }
  const onMove = (x: number) => { if (startX.current !== null) setDx(x - startX.current) }
  const onUp = () => {
    if (startX.current === null) return
    startX.current = null
    // RTL: swipe left = approve (forward), swipe right = reject.
    if (dx < -110) decide('approved')
    else if (dx > 110) decide('rejected')
    else setDx(0)
  }

  const left = queue?.length ?? 0
  const minutes = Math.max(1, Math.ceil((left * SECONDS_PER_ITEM) / 60))
  const approvedSum = purchases.filter((p) => ['auto_approved', 'approved', 'purchased'].includes(p.status)).reduce((a, p) => a + Number(p.price), 0)
  const pendingCount = purchases.filter((p) => p.status === 'pending_manager').length
  const failed = runs.filter((r) => !r.ok).length

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'תמונת מצב' },
    { id: 'queue', label: 'לאשר', count: left },
    { id: 'sources', label: 'מקורות', count: sources.length },
    { id: 'reports', label: 'דיווחים', count: reports.length },
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


      {tab === 'overview' && (kpis === null ? <div className="skeleton" /> : <Overview k={kpis} onQueue={() => setTab('queue')} />)}

      {tab === 'queue' && approvedAll !== null && (
        <div className="notice ok" style={{ marginTop: 12 }}>אישרתם {approvedAll} פריטים. הם כבר באוויר.</div>
      )}
      {tab === 'queue' && (queue === null ? <div className="skeleton" /> : !current ? (
        <div className="empty-calm"><b>אין מה לאשר</b>כל הכבוד, סיימתם לשבוע הזה.</div>
      ) : (
        <div className="swipe-wrap">
          <div className="swipe-progress">
            <span>עוד {left} · בערך {minutes} דק'</span>
            <span>שמאלה לאשר · ימינה לדחות</span>
          </div>
          <div
            className="card swipe-card"
            style={{
              transform: `translateX(${dx}px) rotate(${dx / 30}deg)`,
              borderColor: dx < -60 ? 'var(--green)' : dx > 60 ? 'var(--red)' : undefined,
              transition: startX.current === null ? 'transform .25s' : 'none',
            }}
            onPointerDown={(e) => onDown(e.clientX)}
            onPointerMove={(e) => onMove(e.clientX)}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => startX.current !== null && onUp()}
          >
            {editing ? (
              <div onPointerDown={(e) => e.stopPropagation()}>
                <label className="field"><span>כותרת</span>
                  <input className="input" value={draft.title_he} onChange={(e) => setDraft({ ...draft, title_he: e.target.value })} />
                </label>
                <label className="field"><span>תקציר</span>
                  <textarea className="textarea" style={{ minHeight: 200 }} value={draft.summary_he} onChange={(e) => setDraft({ ...draft, summary_he: e.target.value })} />
                </label>
              </div>
            ) : (
              <>
                <ItemMeta item={current} />
                <h3>{current.title_he}</h3>
                {current.title_orig && <div className="small muted" dir="auto">{current.title_orig}</div>}
                <p style={{ marginTop: 12, lineHeight: 1.65 }}>{current.summary_he}</p>
                {reports.some((r) => r.item_id === current.id) && (
                  <div className="notice err small" style={{ marginTop: 12 }}>
                    דיווח: {reports.filter((r) => r.item_id === current.id).map((r) => r.note).join(' / ')}
                  </div>
                )}
                <a className="textlink" style={{ display: 'inline-block', marginTop: 12 }} href={current.source_url}
                  target="_blank" rel="noopener noreferrer" onPointerDown={(e) => e.stopPropagation()}>
                  לבדוק במקור ←
                </a>
              </>
            )}
          </div>
          <div className="swipe-actions">
            <button className="btn ghost" onClick={() => decide('rejected')}>לדחות</button>
            {editing
              ? <button className="btn ghost" onClick={() => decide('approved', draft)}>לשמור ולאשר</button>
              : <button className="btn ghost" onClick={startEdit}>לתקן</button>}
            <button className="btn green" onClick={() => decide('approved')}>לאשר</button>
          </div>
          <div className="approve-all">
            {confirmAll ? (
              <>
                <span>לאשר את כל {left} הפריטים שנשארו, בלי לעבור עליהם?</span>
                <button className="btn green" onClick={approveAll}>כן, לאשר הכול</button>
                <button className="btn ghost" onClick={() => setConfirmAll(false)}>לבטל</button>
              </>
            ) : (
              <button className="linkbtn" onClick={() => setConfirmAll(true)}>לאשר את כל מה שנשאר</button>
            )}
          </div>
        </div>
      ))}

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
        <div className="empty-calm"><b>אין דיווחים פתוחים</b>פריט ששני אנשים דיווחו עליו חוזר לתור האישור.</div>
      ) : (
        <ul className="simple-list">
          {reports.map((r) => (
            <li key={r.id}>
              <span className="dot wait" />
              <span className="grow">{r.note || 'בלי הערה'}<span className="sub">פריט #{r.item_id} · {fmtDate(r.at)}</span></span>
            </li>
          ))}
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

function Overview({ k, onQueue }: { k: Kpis; onQueue: () => void }) {
  const minutes = Math.max(1, Math.ceil((k.pending * SECONDS_PER_ITEM) / 60))
  const cost = k.ai_runs_week * COST_PER_AI_RUN
  const max = Math.max(1, ...k.by_source.map((s) => s.n))
  return (
    <>
      <p className="ov-lead">האוטומציה עושה את העבודה. כאן רק מאשרים, מתקנים או דוחים.</p>
      <div className="stat-row">
        <button className="stat stat-btn" onClick={onQueue}>
          <b>{k.pending}</b><span>מחכים לאישור{k.pending ? ` · בערך ${minutes} דק'` : ''}</span>
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
