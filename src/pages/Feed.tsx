import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ITEM_COLS, Item, KIND_LABEL, supabase, track, callFn } from '../lib'
import { Comments, ShareSheet, getSocial, react, useSocial } from '../components/social'
import { BoardRow, earn } from '../components/points'
import { BoardCard } from '../components/board'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'
import { PageNav, useApp } from '../App'
import { openProfile, openPublish } from './Me'
import '../feed.css'
import '../tiktok.css'
import '../desk.css'
import { Remind } from '../components/Remind'
import { IClock } from '../components/icons'
import { Avatar } from '../components/Avatar'
import { AiButton } from '../components/AiSheet'
import { teamColor, teamInitials } from './Doc'
import { DocPreview, previewLines } from '../components/ui'
import { Layer } from '../components/Layer'
import { EpisodeBell, EpisodePlayer } from '../components/Episodes'
import { choosePreview, pageShot, proxied, ytId } from '../preview'
import { TypeBadge } from '../components/TypeBadge'
import zapMark from '../assets/zap-mark-white.png'
import { Avatar as Face } from '../components/Avatar'
import { DetailBody, DetailLink, setDetailHost, type Target } from '../components/detail'

// zap UP is a TikTok for work: one full-screen vertical feed (up/down = next/prev), a horizontal
// swipe per card (right = save, left = not for me), double-tap = like, and a rail of reactions.
// Every card previews itself live: the video plays, the podcast's equalizer moves, a web page
// scrolls past as a real capture of that page, a team document scrolls by as you'd read it.
// On a desktop the feed is a stage: the card in the middle, its rail beside it, and a panel
// with the details, comments and what's next, so nothing ever covers the card.

export type FeedSource = 'all' | 'external' | 'internal' | 'bites' | 'trending' | 'team' | 'saved' | 'later' | 'history'
export type ReasonKind = 'personal' | 'team' | 'platform' | 'share' | 'explore'
type FeedItem = Item & { reason?: string | null; reason_kind?: ReasonKind | null }
type TeamLite = { id: number; team: string }
type DocLite = { id: number; team_id: number; body_md?: string | null; tools?: string[] | null }
type Episode = { week: string; body_he: string; audio_url: string | null; items: Item[]; segments?: string[] }
type Quote = { comment_id: number; item_id: number; item_title: string; body: string; author: string; user_id: string | null; team: string | null }
type Entry =
  | { t: 'item'; item: FeedItem }
  | { t: 'episode'; ep: Episode }
  | { t: 'leaders'; rows: BoardRow[] }
  | { t: 'quote'; q: Quote }
  | { t: 'card'; key: string; node: React.ReactNode }
  | { t: 'hot'; lane: 'trending' | 'team'; items: FeedItem[] }

// Who liked a card (item_likers, patch-019): my team first, then the most recent.
export type Liker = { item_id: number; user_id: string; display_name: string; avatar_url: string | null; avatar_style: string | null
  avatar_color: string | null; team: string | null; is_demo: boolean; liked_at: string; total: number }

async function fetchItems(ids: number[]): Promise<FeedItem[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('items').select(ITEM_COLS).in('id', ids)
  const byId = new Map(((data ?? []) as unknown as FeedItem[]).map((i) => [i.id, i]))
  return ids.map((id) => byId.get(id)).filter((x): x is FeedItem => !!x)
}

const reasonOf = (r: { shared_by?: string | null; popular_with?: string | null }) =>
  r.shared_by ? `המלצה מ-${r.shared_by}` : r.popular_with ? `פופולרי אצל ${r.popular_with}` : null

// The three-level ranking (patch-025): personal, team and platform scores, per lane, with a reason.
type V2Lane = 'for_you' | 'zap' | 'world' | 'quick' | 'trending' | 'team'
async function rankedV2(lane: V2Lane, limit = 40, maxMinutes?: number): Promise<FeedItem[] | null> {
  const { data, error } = await supabase.rpc('feed_v2', { p_limit: limit, p_lane: lane, ...(maxMinutes ? { p_max_minutes: maxMinutes } : {}) })
  if (error) return null
  const rows = (data ?? []) as { id: number; reason_he: string | null; reason_kind: ReasonKind | null; popular_with: string | null; shared_by: string | null }[]
  const why = new Map(rows.map((r) => [r.id, r]))
  return (await fetchItems(rows.map((r) => r.id))).map((i) => {
    const r = why.get(i.id)
    return { ...i, reason: r?.reason_kind === 'explore' ? 'אולי יפתיע אתכם' : r?.reason_he ?? reasonOf(r ?? {}), reason_kind: r?.reason_kind ?? null }
  })
}
const MINUTES: Record<string, number> = { '15 דקות': 10, 'שעה': 15, '2-3 שעות': 20, 'יותר': 30 }

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

const DESK = '(min-width: 1024px)'
export function useDesk() {
  const [desk, setDesk] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(DESK).matches)
  useEffect(() => {
    const m = window.matchMedia?.(DESK)
    if (!m) return
    const on = () => setDesk(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return desk
}

// Card shape on a desktop stage: video and source images are landscape, podcast art is square,
// page captures and documents are tall. On a phone every card is the full screen.
type Shape = 'wide' | 'square' | 'tall'
const shapeOf = (i: FeedItem): Shape =>
  i.kind === 'podcast' ? 'square' : i.preview_video_id || i.thumbnail_url ? 'wide' : 'tall'

const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const saveData = typeof navigator !== 'undefined' && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
const YT_Q = ['maxresdefault', 'sddefault', 'hqdefault']
const ytStill = (id: string, q = 0) => `https://i.ytimg.com/vi/${id}/${YT_Q[q]}.jpg`

// האזור שלי: what I saved, what I queued for later, everything I touched; searchable.
async function loadMine(source: 'saved' | 'later' | 'history', q: string): Promise<FeedItem[]> {
  const uniq = (ids: (number | null)[]) => [...new Set(ids.filter((x): x is number => !!x))]
  if (source === 'later') {
    const [ll, rm] = await Promise.all([
      supabase.from('listen_later').select('item_id'),
      supabase.from('reminders').select('item_id').is('sent_at', null).order('send_at'),
    ])
    const ids = uniq([...((rm.data ?? []) as { item_id: number | null }[]).map((r) => r.item_id), ...((ll.data ?? []) as { item_id: number }[]).map((r) => r.item_id)])
    const list = await fetchItems(ids)
    const t = q.trim().toLowerCase()
    return t ? list.filter((i) => `${i.title_he} ${i.summary_he ?? ''}`.toLowerCase().includes(t)) : list
  }
  const { data } = await supabase.rpc('my_history', { p_q: q.trim(), p_type: source === 'saved' ? 'save' : null, p_limit: 120 })
  return fetchItems(uniq(((data ?? []) as { item_id: number }[]).map((r) => r.item_id)).slice(0, 60))
}

const EMPTY: Partial<Record<FeedSource, [string, string]>> = {
  saved: ['עוד לא שמרתם כלום', 'בפיד, הסימנייה שומרת לכאן כל מה ששווה לחזור אליו.'],
  later: ['אין כאן כלום לאחר כך', 'תזכורת במייל או "להאזין אחר כך" מכל כרטיס, וזה מחכה כאן.'],
  history: ['ההיסטוריה עוד ריקה', 'כל מה שתפתחו, תאהבו או תגיבו עליו יופיע כאן.'],
}

export default function Feed({ source, head, listTo, agent, q = '', chip, prefix, carousel, onLane }: {
  source: FeedSource
  q?: string                   // search inside the personal lanes
  chip?: React.ReactNode       // the profile chip, on האזור שלי
  prefix?: { key: string; node: React.ReactNode }[]   // my own cards, before the feed (האזור שלי)
  carousel?: React.ReactNode   // instead of a feed: one slide holding a horizontal carousel (שלי)
  onLane?: (lane: 'trending' | 'team') => void   // open "חם ב-zap" / "חם בצוות שלכם" as a feed
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
  const [kept, setKept] = useState<Set<number>>(new Set())
  const [sheet, setSheet] = useState<{ item: FeedItem; kind: 'comments' | 'share' } | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [faces, setFaces] = useState<Map<string, BoardRow[]>>(new Map())
  const goToRef = useRef<(i: number) => void>(() => {})
  const desk = useDesk()
  const scroller = useRef<HTMLDivElement>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout>>()

  // On a desktop, "לפתוח" (and any open from the AI or a deep link) lands in this feed's panel.
  useEffect(() => {
    if (!desk) return
    return setDetailHost((t) => {
      setPanel({ kind: 'details', target: t })
      const i = entriesRef.current.findIndex((e) => e.t === 'item' && (t.kind === 'item' ? e.item.id === t.id : e.item.doc_id === t.id))
      if (i >= 0) goToRef.current(i)
    })
  }, [desk])
  useEffect(() => { if (!desk) setPanel(null) }, [desk])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? ''))
    Promise.all([
      supabase.from('team_profiles').select('id,team'),
      supabase.from('team_docs').select('id,team_id,body_md,tools'),
    ]).then(([t, d]) => {
      setTeams(new Map(((t.data ?? []) as TeamLite[]).map((x) => [x.id, x])))
      setDocs(new Map(((d.data ?? []) as DocLite[]).map((x) => [x.id, x])))
    })
    // The people on each team, for the faces on team documents.
    supabase.rpc('leaderboard', { p_period: 'all', p_scope: 'people', p_limit: 200 }).then(({ data, error }) => {
      if (error) return
      const m = new Map<string, BoardRow[]>()
      for (const r of (data ?? []) as BoardRow[]) { if (r.team) m.set(r.team, [...(m.get(r.team) ?? []), r]) }
      setFaces(m)
    })
  }, [])

  // The home feed also carries the weekly episode, the monthly leaders and what colleagues wrote.
  useEffect(() => {
    if (source !== 'all') return
    supabase.from('episodes').select('*').order('week', { ascending: false }).limit(1).maybeSingle()
      .then(async ({ data }) => {
        const e = data as { week: string; body_he: string; audio_url: string | null; item_ids: number[]; segments?: string[] } | null
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
    if (!docs || carousel) return
    let alive = true
    setItems(null); setActive(0); setMore('idle')
    const load = async (): Promise<FeedItem[]> => {
      if (source === 'saved' || source === 'later' || source === 'history') return loadMine(source, q)
      // feed_v2 for every home lane; the older ranking only if it fails.
      const lane: V2Lane | null = source === 'all' ? 'for_you' : source === 'internal' ? 'zap' : source === 'external' ? 'world'
        : source === 'bites' ? 'quick' : source === 'trending' ? 'trending' : source === 'team' ? 'team' : null
      if (lane) {
        const v2 = await rankedV2(lane, 40, lane === 'quick' ? MINUTES[profile.weekly_time ?? ''] ?? 7 : undefined)
        if (v2 && v2.length) return v2
      }
      if (source === 'internal' || source === 'team') return loadInternal(myTeamId, profile.topics, docs)
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
  }, [source, q, JSON.stringify(f), saved, docs, myTeamId]) // eslint-disable-line react-hooks/exhaustive-deps

  // "חם ב-zap" and "חם בצוות שלכם": their top 3, as cards inside בשבילך.
  const [hot, setHot] = useState<{ trending: FeedItem[]; team: FeedItem[] }>({ trending: [], team: [] })
  useEffect(() => {
    if (source !== 'all') return
    Promise.all([rankedV2('trending', 3), rankedV2('team', 3)]).then(([t, m]) => setHot({ trending: t ?? [], team: m ?? [] }))
  }, [source])

  // Specials go between items: the episode third, leaders sixth, a colleague's words every sixth after.
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = (prefix ?? []).map((p) => ({ t: 'card', key: p.key, node: p.node }))
    let qn = 0
    for (const [n, item] of (items ?? []).entries()) {
      out.push({ t: 'item', item })
      if (n === 1 && episode) out.push({ t: 'episode', ep: episode })
      else if (n === 4 && leaders) out.push({ t: 'leaders', rows: leaders })
      else if (n >= 7 && (n - 7) % 6 === 0 && qn < quotes.length) out.push({ t: 'quote', q: quotes[qn++] })
      if (n === 8 && hot.trending.length) out.push({ t: 'hot', lane: 'trending', items: hot.trending })
      else if (n === 18 && hot.team.length) out.push({ t: 'hot', lane: 'team', items: hot.team })
    }
    return out
  }, [items, episode, leaders, quotes, prefix, hot])
  const entriesRef = useRef<Entry[]>([])
  entriesRef.current = entries

  // Social proof: the likers of every card on this page, in one call.
  const [likers, setLikers] = useState<Map<number, Liker[]>>(new Map())
  const likerKey = (items ?? []).map((i) => i.id).join(',')
  useEffect(() => {
    if (!likerKey) return
    supabase.rpc('item_likers', { p_item_ids: likerKey.split(',').map(Number), p_per: 3 }).then(({ data, error }) => {
      if (error) return  // not deployed yet: no stack, nothing else changes
      const m = new Map<number, Liker[]>()
      for (const r of (data ?? []) as Liker[]) m.set(r.item_id, [...(m.get(r.item_id) ?? []), r])
      setLikers(m)
    })
  }, [likerKey])
  const [likersOf, setLikersOf] = useState<number | null>(null)

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
    if (!items || (source !== 'all' && source !== 'external') || more !== 'idle' || active < entries.length - 3) return
    setMore('loading')
    loadMore(new Set(items.map((i) => i.id))).then((extra) => {
      setItems((cur) => (cur ? [...cur, ...applyFilters(extra, f, { saved })] : extra))
      setMore(extra.length ? 'idle' : 'done')
    })
  }, [active, items, entries.length, more, source]) // eslint-disable-line react-hooks/exhaustive-deps

  const slideH = useRef(0)
  const activeRef = useRef(0)
  activeRef.current = active
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight
      if (!h || h === slideH.current) return
      slideH.current = h
      el.style.setProperty('--slide-h', `${h}px`)
      // Re-snap to the card that was on screen.
      el.scrollTo({ top: activeRef.current * h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const goTo = useCallback((i: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: i * (slideH.current || el.clientHeight), behavior: reduced ? 'auto' : 'smooth' })
  }, [])
  goToRef.current = goTo

  const removeItem = useCallback((id: number) => setItems((cur) => (cur ? cur.filter((x) => x.id !== id) : cur)), [])

  // Swipe right: saved, and out of the feed.
  const save = useCallback(async (item: FeedItem) => {
    const { error } = await supabase.from('saves').insert({ item_id: item.id, user_id: myId })
    if (!error) { track(item.id, 'save'); earn('save') }
    removeItem(item.id)
  }, [myId, removeItem])

  // The rail's bookmark and "S": saved in place, the card stays.
  const keep = useCallback((item: FeedItem) => {
    setKept((cur) => {
      if (cur.has(item.id)) return cur
      supabase.from('saves').insert({ item_id: item.id, user_id: myId }).then(({ error }) => { if (!error) { track(item.id, 'save'); earn('save') } })
      return new Set(cur).add(item.id)
    })
  }, [myId])

  // Comments open beside the card on a desktop, as a sheet on a phone.
  const openComments = useCallback((item: FeedItem) => {
    if (desk) setPanel((p) => (p?.kind === 'comments' && p.item.id === item.id ? null : { kind: 'comments', item }))
    else setSheet({ item, kind: 'comments' })
  }, [desk])

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

  // Keyboard: ↑↓ or J/K move, L like, C comments, S save, ← not for me, → save and next.
  // Physical keys (e.code), so it works on a Hebrew layout too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape' && panel) { setPanel(null); return }
      if (t.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
      if (document.querySelector('.ai-back, .sheet-wrap, .fd-sheet-back, .dt-back')) return
      const en = entries[active]
      const it = en?.t === 'item' ? en.item : null
      if (e.key === 'ArrowDown' || e.code === 'KeyJ') { e.preventDefault(); goTo(Math.min(active + 1, entries.length - 1)) }
      else if (e.key === 'ArrowUp' || e.code === 'KeyK') { e.preventDefault(); goTo(Math.max(active - 1, 0)) }
      else if (!it) return
      else if (e.code === 'KeyL') { if (getSocial(it.id)?.mine !== 1) react(it.id, 1) }
      else if (e.code === 'KeyC') openComments(it)
      else if (e.code === 'KeyS') keep(it)
      else if (e.key === 'ArrowRight') save(it)
      else if (e.key === 'ArrowLeft') hide(it)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entries, active, goTo, save, hide, keep, openComments, panel])

  const extOf = (it: FeedItem) => {
    const text = [it.doc_id ? docs?.get(it.doc_id)?.body_md : null, it.summary_he].filter(Boolean).join('\n')
    return (text.match(/https?:\/\/[^\s)<>"']+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, '')).find((u) => !/zap-know|nitaizap\.github\.io|#\/doc\//i.test(u)) ?? null
  }
  const toolsOf = (it: FeedItem) => (it.doc_id ? docs?.get(it.doc_id)?.tools : null) ?? it.tools ?? []
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
  const backdrop = cur?.t === 'item' ? (ytIdOf(cur.item) ? ytStill(ytIdOf(cur.item)!, 2) : cur.item.thumbnail_url ? proxied(cur.item.thumbnail_url, 480) : null) : null

  const filterEl = (
    <FilterBar icon value={f} onChange={setF} extra={agent}
      show={{ topic: topicList, kind: source !== 'internal', len: true, vertical: source !== 'internal', saved: true, lang: true }} />
  )

  return (
    <div className={`fd-wrap tk-${source}${desk ? ' desk' : ''}${panel ? ' has-panel' : ''}`}>
      <div className="fd-backdrop" style={backdrop ? { backgroundImage: `url("${backdrop}")` } : undefined} aria-hidden />
      <div className="fd-col">
        {/* Minimal chrome: the zap logo top right, the tabs, the AI. Pages and me only on a desktop. */}
        <header className="tk-top">
          <div className="tk-top-row">
            {/* The lockup: the real zap mark and wordmark + UP, "by zap group" under it. */}
            <Link to="/" className="tk-brand" aria-label="zap UP by zap group, הבית">
              <span className="tk-lock"><img src={zapMark} alt="" width={70} height={31} /><b className="tk-up">UP</b></span>
              <small className="tk-by">by zap group</small>
            </Link>
            {desk && <PageNav className="tk-pages" />}
            <span className="tk-grow" />
            {desk && filterEl}
            {desk && listTo && (
              <Link to={listTo} className="tk-ico" aria-label="תצוגת רשימה">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
              </Link>
            )}
            {!desk && chip}
            {desk && <button type="button" className="tk-publish" onClick={() => openPublish()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              לפרסם
            </button>}
            <EpisodeBell />
            <AiButton />
            {desk && (chip ?? (
              <button type="button" className="tk-me" aria-label="הפרופיל שלי" onClick={() => openProfile()}>
                <Avatar face={{ ...profile, name: profile.display_name || profile.email }} size={34} />
              </button>
            ))}
          </div>
          {(head || !desk) && <div className="tk-head">{head}{!desk && filterEl}</div>}
        </header>

        <div className="fd-scroller" ref={scroller}>
          {carousel && <section className="fd-card fd-carousel-slide" data-index={0}>{carousel}</section>}
          {!carousel && <>
          {entries.map((en, i) => {
            const near = Math.abs(i - active) <= 1
            if (en.t === 'card') return (
              <section key={en.key} className="fd-card" data-index={i}><div className="fd-inner tk-special tk-mine">{en.node}</div></section>
            )
            if (en.t === 'hot') return <HotSlide key={`hot-${en.lane}`} lane={en.lane} items={en.items} index={i} onOpen={onLane} />
            if (en.t === 'episode') return <EpisodeSlide key="ep" ep={en.ep} index={i} />
            if (en.t === 'leaders') return <LeadersSlide key="lead" index={i} />
            if (en.t === 'quote') return <QuoteSlide key={`q${en.q.comment_id}`} q={en.q} index={i} />
            const it = en.item
            return (
              <FeedCard key={it.id} item={it} index={i} active={i === active} near={near} bite={source === 'bites'}
                lines={linesOf(it)} team={authorOf(it)} faces={faces.get(authorOf(it)?.team ?? '') ?? []} tools={toolsOf(it)} ext={extOf(it)}
                likers={likers.get(it.id) ?? []} myId={myId} onLikers={() => setLikersOf(it.id)}
                kept={kept.has(it.id)} onKeep={() => keep(it)} onSave={() => save(it)} onHide={() => hide(it)}
                onComments={() => openComments(it)} onShare={() => setSheet({ item: it, kind: 'share' })} />
            )
          })}
          {items === null && <div className="fd-card fd-empty"><div className="fd-spinner" aria-hidden />טוענים בשבילכם</div>}
          {items?.length === 0 && (
            <div className="fd-card fd-empty">
              <p className="fd-empty-title">{q && EMPTY[source] ? 'לא מצאנו' : EMPTY[source]?.[0] ?? 'עברתם על הכול'}</p>
              <p>{q && EMPTY[source] ? 'נסו מילה אחרת, או שאלו את ה-AI.' : EMPTY[source]?.[1] ?? 'תוכן חדש נכנס כל כמה שעות. אפשר לנקות את הסינון, או לשאול את ה-AI.'}</p>
            </div>
          )}
          {items && items.length > 0 && more === 'done' && (
            <div className="fd-card fd-empty">
              <p className="fd-empty-title">זהו להיום</p>
              <p>ראיתם את כל מה שחדש. מחר יש עוד.</p>
            </div>
          )}
          </>}
        </div>

        {desk && entries.length > 1 && (
          <div className="fd-arrows">
            <button onClick={() => goTo(Math.max(active - 1, 0))} disabled={active === 0} aria-label="הקודם"><IcoUp /></button>
            <button onClick={() => goTo(Math.min(active + 1, entries.length - 1))} disabled={active >= entries.length - 1} aria-label="הבא"><IcoDownArrow /></button>
          </div>
        )}

        {undo && (
          <div className="fd-snack" role="status">
            הסתרנו את זה מהפיד שלכם
            <button onClick={undoHide}>לבטל</button>
          </div>
        )}
      </div>

      {/* Desktop: a panel only when something was opened. ✕ or Esc and it's gone. */}
      {desk && panel && (
        <aside className={`fd-panel${panel.kind === 'comments' ? ' cm' : ''}`} aria-label={panel.kind === 'comments' ? 'תגובות' : 'פרטים'}>
          <div className="fp-head">
            <b>{panel.kind === 'comments' ? 'תגובות' : 'פרטים'}</b>
            <button className="fp-x" onClick={() => setPanel(null)} aria-label="לסגור"><IcoX /></button>
          </div>
          <div className="fp-body">
            {panel.kind === 'comments'
              ? <Comments key={panel.item.id} item={panel.item} myId={myId} bare docked autoFocus />
              : <DetailBody target={panel.target} onOpen={(t) => setPanel({ kind: 'details', target: t })} />}
          </div>
        </aside>
      )}

      {sheet?.kind === 'comments' && (
        <Layer>
          <div className="fd-sheet-back" onClick={() => setSheet(null)}>
            <div className="fd-sheet" role="dialog" aria-modal="true" aria-label="תגובות" onClick={(e) => e.stopPropagation()}>
              <div className="fd-sheet-head">
                <b>תגובות</b>
                <button onClick={() => setSheet(null)} aria-label="לסגור"><IcoX /></button>
              </div>
              <div className="fd-sheet-body cm"><Comments item={sheet.item} myId={myId} bare docked autoFocus /></div>
            </div>
          </div>
        </Layer>
      )}
      {sheet?.kind === 'share' && <ShareSheet item={sheet.item} onClose={() => setSheet(null)} />}
      {likersOf !== null && <LikersSheet itemId={likersOf} onClose={() => setLikersOf(null)} />}
    </div>
  )
}

// Everyone who liked a card: face, name, team.
function LikersSheet({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const [rows, setRows] = useState<Liker[] | null>(null)
  useEffect(() => {
    supabase.rpc('item_likers', { p_item_ids: [itemId], p_per: 50 }).then(({ data, error }) => setRows(error ? [] : ((data as Liker[]) ?? [])))
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [itemId, onClose])
  return (
    <Layer>
      <div className="fd-sheet-back" onClick={onClose}>
        <div className="fd-sheet short" role="dialog" aria-modal="true" aria-label="מי אהב" onClick={(e) => e.stopPropagation()}>
          <div className="fd-sheet-head"><b>מי אהב את זה</b><button onClick={onClose} aria-label="לסגור"><IcoX /></button></div>
          <div className="fd-sheet-body">
            <ul className="likers">
              {(rows ?? []).map((r) => (
                <li key={r.user_id}>
                  <Face face={{ ...r, name: r.display_name }} size={40} />
                  <span><b>{r.display_name}</b><small>{[r.team, r.is_demo ? 'דמו' : null].filter(Boolean).join(' · ')}</small></span>
                </li>
              ))}
              {rows?.length === 0 && <li className="likers-empty">עוד אין לייקים. אולי אתם הראשונים.</li>}
            </ul>
          </div>
        </div>
      </div>
    </Layer>
  )
}

type Panel = { kind: 'details'; target: Target } | { kind: 'comments'; item: FeedItem }
const targetOf = (i: FeedItem): Target => (i.doc_id ? { kind: 'doc', id: i.doc_id } : { kind: 'item', id: i.id })

function FeedCard({ item, index, active, near, bite, lines, team, faces, tools, ext, likers, myId, onLikers, kept, onKeep, onSave, onHide, onComments, onShare }: {
  item: FeedItem; index: number; active: boolean; near: boolean; bite: boolean; lines: string[]
  team: TeamLite | null; faces: BoardRow[]; tools: string[]; ext: string | null; likers: Liker[]; myId: string; onLikers: () => void; kept: boolean; onKeep: () => void; onSave: () => void; onHide: () => void
  onComments: () => void; onShare: () => void
}) {
  const s = useSocial(item.id)
  const { profile } = useApp()
  // Optimistic: my face joins the stack the moment I like, and leaves when I unlike.
  const serverMe = likers.some((l) => l.user_id === myId)
  const iLike = s ? s.mine === 1 : serverMe
  const others = likers.filter((l) => l.user_id !== myId)
  const meFace: Liker = { item_id: item.id, user_id: myId, display_name: profile.display_name || 'אתם', avatar_url: profile.avatar_url ?? null,
    avatar_style: profile.avatar_style ?? null, avatar_color: profile.avatar_color ?? null, team: profile.role, is_demo: false, liked_at: '', total: 0 }
  const stack = (iLike ? [meFace, ...others] : others).slice(0, 4)
  const total = Math.max(stack.length, (likers[0]?.total ?? 0) + (iLike && !serverMe ? 1 : 0) - (!iLike && serverMe ? 1 : 0))
  const firstName = (n: string) => n.replace(/\s*\(דמו\)/, '').split(/\s+/)[0]
  const likeLine = !stack.length ? null
    : `לייק מ${stack[0].user_id === myId ? 'כם' : `-${firstName(stack[0].display_name)}`}${total > 1 ? ` ועוד ${(total - 1).toLocaleString('he-IL')}` : ''}`
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const [burst, setBurst] = useState<{ n: number; x: number; y: number } | null>(null)
  const [menu, setMenu] = useState(false)
  const start = useRef<{ x: number; y: number; locked: 'x' | 'y' | null } | null>(null)
  const lastTap = useRef(0)
  const remind = useRef<(() => void) | null>(null)
  const listen = useListen(item, active)

  // Count a view after 2 seconds on screen.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => { track(item.id, 'open'); earn('open') }, 2000)
    return () => clearTimeout(t)
  }, [active, item.id])

  // The "⋯" menu closes on any outside tap, and when the card leaves the screen.
  useEffect(() => {
    if (!menu) return
    const off = (e: Event) => { if (!(e.target as HTMLElement).closest('.fd-more-wrap')) setMenu(false) }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [menu])
  useEffect(() => { if (!active) setMenu(false) }, [active])

  const like = () => { if (s?.mine !== 1) react(item.id, 1) }

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
  const authorName = team ? `צוות ${team.team}` : item.kind === 'internal' ? 'קורה ב-zap' : item.source_name
  // Light media (a document page, a web capture) gets a dark band behind the caption.
  const band = !ytIdOf(item) && !item.thumbnail_url && item.kind !== 'podcast' && !item.doc_id
  // Listening is the main action for podcasts and for text; elsewhere it sits in "⋯".
  const listenMain = item.kind === 'podcast' || !!item.doc_id || band
  const listenBtn = (
    <RailBtn label={listen.label} on={listen.playing} busy={listen.state === 'making'} onClick={listen.toggle}>
      {listen.state === 'making' ? <span className="listen-wave"><i /><i /><i /><i /></span> : listen.playing ? <IcoPause /> : <IcoHead />}
    </RailBtn>
  )

  return (
    <section className={`fd-card shape-${shapeOf(item)}`} data-index={index} aria-label={item.title_he}>
      <div className={`fd-inner ${drag ? 'drag' : ''}`}
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 22}deg)` : undefined }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; setDrag(false); setDx(0) }}>
        <LiveMedia item={item} active={active} near={near} lines={lines} team={team} faces={faces} tools={tools} ext={ext}
          playing={listen.playing} onPlay={listen.toggle} />
        {burst && <span key={burst.n} className="tk-heart" style={{ left: burst.x, top: burst.y }} aria-hidden>
          <svg viewBox="0 0 24 24" width="110" height="110"><path fill="#ff5c9e" d="M12 21s-7.5-4.6-9.6-9.3C.8 7.9 3.2 4 7 4c2.1 0 3.7 1.1 5 2.9C13.3 5.1 14.9 4 17 4c3.8 0 6.2 3.9 4.6 7.7C19.5 16.4 12 21 12 21z" /></svg>
        </span>}

        <div className="fd-stamp save" style={{ opacity: stampSave }} aria-hidden>שומר לי</div>
        <div className="fd-stamp hide" style={{ opacity: stampHide }} aria-hidden>לא בשבילי</div>

        <TypeBadge item={item} bite={bite} className="fd-type" note={team ? `צוות ${team.team}` : undefined} />
        {/* A team doc shown on its tool's page: the tool's logo in the corner says which tool it is. */}
        {item.doc_id && item.thumbnail_url && tools[0] && <span className="fd-toolchip"><ToolLogo name={mainTool(item.title_he, tools)} /></span>}

        {/* The caption is the way in: tap it to open, in place. */}
        <DetailLink {...targetOf(item)} className={`fd-cap${band ? ' band' : ''}`} label={`לפתוח: ${item.title_he}`}>
          {item.reason && <span className={`fd-reason k-${item.reason_kind ?? 'personal'}`}><ReasonIcon kind={item.reason_kind ?? 'personal'} />{item.reason}</span>}
          <h2 className="fd-title">{item.title_he}</h2>
          <span className="fd-src">
            <bdi>{authorName}</bdi>{item.lang === 'he' ? ' · עברית' : ''}{item.is_demo ? ' · דמו' : ''}
            <span className="fd-go" aria-hidden>↗</span>
          </span>
          {likeLine && <span className="fd-likeline">{likeLine}</span>}
        </DetailLink>
      </div>

      <div className="fd-rail" aria-label="פעולות">
        <div className="fd-likewrap">
        <RailBtn tone="like" label="אהבתי" count={s?.likes ?? item.likes ?? 0} on={s?.mine === 1} pop onClick={() => react(item.id, 1)}><IcoHeart /></RailBtn>
        {stack.length > 0 && (
          // The faces sit on a ring around the heart (2, 10, 4, 8 o'clock), on its edge, never over it.
          <span className="fd-ring">
            {stack.map((l, n) => (
              <button key={l.user_id} type="button" className={`fd-ring-face s${n}${l.user_id === myId ? ' me' : ''}`} tabIndex={n === 0 ? 0 : -1}
                aria-label={n === 0 ? `${likeLine}. מי אהב` : undefined} onClick={(e) => { e.stopPropagation(); onLikers() }}>
                <Face face={{ ...l, name: l.display_name }} size={24} />
              </button>
            ))}
          </span>
        )}
        </div>
        <RailBtn tone="dislike" label="לא אהבתי" count={s?.dislikes ?? 0} on={s?.mine === -1} onClick={() => react(item.id, -1)}><IcoDown /></RailBtn>
        <RailBtn tone="comment" label="תגובות" count={s?.comments_count ?? 0} onClick={onComments}><IcoChat /></RailBtn>
        <RailBtn tone="share" label="לשתף" count={s?.shares_count ?? 0} onClick={onShare}><IcoShare /></RailBtn>
        <RailBtn tone="save" label={kept ? 'נשמר' : 'לשמור'} on={kept} pop onClick={onKeep}><IcoSave /></RailBtn>
        {listenMain && listenBtn}
        <div className="fd-more-wrap">
          <RailBtn label="עוד" on={menu} onClick={() => setMenu((m) => !m)}><IcoMore /></RailBtn>
          {menu && (
            <div className="fd-more" role="menu">
              {!listenMain && (
                <button role="menuitem" onClick={() => { listen.toggle(); setMenu(false) }}><IcoHead /> {listen.playing ? 'לעצור' : 'להאזין לזה'}</button>
              )}
              <button role="menuitem" onClick={() => { setMenu(false); remind.current?.() }}><IClock size={20} /> תזכורת במייל</button>
              <button role="menuitem" onClick={() => { setMenu(false); onHide() }}><IcoX /> לא בשבילי</button>
            </div>
          )}
        </div>
        <Remind itemId={item.id} trigger={(open) => { remind.current = open; return null }} />
      </div>
    </section>
  )
}

// A source still that looks good at any size and ratio: a blurred, darkened copy fills the frame,
// the sharp image sits on top (cover when its shape is close to the frame's, contain otherwise),
// a shimmer holds the place until it loads, and a slow Ken Burns keeps it alive.
function Still({ src, live, onLoad, onFail }: {
  src: string; live: boolean; onLoad?: (img: HTMLImageElement) => boolean | void; onFail: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'wait' | 'cover' | 'contain'>('wait')
  useEffect(() => setState('wait'), [src])
  const loaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (onLoad?.(img) === false) return
    const r = box.current?.getBoundingClientRect()
    const card = r && r.height ? r.width / r.height : 9 / 16
    const ratio = img.naturalWidth / Math.max(1, img.naturalHeight)
    setState(img.naturalWidth >= 600 && Math.abs(Math.log(ratio / card)) < 0.28 ? 'cover' : 'contain')
  }
  return (
    <div ref={box} className={`st st-${state}${live && !reduced ? ' live' : ''}`}>
      {state !== 'wait' && <img className="st-bg" src={src} alt="" aria-hidden draggable={false} />}
      <img className="st-img" src={src} alt="" decoding="async" draggable={false} onLoad={loaded} onError={onFail} />
      {state === 'wait' && <span className="st-shim" aria-hidden />}
    </div>
  )
}

// A YouTube id from the column, or from any watch / youtu.be / shorts / embed link, or from a
// YouTube thumbnail, so every video plays even when the collector didn't store the id.
const YT_RE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/
export const ytIdOf = (i: Pick<Item, 'kind' | 'source_url'> & Partial<Pick<Item, 'preview_video_id' | 'thumbnail_url'>>) => ytId(i)

// When a page has no usable image and its capture fails: what the page itself declares
// (og:image, og:video, an embedded YouTube), via microlink. Cached per URL, a few calls per visit.
type Meta = { image: string | null; video: string | null; yt: string | null }
let metaBudget = 6
async function metaOf(url: string): Promise<Meta> {
  const key = `zapup.meta.${url}`
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c) as Meta } catch { /* storage blocked */ }
  const none: Meta = { image: null, video: null, yt: null }
  if (metaBudget <= 0) return none
  metaBudget--
  try {
    const j = await (await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)).json()
    const d = (j?.data ?? {}) as { image?: { url?: string; width?: number }; video?: { url?: string }; iframe?: { html?: string } }
    const m: Meta = {
      image: d.image?.url && (d.image.width ?? 600) >= 300 ? d.image.url : null,
      video: d.video?.url && /\.(mp4|webm)(\?|$)/i.test(d.video.url) ? d.video.url : null,
      yt: (d.video?.url ?? '').match(YT_RE)?.[1] ?? (d.iframe?.html ?? '').match(YT_RE)?.[1] ?? null,
    }
    try { localStorage.setItem(key, JSON.stringify(m)) } catch { /* storage blocked */ }
    return m
  } catch { return none }
}

// A YouTube clip over its still: muted, looping, from a lively point. It fades in once the player
// reports it's playing (or shortly after it loads, if the player never says).
function YouTubeLoop({ vid, list, poster, live, title }: { vid?: string; list?: string; poster?: string; live: boolean; title: string }) {
  const [q, setQ] = useState(0)
  const [ok, setOk] = useState(true)
  const [clip, setClip] = useState(false)
  const [full, setFull] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const from = useRef(20)
  const play = live && !saveData && !full
  // Leaving the card stops the real player and goes back to the loop.
  useEffect(() => { if (!live) setFull(false) }, [live])

  useEffect(() => {
    setClip(false)
    if (!play) return
    from.current = 20
    let seeked = false
    const post = (func: string, args: unknown[] = []) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let d: { event?: string; info?: unknown }
      try { d = JSON.parse(e.data) } catch { return }
      const info = d.info as { playerState?: number; duration?: number } | number | undefined
      const st = d.event === 'onStateChange' ? info : typeof info === 'object' ? info?.playerState : undefined
      if (st === 1) setClip(true)
      const dur = typeof info === 'object' ? info?.duration : undefined
      if (dur && dur > 90 && !seeked) { seeked = true; from.current = Math.round(dur * 0.25); post('seekTo', [from.current, true]) }
    }
    window.addEventListener('message', onMsg)
    const loop = setInterval(() => post('seekTo', [from.current, true]), 15000)
    return () => { window.removeEventListener('message', onMsg); clearInterval(loop) }
  }, [play, vid, list])

  const loaded = () => {
    const w = frame.current?.contentWindow
    w?.postMessage(JSON.stringify({ event: 'listening', id: vid ?? list, channel: 'widget' }), '*')
    w?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), '*')
    setTimeout(() => setClip(true), 2500)
  }
  const origin = encodeURIComponent(window.location.origin)
  return (
    <>
      {vid && ok && <Still src={ytStill(vid, q)} live={live && !clip}
        onLoad={(img) => { if (img.naturalWidth < 200 && q < YT_Q.length - 1) { setQ(q + 1); return false } }}
        onFail={() => (q < YT_Q.length - 1 ? setQ(q + 1) : setOk(false))} />}
      {!vid && (poster ? <Still src={poster} live={live && !clip} onFail={() => setOk(false)} /> : <span className="st-shim" aria-hidden />)}
      {play && (
        <iframe ref={frame} className={`fd-video${clip ? ' on' : ''}`} title={title} tabIndex={-1} onLoad={loaded}
          src={vid
            ? `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${vid}&start=20&enablejsapi=1&origin=${origin}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`
            : `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1&mute=1&controls=0&playsinline=1&loop=1&enablejsapi=1&origin=${origin}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`}
          allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
      )}
      {full ? (
        <>
          <iframe className="fd-player" title={title}
            src={vid
              ? `https://www.youtube.com/embed/${vid}?autoplay=1&controls=1&playsinline=1&rel=0`
              : `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1&controls=1&playsinline=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          <button type="button" className="fd-player-x" onClick={(e) => { e.stopPropagation(); setFull(false) }}>✕ חזרה לפיד</button>
        </>
      ) : (
        <button type="button" className="fd-playbtn" onClick={(e) => { e.stopPropagation(); setFull(true) }} aria-label={`לנגן את הסרטון: ${title}`}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </button>
      )}
    </>
  )
}

// Tools named in a team document, as their real logos (simple-icons), or a plain chip.
const TOOL_SLUG: [RegExp, string][] = [
  [/ga4|google analytics|אנליטיקס/i, 'googleanalytics'], [/looker/i, 'looker'], [/google ads|גוגל אדס/i, 'googleads'],
  [/tag manager|gtm/i, 'googletagmanager'], [/search console/i, 'googlesearchconsole'], [/meta|facebook|פייסבוק/i, 'meta'],
  [/instagram/i, 'instagram'], [/tiktok/i, 'tiktok'], [/figma/i, 'figma'], [/canva/i, 'canva'], [/hubspot/i, 'hubspot'],
  [/salesforce/i, 'salesforce'], [/jira/i, 'jira'], [/confluence/i, 'confluence'], [/slack/i, 'slack'], [/notion/i, 'notion'],
  [/monday/i, 'mondaydotcom'], [/semrush/i, 'semrush'], [/ahrefs/i, 'ahrefs'], [/tableau/i, 'tableau'], [/wordpress/i, 'wordpress'],
  [/zapier/i, 'zapier'], [/mailchimp/i, 'mailchimp'], [/chatgpt|openai/i, 'openai'], [/gemini/i, 'googlegemini'], [/bigquery/i, 'googlebigquery'],
  [/youtube/i, 'youtube'], [/shopify/i, 'shopify'], [/hotjar/i, 'hotjar'], [/google sheets|sheets/i, 'googlesheets'],
]
const mainTool = (title: string, tools: string[]) => tools.find((t) => title.toLowerCase().includes(t.split(' / ')[0].toLowerCase())) ?? tools[0]

function ToolLogo({ name }: { name: string }) {
  const slug = TOOL_SLUG.find(([re]) => re.test(name))?.[1]
  const [bad, setBad] = useState(false)
  if (!slug || bad) return <span className="dv-tool txt">{name}</span>
  return (
    <span className="dv-tool" title={name}>
      <img src={`https://cdn.jsdelivr.net/npm/simple-icons@13.0.0/icons/${slug}.svg`} alt={name} width={20} height={20} loading="lazy" onError={() => setBad(true)} />
    </span>
  )
}

// A team document as a striking card of its own: the team's colour, its key lines as a quote,
// the people on the team and the tools it uses. All of it is the document's own material.
const DARK_ON = new Set(['#ffc600', '#00ab12', '#ff5c9e'])
function DocVisual({ item, team, lines, faces, tools, live }: {
  item: FeedItem; team: TeamLite | null; lines: string[]; faces: BoardRow[]; tools: string[]; live: boolean
}) {
  const bg = team ? teamColor(team.id) : '#052b7a'
  const fg = DARK_ON.has(bg) ? '#001c32' : '#fff'
  const key = lines.filter((l) => l !== item.title_he).slice(0, 3)
  return (
    <div className={`dv${live && !reduced ? ' live' : ''}`} style={{ background: bg, color: fg }}>
      <span className="dv-shape a" aria-hidden /><span className="dv-shape b" aria-hidden />
      <div className="dv-team">
        <span className="dv-badge" style={{ color: bg }}>{team ? teamInitials(team.team) : 'zap'}</span>
        <b>{team ? `צוות ${team.team}` : item.source_name}</b>
      </div>
      {key.length > 0 && (
        <blockquote className="dv-quote">
          {key.map((l, i) => <p key={i} className={i === 0 ? 'lead' : ''}><mark>{l}</mark></p>)}
        </blockquote>
      )}
      <div className="dv-foot">
        {faces.length > 0 && (
          <span className="dv-faces" aria-label={`${faces.length} אנשים בצוות`}>
            {faces.slice(0, 5).map((p) => <Avatar key={p.user_id ?? p.name} face={{ ...p, user_id: p.user_id ?? p.name }} size={34} />)}
          </span>
        )}
        {tools.length > 0 && <span className="dv-tools">{tools.slice(0, 5).map((t) => <ToolLogo key={t} name={t} />)}</span>}
      </div>
    </div>
  )
}

// The media layer, best source first. Plain text is the very last resort.
type Stage = 'still' | 'shot' | 'meta' | 'text'
const stageMem = new Map<number, Stage>()
const stageOf = (id: number): Stage | null => {
  if (stageMem.has(id)) return stageMem.get(id)!
  try { const v = localStorage.getItem(`zapup.pv.${id}`) as Stage | null; if (v) { stageMem.set(id, v); return v } } catch { /* storage blocked */ }
  return null
}
const remember = (id: number, st: Stage) => {
  stageMem.set(id, st)
  try { localStorage.setItem(`zapup.pv.${id}`, st) } catch { /* storage blocked */ }
}

function LiveMedia({ item, active, near, lines, team, faces, tools, ext, playing, onPlay }: {
  item: FeedItem; active: boolean; near: boolean; lines: string[]; team: TeamLite | null; faces: BoardRow[]; tools: string[]; ext?: string | null
  playing: boolean; onPlay: () => void
}) {
  const live = active
  const pv = choosePreview(item)
  const vid = pv.vid
  const isDoc = pv.type === 'doc poster'
  const isPage = !vid && !isDoc && item.kind !== 'podcast' && /^https?:\/\//.test(item.source_url) && !/zap-know/.test(item.source_url)
  const [stage, setStage] = useState<Stage>(() => stageOf(item.id) ?? (pv.type === 'source image' ? 'still' : pv.type === 'page capture' ? 'shot' : 'text'))
  useEffect(() => { if (stage === 'text') remember(item.id, 'text') }, [stage, item.id])
  const [shotOk, setShotOk] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [artOk, setArtOk] = useState(true)
  // A post or doc without an image of its own: the image of the page it links to, if any.
  const [docMeta, setDocMeta] = useState<Meta | null>(null)
  useEffect(() => {
    if (!isDoc || !ext || !near || docMeta || stageOf(item.id) === 'text') return
    let alive = true
    metaOf(ext).then((m) => { if (alive) { setDocMeta(m); if (!m.image) remember(item.id, 'text') } })
    return () => { alive = false }
  }, [isDoc, ext, near, docMeta, item.id])

  // Ask microlink only when the page's own capture failed and the card is about to be seen.
  useEffect(() => {
    if (stage !== 'meta' || !near || meta) return
    let alive = true
    metaOf(item.source_url).then((m) => { if (alive) { setMeta(m); if (!m.image && !m.video && !m.yt) setStage('text') } })
    return () => { alive = false }
  }, [stage, near, meta, item.source_url])

  if (item.kind === 'podcast') {
    const art = artOk ? pv.still ?? null : null
    return (
      <div className={`fd-media pod${live ? ' live' : ''}`}>
        {art && <img className="pod-bg" src={art} alt="" aria-hidden draggable={false} />}
        <button className={`fd-pod${playing ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); onPlay() }} aria-label={playing ? 'לעצור' : 'להאזין לקטע מהפרק'}>
          {art
            ? <img className="pod-art" src={art} alt="" decoding="async" draggable={false} onError={() => setArtOk(false)} />
            : <span className="pod-art none" aria-hidden><IcoHead /></span>}
          <span className="fd-eq" aria-hidden>{Array.from({ length: 11 }, (_, k) => <i key={k} />)}</span>
          <span className="fd-pod-pill" aria-hidden>{playing ? <><IcoPause /> מנגן</> : <><IcoPlay /> האזנה</>}</span>
        </button>
        <div className="fd-shade" />
      </div>
    )
  }

  if (isDoc) {
    return (
      <div className={`fd-media${live ? ' live' : ''}`}>
        {docMeta?.image
          ? <Still src={proxied(docMeta.image)} live={live} onLoad={() => { remember(item.id, 'meta') }} onFail={() => setDocMeta({ image: null, video: null, yt: null })} />
          : <DocVisual item={item} team={team} lines={lines} faces={faces} tools={tools} live={live} />}
        <div className="fd-shade" />
      </div>
    )
  }

  const metaYt = meta?.yt ?? null
  const paper = (
    <div className="fd-docpv">
      <DocPreview big title={item.title_he} lines={lines} by={item.source_name}
        badge={{ color: '#001c32', initials: (item.source_name || 'z').trim().charAt(0).toUpperCase() }} />
    </div>
  )
  return (
    <div className={`fd-media${live ? ' live' : ''}`}>
      {vid || metaYt || pv.list ? <YouTubeLoop vid={vid || metaYt || undefined} list={pv.list} poster={pv.still} live={live} title={item.title_he} /> : (
        <>
          {stage === 'still' && pv.still && (
            <Still src={pv.still} live={live}
              onLoad={(img) => { if (isPage && img.naturalWidth < 300) { setStage('shot'); return false } remember(item.id, 'still') }}
              onFail={() => setStage(isPage ? 'shot' : 'text')} />
          )}
          {stage === 'shot' && (
            <>
              {!shotOk && <span className="st-shim" aria-hidden />}
              {near && (
                <img className={`fd-shot${shotOk ? ' on' : ''}`} src={pageShot(item.source_url, 1080)} alt="" draggable={false} decoding="async"
                  onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth > 300 && i.naturalHeight > 300) { setShotOk(true); remember(item.id, 'shot') } else setStage('meta') }}
                  onError={() => setStage('meta')} />
              )}
            </>
          )}
          {stage === 'meta' && meta?.video && live && !saveData
            ? <video className="fd-mp4" src={meta.video} poster={meta.image ?? undefined} muted loop playsInline autoPlay preload="metadata" />
            : stage === 'meta' && meta?.image
              ? <Still src={proxied(meta.image)} live={live} onLoad={() => { remember(item.id, 'meta') }} onFail={() => setStage('text')} />
              : stage === 'meta' ? <span className="st-shim" aria-hidden /> : null}
          {stage === 'text' && paper}
        </>
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

  const counted = useRef(false)
  const play = (url: string) => {
    if (!audio.current) {
      audio.current = new Audio(url)
      audio.current.onended = () => setPlaying(false)
      // A listen counts (for the ranking) once 30 seconds have played.
      const a = audio.current
      const start = item.kind === 'podcast' ? 60 : 0
      a.ontimeupdate = () => { if (!counted.current && a.currentTime - start >= 30) { counted.current = true; track(item.id, 'listen') } }
    }
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
  return (
    <section className="fd-card shape-tall" data-index={index} aria-label="הפרק השבועי שלכם">
      <div className="fd-inner tk-special tk-episode">
        <span className="tk-kicker">הפרק השבועי שלכם</span>
        <h2>מה שווה להכיר השבוע</h2>
        {(ep.segments?.length ?? 0) > 0 && <div className="tk-ep-segs">{ep.segments!.map((x) => <span key={x}>{x}</span>)}</div>}
        <ol className="tk-ep-list">
          {ep.items.map((i, n) => (
            <li key={i.id}>
              <DetailLink kind="item" id={i.id}>
                <span className="tk-ep-thumb">{i.thumbnail_url ? <img src={i.thumbnail_url} alt="" loading="lazy" /> : <b>{n + 1}</b>}</span>
                <span>{i.title_he}</span>
              </DetailLink>
            </li>
          ))}
        </ol>
        {/* The same player as the bell's list: playing it marks it heard. */}
        <EpisodePlayer ep={ep} big />
      </div>
    </section>
  )
}

function LeadersSlide({ index }: { index: number }) {
  return (
    <section className="fd-card" data-index={index} aria-label="המובילים">
      <div className="fd-inner tk-special tk-leaders"><BoardCard dark /></div>
    </section>
  )
}

function QuoteSlide({ q, index }: { q: Quote; index: number }) {
  return (
    <section className="fd-card shape-tall" data-index={index} aria-label={`${q.author} כתבו`}>
      <div className="fd-inner tk-special tk-quote">
        <span className="tk-kicker">עובדים מספרים</span>
        <blockquote>{q.body}</blockquote>
        <div className="tk-quote-by">
          {q.user_id && <Avatar face={{ user_id: q.user_id, name: q.author }} size={44} />}
          <span><b>{q.author}</b>{q.team && <small>{q.team}</small>}</span>
        </div>
        <DetailLink className="tk-quote-on" kind="item" id={q.item_id}>על: {q.item_title} ←</DetailLink>
      </div>
    </section>
  )
}

function RailBtn({ label, count, on, pop, busy, tone, onClick, children }: {
  label: string; count?: number; on?: boolean; pop?: boolean; busy?: boolean; tone?: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button className={`fd-rail-btn${tone ? ` tone-${tone}` : ''}${on ? ' on' : ''}${on && pop ? ' pop' : ''}`} aria-label={count !== undefined ? `${label}, ${count}` : label}
      aria-pressed={on} aria-busy={busy} onClick={(e) => { e.stopPropagation(); onClick() }}>
      <span className="fd-rail-ico">{children}</span>
      {count ? <span className="fd-rail-n">{count.toLocaleString('he-IL')}</span> : null}
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
const IcoUp = () => <svg {...svg}><path d="M6 15l6-6 6 6" /></svg>
const IcoDownArrow = () => <svg {...svg}><path d="M6 9l6 6 6-6" /></svg>
const IcoMore = () => <svg {...svg}><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
const IcoX = () => <svg {...svg}><path d="M18 6 6 18M6 6l12 12" /></svg>
const IcoPlay = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>
const IcoPause = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>

export { KIND_LABEL }

// A small icon per reason: ✦ personal, people for the team, a flame for zap-wide, an arrow for a share, a compass for explore.
function ReasonIcon({ kind }: { kind: ReasonKind }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'team') return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3 2.6 3 6" /></svg>
  if (kind === 'platform') return <svg {...p}><path d="M12 22c4 0 7-2.7 7-6.5 0-3.5-2.5-5.5-3.5-8.5-1.5 2-2 3-3.5 3.5C12 7 11 4 8.5 2 8.5 6 5 8.5 5 13.5 5 19 8 22 12 22z" /></svg>
  if (kind === 'share') return <svg {...p}><path d="M14 5l7 7-7 7M21 12H9a6 6 0 0 0-6 6" /></svg>
  if (kind === 'explore') return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
  return <svg {...p} fill="currentColor" stroke="none"><path d="M12 2.5l2.1 6.2 6.4 2.3-6.4 2.3L12 19.5l-2.1-6.2L3.5 11l6.4-2.3z" /></svg>
}

// "חם ב-zap" / "חם בצוות שלכם" inside בשבילך: the lane's top 3; tap to open the whole lane.
function HotSlide({ lane, items, index, onOpen }: { lane: 'trending' | 'team'; items: FeedItem[]; index: number; onOpen?: (l: 'trending' | 'team') => void }) {
  const title = lane === 'trending' ? 'חם ב-zap' : 'חם בצוות שלכם'
  return (
    <section className="fd-card" data-index={index} aria-label={title}>
      <div className={`fd-inner tk-special tk-hot ${lane}`}>
        <span className="tk-kicker">{lane === 'trending' ? <ReasonIcon kind="platform" /> : <ReasonIcon kind="team" />} {title}</span>
        <h2>{lane === 'trending' ? 'מה כולם ב-zap פותחים השבוע' : 'מה הצוות שלכם אוהב השבוע'}</h2>
        <ol className="tk-hot-list">
          {items.map((i) => {
            const th = i.preview_video_id ? ytStill(i.preview_video_id, 2) : i.thumbnail_url ? proxied(i.thumbnail_url, 360) : null
            return (
              <li key={i.id}>
                <DetailLink kind={i.doc_id ? 'doc' : 'item'} id={i.doc_id ?? i.id}>
                  <span className="tk-hot-th">{th ? <img src={th} alt="" loading="lazy" decoding="async" /> : <TypeBadge item={i} />}</span>
                  <span className="tk-hot-t">{i.title_he}</span>
                </DetailLink>
              </li>
            )
          })}
        </ol>
        {onOpen && <button type="button" className="tk-big-play" onClick={() => onOpen(lane)}>לכל ה{lane === 'trending' ? 'חם ב-zap' : 'חם בצוות'} ←</button>}
      </div>
    </section>
  )
}
