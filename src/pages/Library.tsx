import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'
import '../contribute.css'

type ToolCount = { tool: string; items: number; docs: number }

export default function Library() {
  const { topics } = useApp()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [f, setF] = useFilters('library')
  const [items, setItems] = useState<Item[] | null>(null)
  const [tools, setTools] = useState<ToolCount[]>([])
  const saved = useSavedIds(f.saved)

  // The header search lands here with ?q=; keep the box and the URL in step.
  useEffect(() => { const u = params.get('q') ?? ''; if (u !== q) setQ(u) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    supabase.rpc('tool_counts').then(({ data, error }) => {
      if (!error) setTools(((data ?? []) as ToolCount[]).filter((t) => t.items + t.docs > 0))
    })
  }, [])

  const toolsPresent = useMemo(() => [...new Set((items ?? []).flatMap((i) => i.tools ?? []))].sort(), [items])
  const shown = items ? applyFilters(items, f, { saved }) : null
  const term = q.trim()
  const unfiltered = !term && !f.tool && !f.topic && !f.kind

  function onType(v: string) {
    setQ(v)
    const next = new URLSearchParams(params)
    if (v.trim()) next.set('q', v); else next.delete('q')
    setParams(next, { replace: true })
  }

  return (
    <div>
      <Headline light="כל מה שאספנו," black="בחיפוש אחד" />
      <input className="input input-lg" placeholder="חפשו נושא, כלי או מילת מפתח" value={q} onChange={(e) => onType(e.target.value)} />

      {term && (
        <Link className="ask-hatch" to={`/agent?q=${encodeURIComponent(term)}`}>
          רוצים תשובה ולא רשימה? <b>לשאול את zap UP</b>
        </Link>
      )}

      {unfiltered && tools.length > 0 && (
        <section className="tools-row" aria-label="כלי עבודה">
          <h2 className="section-sm">כלי עבודה</h2>
          <div className="tools-scroll">
            {tools.map((t) => (
              <button key={t.tool} className="tool-tile" onClick={() => setF({ ...f, tool: t.tool })}>
                <bdi dir="ltr" className="tool-name">{t.tool}</bdi>
                <span className="small muted">{t.items + t.docs === 1 ? 'תוכן אחד' : `${t.items + t.docs} תכנים`}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {f.tool && (
        <div className="tool-active">
          <span>מסננים לפי <bdi dir="ltr"><b>{f.tool}</b></bdi></span>
          <Link className="btn ghost sm" to={`/agent?q=${encodeURIComponent(`טיפים ל-${f.tool}`)}`}>טיפים ל-<bdi dir="ltr">{f.tool}</bdi></Link>
          <button className="fbar-clear" onClick={() => setF({ ...f, tool: '' })}>לבטל</button>
        </div>
      )}

      <FilterBar value={f} onChange={setF} total={shown?.length}
        show={{ topic: topics, kind: true, len: true, vertical: true, saved: true, lang: true, level: true, tools: toolsPresent }} />
      {shown === null ? <Skeletons n={6} /> : shown.length ? (
        <div className="grid three">{shown.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      ) : (
        <Empty>
          לא מצאנו. אפשר לנקות את הסינון, לנסות מילה אחרת, או{' '}
          <Link to={`/agent${term ? `?q=${encodeURIComponent(term)}` : ''}`}>לשאול את zap UP</Link>.
        </Empty>
      )}
    </div>
  )
}
