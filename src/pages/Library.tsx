import { useEffect, useState } from 'react'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'

export default function Library() {
  const { topics } = useApp()
  const [q, setQ] = useState('')
  const [f, setF] = useFilters('library')
  const [items, setItems] = useState<Item[] | null>(null)
  const saved = useSavedIds(f.saved)

  useEffect(() => {
    const t = setTimeout(async () => {
      setItems(null)
      let query = supabase.from('items').select(ITEM_COLS).eq('status', 'approved')
      const term = q.trim().replace(/[%,()]/g, ' ')
      if (term) query = query.or(`title_he.ilike.%${term}%,title_orig.ilike.%${term}%,summary_he.ilike.%${term}%`)
      const { data } = await query.order('opens', { ascending: false }).limit(150)
      setItems((data as Item[]) ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const shown = items ? applyFilters(items, f, { saved }) : null

  return (
    <div>
      <Headline light="כל מה שאספנו," black="בחיפוש אחד" />
      <input className="input input-lg" placeholder="חפשו נושא, כלי או מילת מפתח" value={q} onChange={(e) => setQ(e.target.value)} />
      <FilterBar value={f} onChange={setF} total={shown?.length} show={{ topic: topics, kind: true, len: true, vertical: true, saved: true }} />
      {shown === null ? <Skeletons n={6} /> : shown.length ? (
        <div className="grid three">{shown.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      ) : <Empty>לא מצאנו. אפשר לנקות את הסינון, לנסות מילה אחרת, או <a href="#/ask">לשאול את zap UP</a>.</Empty>}
    </div>
  )
}
