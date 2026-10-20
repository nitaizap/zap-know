import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ITEM_COLS, Item, KIND_LABEL, fmtDate, fmtMinutes, supabase, track, callFn } from '../lib'
import { Comments, ShareSheet, react, useSocial } from '../components/social'
import { BoardRow, PointsPill, earn, rankLine, useRankGap } from '../components/points'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'
import { useApp } from '../App'
import '../feed.css'
import '../tiktok.css'
import { Remind } from '../components/Remind'
import { IClock } from '../components/icons'
import { Avatar } from '../components/Avatar'
import { AiButton } from '../components/AiSheet'
import { teamColor, teamInitials } from './Doc'
import { DocPreview, previewLines } from '../components/ui'

// zap UP is a TikTok for work: one full-screen vertical feed (up/down = next/prev), a horizontal
// swipe per card (right = save, left = not for me), double-tap = like, and a rail of reactions.
// Every card previews itself live: the video plays, the podcast's equalizer moves, a web page
// pans past as a real capture of that page, a team document scrolls by as you'd read it.

export type FeedSource = 'all' | 'external' | 'internal' | 'bites'
type FeedItem = Item & { reason?: string | null }
type TeamLite = { id: number; team: string }
type DocLite = { id: number; team_id: number; body_md?: string | null }
type Episode = { week: string; body_he: string; audio_url: string | null; items: Item[] }
type Quote = { comment_id: number; item_id: number; item_title: string; body: string; author: string; user_id: string | null; team: string | null }
type Entry =
  | { t: 'item'; item: FeedItem }
  | { t: 'episode'; ep: Episode }
  | { t: 'leaders'; rows: BoardRow[] }
  | { t: 'quote'; q: Quote }

async function fetchItems(ids: number[]): Promise<FeedItem[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('items').select(ITEM_COLS).in('id', ids)
  const byId = new Map(((data ?? []) as unknown as FeedItem[]).map((i) => [i.id, i]))
  return ids.map((id) => byId.get(id)).filter((x): x is FeedItem => !!x)
}

const reasonOf = (r: { shared_by?: string | null; popular_with?: string | null }) =>
  r.shared_by ? `המלצה מ-${r.shared_by}` : r.popular_with ? `פופולרי אצל ${r.popular_with}` : null

async function ranked(rpc: 'feed' | 'feed_all', limit: number): Promise<FeedItem[] | null> {
  const { data, error } = await supabase.rpc(rpc, { p_limit: limit })
  if (error) return null
  const rows = (data ?? []) as { id: number; popular_with: string | null; shared_by: string | null }[]
  const why = new Map(rows.map((r) => [r.id, reasonOf(r)]))
  return (await fetchItems(rows.map((r) => r.id))).map((i) => ({ ...i, reason: why.get(i.id) ?? null }))
}

// Internal lane: posts and team docs, my team's first, then my topics, then fresh and liked.
async function loadInternal(myTeamId: number | null, myTopics: string[], docs: Map<number, DocLite>): Promise<FeedItem[]> {
  const { data } = await supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('kind', 'internal')
    .order('created_at', { ascending: false }).limit(80)
  const list = (data ?? []) as unknown as FeedItem[]
  const score = (i: FeedItem) => {
    const d = i.doc_id ? docs.get(i.doc_id) : null
    const age = (Date.now() - +new Date(i.published_at ?? i.created_at)) / 864e5
    return (d && myTeamId && d.team_id === myTeamId ? 3 : 0) + (myTopics.includes(i.topic_slug ?? '') ? 1.5 : 0)
      + 2 * Math.exp(-age / 10) + 0.6 * Math.log1p(i.likes ?? 0) + 0.4 * Math.log1p(i.opens) + (i.lang === 'he' ? 0.3 : 0)
  }
  return list.sort((a, b) => score(b) - score(a))
}

async function loadBites(): Promise<FeedItem[]> {
  const { data } = await supabase.rpc('quick_bites', { p_limit: 40 })
  return fetchItems(((data ?? []) as { id: number }[]).map((r) => r.id))
}

// More to scroll once the first batch runs out: things outside my topics, then what's hot.
async function loadMore(seen: Set<number>): Promise<FeedItem[]> {
  const [d, t] = await Promise.all([supabase.rpc('discover', { p_limit: 15 }), supabase.rpc('trending', { p_limit: 15 })])
  const reasons = new Map<number, string>()
  for (const r of (d.data ?? []) as { id: number; reason: string }[]) if (!seen.has(r.id)) reasons.set(r.id, r.reason)
  for (const r of (t.data ?? []) as { id: number }[]) if (!seen.has(r.id) && !reasons.has(r.id)) reasons.set(r.id, 'טרנד השבוע')
  return (await fetchItems([...reasons.keys()])).map((i) => ({ ...i, reason: reasons.get(i.id) ?? null }))
}

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
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
// A real capture of the source page (not generated), for web pages without a video.
const pageShot = (url: string) => `https://image.thum.io/get/width/720/crop/1600/noanimate/${url}`

export default function Feed({ source, head, listTo, agent }: {
  source: FeedSource
  head?: React.ReactNode       // tabs or the page name, in the slim top overlay
  listTo?: string              // the list view, behind a small icon
  agent?: React.ReactNode      // "שאלו את העמוד", inside the filter sheet
}) {
  const { topics: topicList, profile } = useApp()
  const [f, setF] = useFilters(`feed-${source}`)
  const saved = useSavedIds(f.saved)
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [teams, setTeams] = useState<Map<number, TeamLite>>(new Map())
  const [docs, setDocs] = useState<Map<number, DocLite> | null>(null)
  const [active, setActive] = useState(0)
  const [myId, setMyId] = useState('')
  const [undo, setUndo] = useState<{ item: FeedItem; index: number } | null>(null)
  const [more, setMore] = useState<'idle' | 'loading' | 'done'>('idle')
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [leaders, setLeaders] = useState<BoardRow[] | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
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

  // The home feed also carries the weekly episode, the monthly leaders and what colleagues wrote.
  useEffect(() => {
    if (source !== 'all') return
    supabase.from('episodes').select('week,body_he,audio_url,item_ids').order('week', { ascending: false }).limit(1).maybeSingle()
      .then(async ({ data }) => {
        const e = data as { week: string; body_he: string; audio_url: string | null; item_ids: number[] } | null
        if (!e || !e.item_ids?.length) return
        setEpisode({ ...e, items: await fetchItems(e.item_ids.slice(0, 4)) })
      })
    supabase.rpc('leaderboard', { p_period: 'month', p_scope: 'people', p_limit: 3 })
      .then(({ data, error }) => { if (!error && (data as BoardRow[] | null)?.length) setLeaders(data as BoardRow[]) })
    supabase.rpc('testimonials', { p_limit: 6 }).then(({ data, error }) => { if (!error) setQuotes((data as Quote[]) ?? []) })
  }, [source])

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
      if (source === 'bites') return loadBites()
      if (source === 'all') {
        const mixed = await ranked('feed_all', 40)
        if (mixed && mixed.length) return mixed
        const [ext, inn] = await Promise.all([ranked('feed', 30), loadInternal(myTeamId, profile.topics, docs)])
        return interleave(ext ?? [], inn)
      }
      return (await ranked('feed', 40)) ?? []
    }
    load().then((list) => { if (alive) setItems(applyFilters(list, f, { saved })) })
    scroller.current?.scrollTo({ top: 0 })
    return () => { alive = false }
  }, [source, JSON.stringify(f), saved, docs, myTeamId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Specials go between items: the episode third, leaders sixth, a colleague's words every sixth after.
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    let qn = 0
    for (const [n, item] of (items ?? []).entries()) {
      out.push({ t: 'item', item })
      if (n === 1 && episode) out.push({ t: 'episode', ep: episode })
      else if (n === 4 && leaders) out.push({ t: 'leaders', rows: leaders })
      else if (n >= 7 && (n - 7) % 6 === 0 && qn < quotes.length) out.push({ t: 'quote', q: quotes[qn++] })
    }
    return out
  }, [items, episode, leaders, quotes])

  // Which card is on screen.
  useEffect(() => {
    const root = scroller.current
    if (!root || !entries.length) return
    const io = new IntersectionObserver((list) => {
      for (const e of list) if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(Number((e.target as HTMLElement).dataset.index))
    }, { root, threshold: [0.6] })
    root.querySelectorAll('[data-index]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [entries])

  // Infinite scroll: top up when close to the end.
  useEffect(() => {
    if (!items || source === 'internal' || source === 'bites' || more !== 'idle' || active < entries.length - 3) return
    setMore('loading')
    loadMore(new Set(items.map((i) => i.id))).then((extra) => {
      setItems((cur) => (cur ? [...cur, ...applyFilters(extra, f, { saved })] : extra))
      setMore(extra.length ? 'idle' : 'done')
    })
  }, [active, items, entries.length, more, source]) // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = useCallback((i: number) => {
    scroller.current?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }, [])

  const removeItem = useCallback((id: number) => setItems((cur) => (cur ? cur.filter((x) => x.id !== id) : cur)), [])

  const save = useCallback(async (item: FeedItem) => {
    const { error } = await supabase.from('saves').insert({ item_id: item.id, user_id: myId })
    if (!error) { track(item.id, 'save'); earn('save') }
    removeItem(item.id)
  }, [myId, removeItem])

  const hide = useCallback((item: FeedItem) => {
    // Private "not for me": never a public dislike.
    supabase.rpc('hide_item', { p_item: item.id }).then(() => {}, () => {})
    const index = (items ?? []).findIndex((x) => x.id === item.id)
    removeItem(item.id)
    clearTimeout(undoTimer.current)
    setUndo({ item, index })
    undoTimer.current = setTimeout(() => setUndo(null), 4000)
  }, [items, removeItem])

  const undoHide = () => {
    if (!undo) return
    supabase.rpc('unhide_item', { p_item: undo.item.id }).then(() => {}, () => {})
    setItems((cur) => { const list = [...(cur ?? [])]; list.splice(Math.max(0, Math.min(undo.index, list.length)), 0, undo.item); return list })
    clearTimeout(undoTimer.current)
    setUndo(null)
  }

  // Keyboard: ↑↓ move, ← not for me, → save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [role="dialog"]') || document.querySelector('.ai-back, .sheet-wrap, .fd-sheet-back')) return
      const en = entries[active]
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); goTo(Math.min(active + 1, entries.length - 1)) }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); goTo(Math.max(active - 1, 0)) }
      else if (e.key === 'ArrowRight' && en?.t === 'item') save(en.item)
      else if (e.key === 'ArrowLeft' && en?.t === 'item') hide(en.item)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entries, active, goTo, save, hide])

  const authorOf = (it: FeedItem) => {
    const d = it.doc_id ? docs?.get(it.doc_id) : null
    const team = d ? teams.get(d.team_id) : null
    return team ?? null
  }
  const linesOf = (it: FeedItem) => {
    const d = it.doc_id ? docs?.get(it.doc_id) : null
    return previewLines(d?.body_md || it.summary_he, 16)
  }
  const cur = entries[active]
  const backdrop = cur?.t === 'item' ? cur.item.thumbnail_url || (cur.item.preview_video_id ? ytThumb(cur.item.preview_video_id) : null) : null

  return (
    <div className={`fd-wrap tk-${source}`}>
      <div className="fd-backdrop" style={backdrop ? { backgroundImage: `url("${backdrop}")` } : undefined} aria-hidden />
      <div className="fd-col">
        <div className="tk-top">
          <div className="tk-top-row">
            <Link to="/me" className="tk-me" aria-label="האזור שלי">
              <Avatar face={{ ...profile, name: profile.display_name || profile.email }} size={34} />
            </Link>
            <PointsPill />
            <span className="tk-grow" />
            <FilterBar icon value={f} onChange={setF} extra={agent}
              show={{ topic: topicList, kind: source !== 'internal', len: true, vertical: source !== 'internal', saved: true, lang: true }} />
            {listTo && (
              <Link to={listTo} className="tk-ico" aria-label="תצוגת רשימה">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
              </Link>
            )}
            <AiButton />
          </div>
          {head && <div className="tk-head">{head}</div>}
        </div>

        <div className="fd-scroller" ref={scroller}>
          {items === null && <div className="fd-card fd-empty"><div className="fd-spinner" aria-hidden />טוענים בשבילכם</div>}
          {items?.length === 0 && (
            <div className="fd-card fd-empty">
              <p className="fd-empty-title">עברתם על הכול</p>
              <p>תוכן חדש נכנס כל כמה שעות. אפשר לנקות את הסינון, או לשאול את ה-AI.</p>
            </div>
          )}
          {entries.map((en, i) => {
            const near = Math.abs(i - active) <= 1
            if (en.t === 'episode') return <EpisodeSlide key="ep" ep={en.ep} index={i} />
            if (en.t === 'leaders') return <LeadersSlide key="lead" rows={en.rows} index={i} />
            if (en.t === 'quote') return <QuoteSlide key={`q${en.q.comment_id}`} q={en.q} index={i} />
            const it = en.item
            return (
              <FeedCard key={it.id} item={it} index={i} active={i === active} near={near}
                topicName={topicName.get(it.topic_slug ?? '') ?? ''} lines={linesOf(it)} team={authorOf(it)}
                myId={myId} onSave={() => save(it)} onHide={() => hide(it)} />
            )
          })}
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
    </div>
  )
}

function FeedCard({ item, index, active, near, topicName, lines, team, myId, onSave, onHide }: {
  item: FeedItem; index: number; active: boolean; near: boolean; topicName: string; lines: string[]
  team: TeamLite | null; myId: string; onSave: () => void; onHide: () => void
}) {
  const s = useSocial(item.id)
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const [sheet, setSheet] = useState<'comments' | 'share' | null>(null)
  const [saved, setSaved] = useState(false)
  const [burst, setBurst] = useState<{ n: number; x: number; y: number } | null>(null)
  const start = useRef<{ x: number; y: number; locked: 'x' | 'y' | null } | null>(null)
  const lastTap = useRef(0)
  const listen = useListen(item, active)

  // Count a view after 2 seconds on screen.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => { track(item.id, 'open'); earn('open') }, 2000)
    return () => clearTimeout(t)
  }, [active, item.id])

  const like = () => { if (s?.mine !== 1) { react(item.id, 1); earn('react') } }

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
      // Two taps within 300ms = like, with a heart where the finger was.
      if ((e.target as HTMLElement).closest('button, a, audio')) return
      const now = Date.now()
      if (now - lastTap.current < 300) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        like(); setBurst((b) => ({ n: (b?.n ?? 0) + 1, x: e.clientX - r.left, y: e.clientY - r.top })); lastTap.current = 0
      } else lastTap.current = now
      return
    }
    if (st.locked !== 'x') return
    setDrag(false)
    const limit = Math.min(120, window.innerWidth * 0.28)
    if (dx > limit) { setDx(window.innerWidth); setTimeout(onSave, reduced ? 0 : 220) }
    else if (dx < -limit) { setDx(-window.innerWidth); setTimeout(onHide, reduced ? 0 : 220) }
    else setDx(0)
  }

  const stampSave = Math.max(0, Math.min(1, dx / 120))
  const stampHide = Math.max(0, Math.min(1, -dx / 120))
  const pub = fmtDate(item.published_at ?? item.created_at)
  const openTo = item.doc_id ? `/doc/${item.doc_id}` : `/item/${item.id}`
  const authorName = team ? `צוות ${team.team}` : item.kind === 'internal' ? 'קורה ב-zap' : item.source_name
  const why = item.why_he || item.summary_he
  const chips = [
    item.reason ? { label: item.reason, cls: 'hot' } : null,
    item.lang === 'he' ? { label: 'עברית', cls: 'he' } : null,
    item.minutes ? { label: fmtMinutes(item.minutes), cls: 'ghost' } : null,
    topicName ? { label: topicName, cls: 'ghost' } : null,
  ].filter((c): c is { label: string; cls: string } => !!c).slice(0, 2)

  return (
    <section className="fd-card" data-index={index} aria-label={item.title_he}>
      <div className={`fd-inner ${drag ? 'drag' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 22}deg)` : undefined }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; setDrag(false); setDx(0) }}>
        <LiveMedia item={item} active={active} near={near} lines={lines} by={team ? `צוות ${team.team}` : item.source_name}
          playing={listen.playing} onPlay={listen.toggle} />
        {burst && <span key={burst.n} className="tk-heart" style={{ left: burst.x, top: burst.y }} aria-hidden>
          <svg viewBox="0 0 24 24" width="110" height="110"><path fill="#ff5c9e" d="M12 21s-7.5-4.6-9.6-9.3C.8 7.9 3.2 4 7 4c2.1 0 3.7 1.1 5 2.9C13.3 5.1 14.9 4 17 4c3.8 0 6.2 3.9 4.6 7.7C19.5 16.4 12 21 12 21z" /></svg>
        </span>}

        <div className="fd-stamp save" style={{ opacity: stampSave }} aria-hidden>שומר לי</div>
        <div className="fd-stamp hide" style={{ opacity: stampHide }} aria-hidden>לא בשבילי</div>

        <div className="fd-body">
          <div className="tk-author">
            {team
              ? <span className="tk-av" style={{ background: teamColor(team.id) }} aria-hidden>{teamInitials(team.team)}</span>
              : <span className="tk-av src" aria-hidden>{(item.source_name || 'z').trim().charAt(0).toUpperCase()}</span>}
            <span className="tk-author-name"><bdi>{authorName}</bdi>{pub && <small> · {pub}</small>}{item.is_demo ? <small> · דמו</small> : null}</span>
          </div>
          <h2 className="fd-title">{item.title_he}</h2>
          {why && <p className="fd-why1">{why}</p>}
          <div className="fd-foot">
            {chips.map((c) => <span key={c.label} className={`fd-chip ${c.cls}`}>{c.label}</span>)}
            <Link className="fd-open" to={openTo}>לפתוח ←</Link>
          </div>
        </div>

        <div className="fd-rail" aria-label="פעולות">
          <RailBtn label="אהבתי" count={s?.likes ?? item.likes ?? 0} on={s?.mine === 1} pop
            onClick={() => { react(item.id, 1); if (s?.mine !== 1) earn('react') }}><IcoHeart /></RailBtn>
          <RailBtn label="פחות" on={s?.mine === -1} onClick={() => react(item.id, -1)}><IcoDown /></RailBtn>
          <RailBtn label="תגובות" count={s?.comments_count ?? 0} onClick={() => setSheet('comments')}><IcoChat /></RailBtn>
          <RailBtn label="לשתף" count={s?.shares_count || undefined} onClick={() => setSheet('share')}><IcoShare /></RailBtn>
          <RailBtn label={saved ? 'נשמר' : 'לשמור'} on={saved} pop
            onClick={() => { if (!saved) { setSaved(true); supabase.from('saves').insert({ item_id: item.id, user_id: myId }).then(({ error }) => { if (!error) { track(item.id, 'save'); earn('save') } }) } }}>
            <IcoSave />
          </RailBtn>
          <Remind itemId={item.id} trigger={(open) => <RailBtn label="אחר כך" onClick={open}><IClock size={24} /></RailBtn>} />
          <RailBtn label={listen.label} on={listen.playing} busy={listen.state === 'making'} onClick={listen.toggle}>
            {listen.state === 'making' ? <span className="listen-wave"><i /><i /><i /><i /></span> : listen.playing ? <IcoPause /> : <IcoHead />}
          </RailBtn>
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

// The media layer, alive only while the card is on screen (and never under reduced motion).
function LiveMedia({ item, active, near, lines, by, playing, onPlay }: {
  item: FeedItem; active: boolean; near: boolean; lines: string[]; by: string; playing: boolean; onPlay: () => void
}) {
  const live = active && !reduced
  const vid = item.preview_video_id
  const poster = item.thumbnail_url || (vid ? ytThumb(vid) : null)
  const isPage = !vid && item.kind !== 'internal' && item.kind !== 'podcast' && /^https?:\/\//.test(item.source_url)
  const [shot, setShot] = useState<'wait' | 'ok' | 'bad'>('wait')
  const [posterOk, setPosterOk] = useState(true)
  const frame = useRef<HTMLIFrameElement>(null)

  // YouTube: muted, from 0:20, looping a 15-second stretch.
  useEffect(() => {
    if (!live || !vid) return
    const t = setInterval(() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [20, true] }), '*'), 15000)
    return () => clearInterval(t)
  }, [live, vid])

  const paper = <div className="fd-docpv"><DocPreview big title={item.title_he} lines={lines} by={by} /></div>
  return (
    <div className={`fd-media${live ? ' live' : ''}`}>
      {poster && posterOk
        ? <img className="fd-thumb" src={poster} alt="" loading={near ? 'eager' : 'lazy'} draggable={false} onError={() => setPosterOk(false)} />
        : (shot !== 'ok' || !isPage) && paper}
      {isPage && near && shot !== 'bad' && (
        <img className={`fd-shot${shot === 'ok' ? ' on' : ''}`} src={pageShot(item.source_url)} alt="" draggable={false}
          onLoad={(e) => setShot(e.currentTarget.naturalHeight > 200 ? 'ok' : 'bad')} onError={() => setShot('bad')} />
      )}
      {vid && live && (
        <iframe ref={frame} className="fd-video" title={item.title_he} tabIndex={-1}
          src={`https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&mute=1&controls=0&playsinline=1&start=20&enablejsapi=1&modestbranding=1&rel=0&iv_load_policy=3`}
          allow="autoplay; encrypted-media; picture-in-picture" />
      )}
      {item.kind === 'podcast' && (
        <button className={`fd-pod${playing ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); onPlay() }} aria-label={playing ? 'לעצור' : 'להאזין לפרק'}>
          <span className="fd-eq" aria-hidden>{Array.from({ length: 9 }, (_, k) => <i key={k} />)}</span>
          <span className="fd-pod-btn" aria-hidden>{playing ? <IcoPause /> : <IcoPlay />}</span>
          <span className="fd-pod-label">{playing ? 'מנגן' : 'נגיעה אחת, וזה מתנגן'}</span>
        </button>
      )}
      <div className="fd-shade" />
    </div>
  )
}

// The podcast itself (from 1:00), or a two-host "להאזנה" conversation for anything written,
// made on the first tap and cached for everyone after. Stops when the card leaves the screen.
function useListen(item: FeedItem, active: boolean) {
  const [state, setState] = useState<'idle' | 'making' | 'ready' | 'error'>('idle')
  const [src, setSrc] = useState<string | null>(item.kind === 'podcast' && item.audio_url ? `${item.audio_url}#t=60` : null)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { audio.current?.pause() }, [])
  useEffect(() => { if (!active && audio.current && !audio.current.paused) { audio.current.pause(); setPlaying(false) } }, [active])

  const play = (url: string) => {
    if (!audio.current) { audio.current = new Audio(url); audio.current.onended = () => setPlaying(false) }
    audio.current.play().then(() => setPlaying(true), () => setPlaying(false))
  }
  const toggle = async () => {
    if (playing) { audio.current?.pause(); setPlaying(false); return }
    if (src) { play(src); return }
    if (state === 'making') return
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
  const label = playing ? 'עוצרים' : state === 'making' ? 'מכינים' : state === 'error' ? 'שוב' : 'להאזין'
  return { state, playing, toggle, label }
}

function EpisodeSlide({ ep, index }: { ep: Episode; index: number }) {
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { audio.current?.pause() }, [])
  const toggle = () => {
    if (!ep.audio_url) return
    if (!audio.current) { audio.current = new Audio(ep.audio_url); audio.current.onended = () => setPlaying(false) }
    if (playing) { audio.current.pause(); setPlaying(false) } else audio.current.play().then(() => setPlaying(true), () => setPlaying(false))
  }
  return (
    <section className="fd-card" data-index={index} aria-label="הפרק השבועי שלכם">
      <div className="fd-inner tk-special tk-episode">
        <span className="tk-kicker">הפרק השבועי שלכם</span>
        <h2>מה שווה להכיר השבוע</h2>
        <ol className="tk-ep-list">
          {ep.items.map((i, n) => (
            <li key={i.id}>
              <Link to={`/item/${i.id}`}>
                <span className="tk-ep-thumb">{i.thumbnail_url ? <img src={i.thumbnail_url} alt="" loading="lazy" /> : <b>{n + 1}</b>}</span>
                <span>{i.title_he}</span>
              </Link>
            </li>
          ))}
        </ol>
        {ep.audio_url && (
          <button className={`tk-big-play${playing ? ' on' : ''}`} onClick={toggle} aria-pressed={playing}>
            <span className="fd-eq small" aria-hidden>{Array.from({ length: 5 }, (_, k) => <i key={k} />)}</span>
            {playing ? 'עוצרים' : 'להאזין לפרק'}
          </button>
        )}
      </div>
    </section>
  )
}

function LeadersSlide({ rows, index }: { rows: BoardRow[]; index: number }) {
  const gap = useRankGap()
  const order = [rows[1], rows[0], rows[2]].filter(Boolean)
  return (
    <section className="fd-card" data-index={index} aria-label="המובילים החודש">
      <div className="fd-inner tk-special tk-leaders">
        <span className="tk-kicker">המובילים החודש</span>
        <div className="tk-podium">
          {order.map((r) => (
            <div key={r.rank + r.name} className={`tk-pod r${r.rank}${r.is_me ? ' me' : ''}`}>
              {r.user_id ? <Avatar face={{ ...r, user_id: r.user_id }} size={r.rank === 1 ? 72 : 56} /> : null}
              <b>{r.name}</b>
              <small>{r.team}</small>
              <span className="tk-pod-bar"><span>{r.rank}</span>{r.points.toLocaleString('he-IL')}</span>
            </div>
          ))}
        </div>
        {gap && <p className="tk-gap">{rankLine(gap)}</p>}
        <Link className="fd-btn" to="/me#points">לטבלה המלאה</Link>
      </div>
    </section>
  )
}

function QuoteSlide({ q, index }: { q: Quote; index: number }) {
  return (
    <section className="fd-card" data-index={index} aria-label={`${q.author} כתבו`}>
      <div className="fd-inner tk-special tk-quote">
        <span className="tk-kicker">עובדים מספרים</span>
        <blockquote>{q.body}</blockquote>
        <div className="tk-quote-by">
          {q.user_id && <Avatar face={{ user_id: q.user_id, name: q.author }} size={44} />}
          <span><b>{q.author}</b>{q.team && <small>{q.team}</small>}</span>
        </div>
        <Link className="tk-quote-on" to={`/item/${q.item_id}`}>על: {q.item_title} ←</Link>
      </div>
    </section>
  )
}

function RailBtn({ label, count, on, pop, busy, onClick, children }: {
  label: string; count?: number; on?: boolean; pop?: boolean; busy?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button className={`fd-rail-btn${on ? ' on' : ''}${on && pop ? ' pop' : ''}`} aria-label={count !== undefined ? `${label}, ${count}` : label}
      aria-pressed={on} aria-busy={busy} onClick={(e) => { e.stopPropagation(); onClick() }}>
      <span className="fd-rail-ico">{children}</span>
      <span className="fd-rail-n">{count !== undefined ? count.toLocaleString('he-IL') : label}</span>
    </button>
  )
}

const svg = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IcoHeart = () => <svg {...svg}><path d="M12 20s-7-4.3-8.9-8.6C1.6 8 3.8 4.5 7.2 4.5c2 0 3.5 1 4.8 2.7 1.3-1.7 2.8-2.7 4.8-2.7 3.4 0 5.6 3.5 4.1 6.9C19 15.7 12 20 12 20z" /></svg>
const IcoDown = () => <svg {...svg}><path d="M17 14V3h3v11h-3zM17 14l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17" /></svg>
const IcoChat = () => <svg {...svg}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
const IcoShare = () => <svg {...svg}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" /></svg>
const IcoSave = () => <svg {...svg}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>
const IcoHead = () => <svg {...svg}><path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2z" /></svg>
const IcoX = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>
const IcoPlay = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>
const IcoPause = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>

export { KIND_LABEL }
