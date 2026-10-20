import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, PurchaseResult, fmtMoney, supabase, track } from '../lib'
import { Empty, ItemMeta, MediaHero, Skeletons } from '../components/ui'
import { Listen } from '../components/Listen'
import { BuyResult, ManagerPrompt, buy } from '../components/budget'
import { Comments, ReactionBar } from '../components/social'
import { earn } from '../components/points'
import { AudioPlayer } from '../components/AudioPlayer'
import { Remind } from '../components/Remind'
import { IHeadphones } from '../components/icons'
import { TypeBadge } from '../components/TypeBadge'

export default function ItemPage() {
  const { id } = useParams()
  return <ItemDetail itemId={Number(id)} />
}

// Everything about one item. Embedded (the feed's panel or sheet), it skips the media the card
// already shows and never navigates away; only the source itself opens, in a new tab.
export function ItemDetail({ itemId, embedded }: { itemId: number; embedded?: boolean }) {
  const { profile, topics } = useApp()
  const location = useLocation()
  const [item, setItem] = useState<Item | null | undefined>(undefined)
  const [done, setDone] = useState<number[]>([])
  const [saved, setSaved] = useState(false)
  const [later, setLater] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [note, setNote] = useState('')
  const [reported, setReported] = useState(false)
  const [why, setWhy] = useState('')
  const [tab, setTab] = useState<'talk' | 'notes'>('talk')
  const [talkCount, setTalkCount] = useState<number | null>(null)
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
      supabase.from('listen_later').select('item_id').eq('user_id', profile.user_id).eq('item_id', itemId).maybeSingle(),
    ]).then(([it, pr, sv, ll]) => {
      if (!alive) return
      setItem((it.data as Item) ?? null)
      setDone((pr.data as { lessons_done: number[] } | null)?.lessons_done ?? [])
      setSaved(!!sv.data)
      setLater(!ll.error && !!ll.data)
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

  // "להאזין אחר כך": queued items land in the personal podcast feed.
  async function toggleLater() {
    if (later) {
      setLater(false)
      await supabase.from('listen_later').delete().eq('user_id', profile.user_id).eq('item_id', itemId)
    } else {
      setLater(true)
      await supabase.from('listen_later').insert({ user_id: profile.user_id, item_id: itemId })
    }
  }

  async function sendReport(e: React.FormEvent) {
    e.preventDefault()
    if (!why) return
    let { error } = await supabase.rpc('report_item_reason', { p_item: itemId, p_reason: why, p_note: note.trim() || null })
    // Before the reasons patch is live, fall back to the plain report.
    if (error) ({ error } = await supabase.rpc('report_item', { p_item: itemId, p_note: [why, note.trim()].filter(Boolean).join(': ') }))
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
  if (item === null) return <Empty>התוכן הזה כבר לא זמין. אולי הקישור שלו נשבר, או שהוא אצלנו בבדיקה.</Empty>

  const lessons = item.lesson_plan ?? []
  const pct = lessons.length ? done.length / lessons.length : 0
  const topic = topics.find((t) => t.slug === item.topic_slug)

  return (
    <article className={embedded ? 'dt-item' : undefined} style={{ maxWidth: 760 }}>
      <div className="small row" style={{ marginTop: 24, gap: 8 }}>
        <TypeBadge item={item} />
        {topic && (embedded ? <span className="muted">{topic.name_he}</span> : <Link to={`/topic/${topic.slug}`}>{topic.name_he}</Link>)}
      </div>
      <h1 style={{ fontWeight: 900, fontSize: 'clamp(24px, 5vw, 34px)', lineHeight: 1.2, margin: '8px 0', color: 'var(--navy)' }}>
        {item.title_he}
      </h1>
      {item.title_orig && <div className="small muted" dir="auto">{item.title_orig}</div>}
      <ItemMeta item={item} />
      {!embedded && <MediaHero item={item} />}
      {item.kind === 'podcast' && item.audio_url
        ? <div style={{ marginTop: 16 }}><AudioPlayer src={item.audio_url} title={item.title_he} /></div>
        : <Listen kind="item" id={item.id} />}
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
        <button className="btn ghost" onClick={toggleSave}>{saved ? 'נשמר ✓' : 'לשמור לאחר כך'}</button>
        <button className={`btn ghost${later ? ' on' : ''}`} onClick={toggleLater} aria-pressed={later}>
          <IHeadphones size={18} /> {later ? 'בתור ההאזנה שלכם' : 'להאזין אחר כך'}
        </button>
        <Remind itemId={item.id} />
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
                <button className="btn ghost" onClick={() => setBuyOpen(false)}>לבטל</button>
              </div>
            </div>
          )}
          {needManager && <ManagerPrompt onSaved={purchase} />}
          {buyErr && <div className="notice err" style={{ marginTop: 10 }}>משהו נתקע בדרך. נסו שוב עוד רגע.</div>}
          {bought && <BuyResult result={bought} url={item.source_url} />}
          <div className="small muted" style={{ marginTop: 10 }}>
            עד גובה התקציב החודשי זה מאושר מיד. מעל זה, הבקשה הולכת ישר למי שמנהל אתכם. <Link to="/me#budget">התקציב שלי ←</Link>
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

      <div className="itabs" role="tablist" aria-label="דיון והערות">
        <button role="tab" aria-selected={tab === 'talk'} className={tab === 'talk' ? 'on' : ''} onClick={() => setTab('talk')}>
          דיון{talkCount !== null ? ` (${talkCount})` : ''}
        </button>
        <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>ההערות שלי</button>
      </div>
      <div hidden={tab !== 'talk'}><Comments item={item} myId={profile.user_id} bare onCount={setTalkCount} /></div>
      {tab === 'notes' && <MyNotes itemId={item.id} userId={profile.user_id} />}

      <div style={{ marginTop: 24 }}>
        {reported ? (
          <div className="notice ok">תודה. הדיווח הגיע לצוות L&D, והם יבדקו את זה.</div>
        ) : reportOpen ? (
          <form className="card" onSubmit={sendReport}>
            <b>מה לא מסתדר?</b>
            <div className="reason-chips" role="radiogroup" aria-label="סיבה">
              {REASONS.map((r) => (
                <button type="button" key={r} role="radio" aria-checked={why === r} className={why === r ? 'on' : ''} onClick={() => setWhy(r)}>{r}</button>
              ))}
            </div>
            <label className="field">
              <span>עוד משהו? <small className="muted">לא חובה</small></span>
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: בקורס עצמו יש 6 שיעורים ולא 4" />
            </label>
            <div className="row">
              <button className="btn red" disabled={!why}>לשלוח</button>
              <button type="button" className="btn ghost" onClick={() => setReportOpen(false)}>לבטל</button>
            </div>
          </form>
        ) : (
          <button className="chip" onClick={() => setReportOpen(true)}>⚑ לדווח על טעות</button>
        )}
      </div>
    </article>
  )
}

const REASONS = ['הקישור לא עובד', 'התקציר לא מדויק', 'לא רלוונטי', 'משהו אחר']

// "ההערות שלי": private, autosaved, searchable later in the personal zone.
function MyNotes({ itemId, userId }: { itemId: number; userId: string }) {
  const [body, setBody] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from('notes').select('body').eq('item_id', itemId).eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => setBody(error ? '' : ((data as { body: string } | null)?.body ?? '')))
  }, [itemId, userId])

  function onChange(v: string) {
    setBody(v)
    setState('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from('notes').upsert({ user_id: userId, item_id: itemId, body: v, updated_at: new Date().toISOString() })
      setState(error ? 'error' : 'saved')
    }, 700)
  }

  if (body === null) return <div className="card itab-body"><div className="skeleton" style={{ height: 120 }} /></div>
  return (
    <section className="card itab-body">
      <textarea className="textarea notes-area" value={body} onChange={(e) => onChange(e.target.value)}
        placeholder="מה לקחתם מזה? מה לנסות מחר? רק אתם רואים את זה." aria-label="ההערות שלי" />
      <div className="notes-meta">
        <span>רק אתם רואים את זה</span>
        <span role="status">{state === 'saving' ? 'שומרים' : state === 'saved' ? 'נשמר' : state === 'error' ? 'לא נשמר, נסו שוב' : ''}</span>
      </div>
    </section>
  )
}
