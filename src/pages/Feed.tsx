import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ITEM_COLS, Item, KIND_LABEL, Topic, fmtDate, supabase, track } from '../lib'
import { Comments, ShareSheet, react, useSocial } from '../components/social'
import { earn } from '../components/points'
import '../feed.css'

// Social-media style feed: vertical snap cards (up/down = next/prev, like TikTok),
// a horizontal swipe on each card (right = save, left = not for me, like Tinder),
// and an action rail with reactions, comments, share and save.

type FeedItem = Item & { thumbnail_url?: string | null; preview_video_id?: string | null; reason?: string | null }
type Tab = 'foryou' | 'trending' | 'new'

const TABS: { key: Tab; label: string }[] = [
  { key: 'foryou', label: 'בשבילכם' },
  { key: 'trending', label: 'טרנדים' },
  { key: 'new', label: 'חדש' },
]

// Brand tints per topic for the fallback tile (zap-visual-language palette).
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

const EXTRA_COLS = ',thumbnail_url,preview_video_id'
type Rows = { data: unknown; error: unknown }

async function fetchItems(ids: number[]): Promise<FeedItem[]> {
  if (!ids.length) return []
  let res: Rows = await supabase.from('items').select(ITEM_COLS + EXTRA_COLS).in('id', ids)
  // thumbnail_url / preview_video_id may not exist yet; fall back to the base columns.
  if (res.error) res = await supabase.from('items').select(ITEM_COLS).in('id', ids)
  const byId = new Map(((res.data ?? []) as unknown as FeedItem[]).map((i) => [i.id, i]))
  return ids.map((id) => byId.get(id)).filter((x): x is FeedItem => !!x)
}

async function loadTab(tab: Tab): Promise<FeedItem[]> {
  if (tab === 'new') {
    let res: Rows = await supabase.from('items').select(ITEM_COLS + EXTRA_COLS)
      .eq('status', 'approved').in('kind', ['course', 'news']).order('created_at', { ascending: false }).limit(30)
    if (res.error) res = await supabase.from('items').select(ITEM_COLS)
      .eq('status', 'approved').in('kind', ['course', 'news']).order('created_at', { ascending: false }).limit(30)
    return (res.data ?? []) as unknown as FeedItem[]
  }
  if (tab === 'trending') {
    const { data } = await supabase.rpc('trending', { p_limit: 30 })
    return fetchItems(((data ?? []) as { id: number }[]).map((r) => r.id))
  }
  const { data } = await supabase.rpc('feed', { p_limit: 30 })
  const rows = (data ?? []) as { id: number; popular_with: string | null; shared_by: string | null }[]
  const items = await fetchItems(rows.map((r) => r.id))
  const why = new Map(rows.map((r) => [r.id, r.shared_by ? `המלצה מ-${r.shared_by}` : r.popular_with ? `פופולרי אצל ${r.popular_with}` : null]))
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

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function Feed() {
  const [tab, setTab] = useState<Tab>('foryou')
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [topics, setTopics] = useState<Map<string, string>>(new Map())
  const [active, setActive] = useState(0)
  const [myId, setMyId] = useState('')
  const [undo, setUndo] = useState<{ item: FeedItem; index: number } | null>(null)
  const [more, setMore] = useState<'idle' | 'loading' | 'done'>('idle')
  const scroller = useRef<HTMLDivElement>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? ''))
    supabase.from('topics').select('slug,name_he').then(({ data }) =>
      setTopics(new Map(((data ?? []) as Pick<Topic, 'slug' | 'name_he'>[]).map((t) => [t.slug, t.name_he]))))
  }, [])

  useEffect(() => {
    let alive = true
    setItems(null); setActive(0); setMore('idle')
    loadTab(tab).then((list) => { if (alive) setItems(list) })
    scroller.current?.scrollTo({ top: 0 })
    return () => { alive = false }
  }, [tab])

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
    if (!items || tab !== 'foryou' || more !== 'idle' || active < items.length - 3) return
    setMore('loading')
    loadMore(new Set(items.map((i) => i.id))).then((extra) => {
      setItems((cur) => (cur ? [...cur, ...extra] : extra))
      setMore(extra.length ? 'idle' : 'done')
    })
  }, [active, items, tab, more])

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

  // Keyboard: ↑↓ move, ← not for me, → save (RTL-agnostic: right = save, as on the card).
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

  return (
    <div className="fd-wrap">
      <div className="fd-tabs" role="tablist" aria-label="סוג הפיד">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`fd-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="fd-scroller" ref={scroller}>
        {items === null && <div className="fd-card fd-empty"><div className="fd-spinner" aria-hidden />טוענים בשבילכם</div>}
        {items?.length === 0 && (
          <div className="fd-card fd-empty">
            <p className="fd-empty-title">עברתם על הכול</p>
            <p>תוכן חדש נכנס כל כמה שעות. בינתיים אפשר לבדוק את <Link to="/topics">הנושאים</Link>.</p>
          </div>
        )}
        {items?.map((it, i) => (
          <FeedCard key={it.id} item={it} index={i} active={i === active} topicName={topics.get(it.topic_slug ?? '') ?? ''}
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

function FeedCard({ item, index, active, topicName, myId, onSave, onHide }: {
  item: FeedItem; index: number; active: boolean; topicName: string; myId: string
  onSave: () => void; onHide: () => void
}) {
  const s = useSocial(item.id)
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const [sheet, setSheet] = useState<'comments' | 'share' | null>(null)
  const [saved, setSaved] = useState(false)
  const start = useRef<{ x: number; y: number; locked: 'x' | 'y' | null } | null>(null)

  // Count a view after 2 seconds on screen.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => { track(item.id, 'open'); earn('open') }, 2000)
    return () => clearTimeout(t)
  }, [active, item.id])

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return
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
  const onUp = () => {
    const st = start.current
    start.current = null
    if (!st || st.locked !== 'x') return
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

  return (
    <section className="fd-card" data-index={index} aria-label={item.title_he}>
      <div className={`fd-inner ${drag ? 'drag' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 22}deg)` : undefined }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="fd-media" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
          {item.preview_video_id && active && !reduced ? (
            <iframe className="fd-video" title={item.title_he} tabIndex={-1}
              src={`https://www.youtube-nocookie.com/embed/${item.preview_video_id}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${item.preview_video_id}&modestbranding=1&rel=0`}
              allow="autoplay; encrypted-media; picture-in-picture" />
          ) : item.thumbnail_url ? (
            <img className="fd-thumb" src={item.thumbnail_url} alt="" loading={index < 2 ? 'eager' : 'lazy'} draggable={false} />
          ) : (
            <div className="fd-fallback" aria-hidden>
              <span>{topicName || KIND_LABEL[item.kind]}</span>
            </div>
          )}
          <div className="fd-shade" />
        </div>

        <div className="fd-stamp save" style={{ opacity: stampSave }} aria-hidden>שומר לי</div>
        <div className="fd-stamp hide" style={{ opacity: stampHide }} aria-hidden>לא בשבילי</div>

        <div className="fd-body">
          <div className="fd-chips">
            {topicName && <span className="fd-chip">{topicName}</span>}
            <span className="fd-chip ghost">{KIND_LABEL[item.kind]}</span>
            {item.reason && <span className="fd-chip hot">{item.reason}</span>}
          </div>
          <h2 className="fd-title">{item.title_he}</h2>
          {item.summary_he && <p className="fd-summary">{item.summary_he}</p>}
          {item.why_he && <p className="fd-why"><b>למה זה שווה לכם:</b> {item.why_he}</p>}
          <p className="fd-meta">{item.source_name}{pub ? ` · ${pub}` : ''}{item.is_demo ? ' · דמו' : ''}</p>
          <div className="fd-ctas">
            <Link className="fd-btn" to={`/item/${item.id}`}>לפתוח</Link>
            {item.kind !== 'internal' && (
              <a className="fd-btn ghost" href={item.source_url} target="_blank" rel="noopener noreferrer"
                onClick={() => track(item.id, 'click_source')}>למקור</a>
            )}
          </div>
        </div>

        <div className="fd-rail" aria-label="פעולות">
          <RailBtn label="אהבתי" count={s?.likes} on={s?.mine === 1} onClick={() => react(item.id, 1)}><IcoUp /></RailBtn>
          <RailBtn label="פחות" count={s?.dislikes} on={s?.mine === -1} onClick={() => react(item.id, -1)}><IcoDown /></RailBtn>
          <RailBtn label="תגובות" count={s?.comments_count} onClick={() => setSheet('comments')}><IcoChat /></RailBtn>
          <RailBtn label="לשתף" count={s?.shares_count || undefined} onClick={() => setSheet('share')}><IcoShare /></RailBtn>
          <RailBtn label={saved ? 'נשמר' : 'לשמור'} on={saved}
            onClick={() => { if (!saved) { setSaved(true); supabase.from('saves').insert({ item_id: item.id, user_id: myId }).then(({ error }) => { if (!error) { track(item.id, 'save'); earn('save') } }) } }}>
            <IcoSave />
          </RailBtn>
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
const IcoUp = () => <svg {...svg}><path d="M7 10v11H4V10h3zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" /></svg>
const IcoDown = () => <svg {...svg}><path d="M17 14V3h3v11h-3zM17 14l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17" /></svg>
const IcoChat = () => <svg {...svg}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
const IcoShare = () => <svg {...svg}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" /></svg>
const IcoSave = () => <svg {...svg}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>
const IcoX = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>
