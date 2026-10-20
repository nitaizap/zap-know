import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'
import { FeedRow, loadFeed, reasonChips } from '../components/social'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'

export default function TopicPage() {
  const { slug } = useParams()
  const { topics } = useApp()
  const topic = topics.find((t) => t.slug === slug)
  const [items, setItems] = useState<Item[] | null>(null)
  const [f, setF] = useFilters('topic')
  const saved = useSavedIds(f.saved)
  const [ranked, setRanked] = useState<FeedRow[] | null>(null)

  useEffect(() => {
    setItems(null)
    supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('topic_slug', slug ?? '')
      .neq('kind', 'internal').order('published_at', { ascending: false, nullsFirst: false }).limit(200)
      .then(({ data }) => setItems((data as Item[]) ?? []))
    setRanked(null)
    loadFeed(200, slug).then(setRanked)
  }, [slug])

  if (!topic) return <Empty>לא מצאנו את הנושא הזה.</Empty>

  if (topic.status === 'soon') {
    return (
      <div>
        <Headline light={topic.name_he} black="בקרוב כאן" hand="שווה לחכות" />
        <div className="card">
          <p>{topic.blurb_he}</p>
          <p className="muted small" style={{ marginTop: 8 }}>אנחנו כבר בוחרים מקורות לנושא הזה. ברגע שנאשר אותם, התוכן יגיע לכאן לבד.</p>
        </div>
      </div>
    )
  }

  const rank = new Map((ranked ?? []).map((r, n) => [r.id, n]))
  const rowOf = new Map((ranked ?? []).map((r) => [r.id, r]))
  const shown = items ? applyFilters(items, { ...f, topic: '' }, { saved, rank: ranked ? rank : undefined }) : null

  return (
    <div>
      <Headline light={topic.blurb_he ?? ''} black={topic.name_he} />
      <FilterBar value={f} onChange={setF} total={shown?.length} show={{ kind: true, len: true, vertical: true, saved: true }} />
      {shown === null ? <Skeletons n={6} /> : shown.length ? (
        <div className="grid three">{shown.map((i) => <ItemCard key={i.id} item={i} reasons={f.sort === 'top' ? reasonChips(rowOf.get(i.id)).slice(0, 1) : undefined} />)}</div>
      ) : <Empty>אין כאן עדיין תוכן שמתאים לסינון. אפשר לנסות סינון אחר.</Empty>}
    </div>
  )
}
