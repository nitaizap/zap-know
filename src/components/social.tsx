import { useEffect, useRef, useState } from 'react'
import { DetailLink } from './detail'
import { Layer } from './Layer'
import { Avatar, useFaces } from './Avatar'
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
          <DetailLink className="rb" label={`תגובות, ${s.comments_count}`} kind="item" id={item.id}><IComment size={18} /><span>{s.comments_count}</span></DetailLink>
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
  const [mode, setMode] = useState<'pick' | 'with'>('pick')
  const [tab, setTab] = useState<'people' | 'teams'>('people')
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [picked, setPicked] = useState<Person[]>([])
  const [teams, setTeams] = useState<{ team: string; members: string[] }[]>([])
  const [pickedTeams, setPickedTeams] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ msg: string; link?: string } | null>(null)
  const [err, setErr] = useState('')
  const face = useFaces([...people.map((p) => p.user_id), ...picked.map((p) => p.user_id)])

  useEffect(() => {
    if (mode !== 'with' || tab !== 'people') return
    const t = setTimeout(() => {
      supabase.rpc('people', { p_q: q.trim() }).then(({ data }) => setPeople((data as Person[]) ?? []))
    }, 200)
    return () => clearTimeout(t)
  }, [q, mode, tab])

  // Teams and their members (from the all-time board, which knows everyone's team).
  useEffect(() => {
    if (mode !== 'with' || tab !== 'teams' || teams.length) return
    supabase.rpc('leaderboard', { p_period: 'all', p_scope: 'people', p_limit: 300 }).then(({ data }) => {
      const m = new Map<string, string[]>()
      for (const r of (data ?? []) as { team: string | null; user_id: string | null }[]) if (r.team && r.user_id) m.set(r.team, [...(m.get(r.team) ?? []), r.user_id])
      setTeams([...m.entries()].map(([team, members]) => ({ team, members })).sort((a, b) => a.team.localeCompare(b.team, 'he')))
    })
  }, [mode, tab, teams.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send(channel: 'teams' | 'link') {
    setBusy(true); setErr('')
    try {
      const r = await callFn<{ ok: boolean; link: string }>('share', { item_id: item.id, channel, note: note.trim() || undefined })
      setSocial(item.id, { shares_count: (store.get(item.id)?.shares_count ?? 0) + 1 })
      earn('share')
      if (channel === 'link') {
        let copied = false
        try { await navigator.clipboard.writeText(r.link); copied = true } catch { /* show it instead */ }
        setDone(copied ? { msg: 'הקישור הועתק. אפשר להדביק איפה שרוצים.' } : { msg: 'הנה הקישור:', link: r.link })
      } else setDone({ msg: 'נשלח לערוץ "קורה ב-zap" ב-Teams.' })
    } catch {
      setErr('השיתוף לא עבר. נסו שוב עוד רגע.')
    }
    setBusy(false)
  }

  // To colleagues, or to whole teams (each member gets it in zap UP and by email, as a colleague share).
  async function sendWith() {
    const ids = new Set(picked.map((p) => p.user_id))
    for (const t of teams.filter((t) => pickedTeams.includes(t.team))) t.members.forEach((m) => ids.add(m))
    ids.delete(myIdCache ?? '')
    const list = [...ids].slice(0, 60)
    if (!list.length) return
    setBusy(true); setErr('')
    const res = await Promise.all(list.map((u) => callFn('share', { item_id: item.id, channel: 'colleague', to_user: u, note: note.trim() || undefined }).then(() => true, () => false)))
    const ok = res.filter(Boolean).length
    setBusy(false)
    if (!ok) { setErr('השיתוף לא עבר. נסו שוב עוד רגע.'); return }
    setSocial(item.id, { shares_count: (store.get(item.id)?.shares_count ?? 0) + 1 })
    earn('share')
    const who = [...picked.map((p) => p.name), ...pickedTeams.map((t) => `צוות ${t}`)]
    setDone({ msg: `נשלח ל${who.slice(0, 3).join(', ')}${who.length > 3 ? ` ועוד ${who.length - 3}` : ''}. זה מחכה להם ב-zap UP, וגם במייל.` })
  }

  const togglePerson = (p: Person) => setPicked((cur) => (cur.some((x) => x.user_id === p.user_id) ? cur.filter((x) => x.user_id !== p.user_id) : [...cur, p]))
  const toggleTeam = (t: string) => setPickedTeams((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
  const count = picked.length + pickedTeams.length

  return (
    <Layer>
    <div className="sheet-wrap" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose() }}>
      <div className="sheet card share-sheet" role="dialog" aria-label="שיתוף" onClick={(e) => e.stopPropagation()}>
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
            <button className="btn block" onClick={() => setMode('with')}>לשתף עם…</button>
            <button className="btn ghost block" disabled={busy} onClick={() => send('teams')}>לערוץ "קורה ב-zap" ב-Teams</button>
            <button className="btn ghost block" disabled={busy} onClick={() => send('link')}>להעתיק קישור</button>
          </div>
        ) : (
          <div className="share-with">
            <div className="share-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>חבר/ה</button>
              <button role="tab" aria-selected={tab === 'teams'} className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>צוותים</button>
            </div>
            {count > 0 && (
              <div className="share-picked">
                {picked.map((p) => <button key={p.user_id} className="chip on" onClick={() => togglePerson(p)}>{p.name} ×</button>)}
                {pickedTeams.map((t) => <button key={t} className="chip on" onClick={() => toggleTeam(t)}>צוות {t} ×</button>)}
              </div>
            )}
            <div className="share-list">
              {tab === 'people' ? (
                <>
                  <input className="input" autoFocus placeholder="שם או מייל" value={q} onChange={(e) => setQ(e.target.value)} />
                  <ul className="people">
                    {people.map((p) => {
                      const on = picked.some((x) => x.user_id === p.user_id)
                      return (
                        <li key={p.user_id}>
                          <button onClick={() => togglePerson(p)} className={`person-btn${on ? ' on' : ''}`} aria-pressed={on}>
                            <Avatar face={face(p.user_id) ?? { user_id: p.user_id, name: p.name }} size={32} />
                            <span><b>{p.name}</b> <span className="small muted">{p.role ?? ''}</span></span>
                            {on && <span className="share-check" aria-hidden>✓</span>}
                          </button>
                        </li>
                      )
                    })}
                    {people.length === 0 && <li className="small muted" style={{ padding: 8 }}>לא מצאנו. אולי עוד לא נכנסו ל-zap UP.</li>}
                  </ul>
                </>
              ) : (
                <ul className="people">
                  {teams.map((t) => {
                    const on = pickedTeams.includes(t.team)
                    return (
                      <li key={t.team}>
                        <button onClick={() => toggleTeam(t.team)} className={`person-btn${on ? ' on' : ''}`} aria-pressed={on}>
                          <Avatar face={{ user_id: `team-${t.team}`, name: t.team }} size={32} />
                          <span><b>צוות {t.team}</b> <span className="small muted">{t.members.length} אנשים</span></span>
                          {on && <span className="share-check" aria-hidden>✓</span>}
                        </button>
                      </li>
                    )
                  })}
                  {teams.length === 0 && <li className="small muted" style={{ padding: 8 }}>טוענים את הצוותים</li>}
                </ul>
              )}
            </div>
            <div className="share-foot">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="כמה מילים משלכם (לא חובה)" aria-label="כמה מילים משלכם" />
              <div className="row">
                <button className="btn" disabled={!count || busy} onClick={sendWith}>{busy ? 'שולחים' : count ? `לשלוח (${count})` : 'לשלוח'}</button>
                <button className="btn ghost" onClick={() => setMode('pick')}>לחזור</button>
              </div>
            </div>
          </div>
        )}
        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    </div>
    </Layer>
  )
}
let myIdCache: string | null = null
supabase.auth.getSession().then(({ data }) => { myIdCache = data.session?.user.id ?? null })

type Comment = { id: number; user_id: string; author_name: string; body: string; at: string; pending?: boolean }

// The conversation on an item: the list, and a composer that is always there, pinned at the
// bottom (docked) in the side panel and the phone sheet, inline on full pages.
export function Comments({ item, myId, bare, docked, autoFocus, onCount }: {
  item: Item; myId: string; bare?: boolean; docked?: boolean; autoFocus?: boolean; onCount?: (n: number) => void
}) {
  const [list, setList] = useState<Comment[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [reported, setReported] = useState<number[]>([])
  const [mq, setMq] = useState<string | null>(null) // the text after "@" while picking
  const [matches, setMatches] = useState<Person[]>([])
  const [mentioned, setMentioned] = useState<Person[]>([])
  const [notified, setNotified] = useState('')
  const [me, setMe] = useState<{ name: string; avatar_url?: string | null; avatar_style?: string | null; avatar_color?: string | null } | null>(null)
  const face = useFaces([...(list ?? []).map((c) => c.user_id), ...matches.map((m) => m.user_id), myId])
  const box = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setList(null); setFailed(false)
    supabase.from('comments').select('id,user_id,author_name,body,at').eq('item_id', item.id).order('at')
      .then(({ data, error }) => { if (error) { setFailed(true); setList([]) } else setList((data as Comment[]) ?? []) })
  }, [item.id])
  useEffect(() => {
    if (!myId) return
    supabase.from('profiles').select('display_name,email,avatar_url,avatar_style,avatar_color').eq('user_id', myId).maybeSingle()
      .then(({ data }) => { const p = data as { display_name: string | null; email: string } | null; if (p) setMe({ ...p, name: p.display_name || p.email.split('@')[0] }) })
  }, [myId])
  useEffect(() => { if (autoFocus) setTimeout(() => box.current?.focus({ preventScroll: true }), 250) }, [autoFocus, item.id])
  useEffect(() => { if (list) onCount?.(list.filter((c) => !c.pending).length) }, [list?.length])
  // New comments land at the bottom, next to the composer.
  useEffect(() => { if (docked) scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [list?.length, docked])

  useEffect(() => {
    if (mq === null) { setMatches([]); return }
    const t = setTimeout(() => {
      supabase.rpc('people', { p_q: mq }).then(({ data }) => setMatches(((data as Person[]) ?? []).slice(0, 6)))
    }, 150)
    return () => clearTimeout(t)
  }, [mq])

  function onType(v: string) {
    setBody(v)
    const m = v.match(/(?:^|\s)@([^\s@]{0,20})$/)
    setMq(m ? m[1] : null)
  }

  function pick(p: Person) {
    setBody((b) => b.replace(/@([^\s@]{0,20})$/, `@${p.name} `))
    setMentioned((m) => (m.some((x) => x.user_id === p.user_id) ? m : [...m, p]))
    setMq(null)
    box.current?.focus()
  }

  async function add(e?: React.FormEvent) {
    e?.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    setBusy(true); setErr('')
    // Optimistic: it's in the list (and the card's count) right away.
    const temp: Comment = { id: -Date.now(), user_id: myId, author_name: me?.name ?? 'אתם', body: text, at: new Date().toISOString(), pending: true }
    setList((l) => [...(l ?? []), temp])
    setBody('')
    const before = store.get(item.id)?.comments_count ?? 0
    setSocial(item.id, { comments_count: before + 1 })
    const { data, error } = await supabase.rpc('add_comment', { p_item: item.id, p_body: text })
    setBusy(false)
    if (error || !data) {
      setList((l) => (l ?? []).filter((c) => c.id !== temp.id))
      setSocial(item.id, { comments_count: before })
      setBody(text)
      setErr('התגובה לא עלתה. נסו שוב.')
      return
    }
    setList((l) => (l ?? []).map((c) => (c.id === temp.id ? (data as Comment) : c)))
    earn('comment')
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

  const myFace = face(myId) ?? { user_id: myId, ...(me ?? { name: 'אתם' }) }
  return (
    <section id="comments" className={`cmts${docked ? ' docked' : ''}${bare ? '' : ' card'}`} style={bare || docked ? undefined : { marginTop: 24 }}>
      {!bare && !docked && <h2 style={{ fontWeight: 900, fontSize: 19, margin: '0 0 10px' }}>מה אומרים פה</h2>}
      <div className="cmts-list" ref={scroller}>
        {list === null && <p className="small muted">טוענים את התגובות</p>}
        {list?.length === 0 && <p className="cmts-empty">{failed ? 'לא הצלחנו לטעון את התגובות כרגע.' : 'עוד אין תגובות. אתם ראשונים'}</p>}
        <ul className="comments">
          {(list ?? []).map((c) => (
            <li key={c.id} className={c.pending ? 'pending' : ''}>
              <div className="row" style={{ gap: 6 }}>
                <Avatar face={face(c.user_id) ?? { user_id: c.user_id, name: c.author_name }} size={32} />
                <b>{c.author_name}</b>
                <span className="small muted">{c.pending ? 'שולחים' : new Date(c.at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</span>
                <span style={{ marginInlineStart: 'auto' }} />
                {c.pending ? null : c.user_id === myId ? (
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
      </div>
      <form className="cmts-compose" onSubmit={add}>
        <Avatar face={myFace} size={32} />
        <div className="mention-wrap">
          <textarea ref={box} className="cmts-input" rows={1} maxLength={1000} value={body} onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMq(null)
              // Enter sends, Shift+Enter is a new line (not while picking someone to tag).
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && mq === null) { e.preventDefault(); add() }
            }}
            placeholder="הוסיפו תגובה…" aria-label="הוסיפו תגובה" aria-describedby="mention-hint" />
          {mq !== null && matches.length > 0 && (
            <ul className="mention-pick" role="listbox" aria-label="לתייג עמית או עמיתה">
              {matches.map((p) => (
                <li key={p.user_id}>
                  <button type="button" role="option" aria-selected="false" onClick={() => pick(p)}>
                    <Avatar face={face(p.user_id) ?? { user_id: p.user_id, name: p.name }} size={24} />
                    <b>{p.name}</b> <span className="small muted">{p.role ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="cmts-send" disabled={!body.trim() || busy} aria-label="לשלוח תגובה">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 12l18-9-6 18-3-7-9-2z" transform="scale(-1,1) translate(-24,0)" /></svg>
        </button>
      </form>
      <span id="mention-hint" className="cmts-hint">@ מתייג עמית, וזה נשלח אליו במייל.</span>
      {err && <div className="notice err" role="alert">{err}</div>}
      {notified && <div className="notice ok mention-toast" role="status">{notified}</div>}
    </section>
  )
}

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
