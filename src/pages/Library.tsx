import { useEffect, useState } from 'react'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'

export default function Library() {
  const { topics } = useApp()
  const [q, setQ] = useState('')
  const [topic, setTopic] = useState('')
  const [kind, setKind] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      setItems(null)
      let query = supabase.from('items').select(ITEM_COLS).eq('status', 'approved')
      if (topic) query = query.eq('topic_slug', topic)
      if (kind) query = query.eq('kind', kind)
      const term = q.trim().replace(/[%,()]/g, ' ')
      if (term) query = query.or(`title_he.ilike.%${term}%,title_orig.ilike.%${term}%,summary_he.ilike.%${term}%`)
      const { data } = await query.order('published_at', { ascending: false, nullsFirst: false }).limit(60)
      setItems((data as Item[]) ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q, topic, kind])

  return (
    <div>
      <Headline light="כל מה שאספנו," black="בחיפוש אחד" />
      <div className="card" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="חפשו נושא, כלי או מילת מפתח" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row" style={{ marginTop: 10 }}>
          <select className="select" style={{ flex: 1, minWidth: 140 }} value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">כל הנושאים</option>
            {topics.map((t) => <option key={t.slug} value={t.slug}>{t.name_he}</option>)}
          </select>
          <select className="select" style={{ flex: 1, minWidth: 140 }} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">כל הסוגים</option>
            <option value="course">קורסים</option>
            <option value="news">עדכונים</option>
            <option value="internal">קורה ב-zap</option>
          </select>
        </div>
      </div>
      {items === null ? <Skeletons n={6} /> : items.length ? (
        <>
          <p className="small muted">{items.length} תוצאות</p>
          <div className="grid three">{items.map((i) => <ItemCard key={i.id} item={i} />)}</div>
        </>
      ) : <Empty>לא מצאנו. אפשר לנסות מילה אחרת, או <a href="#/ask">לשאול את zap UP</a>.</Empty>}
    </div>
  )
}
