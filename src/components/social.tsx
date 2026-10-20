import { useEffect, useState } from 'react'
import { Layer } from './Layer'
import { Avatar, useFaces } from './Avatar'
import { Link } from 'react-router-dom'
import { Item, callFn, supabase } from '../lib'
import { earn } from './points'
import { IClose, IComment, IShare, IThumbDown, IThumbUp } from './icons'

export type Social = { likes: number; dislikes: number; comments_count: number; shares_count: number; mine: 1 | -1 | null }

// Cards ask for their counters one by one; we batch every request made in the same tick
// into a single query, so a page of 30 cards costs two round trips, not sixty.
const store = new Map<number, Social>()
const listeners = new Set<() => void>()
let pending = new Set<number>()
let timer: ReturnType<typeof setTimeout> | null = null
let available: boolean | null = null // false when the social tables aren't there yet

function emit() { listeners.forEach((l) => l()) }

async function flush() {
  timer = null
  const ids = [...pending]
  pending = new Set()
  if (!ids.length || available === false) return
  const [counts, mine] = await Promise.all([
    supabase.from('items').select('id,likes,dislikes,comments_count,shares_count').in('id', ids),
    supabase.from('reactions').select('item_id,value').in('item_id', ids),
  ])
  if (counts.error) { available = false; emit(); return }
  available = true
  const myMap = new Map(((mine.data ?? []) as { item_id: number; value: 1 | -1 }[]).map((r) => [r.item_id, r.value]))
  for (const row of (counts.data ?? []) as (Omit<Social, 'mine'> & { id: number })[]) {
    store.set(row.id, {
      likes: row.likes, dislikes: row.dislikes, comments_count: row.comments_count, shares_count: row.shares_count,
      mine: myMap.get(row.id) ?? null,
    })
  }
  emit()
}

export const getSocial = (id: number) => store.get(id) ?? null

export function setSocial(id: number, patch: Partial<Social>) {
  const cur = store.get(id)
  if (cur) { store.set(id, { ...cur, ...patch }); emit() }
}

export function useSocial(id: number): Social | null {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    if (!store.has(id) && available !== false) {
      pending.add(id)
      if (!timer) timer = setTimeout(flush, 0)
    }
    return () => { listeners.delete(l) }
  }, [id])
  return available === false ? null : store.get(id) ?? null
}

export async function react(id: number, value: 1 | -1) {
  const cur = store.get(id)
  // Pressing the same reaction again removes it, and removing earns nothing.
  if (cur?.mine !== value) earn('react')
  if (cur) {
    // Optimistic: flip locally, then trust the server's counters.
    const was = cur.mine
    const next = was === value ? null : value
    setSocial(id, {
      mine: next,
      likes: cur.likes + (next === 1 ? 1 : 0) - (was === 1 ? 1 : 0),
      dislikes: cur.dislikes + (next === -1 ? 1 : 0) - (was === -1 ? 1 : 0),
    })
  }
  const { data, error } = await supabase.rpc('react', { p_item: id, p_value: value })
  if (!error && data) {
    const d = data as { likes: number; dislikes: number; mine: 1 | -1 | null }
    setSocial(id, { likes: d.likes, dislikes: d.dislikes, mine: d.mine })
  }
}

// compact (cards): just like + share, counts stay quiet. Full bar on the item page.
export function ReactionBar({ item, onComments, compact }: { item: Item; onComments?: () => void; compact?: boolean }) {
  const s = useSocial(item.id)
  const [sharing, setSharing] = useState(false)
  if (!s || item.kind === 'internal') return null
  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }
  return (
    <>
      <div className={`reactbar${compact ? ' compact' : ''}`}>
        <button className={`rb ${s.mine === 1 ? 'on' : ''}`} aria-label={`אהבתי, ${s.likes}`} aria-pressed={s.mine === 1}
          onClick={(e) => { stop(e); react(item.id, 1) }}><IThumbUp size={18} />{(!compact || s.likes > 0) && <span>{s.likes}</span>}</button>
        {!compact && <button className={`rb ${s.mine === -1 ? 'on neg' : ''}`} aria-label={`לא בשבילי, ${s.dislikes}`} aria-pressed={s.mine === -1}
          onClick={(e) => { stop(e); react(item.id, -1) }}><IThumbDown size={18} /><span>{s.dislikes}</span></button>}
        {compact ? null : onComments ? (
          <button className="rb" aria-label={`תגובות, ${s.comments_count}`} onClick={(e) => { stop(e); onComments() }}><IComment size={18} /><span>{s.comments_count}</span></button>
        ) : (
          <Link className="rb" aria-label={`תגובות, ${s.comments_count}`} to={`/item/${item.id}#comments`}><IComment size={18} /><span>{s.comments_count}</span></Link>
        )}
        <button className="rb share" aria-label={`שיתוף${s.shares_count ? `, שותף ${s.shares_count} פעמים` : ''}`} title="שיתוף"
          onClick={(e) => { stop(e); setSharing(true) }}><IShare size={18} />{!compact && s.shares_count ? <span>{s.shares_count}</span> : null}</button>
      </div>
      {sharing && <ShareSheet item={item} onClose={() => setSharing(false)} />}
    </>
  )
}

type Person = { user_id: string; name: string; email: string; role: string | null }

export function ShareSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const [mode, setMode] = useState<'pick' | 'colleague'>('pick')
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [to, setTo] = useState<Person | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ msg: string; link?: string } | null>(null)
  const [err, setErr] = useState('')
  const face = useFaces(people.map((p) => p.user_id))

  useEffect(() => {
    if (mode !== 'colleague') return
    const t = setTimeout(() => {
      supabase.rpc('people', { p_q: q.trim() }).then(({ data }) => setPeople((data as Person[]) ?? []))
    }, 200)
    return () => clearTimeout(t)
  }, [q, mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send(channel: 'colleague' | 'teams' | 'link') {
    setBusy(true); setErr('')
    try {
      const r = await callFn<{ ok: boolean; link: string }>('share', {
        item_id: item.id, channel, to_user: to?.user_id, note: note.trim() || undefined,
      })
      setSocial(item.id, { shares_count: (store.get(item.id)?.shares_count ?? 0) + 1 })
      earn('share')
      if (channel === 'link') {
        let copied = false
        try { await navigator.clipboard.writeText(r.link); copied = true } catch { /* show it instead */ }
        setDone(copied ? { msg: 'הקישור הועתק. אפשר להדביק איפה שרוצים.' } : { msg: 'הנה הקישור:', link: r.link })
      } else if (channel === 'teams') {
        setDone({ msg: 'נשלח לערוץ "קורה ב-zap" ב-Teams.' })
      } else {
        setDone({ msg: `נשלח ל${to?.name}. זה יחכה בבית שלהם ב-zap UP, וגם במייל.` })
      }
    } catch {
      setErr('השיתוף לא עבר. נסו שוב עוד רגע.')
    }
    setBusy(false)
  }

  return (
    <Layer>
    <div className="sheet-wrap" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose() }}>
      <div className="sheet card" role="dialog" aria-label="שיתוף" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>שיתוף</h3>
          <button className="icon-btn" onClick={onClose} aria-label="לסגור"><IClose /></button>
        </div>
        <p className="small muted" style={{ margin: '4px 0 12px' }}>{item.title_he}</p>

        {done ? (
          <>
            <div className="notice ok">{done.msg}</div>
            {done.link && <input className="input" dir="ltr" readOnly value={done.link} onFocus={(e) => e.target.select()} style={{ marginTop: 8 }} />}
            <button className="btn block" style={{ marginTop: 12 }} onClick={onClose}>לסגור</button>
          </>
        ) : mode === 'pick' ? (
          <div className="sheet-opts">
            <button className="btn ghost block" onClick={() => setMode('colleague')}>לעמית או עמיתה</button>
            <button className="btn ghost block" disabled={busy} onClick={() => send('teams')}>לערוץ "קורה ב-zap" ב-Teams</button>
            <button className="btn ghost block" disabled={busy} onClick={() => send('link')}>להעתיק קישור</button>
          </div>
        ) : (
          <>
            {to ? (
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="badge">{to.name}{to.role ? ` · ${to.role}` : ''}</span>
                <button className="chip" onClick={() => setTo(null)}>להחליף</button>
              </div>
            ) : (
              <>
                <input className="input" autoFocus placeholder="שם או מייל" value={q} onChange={(e) => setQ(e.target.value)} />
                <ul className="people">
                  {people.map((p) => (
                    <li key={p.user_id}>
                      <button onClick={() => setTo(p)} className="person-btn">
                        <Avatar face={face(p.user_id) ?? { user_id: p.user_id, name: p.name }} size={30} />
                        <b>{p.name}</b> <span className="small muted">{p.role ?? ''}</span>
                        <div className="small muted" dir="ltr">{p.email}</div>
                      </button>
                    </li>
                  ))}
                  {people.length === 0 && <li className="small muted" style={{ padding: 8 }}>לא מצאנו. אולי עוד לא נכנסו ל-zap UP.</li>}
                </ul>
              </>
            )}
            <label className="field" style={{ marginTop: 10 }}>
              <span>כמה מילים משלכם <small className="muted">לא חובה</small></span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: זה בדיוק מה שדיברנו עליו" />
            </label>
            <div className="row">
              <button className="btn" disabled={!to || busy} onClick={() => send('colleague')}>{busy ? 'שולחים' : 'לשלוח'}</button>
              <button className="btn ghost" onClick={() => setMode('pick')}>לחזור</button>
            </div>
          </>
        )}
        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    </div>
    </Layer>
  )
}

type Comment = { id: number; user_id: string; author_name: string; body: string; at: string }

// "@" in a comment opens a colleague picker; whoever is still @mentioned when it's posted gets an email.
export function Comments({ item, myId, bare, onCount }: { item: Item; myId: string; bare?: boolean; onCount?: (n: number) => void }) {
  const [list, setList] = useState<Comment[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [reported, setReported] = useState<number[]>([])
  const [mq, setMq] = useState<string | null>(null) // the text after "@" while picking
  const [matches, setMatches] = useState<Person[]>([])
  const [mentioned, setMentioned] = useState<Person[]>([])
  const [notified, setNotified] = useState('')
  const face = useFaces([...(list ?? []).map((c) => c.user_id), ...matches.map((m) => m.user_id)])

  useEffect(() => {
    supabase.from('comments').select('id,user_id,author_name,body,at').eq('item_id', item.id).order('at')
      .then(({ data, error }) => setList(error ? null : (data as Comment[]) ?? []))
  }, [item.id])

  useEffect(() => { if (list) onCount?.(list.length) }, [list?.length])

  useEffect(() => {
    if (mq === null) { setMatches([]); return }
    const t = setTimeout(() => {
      supabase.rpc('people', { p_q: mq }).then(({ data }) => setMatches(((data as Person[]) ?? []).slice(0, 6)))
    }, 150)
    return () => clearTimeout(t)
  }, [mq])

  if (list === null || item.kind === 'internal') return null

  function onType(v: string) {
    setBody(v)
    const m = v.match(/(?:^|\s)@([^\s@]{0,20})$/)
    setMq(m ? m[1] : null)
  }

  function pick(p: Person) {
    setBody((b) => b.replace(/@([^\s@]{0,20})$/, `@${p.name} `))
    setMentioned((m) => (m.some((x) => x.user_id === p.user_id) ? m : [...m, p]))
    setMq(null)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    const text = body.trim()
    const { data, error } = await supabase.rpc('add_comment', { p_item: item.id, p_body: text })
    setBusy(false)
    if (error || !data) return
    setList((l) => [...(l ?? []), data as Comment])
    earn('comment')
    setBody('')
    setSocial(item.id, { comments_count: (store.get(item.id)?.comments_count ?? 0) + 1 })
    const toTell = mentioned.filter((p) => p.user_id !== myId && text.includes(`@${p.name}`))
    setMentioned([])
    if (toTell.length) {
      await Promise.all(toTell.map((p) => callFn('share', { item_id: item.id, channel: 'colleague', to_user: p.user_id, note: text }).catch(() => null)))
      setNotified(`שלחנו התראה במייל: ${toTell.map((p) => p.name).join(', ')}`)
      setTimeout(() => setNotified(''), 4000)
    }
  }

  async function remove(id: number) {
    setList((l) => (l ?? []).filter((c) => c.id !== id))
    await supabase.from('comments').delete().eq('id', id)
    setSocial(item.id, { comments_count: Math.max(0, (store.get(item.id)?.comments_count ?? 1) - 1) })
  }

  async function report(id: number) {
    setReported((r) => [...r, id])
    await supabase.rpc('report_comment', { p_comment: id })
  }

  return (
    <section id="comments" className={bare ? 'card itab-body' : 'card'} style={bare ? undefined : { marginTop: 24 }}>
      {!bare && <h2 style={{ fontWeight: 900, fontSize: 19, margin: '0 0 10px' }}>מה אומרים פה</h2>}
      {list.length === 0 && <p className="small muted">עוד אין תגובות. מה לקחתם מזה?</p>}
      <ul className="comments">
        {list.map((c) => (
          <li key={c.id}>
            <div className="row" style={{ gap: 6 }}>
              <Avatar face={face(c.user_id) ?? { user_id: c.user_id, name: c.author_name }} size={28} />
              <b>{c.author_name}</b>
              <span className="small muted">{new Date(c.at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>
              <span style={{ marginInlineStart: 'auto' }} />
              {c.user_id === myId ? (
                <button className="linkbtn small" onClick={() => remove(c.id)}>למחוק</button>
              ) : reported.includes(c.id) ? (
                <span className="small muted">קיבלנו, תודה</span>
              ) : (
                <button className="linkbtn small" onClick={() => report(c.id)}>לדווח</button>
              )}
            </div>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{c.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={add} style={{ marginTop: 12 }}>
        <div className="mention-wrap">
          <textarea className="textarea" maxLength={1000} value={body} onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setMq(null) }}
            placeholder="שווה? לא שווה? טיפ למי שמתחיל? אפשר לתייג עם @" style={{ minHeight: 70 }} aria-describedby="mention-hint" />
          {mq !== null && matches.length > 0 && (
            <ul className="mention-pick" role="listbox" aria-label="לתייג עמית או עמיתה">
              {matches.map((p) => (
                <li key={p.user_id}>
                  <button type="button" role="option" aria-selected="false" onClick={() => pick(p)}>
                    <Avatar face={face(p.user_id) ?? { user_id: p.user_id, name: p.name }} size={26} />
                    <b>{p.name}</b> <span className="small muted">{p.role ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span id="mention-hint" className="small muted">תיוג שולח את התגובה במייל.</span>
        <div><button className="btn" style={{ marginTop: 8 }} disabled={!body.trim() || busy}>{busy ? 'מפרסמים' : 'לפרסם תגובה'}</button></div>
        {notified && <div className="notice ok mention-toast" role="status">{notified}</div>}
      </form>
    </section>
  )
}

// Ranked feed (team-aware). Null when the ranking isn't available, so callers can fall back.
export type FeedRow = { id: number; score: number; popular_with: string | null; shared_by: string | null }
export async function loadFeed(limit: number, topic?: string | null, kind?: string | null): Promise<FeedRow[] | null> {
  const { data, error } = await supabase.rpc('feed', { p_limit: limit, p_topic: topic ?? null, p_kind: kind ?? null })
  if (error) return null
  return (data as FeedRow[]) ?? []
}

export function reasonChips(r?: FeedRow | null): string[] {
  if (!r) return []
  const out: string[] = []
  if (r.shared_by) out.push(`המלצה מ-${r.shared_by}`)
  if (r.popular_with) out.push(`פופולרי אצל ${r.popular_with}`)
  return out
}
