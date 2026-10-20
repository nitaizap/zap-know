import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ITEM_COLS, Item, KIND_LABEL, fmtDate, supabase, track, callFn } from '../lib'
import { Comments, ShareSheet, react, useSocial } from '../components/social'
import { earn } from '../components/points'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'
import { useApp } from '../App'
import '../feed.css'
import '../tiktok.css'
import { Remind } from '../components/Remind'
import { FitTime } from '../components/FitTime'
import { IClock, IClose } from '../components/icons'
import { Avatar, useFaces } from '../components/Avatar'
import { teamColor, teamInitials } from './Doc'
import { DocPreview, previewLines } from '../components/ui'

// zap UP's TikTok: vertical snap cards (up/down = next/prev), a horizontal swipe on each card
// (right = save, left = not for me), double-tap = like, and a rail with reactions, comments,
// share, save and "later". One component serves the mixed home feed, ידע מבחוץ and ידע מבפנים.

export type FeedSource = 'all' | 'external' | 'internal'
type FeedItem = Item & { reason?: string | null }
type Tab = 'foryou' | 'bites' | 'trending' | 'new'
type TeamLite = { id: number; team: string }
type DocLite = { id: number; team_id: number; body_md?: string | null }

const TABS: { key: Tab; label: string }[] = [
  { key: 'foryou', label: 'בשבילכם' },
  { key: 'bites', label: 'ביס קטן' },
  { key: 'trending', label: 'טרנדים' },
  { key: 'new', label: 'חדש' },
]

// Brand tints per topic for the last-resort tile (zap-visual-language palette).
const TOPIC_TINT: Record<string, [string, string]> = {
  'digital-marketing': ['#052b7a', '#485cc7'],
  ppc: ['#052b7a', '#00ab12'],
  social: ['#ff5c9e', '#485cc7'],
  'geo-ecommerce': ['#001c32', '#052b7a'],
  'data-ai': ['#485cc7', '#001c32'],
  'behavioral-econ': ['#ff210d', '#ff5c9e'],
  decisions: ['#052b7a', '#ffc600'],
  cx: ['#00ab12', '#052b7a'],
}

async function fetchItems(ids: number[]): Promise<FeedItem[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('items').select(ITEM_COLS).in('id', ids)
  const byId = new Map(((data ?? []) as unknown as FeedItem[]).map((i) => [i.id, i]))
  return ids.map((id) => byId.get(id)).filter((x): x is FeedItem => !!x)
}

const reasonOf = (r: { shared_by?: string | null; popular_with?: string | null }) =>
  r.shared_by ? `המלצה מ-${r.shared_by}` : r.popular_with ? `פופולרי אצל ${r.popular_with}` : null

// Internal lane: posts and team docs, my team's first, then my topics, then fresh and liked.
async function loadInternal(myTeamId: number | null, myTopics: string[], docs: Map<number, DocLite>): Promise<FeedItem[]> {
  const { data } = await supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('kind', 'internal')
    .order('created_at', { ascending: false }).limit(80)
  const list = (data ?? []) as unknown as FeedItem[]
  const score = (i: FeedItem) => {
    const d = i.doc_id ? docs.get(i.doc_id) : null
    const age = (Date.now() - +new Date(i.published_at ?? i.created_at)) / 864e5
    return (d && myTeamId && d.team_id === myTeamId ? 3 : 0) + (myTopics.includes(i.topic_slug ?? '') ? 1.5 : 0)
      + 2 * Math.exp(-age / 10) + 0.6 * Math.log1p(i.likes ?? 0) + 0.4 * Math.log1p(i.opens)
  }
  return list.sort((a, b) => score(b) - score(a))
}

async function loadAll(): Promise<FeedItem[] | null> {
  const { data, error } = await supabase.rpc('feed_all', { p_limit: 40 })
  if (error) return null
  const rows = (data ?? []) as { id: number; popular_with: string | null; shared_by: string | null }[]
  const items = await fetchItems(rows.map((r) => r.id))
  const why = new Map(rows.map((r) => [r.id, reasonOf(r)]))
  return items.map((i) => ({ ...i, reason: why.get(i.id) ?? null }))
}

async function loadTab(tab: Tab): Promise<FeedItem[]> {
  if (tab === 'new') {
    const { data } = await supabase.from('items').select(ITEM_COLS)
      .eq('status', 'approved').neq('kind', 'internal').order('created_at', { ascending: false }).limit(30)
    return (data ?? []) as unknown as FeedItem[]
  }
  if (tab === 'bites') {
    const { data } = await supabase.rpc('quick_bites', { p_limit: 30 })
    return fetchItems(((data ?? []) as { id: number }[]).map((r) => r.id))
  }
  if (tab === 'trending') {
    const { data } = await supabase.rpc('trending', { p_limit: 30 })
    return fetchItems(((data ?? []) as { id: number }[]).map((r) => r.id))
  }
  const { data } = await supabase.rpc('feed', { p_limit: 30 })
  const rows = (data ?? []) as { id: number; popular_with: string | null; shared_by: string | null }[]
  const items = await fetchItems(rows.map((r) => r.id))
  const why = new Map(rows.map((r) => [r.id, reasonOf(r)]))
  return items.map((i) => ({ ...i, reason: why.get(i.id) ?? null }))
}

// More to scroll once the first batch runs out: things outside my topics, then what's hot.
async function loadMore(seen: Set<number>): Promise<FeedItem[]> {
  const [d, t] = await Promise.all([
    supabase.rpc('discover', { p_limit: 15 }),
    supabase.rpc('trending', { p_limit: 15 }),
  ])
  const reasons = new Map<number, string>()
  for (const r of (d.data ?? []) as { id: number; reason: string }[]) if (!seen.has(r.id)) reasons.set(r.id, r.reason)
  for (const r of (t.data ?? []) as { id: number }[]) if (!seen.has(r.id) && !reasons.has(r.id)) reasons.set(r.id, 'טרנד השבוע')
  const items = await fetchItems([...reasons.keys()])
  return items.map((i) => ({ ...i, reason: reasons.get(i.id) ?? null }))
}

// Interleave two lanes (two external, one internal), so the mixed fallback never feels one-note.
function interleave(ext: FeedItem[], inn: FeedItem[]) {
  const out: FeedItem[] = []
  let a = 0, b = 0
  while (a < ext.length || b < inn.length) {
    for (let k = 0; k < 2 && a < ext.length; k++) out.push(ext[a++])
    if (b < inn.length) out.push(inn[b++])
  }
  return out
}

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function Feed({ source = 'external', top }: { source?: FeedSource; top?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('foryou')
  const [fit, setFit] = useState(false)
  const { topics: topicList, profile } = useApp()
  const [f, setF] = useFilters(source === 'external' ? 'feed' : `feed-${source}`)
  const saved = useSavedIds(f.saved)
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [teams, setTeams] = useState<Map<number, TeamLite>>(new Map())
  const [docs, setDocs] = useState<Map<number, DocLite> | null>(null)
  const [active, setActive] = useState(0)
  const [myId, setMyId] = useState('')
  const [undo, setUndo] = useState<{ item: FeedItem; index: number } | null>(null)
  const [more, setMore] = useState<'idle' | 'loading' | 'done'>('idle')
  const scroller = useRef<HTMLDivElement>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout>>()

  const topicName = new Map(topicList.map((t) => [t.slug, t.name_he]))

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? ''))
    Promise.all([
      supabase.from('team_profiles').select('id,team'),
      supabase.from('team_docs').select('id,team_id,body_md'),
    ]).then(([t, d]) => {
      setTeams(new Map(((t.data ?? []) as TeamLite[]).map((x) => [x.id, x])))
      setDocs(new Map(((d.data ?? []) as DocLite[]).map((x) => [x.id, x])))
    })
  }, [])

  const myTeamId = (() => {
    const role = (profile.role ?? '').trim()
    if (!role) return null
    const list = [...teams.values()]
    return (list.find((t) => t.team === role) ?? list.find((t) => t.team.includes(role) || role.includes(t.team)))?.id ?? null
  })()

  useEffect(() => {
    if (!docs) return
    let alive = true
    setItems(null); setActive(0); setMore('idle')
    const load = async (): Promise<FeedItem[]> => {
      if (source === 'internal') return loadInternal(myTeamId, profile.topics, docs)
      if (source === 'all') {
        const mixed = await loadAll()
        if (mixed && mixed.length) return mixed
        const [ext, inn] = await Promise.all([loadTab('foryou'), loadInternal(myTeamId, profile.topics, docs)])
        return interleave(ext, inn)
      }
      return loadTab(tab)
    }
    load().then((list) => { if (alive) setItems(applyFilters(list, f, { saved })) })
    scroller.current?.scrollTo({ top: 0 })
    return () => { alive = false }
  }, [tab, source, JSON.stringify(f), saved, docs, myTeamId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Which card is on screen.
  useEffect(() => {
    const root = scroller.current
    if (!root || !items) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(Number((e.target as HTMLElement).dataset.index))
    }, { root, threshold: [0.6] })
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [items])

  // Infinite scroll: top up when close to the end.
  useEffect(() => {
    if (!items || source === 'internal' || (source === 'external' && tab !== 'foryou') || more !== 'idle' || active < items.length - 3) return
    setMore('loading')
    loadMore(new Set(items.map((i) => i.id))).then((extra) => {
      setItems((cur) => (cur ? [...cur, ...extra] : extra))
      setMore(extra.length ? 'idle' : 'done')
    })
  }, [active, items, tab, more, source])

  const goTo = useCallback((i: number) => {
    const el = scroller.current?.querySelector(`[data-index="${i}"]`)
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }, [])

  const removeAt = useCallback((index: number) => {
    setItems((cur) => (cur ? cur.filter((_, i) => i !== index) : cur))
  }, [])

  const save = useCallback(async (item: FeedItem, index: number) => {
    const { error } = await supabase.from('saves').insert({ item_id: item.id, user_id: myId })
    if (!error) { track(item.id, 'save'); earn('save') }
    removeAt(index)
  }, [myId, removeAt])

  const hide = useCallback((item: FeedItem, index: number) => {
    // Private "not for me": never a public dislike.
    supabase.rpc('hide_item', { p_item: item.id }).then(() => {}, () => {})
    removeAt(index)
    clearTimeout(undoTimer.current)
    setUndo({ item, index })
    undoTimer.current = setTimeout(() => setUndo(null), 4000)
  }, [removeAt])

  const undoHide = () => {
    if (!undo) return
    supabase.rpc('unhide_item', { p_item: undo.item.id }).then(() => {}, () => {})
    setItems((cur) => {
      const list = [...(cur ?? [])]
      list.splice(Math.min(undo.index, list.length), 0, undo.item)
      return list
    })
    clearTimeout(undoTimer.current)
    setUndo(null)
  }

  // Keyboard: ↑↓ move, ← not for me, → save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (!items || t.closest('input, textarea, [role="dialog"]')) return
      const it = items[active]
      if (e.key === 'ArrowDown') { e.preventDefault(); goTo(Math.min(active + 1, items.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); goTo(Math.max(active - 1, 0)) }
      else if (e.key === 'ArrowRight' && it) save(it, active)
      else if (e.key === 'ArrowLeft' && it) hide(it, active)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, active, goTo, save, hide])

  const authorOf = (it: FeedItem) => {
    const d = it.doc_id ? docs?.get(it.doc_id) : null
    const team = d ? teams.get(d.team_id) : null
    return team ? { kind: 'team' as const, team } : null
  }
  // Only real source images; everything else previews its own text.
  const coverOf = (it: FeedItem) => it.thumbnail_url || null
  const linesOf = (it: FeedItem) => {
    const d = it.doc_id ? docs?.get(it.doc_id) : null
    return previewLines(d?.body_md || it.summary_he, 4)
  }

  return (
    <div className={`fd-wrap tk-${source}${top ? ' tk-has-top' : ''}${active > 0 ? ' tk-scrolled' : ''}`}>
      {top && <div className="tk-top">{top}</div>}
      {fit && (
        <div className="sheet-wrap" onClick={() => setFit(false)}>
          <div className="sheet card" role="dialog" aria-label="כמה זמן יש לכם" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>כמה זמן יש לכם?</h3>
              <button className="icon-btn" onClick={() => setFit(false)} aria-label="לסגור"><IClose /></button>
            </div>
            <p className="small muted" style={{ margin: '4px 0 10px' }}>בוחרים מספר דקות, ומקבלים חבילה שנכנסת בדיוק בזה.</p>
            <FitTime />
          </div>
        </div>
      )}
      <div className="fd-tabs" role="tablist" aria-label="סוג הפיד">
        {source === 'external' && TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`fd-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
        {source !== 'internal' && <button className="fd-tab fd-time" onClick={() => setFit(true)}><IClock size={16} /> יש לי זמן</button>}
        <div className="fd-filter"><FilterBar value={f} onChange={setF} show={{ topic: topicList, kind: source !== 'internal', len: true, vertical: source !== 'internal', saved: true }} /></div>
      </div>

      <div className="fd-scroller" ref={scroller}>
        {items === null && <div className="fd-card fd-empty"><div className="fd-spinner" aria-hidden />טוענים בשבילכם</div>}
        {items?.length === 0 && (
          <div className="fd-card fd-empty">
            <p className="fd-empty-title">עברתם על הכול</p>
            <p>תוכן חדש נכנס כל כמה שעות. בינתיים אפשר לעבור ל<Link to={source === 'internal' ? '/internal?view=list' : '/external?view=list'}>רשימה</Link>.</p>
          </div>
        )}
        {items?.map((it, i) => (
          <FeedCard key={it.id} item={it} index={i} active={i === active} near={Math.abs(i - active) <= 1}
            topicName={topicName.get(it.topic_slug ?? '') ?? ''} cover={coverOf(it)} lines={linesOf(it)} author={authorOf(it)}
            myId={myId} onSave={() => save(it, i)} onHide={() => hide(it, i)} />
        ))}
        {items && items.length > 0 && more === 'done' && (
          <div className="fd-card fd-empty">
            <p className="fd-empty-title">זהו להיום</p>
            <p>ראיתם את כל מה שחדש. מחר יש עוד.</p>
          </div>
        )}
      </div>

      {undo && (
        <div className="fd-snack" role="status">
          הסתרנו את זה מהפיד שלכם
          <button onClick={undoHide}>לבטל</button>
        </div>
      )}
    </div>
  )
}

function FeedCard({ item, index, active, near, topicName, cover, lines, author, myId, onSave, onHide }: {
  item: FeedItem; index: number; active: boolean; near: boolean; topicName: string; cover: string | null; lines: string[]
  author: { kind: 'team'; team: TeamLite } | null
  myId: string; onSave: () => void; onHide: () => void
}) {
  const s = useSocial(item.id)
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const [sheet, setSheet] = useState<'comments' | 'share' | null>(null)
  const [saved, setSaved] = useState(false)
  const [burst, setBurst] = useState(0)
  const [voices, setVoices] = useState<string[]>([])
  const start = useRef<{ x: number; y: number; locked: 'x' | 'y' | null } | null>(null)
  const lastTap = useRef(0)
  const faceOf = useFaces(voices)

  // Count a view after 2 seconds on screen.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => { track(item.id, 'open'); earn('open') }, 2000)
    return () => clearTimeout(t)
  }, [active, item.id])

  // Social proof: a few colleagues who joined the conversation (loaded only near the screen).
  useEffect(() => {
    if (!near || voices.length) return
    supabase.from('comments').select('user_id').eq('item_id', item.id).order('at', { ascending: false }).limit(12)
      .then(({ data }) => setVoices([...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))].slice(0, 3)))
  }, [near, item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const like = () => {
    if (s?.mine !== 1) { react(item.id, 1); earn('react') }
    setBurst((n) => n + 1)
  }

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, audio, iframe')) return
    start.current = { x: e.clientX, y: e.clientY, locked: null }
  }
  const onMove = (e: React.PointerEvent) => {
    const st = start.current
    if (!st) return
    const mx = e.clientX - st.x
    const my = e.clientY - st.y
    // Decide the axis once: vertical goes to the scroller, horizontal is ours.
    if (!st.locked && Math.hypot(mx, my) > 10) {
      st.locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (st.locked === 'x') { setDrag(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
    }
    if (st.locked === 'x') setDx(mx)
  }
  const onUp = (e: React.PointerEvent) => {
    const st = start.current
    start.current = null
    if (!st) return
    if (!st.locked) {
      // A tap: two within 300ms = like, with a heart burst.
      if ((e.target as HTMLElement).closest('button, a, audio')) return
      const now = Date.now()
      if (now - lastTap.current < 300) { like(); lastTap.current = 0 } else lastTap.current = now
      return
    }
    if (st.locked !== 'x') return
    setDrag(false)
    const limit = Math.min(120, window.innerWidth * 0.28)
    if (dx > limit) { setDx(window.innerWidth); setTimeout(onSave, reduced ? 0 : 220) }
    else if (dx < -limit) { setDx(-window.innerWidth); setTimeout(onHide, reduced ? 0 : 220) }
    else setDx(0)
  }

  const [c1, c2] = TOPIC_TINT[item.topic_slug ?? ''] ?? ['#052b7a', '#485cc7']
  const stampSave = Math.max(0, Math.min(1, dx / 120))
  const stampHide = Math.max(0, Math.min(1, -dx / 120))
  const pub = fmtDate(item.published_at ?? item.created_at)
  const openTo = item.doc_id ? `/doc/${item.doc_id}` : `/item/${item.id}`
  const likes = s?.likes ?? item.likes ?? 0
  const authorName = author ? `צוות ${author.team.team}` : item.kind === 'internal' ? 'קורה ב-zap' : item.source_name

  return (
    <section className="fd-card" data-index={index} aria-label={item.title_he}>
      <div className={`fd-inner ${drag ? 'drag' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 22}deg)` : undefined }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; setDrag(false); setDx(0) }}>
        <div className="fd-media" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
          {item.preview_video_id && active && !reduced ? (
            <iframe className="fd-video" title={item.title_he} tabIndex={-1}
              src={`https://www.youtube-nocookie.com/embed/${item.preview_video_id}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${item.preview_video_id}&modestbranding=1&rel=0`}
              allow="autoplay; encrypted-media; picture-in-picture" />
          ) : cover ? (
            <img className="fd-thumb" src={cover} alt="" loading={index < 2 ? 'eager' : 'lazy'} draggable={false}
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <div className="fd-docpv"><DocPreview big title={item.title_he} lines={lines} by={author ? `צוות ${author.team.team}` : item.source_name} /></div>
          )}
          <div className="fd-shade" />
          {burst > 0 && <span key={burst} className="tk-heart" aria-hidden>
            <svg viewBox="0 0 24 24" width="110" height="110"><path fill="#ff5c9e" d="M12 21s-7.5-4.6-9.6-9.3C.8 7.9 3.2 4 7 4c2.1 0 3.7 1.1 5 2.9C13.3 5.1 14.9 4 17 4c3.8 0 6.2 3.9 4.6 7.7C19.5 16.4 12 21 12 21z" /></svg>
          </span>}
        </div>

        <div className="fd-stamp save" style={{ opacity: stampSave }} aria-hidden>שומר לי</div>
        <div className="fd-stamp hide" style={{ opacity: stampHide }} aria-hidden>לא בשבילי</div>

        <div className="fd-body">
          <div className="tk-author">
            {author
              ? <span className="tk-av" style={{ background: teamColor(author.team.id) }} aria-hidden>{teamInitials(author.team.team)}</span>
              : <span className="tk-av src" aria-hidden>{(item.source_name || 'z').trim().charAt(0).toUpperCase()}</span>}
            <span className="tk-author-name"><bdi>{authorName}</bdi>{pub && <small> · {pub}</small>}</span>
            {item.reason && <span className="fd-chip hot">{item.reason}</span>}
          </div>
          <h2 className="fd-title">{item.title_he}</h2>
          {item.summary_he && <p className="fd-summary">{item.summary_he}</p>}

          <Preview item={item} />

          {(likes > 0 || voices.length > 0) && (
            <p className="tk-proof">
              {voices.length > 0 && (
                <span className="tk-stack" aria-hidden>
                  {voices.map((id) => <Avatar key={id} face={faceOf(id) ?? { user_id: id, name: '' }} size={22} />)}
                </span>
              )}
              {likes > 0 ? (likes === 1 ? 'עובד אחד אהב את זה' : `${likes} עובדים אהבו את זה`) : 'עובדים מדברים על זה'}
            </p>
          )}

          <div className="fd-ctas">
            <Link className="fd-btn" to={openTo}>לפתוח</Link>
            {item.kind !== 'internal' && (
              <a className="fd-btn ghost" href={item.source_url} target="_blank" rel="noopener noreferrer"
                onClick={() => track(item.id, 'click_source')}>למקור</a>
            )}
            <span className="tk-kind">{topicName || KIND_LABEL[item.kind]}{item.is_demo ? ' · דמו' : ''}</span>
          </div>
        </div>

        <div className="fd-rail" aria-label="פעולות">
          <RailBtn label="אהבתי" count={s?.likes} on={s?.mine === 1} onClick={() => { react(item.id, 1); if (s?.mine !== 1) earn('react') }}><IcoHeart /></RailBtn>
          <RailBtn label="פחות" count={s?.dislikes} on={s?.mine === -1} onClick={() => react(item.id, -1)}><IcoDown /></RailBtn>
          <RailBtn label="תגובות" count={s?.comments_count} onClick={() => setSheet('comments')}><IcoChat /></RailBtn>
          <RailBtn label="לשתף" count={s?.shares_count || undefined} onClick={() => setSheet('share')}><IcoShare /></RailBtn>
          <RailBtn label={saved ? 'נשמר' : 'לשמור'} on={saved}
            onClick={() => { if (!saved) { setSaved(true); supabase.from('saves').insert({ item_id: item.id, user_id: myId }).then(({ error }) => { if (!error) { track(item.id, 'save'); earn('save') } }) } }}>
            <IcoSave />
          </RailBtn>
          <Remind itemId={item.id} trigger={(open) => <RailBtn label="אחר כך" onClick={open}><IClock size={22} /></RailBtn>} />
        </div>

        <div className="fd-swipe-hint" aria-hidden>
          <button className="fd-round hide" onClick={() => { setDx(-window.innerWidth); setTimeout(onHide, reduced ? 0 : 220) }} aria-label="לא בשבילי"><IcoX /></button>
          <button className="fd-round save" onClick={() => { setDx(window.innerWidth); setTimeout(onSave, reduced ? 0 : 220) }} aria-label="שומר לי"><IcoSave /></button>
        </div>
      </div>

      {sheet === 'comments' && (
        <div className="fd-sheet-back" onClick={() => setSheet(null)}>
          <div className="fd-sheet" role="dialog" aria-label="תגובות" onClick={(e) => e.stopPropagation()}>
            <div className="fd-sheet-head">
              <b>תגובות</b>
              <button onClick={() => setSheet(null)} aria-label="לסגור"><IcoX /></button>
            </div>
            <div className="fd-sheet-body"><Comments item={item} myId={myId} /></div>
          </div>
        </div>
      )}
      {sheet === 'share' && <ShareSheet item={item} onClose={() => setSheet(null)} />}
    </section>
  )
}

// Something to play on every card: the podcast itself, or a two-host "להאזנה" conversation for
// anything written (made on the first tap, cached for everyone after). Video previews play on the media.
function Preview({ item }: { item: FeedItem }) {
  const [state, setState] = useState<'idle' | 'making' | 'ready' | 'error'>('idle')
  const [src, setSrc] = useState<string | null>(item.kind === 'podcast' ? item.audio_url ?? null : null)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { audio.current?.pause() }, [])
  if (item.preview_video_id) return null

  const play = (url: string) => {
    if (!audio.current) {
      audio.current = new Audio(url)
      audio.current.onended = () => setPlaying(false)
    }
    audio.current.play().then(() => setPlaying(true), () => setPlaying(false))
  }

  const toggle = async () => {
    if (playing) { audio.current?.pause(); setPlaying(false); return }
    if (src) { play(src); return }
    setState('making')
    const kind = item.doc_id ? 'doc' : 'item'
    const id = item.doc_id ?? item.id
    try {
      const r = await callFn<{ audio_url: string | null }>('listen', { kind, id })
      let url = r.audio_url
      for (let n = 0; !url && n < 30; n++) {
        await new Promise((ok) => setTimeout(ok, 4000))
        const { data } = await supabase.from('listens').select('audio_url').eq('kind', kind).eq('ref_id', id).maybeSingle()
        url = (data as { audio_url: string | null } | null)?.audio_url ?? null
      }
      if (!url) throw new Error('no audio yet')
      setSrc(url); setState('ready'); play(url)
    } catch {
      setState('error')
    }
  }

  const label = playing ? 'עוצרים' : state === 'making' ? 'מכינים שיחה קצרה' : state === 'error' ? 'לנסות שוב' : item.kind === 'podcast' ? 'להאזין לפרק' : 'להאזנה, 2 דקות'
  return (
    <button className={`tk-play${playing ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); toggle() }} disabled={state === 'making'} aria-pressed={playing}>
      <span className="tk-play-ico" aria-hidden>
        {state === 'making' ? <span className="listen-wave"><i /><i /><i /><i /></span> : playing ? <IcoPause /> : <IcoPlay />}
      </span>
      {label}
    </button>
  )
}

function RailBtn({ label, count, on, onClick, children }: {
  label: string; count?: number; on?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button className={`fd-rail-btn ${on ? 'on' : ''}`} aria-label={count !== undefined ? `${label}, ${count}` : label}
      aria-pressed={on} onClick={(e) => { e.stopPropagation(); onClick() }}>
      <span className="fd-rail-ico">{children}</span>
      <span className="fd-rail-n">{count !== undefined ? count : label}</span>
    </button>
  )
}

const svg = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IcoHeart = () => <svg {...svg}><path d="M12 20s-7-4.3-8.9-8.6C1.6 8 3.8 4.5 7.2 4.5c2 0 3.5 1 4.8 2.7 1.3-1.7 2.8-2.7 4.8-2.7 3.4 0 5.6 3.5 4.1 6.9C19 15.7 12 20 12 20z" /></svg>
const IcoDown = () => <svg {...svg}><path d="M17 14V3h3v11h-3zM17 14l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17" /></svg>
const IcoChat = () => <svg {...svg}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
const IcoShare = () => <svg {...svg}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" /></svg>
const IcoSave = () => <svg {...svg}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>
const IcoX = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>
const IcoPlay = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>
const IcoPause = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
