import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, PurchaseResult, fmtMoney, supabase, track } from '../lib'
import { Empty, ItemMeta, Skeletons } from '../components/ui'
import { BuyResult, ManagerPrompt, buy } from '../components/budget'
import { Comments, ReactionBar } from '../components/social'
import { earn } from '../components/points'

export default function ItemPage() {
  const { id } = useParams()
  const itemId = Number(id)
  const { profile, topics } = useApp()
  const location = useLocation()
  const [item, setItem] = useState<Item | null | undefined>(undefined)
  const [done, setDone] = useState<number[]>([])
  const [saved, setSaved] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [note, setNote] = useState('')
  const [reported, setReported] = useState(false)
  const [price, setPrice] = useState<{ price: number; currency: string } | null>(null)
  const [buyOpen, setBuyOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [buying, setBuying] = useState(false)
  const [bought, setBought] = useState<PurchaseResult | null>(null)
  const [needManager, setNeedManager] = useState(false)
  const [buyErr, setBuyErr] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('items').select(ITEM_COLS).eq('id', itemId).maybeSingle(),
      supabase.from('progress').select('lessons_done').eq('user_id', profile.user_id).eq('item_id', itemId).maybeSingle(),
      supabase.from('saves').select('item_id').eq('user_id', profile.user_id).eq('item_id', itemId).maybeSingle(),
    ]).then(([it, pr, sv]) => {
      if (!alive) return
      setItem((it.data as Item) ?? null)
      setDone((pr.data as { lessons_done: number[] } | null)?.lessons_done ?? [])
      setSaved(!!sv.data)
    })
    // Price is optional and fetched on its own, so a missing column never breaks the page.
    supabase.from('items').select('price,currency').eq('id', itemId).maybeSingle().then(({ data, error }) => {
      const row = data as { price: number | null; currency: string } | null
      if (alive && !error && row && row.price != null) setPrice({ price: Number(row.price), currency: row.currency })
    })
    track(itemId, 'open')
    earn('open')
    return () => { alive = false }
  }, [itemId, profile.user_id])

  async function toggleLesson(idx: number) {
    const next = done.includes(idx) ? done.filter((d) => d !== idx) : [...done, idx].sort((a, b) => a - b)
    setDone(next)
    if (next.length > done.length) {
      earn('lesson')
      const total = item?.lesson_plan?.length ?? 0
      if (total > 0 && next.length >= total) earn('course_done')
    }
    await supabase.from('progress').upsert({
      user_id: profile.user_id, item_id: itemId, lessons_done: next, updated_at: new Date().toISOString(),
    })
  }

  async function toggleSave() {
    if (saved) {
      setSaved(false)
      await supabase.from('saves').delete().eq('user_id', profile.user_id).eq('item_id', itemId)
    } else {
      setSaved(true)
      await supabase.from('saves').insert({ user_id: profile.user_id, item_id: itemId })
      track(itemId, 'save')
      earn('save')
    }
  }

  async function sendReport(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('report_item', { p_item: itemId, p_note: note.trim() })
    if (!error) { setReported(true); setReportOpen(false) }
  }

  async function purchase() {
    if (!item || !price) return
    setBuying(true); setBuyErr(false); setNeedManager(false)
    const r = await buy({
      item_id: item.id, title: item.title_he, url: item.source_url, category: 'course', price: price.price,
      reason: reason.trim() || undefined,
    })
    setBuying(false)
    if (r === 'no_manager') setNeedManager(true)
    else if (r === 'error') setBuyErr(true)
    else { setBought(r); setBuyOpen(false) }
  }

  function toComments() {
    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (item && location.hash === '#comments') setTimeout(toComments, 300)
  }, [item, location.hash])

  if (item === undefined) return <div style={{ marginTop: 28 }}><Skeletons n={1} /></div>
  if (item === null) return <Empty>הפריט הזה כבר לא זמין. אולי הקישור שלו נשבר, או שהוא בבדיקה.</Empty>

  const lessons = item.lesson_plan ?? []
  const pct = lessons.length ? done.length / lessons.length : 0
  const topic = topics.find((t) => t.slug === item.topic_slug)

  return (
    <article style={{ maxWidth: 760 }}>
      <div className="small" style={{ marginTop: 24 }}>
        {topic && <Link to={`/topic/${topic.slug}`}>{topic.name_he}</Link>}
      </div>
      <h1 style={{ fontWeight: 900, fontSize: 'clamp(24px, 5vw, 34px)', lineHeight: 1.2, margin: '8px 0', color: 'var(--navy)' }}>
        {item.title_he}
      </h1>
      {item.title_orig && <div className="small muted" dir="auto">{item.title_orig}</div>}
      <ItemMeta item={item} />
      {item.verticals.length > 0 && (
        <div className="chips">{item.verticals.map((v) => <span key={v} className="badge">{v}</span>)}</div>
      )}

      {item.summary_he && <p style={{ fontSize: 17, marginTop: 18 }}>{item.summary_he}</p>}
      {item.why_he && (
        <div className="notice info" style={{ marginTop: 12 }}>
          <b style={{ fontWeight: 800 }}>למה זה שווה לכם: </b>{item.why_he}
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <a className="btn" href={item.source_url} target="_blank" rel="noopener noreferrer" onClick={() => track(itemId, 'click_source')}>
          {item.kind === 'course' ? 'לקורס המקורי ←' : 'למקור ←'}
        </a>
        <button className="btn ghost" onClick={toggleSave}>{saved ? 'שמור אצלכם ✓' : 'שמירה לאחר כך'}</button>
      </div>
      <ReactionBar item={item} onComments={toComments} />

      {price && (
        <section className="card buy" style={{ marginTop: 18 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><span className="muted small">מחיר </span><b className="price">{fmtMoney(price.price, price.currency)}</b></div>
            {!bought && !buyOpen && <button className="btn green" onClick={() => setBuyOpen(true)}>לקנות מהתקציב</button>}
          </div>
          {buyOpen && !bought && (
            <div style={{ marginTop: 12 }}>
              <label className="field">
                <span>למה זה שווה לכם? <small className="muted">לא חובה, אבל עוזר אם צריך אישור</small></span>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="למשל: מכין אותי לקמפיין של הרבעון הבא" />
              </label>
              <div className="row">
                <button className="btn green" disabled={buying} onClick={purchase}>{buying ? 'בודקים תקציב' : `לאשר רכישה של ${fmtMoney(price.price, price.currency)}`}</button>
                <button className="btn ghost" onClick={() => setBuyOpen(false)}>ביטול</button>
              </div>
            </div>
          )}
          {needManager && <ManagerPrompt onSaved={purchase} />}
          {buyErr && <div className="notice err" style={{ marginTop: 10 }}>משהו נתקע בדרך. נסו שוב עוד רגע.</div>}
          {bought && <BuyResult result={bought} url={item.source_url} />}
          <div className="small muted" style={{ marginTop: 10 }}>
            עד גובה התקציב החודשי זה מאושר מיד. מעל זה, הבקשה הולכת ישר למנהל/ת. <Link to="/budget">התקציב שלי ←</Link>
          </div>
        </section>
      )}

      {lessons.length > 0 && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2 style={{ fontWeight: 900, fontSize: 19, margin: '0 0 6px' }}>מערך השיעור</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>מסמנים כל שיעור שסיימתם, וככה zap UP זוכר איפה עצרתם.</p>
          <div className="bar"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
          <div className="small muted" style={{ margin: '4px 0 6px' }}>{done.length} מתוך {lessons.length} שיעורים</div>
          <ul className="lessons">
            {lessons.map((l, idx) => (
              <li key={idx}>
                <input type="checkbox" id={`l${idx}`} checked={done.includes(idx)} onChange={() => toggleLesson(idx)} />
                <label htmlFor={`l${idx}`} style={{ flex: 1, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 600 }}>{idx + 1}. {l.title_he}</div>
                  {l.title_orig && <div className="orig">{l.title_orig}</div>}
                </label>
                {l.minutes ? <span className="small muted">{l.minutes} דק׳</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Comments item={item} myId={profile.user_id} />

      <div style={{ marginTop: 24 }}>
        {reported ? (
          <div className="notice ok">תודה. העברנו את הפריט לבדיקה, והוא יחזור אחרי שנתקן.</div>
        ) : reportOpen ? (
          <form className="card" onSubmit={sendReport}>
            <label className="field">
              <span>מה לא מסתדר?</span>
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: התקציר לא תואם לקורס, או שהקישור לא עובד" />
            </label>
            <div className="row">
              <button className="btn red" disabled={!note.trim()}>שליחה</button>
              <button type="button" className="btn ghost" onClick={() => setReportOpen(false)}>ביטול</button>
            </div>
          </form>
        ) : (
          <button className="chip" onClick={() => setReportOpen(true)}>⚑ דווח על טעות</button>
        )}
      </div>
    </article>
  )
}
