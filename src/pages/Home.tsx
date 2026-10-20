import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { Budget, ITEM_COLS, Item, loadBudget, supabase, weekStart } from '../lib'
import { Empty, Headline, ItemCard, MetroLine, Skeletons } from '../components/ui'
import { BudgetBar } from '../components/budget'
import { FeedRow, loadFeed, reasonChips } from '../components/social'
import { LeaderTeaser } from '../components/points'
import { suggestName } from '../components/prefs'

type Lane = { item: Item; chips: string[] }

type Episode = { id: number; week: string; body_he: string; item_ids: number[]; audio_url: string | null }
type Continue = { item: Item; done: number }

export default function Home() {
  const { profile, topics, setProfile } = useApp()
  const [nameDraft, setNameDraft] = useState(() => suggestName(profile.email))
  const [nameBusy, setNameBusy] = useState(false)
  const nav = useNavigate()
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [episodeItems, setEpisodeItems] = useState<Item[]>([])
  const [hot, setHot] = useState<Record<string, Item[]>>({})
  const [cont, setCont] = useState<Continue[]>([])
  const [internal, setInternal] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [budget, setBudget] = useState<Budget | null>(null)
  const [forYou, setForYou] = useState<{ item: Item; row: FeedRow }[] | null>(null)
  const [inbox, setInbox] = useState<{ id: number; item: Item; note: string | null; by: string }[]>([])
  const [discover, setDiscover] = useState<Lane[] | null>(null)
  const [trending, setTrending] = useState<Lane[] | null>(null)

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
    loadBudget().then((b) => { if (alive) setBudget(b) })
    loadSocialFeed().then((r) => { if (alive && r) { setForYou(r.forYou); setInbox(r.inbox) } })
    loadLane<{ id: number; reason: string }>('discover', 9, (r) => (r.reason ? [r.reason] : []))
      .then((x) => { if (alive) setDiscover(x) })
    loadLane<{ id: number; views: number }>('trending', 6, (r) => (r.views > 0 ? [`${r.views} צפיות השבוע`] : []))
      .then((x) => { if (alive) setTrending(x) })
    return () => { alive = false }
  }, [profile.user_id, profile.topics.join(','), week])

  // An RPC lane: ranked ids → items in the same order. Null hides the lane (e.g. RPC missing).
  async function loadLane<R extends { id: number }>(fn: string, limit: number, chips: (r: R) => string[]): Promise<Lane[] | null> {
    const { data, error } = await supabase.rpc(fn, { p_limit: limit })
    if (error) return null
    const rows = (data as R[] | null) ?? []
    if (!rows.length) return []
    const { data: items } = await supabase.from('items').select(ITEM_COLS).in('id', rows.map((r) => r.id))
    const byId = new Map(((items as Item[] | null) ?? []).map((i) => [i.id, i]))
    return rows.flatMap((r) => (byId.has(r.id) ? [{ item: byId.get(r.id)!, chips: chips(r) }] : []))
  }

  async function loadSocialFeed() {
    const rows = await loadFeed(9)
    if (!rows) return null
    const [itemsRes, sharesRes] = await Promise.all([
      rows.length ? supabase.from('items').select(ITEM_COLS).in('id', rows.map((r) => r.id)) : Promise.resolve({ data: [] }),
      supabase.from('shares').select('id,item_id,note').eq('to_user', profile.user_id).eq('seen', false)
        .order('at', { ascending: false }).limit(5),
    ])
    const byId = new Map(((itemsRes.data as Item[] | null) ?? []).map((i) => [i.id, i]))
    const forYou = rows.flatMap((row) => (byId.has(row.id) ? [{ item: byId.get(row.id)!, row }] : []))
    const shares = (sharesRes.data as { id: number; item_id: number; note: string | null }[] | null) ?? []
    let inboxItems = new Map<number, Item>()
    if (shares.length) {
      const { data } = await supabase.from('items').select(ITEM_COLS).in('id', shares.map((x) => x.item_id))
      inboxItems = new Map(((data as Item[] | null) ?? []).map((i) => [i.id, i]))
    }
    const sharedBy = new Map(rows.filter((r) => r.shared_by).map((r) => [r.id, r.shared_by!]))
    const inbox = shares.flatMap((x) => (inboxItems.has(x.item_id)
      ? [{ id: x.id, item: inboxItems.get(x.item_id)!, note: x.note, by: sharedBy.get(x.item_id) ?? 'עמית/ה' }] : []))
    return { forYou, inbox }
  }

  async function openShare(id: number, itemId: number) {
    setInbox((x) => x.filter((s) => s.id !== id))
    await supabase.from('shares').update({ seen: true }).eq('id', id)
    nav(`/item/${itemId}`)
  }

  const firstName = (profile.display_name || profile.email.split('@')[0]).split(/[.\s_]/)[0]

  // People who joined before onboarding asked for a name: one quick inline prompt.
  async function saveName() {
    setNameBusy(true)
    const { data } = await supabase.from('profiles').update({ display_name: nameDraft.trim() })
      .eq('user_id', profile.user_id).select('*').single()
    setNameBusy(false)
    if (data) setProfile(data as typeof profile)
  }

  return (
    <div style={{ position: 'relative' }}>
      <MetroLine top={10} />
      <Headline light={`היי ${firstName}, זה השבוע שלכם`} black="מה חדש בתחום" />
      <div className="small" style={{ margin: '-6px 0 12px' }}>
        <Link to="/me" style={{ fontWeight: 600 }}>האזור שלי וההעדפות ←</Link>
      </div>

      {!profile.display_name && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 4px' }}>איך לקרוא לכם?</h3>
          <p className="small muted" style={{ margin: '0 0 8px' }}>ככה תופיעו בטבלה, בתגובות ובשיתופים. רגע אחד וסיימנו.</p>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" style={{ flex: 1 }} value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} />
            <button className="btn" disabled={nameBusy || nameDraft.trim().length < 2} onClick={saveName}>{nameBusy ? 'שומרים' : 'לשמור'}</button>
          </div>
        </div>
      )}

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

      <LeaderTeaser />

      {inbox.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ margin: '0 0 6px' }}>שיתפו איתך</h3>
          <ul className="inbox" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {inbox.map((s) => (
              <li key={s.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small muted">{s.by}{s.note ? `: ${s.note}` : ''}</div>
                  <div style={{ fontWeight: 700 }}>{s.item.title_he}</div>
                </div>
                <button className="btn ghost" onClick={() => openShare(s.id, s.item.id)}>לפתוח</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {forYou && forYou.length > 0 && (
        <section>
          <h2 className="section">מה מעניין אותי <small>הנושאים והצרכים שבחרתם, לפי מה שעובד אצל הצוות</small></h2>
          <div className="lane">
            {forYou.map(({ item, row }) => <ItemCard key={item.id} item={item} reasons={reasonChips(row)} />)}
          </div>
        </section>
      )}
      {!forYou && (loading ? <Skeletons /> : myTopics.length > 0 && (
        <section>
          <h2 className="section">מה מעניין אותי</h2>
          <div className="lane">
            {myTopics.flatMap((t) => hot[t.slug] ?? []).map((i) => <ItemCard key={i.id} item={i} />)}
          </div>
        </section>
      ))}

      {discover && discover.length > 0 && (
        <section>
          <h2 className="section">מה יכול לעניין אותך <small>מחוץ לנושאים שבחרתם</small></h2>
          <div className="lane">
            {discover.map(({ item, chips }) => <ItemCard key={item.id} item={item} reasons={chips} />)}
          </div>
        </section>
      )}

      {trending && trending.length > 0 && (
        <section>
          <h2 className="section">טרנדים <small>הכי נצפה השבוע</small></h2>
          <div className="lane">
            {trending.map(({ item, chips }) => <ItemCard key={item.id} item={item} reasons={chips} />)}
          </div>
        </section>
      )}

      {cont.length > 0 && (
        <>
          <h2 className="section">ממשיכים מאיפה שעצרתם</h2>
          <div className="grid three">
            {cont.map((c) => <ItemCard key={c.item.id} item={c.item} progress={c.done} />)}
          </div>
        </>
      )}

      <h2 className="section">
        קורה ב-zap
        <Link to="/internal" className="small" style={{ marginInlineStart: 'auto', fontWeight: 600 }}>לכל הפרויקטים ←</Link>
      </h2>
      {internal.length ? (
        <div className="grid two">{internal.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      ) : <Empty>עוד אין פרויקטים. יש לכם משהו להראות? <Link to="/internal">ספרו לנו</Link></Empty>}
      <form className="card" style={{ marginTop: 28 }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/ask?q=${encodeURIComponent(q.trim())}`) }}>
        <label className="field" style={{ marginBottom: 8 }}>
          <span>שאלו את zap UP</span>
        </label>
        <div className="row">
          <input className="input" style={{ flex: 1 }} placeholder="למשל: איך צוות ה-PPC בונה קמפיין?" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn">שאלו</button>
        </div>
      </form>

      {budget && (
        <Link to="/budget" className="card link" style={{ marginTop: 14, display: 'block' }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>תקציב הלמידה שלכם החודש</h3>
            <span className="small" style={{ fontWeight: 600 }}>לתקציב ←</span>
          </div>
          <BudgetBar b={budget} />
        </Link>
      )}

    </div>
  )
}
