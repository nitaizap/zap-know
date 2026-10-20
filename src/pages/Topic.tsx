import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, VERTICALS, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'

export default function TopicPage() {
  const { slug } = useParams()
  const { topics } = useApp()
  const topic = topics.find((t) => t.slug === slug)
  const [items, setItems] = useState<Item[] | null>(null)
  const [kind, setKind] = useState<'all' | 'course' | 'news'>('all')
  const [vertical, setVertical] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('topic_slug', slug ?? '')
      .neq('kind', 'internal').order('published_at', { ascending: false, nullsFirst: false }).limit(200)
      .then(({ data }) => setItems((data as Item[]) ?? []))
  }, [slug])

  if (!topic) return <Empty>הנושא הזה לא קיים.</Empty>

  if (topic.status === 'soon') {
    return (
      <div>
        <Headline light={topic.name_he} black="בקרוב כאן" hand="שווה לחכות" />
        <div className="card">
          <p>{topic.blurb_he}</p>
          <p className="muted small" style={{ marginTop: 8 }}>אנחנו כבר בוחרים מקורות לנושא הזה. ברגע שהם מאושרים, התוכן מגיע לכאן לבד.</p>
        </div>
      </div>
    )
  }

  const shown = (items ?? []).filter((i) => (kind === 'all' || i.kind === kind) && (!vertical || i.verticals.includes(vertical)))
  const usedVerticals = VERTICALS.filter((v) => (items ?? []).some((i) => i.verticals.includes(v)))

  return (
    <div>
      <Headline light={topic.blurb_he ?? ''} black={topic.name_he} />
      <div className="chips">
        {([['all', 'הכול'], ['course', 'קורסים'], ['news', 'עדכונים']] as const).map(([k, l]) => (
          <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      {usedVerticals.length > 0 && (
        <div className="chips">
          <span className="small muted" style={{ alignSelf: 'center' }}>רלוונטי ל:</span>
          {usedVerticals.map((v) => (
            <button key={v} className={`chip ${vertical === v ? 'on' : ''}`} onClick={() => setVertical(vertical === v ? null : v)}>{v}</button>
          ))}
        </div>
      )}
      {items === null ? <Skeletons n={6} /> : shown.length ? (
        <div className="grid three">{shown.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      ) : <Empty>אין כאן עדיין תוכן שמתאים לסינון.</Empty>}
    </div>
  )
}
