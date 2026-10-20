import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase, weekStart } from '../lib'
import { Empty, Headline, ItemCard, MetroLine, Skeletons } from '../components/ui'

type Episode = { id: number; week: string; body_he: string; item_ids: number[]; audio_url: string | null }
type Continue = { item: Item; done: number }

export default function Home() {
  const { profile, topics } = useApp()
  const nav = useNavigate()
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [episodeItems, setEpisodeItems] = useState<Item[]>([])
  const [hot, setHot] = useState<Record<string, Item[]>>({})
  const [cont, setCont] = useState<Continue[]>([])
  const [internal, setInternal] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const week = weekStart()
  const myTopics = topics.filter((t) => profile.topics.includes(t.slug))

  useEffect(() => {
    let alive = true
    async function load() {
      const [ep, mine, prog, ints] = await Promise.all([
        supabase.from('episodes').select('*').eq('user_id', profile.user_id).order('week', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('items').select(ITEM_COLS).eq('status', 'approved').in('topic_slug', profile.topics).neq('kind', 'internal')
          .order('opens', { ascending: false }).limit(60),
        supabase.from('progress').select('item_id,lessons_done,updated_at').eq('user_id', profile.user_id)
          .order('updated_at', { ascending: false }).limit(6),
        supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('kind', 'internal')
          .order('created_at', { ascending: false }).limit(4),
      ])
      if (!alive) return
      const pool = (mine.data as Item[] | null) ?? []

      // Hot 3 per topic: this week's picks first, then the most opened.
      const byTopic: Record<string, Item[]> = {}
      for (const slug of profile.topics) {
        const ofTopic = pool.filter((i) => i.topic_slug === slug)
        const picks = ofTopic.filter((i) => i.hot_week === week)
        byTopic[slug] = [...picks, ...ofTopic.filter((i) => i.hot_week !== week)].slice(0, 3)
      }
      setHot(byTopic)

      const e = ep.data as Episode | null
      setEpisode(e)
      if (e && e.item_ids.length) {
        const { data } = await supabase.from('items').select(ITEM_COLS).in('id', e.item_ids)
        if (alive) setEpisodeItems((data as Item[]) ?? [])
      } else {
        // No episode generated yet for this person: build a preview from their topics.
        setEpisodeItems(profile.topics.map((s) => byTopic[s]?.[0]).filter(Boolean).slice(0, 3) as Item[])
      }

      const rows = (prog.data as { item_id: number; lessons_done: number[] }[] | null) ?? []
      if (rows.length) {
        const { data } = await supabase.from('items').select(ITEM_COLS).in('id', rows.map((r) => r.item_id))
        const items = (data as Item[]) ?? []
        if (alive) setCont(rows.map((r) => {
          const item = items.find((i) => i.id === r.item_id)
          if (!item) return null
          const total = item.lesson_plan?.length || 1
          return { item, done: Math.min(1, r.lessons_done.length / total) }
        }).filter((x): x is Continue => !!x && x.done < 1))
      }
      setInternal((ints.data as Item[]) ?? [])
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [profile.user_id, profile.topics.join(','), week])

  const firstName = (profile.display_name || profile.email.split('@')[0]).split(/[.\s_]/)[0]

  return (
    <div style={{ position: 'relative' }}>
      <MetroLine top={10} />
      <Headline light={`היי ${firstName}, זה השבוע שלכם`} black="מה חדש בתחום" />

      <div className="card episode">
        <div className="tile" />
        <div className="hand">הפרק השבועי שלכם</div>
        <h3>3 דברים ששווה להכיר השבוע</h3>
        {loading ? <p>אוספים בשבילכם</p> : episodeItems.length === 0 ? (
          <p>עוד אין תוכן מאושר בנושאים שבחרתם. הוא מגיע עם האיסוף הבא.</p>
        ) : (
          <ol>
            {episodeItems.map((i) => (
              <li key={i.id}><Link to={`/item/${i.id}`}>{i.title_he}</Link></li>
            ))}
          </ol>
        )}
        {episode?.audio_url && (
          <audio controls src={episode.audio_url} style={{ width: '100%', marginTop: 12 }} />
        )}
        <p className="small" style={{ marginTop: 12, opacity: .85 }}>
          {episode ? 'הפרק הזה נשלח גם ב-Teams ובמייל.' : 'כל שבוע מגיע פרק חדש ב-Teams ובמייל, לפי הנושאים שבחרתם.'}
        </p>
      </div>

      {cont.length > 0 && (
        <>
          <h2 className="section">ממשיכים מאיפה שעצרתם</h2>
          <div className="grid three">
            {cont.map((c) => <ItemCard key={c.item.id} item={c.item} progress={c.done} />)}
          </div>
        </>
      )}

      <form className="card" style={{ marginTop: 24 }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/ask?q=${encodeURIComponent(q.trim())}`) }}>
        <label className="field" style={{ marginBottom: 8 }}>
          <span>שאלו את zap KNOW</span>
        </label>
        <div className="row">
          <input className="input" style={{ flex: 1 }} placeholder="למשל: איך צוות ה-PPC בונה קמפיין?" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn">שאלו</button>
        </div>
      </form>

      {loading ? <Skeletons /> : myTopics.map((t) => (
        <section key={t.slug}>
          <h2 className="section">
            החם השבוע ב{t.name_he}
            <Link to={`/topic/${t.slug}`} className="small" style={{ marginInlineStart: 'auto', fontWeight: 600 }}>לכל הנושא ←</Link>
          </h2>
          {hot[t.slug]?.length ? (
            <div className="grid three">{hot[t.slug].map((i) => <ItemCard key={i.id} item={i} />)}</div>
          ) : <Empty>עוד אין כאן תוכן מאושר. האיסוף הבא כבר בדרך.</Empty>}
        </section>
      ))}

      <h2 className="section">
        קורה ב-zap
        <Link to="/internal" className="small" style={{ marginInlineStart: 'auto', fontWeight: 600 }}>לכל הפרויקטים ←</Link>
      </h2>
      {internal.length ? (
        <div className="grid two">{internal.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      ) : <Empty>עוד אין פרויקטים. יש לכם משהו להראות? <Link to="/internal">ספרו לנו</Link></Empty>}
    </div>
  )
}
