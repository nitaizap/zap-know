import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App'
import { CATEGORY_LABEL, ITEM_COLS, Item, Purchase, Source, fmtDate, fmtMoney, supabase } from '../lib'
import { Empty, Headline, ItemMeta } from '../components/ui'
import { StatusChip } from '../components/budget'

type Report = { id: number; item_id: number; note: string | null; resolved: boolean; at: string }
type Run = { id: number; job: string; ok: boolean; detail: unknown; at: string }
type BudgetSettings = { monthly_amount: number; currency: string; rollover: boolean; is_placeholder: boolean }

const SECONDS_PER_ITEM = 20

export default function Admin() {
  const { profile } = useApp()
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

    // Budget tables may not exist yet; the section just stays hidden.
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

  if (!profile.is_admin) return <Empty>המסך הזה פתוח לצוות L&D בלבד.</Empty>

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

  return (
    <div>
      <Headline light="15 דקות בשבוע," black="והתוכן באוויר" hand="זאפ קטן וסיימנו" />

      <h2 className="section">ממתינים לאישור <small>{left} פריטים, בערך {minutes} דקות</small></h2>
      {queue === null ? <div className="skeleton" /> : !current ? (
        <Empty>אין מה לאשר. כל הכבוד, סיימתם להשבוע.</Empty>
      ) : (
        <>
          <div className="swipe-hint small"><span className="muted">→ החלקה ימינה: לדחות</span><span className="muted">החלקה שמאלה: לאשר ←</span></div>
          <div className="swipe-stage">
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
                  <h3 style={{ fontSize: 20 }}>{current.title_he}</h3>
                  {current.title_orig && <div className="small muted" dir="auto">{current.title_orig}</div>}
                  <p style={{ marginTop: 10 }}>{current.summary_he}</p>
                  {current.why_he && <p className="small muted" style={{ marginTop: 8 }}>למה זה שווה: {current.why_he}</p>}
                  {current.lesson_plan?.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>{current.lesson_plan.length} שיעורים במערך</p>}
                  {reports.some((r) => r.item_id === current.id) && (
                    <div className="notice err small" style={{ marginTop: 10 }}>
                      דיווח: {reports.filter((r) => r.item_id === current.id).map((r) => r.note).join(' / ')}
                    </div>
                  )}
                  <a className="small" href={current.source_url} target="_blank" rel="noopener noreferrer" onPointerDown={(e) => e.stopPropagation()}>
                    לבדיקה במקור ←
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn red" onClick={() => decide('rejected')}>לדחות</button>
            {editing ? (
              <button className="btn yellow" onClick={() => decide('approved', draft)}>לשמור ולאשר</button>
            ) : (
              <button className="btn ghost" onClick={startEdit}>לתקן</button>
            )}
            <button className="btn green" onClick={() => decide('approved')}>לאשר</button>
          </div>
        </>
      )}

      <h2 className="section">מקורות חדשים שה-AI מציע</h2>
      {sources.length === 0 ? <Empty>אין הצעות חדשות כרגע.</Empty> : (
        <div className="grid two">
          {sources.map((s) => (
            <div key={s.id} className="card">
              <span className="badge">{s.kind}</span>
              <h3>{s.name}</h3>
              {s.reason_he && <p className="small muted">{s.reason_he}</p>}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn green" onClick={() => setSource(s.id, 'active')}>להוסיף</button>
                <button className="btn ghost" onClick={() => setSource(s.id, 'dropped')}>לא עכשיו</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="section">דיווחים פתוחים <small>פריט שדווח חוזר לתור האישור</small></h2>
      {reports.length === 0 ? <Empty>אין דיווחים פתוחים.</Empty> : (
        <div className="card">
          <table className="log"><tbody>
            {reports.map((r) => <tr key={r.id}><td>#{r.item_id}</td><td>{r.note}</td><td className="muted">{fmtDate(r.at)}</td></tr>)}
          </tbody></table>
        </div>
      )}

      {settings && (
        <>
          <h2 className="section">תקציב הלמידה</h2>
          <div className="grid two">
            <form className="card" onSubmit={saveSettings}>
              <label className="field"><span>סכום חודשי לכל עובד/ת (₪)</span>
                <input className="input" type="number" min="0" step="1" dir="ltr" value={amount}
                  onChange={(e) => { setAmount(e.target.value); setSavedSettings(false) }} />
              </label>
              <label className="switch">
                <input type="checkbox" checked={rollover} onChange={(e) => { setRollover(e.target.checked); setSavedSettings(false) }} />
                יתרה שלא נוצלה עוברת לחודש הבא
              </label>
              <div className="row">
                <button className="btn">לשמור</button>
                {savedSettings && <span className="small muted">נשמר. העובדים רואים את הסכום החדש.</span>}
              </div>
              {settings.is_placeholder && !savedSettings && (
                <div className="notice demo small" style={{ marginTop: 10 }}>זה עדיין סכום לדוגמה. ברגע שתשמרו, הוא הופך לסכום האמיתי.</div>
              )}
            </form>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>החודש</h3>
              <div className="budget-num">
                <b>{fmtMoney(purchases.filter((p) => ['auto_approved', 'approved', 'purchased'].includes(p.status)).reduce((a, p) => a + Number(p.price), 0), settings.currency)}</b>
                <span className="muted"> אושרו</span>
              </div>
              <div className="small muted">
                {purchases.length} רכישות ובקשות · {purchases.filter((p) => p.status === 'pending_manager').length} מחכות למנהלים
              </div>
            </div>
          </div>

          <h2 className="section">רכישות החודש</h2>
          {purchases.length === 0 ? <Empty>עוד אין רכישות החודש.</Empty> : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="log">
                <thead><tr><th>מה</th><th>סוג</th><th>מחיר</th><th>מצב</th><th>מנהל/ת</th><th>מתי</th></tr></thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td><a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a></td>
                      <td>{CATEGORY_LABEL[p.category]}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtMoney(p.price, p.currency)}</td>
                      <td><StatusChip status={p.status} /></td>
                      <td dir="ltr" className="small">{p.manager_email ?? ''}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h2 className="section">יומן ריצות</h2>
      {runs.length === 0 ? <Empty>עוד אין ריצות.</Empty> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="log">
            <thead><tr><th>מתי</th><th>תהליך</th><th>מצב</th><th>פרטים</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('he-IL')}</td>
                  <td dir="ltr">{r.job}</td>
                  <td><span className={`badge ${r.ok ? 'ok' : 'fail'}`}>{r.ok ? 'תקין' : 'נכשל'}</span></td>
                  <td className="small" dir="ltr" style={{ maxWidth: 360, wordBreak: 'break-word' }}>{r.detail ? JSON.stringify(r.detail).slice(0, 200) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
