import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, TeamProfile, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'
import { FeedRow, loadFeed, reasonChips } from '../components/social'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'
import { FitTime } from '../components/FitTime'
import { PageAgent } from '../components/PageAgent'
import { ICar } from '../components/icons'
import { ExpertCard, WatchButton } from './Topic'
import '../lean.css'

const Feed = lazy(() => import('./Feed'))

// ידע מבחוץ: courses, news and podcasts. Tailored by default (my topics, my role, what colleagues
// like), a feed view for swiping, and one filter bar for anything manual.
export default function External() {
  const { topics, profile } = useApp()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'list' ? 'list' : 'feed'
  const [q, setQ] = useState(params.get('q') ?? '')
  const [f, setF] = useFilters('external')
  const saved = useSavedIds(f.saved)
  const [items, setItems] = useState<Item[] | null>(null)
  const [ranked, setRanked] = useState<FeedRow[] | null>(null)
  const [expert, setExpert] = useState<TeamProfile | null>(null)

  // Deep links (/topic/:slug, header search) arrive as ?topic= and ?q=.
  useEffect(() => {
    const t = params.get('topic')
    if (t && t !== f.topic) setF({ ...f, topic: t })
    const u = params.get('q') ?? ''
    if (u !== q) setQ(u)
  }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(async () => {
      setItems(null)
      let query = supabase.from('items').select(ITEM_COLS).eq('status', 'approved').neq('kind', 'internal')
      const term = q.trim().replace(/[%,()]/g, ' ')
      if (term) query = query.or(`title_he.ilike.%${term}%,title_orig.ilike.%${term}%,summary_he.ilike.%${term}%`)
      const { data } = await query.order('opens', { ascending: false }).limit(200)
      setItems((data as Item[]) ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { loadFeed(200).then(setRanked) }, [])

  const topic = topics.find((t) => t.slug === f.topic) ?? null
  useEffect(() => {
    setExpert(null)
    if (!topic?.expert_team_id) return
    supabase.from('team_profiles').select('*').eq('id', topic.expert_team_id).maybeSingle()
      .then(({ data }) => setExpert((data as TeamProfile) ?? null))
  }, [topic?.expert_team_id])

  // "מומלץ" = the personal ranking; anything not ranked yet goes after, my topics first.
  const rank = useMemo(() => {
    const m = new Map((ranked ?? []).map((r, n) => [r.id, n]))
    for (const i of items ?? []) if (!m.has(i.id)) m.set(i.id, (profile.topics.includes(i.topic_slug ?? '') ? 500 : 1000) + m.size)
    return m
  }, [ranked, items, profile.topics])
  const rowOf = new Map((ranked ?? []).map((r) => [r.id, r]))
  const shown = items ? applyFilters(items, f, { saved, rank }) : null
  const toolsPresent = useMemo(() => [...new Set((items ?? []).flatMap((i) => i.tools ?? []))].sort(), [items])
  const bites = f.len === '10'

  const setView = (v: 'list' | 'feed') => {
    const next = new URLSearchParams(params)
    if (v === 'list') next.set('view', 'list'); else next.delete('view')
    setParams(next, { replace: true })
  }
  const onType = (v: string) => {
    setQ(v)
    const next = new URLSearchParams(params)
    if (v.trim()) next.set('q', v); else next.delete('q')
    setParams(next, { replace: true })
  }
  const onFilters = (next: typeof f) => {
    setF(next)
    if (params.get('topic') && next.topic !== params.get('topic')) {
      const p = new URLSearchParams(params); p.delete('topic'); setParams(p, { replace: true })
    }
  }

  return (
    <div>
      <div className="page-head">
        <Headline light="קורסים, עדכונים ופודקאסטים," black="ידע מבחוץ" />
        <div className="seg2" role="tablist" aria-label="תצוגה">
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>רשימה</button>
          <button role="tab" aria-selected={view === 'feed'} className={view === 'feed' ? 'on' : ''} onClick={() => setView('feed')}>פיד</button>
        </div>
      </div>

      <PageAgent mode="external" placeholder="שאלו את הדף הזה, למשל: מאיפה מתחילים עם GEO?"
        starters={['מאיפה מתחילים עם GEO?', 'קורס קצר על Google Ads למתחילים', 'מה חדש השבוע ב-AI לשיווק?']} />

      {view === 'feed' ? (
        <Suspense fallback={<Skeletons n={2} />}><Feed /></Suspense>
      ) : (
        <>
          <div className="page-tools">
            <input className="input grow" placeholder="חיפוש בתוך הדף" value={q} onChange={(e) => onType(e.target.value)} aria-label="חיפוש" />
            <button className={`tool-pill${bites ? ' on' : ''}`} aria-pressed={bites} onClick={() => onFilters({ ...f, len: bites ? '' : '10', sort: bites ? f.sort : 'short' })}>ביס קטן</button>
            <FitTime compact />
            <Link to="/drive" className="tool-pill"><ICar size={16} /> אני בדרך</Link>
          </div>

          <FilterBar value={f} onChange={onFilters} total={shown?.length}
            show={{ topic: topics, kind: true, len: true, vertical: true, saved: true, lang: true, level: true, tools: toolsPresent }} />

          {topic && (
            <div className="block">
              <h2 className="section-sm" style={{ margin: '0 0 8px' }}>{topic.name_he}{topic.blurb_he ? <span className="small muted"> · {topic.blurb_he}</span> : null}</h2>
              {topic.status === 'soon' && <div className="card soon-card"><p className="muted small">התחום הזה עולה בקרוב.</p><WatchButton slug={topic.slug} /></div>}
              {expert && <ExpertCard team={expert} />}
            </div>
          )}

          {shown === null ? <Skeletons n={6} /> : shown.length ? (
            <div className="grid three" style={{ marginTop: 14 }}>
              {shown.map((i) => <ItemCard key={i.id} item={i} reasons={f.sort === 'top' ? reasonChips(rowOf.get(i.id)).slice(0, 1) : undefined} />)}
            </div>
          ) : (
            <Empty>לא מצאנו. אפשר לנקות את הסינון, לנסות מילה אחרת, או לשאול את הדף למעלה.</Empty>
          )}
        </>
      )}
    </div>
  )
}
