import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase, weekStart } from '../lib'
import { BitesRow, Empty, EpisodeCard, Headline, ItemCard, MetroLine, Skeletons } from '../components/ui'
import { FeedRow, loadFeed, reasonChips } from '../components/social'
import { LeaderTeaser } from '../components/points'
import { suggestName } from '../components/prefs'
import { FitTime } from '../components/FitTime'
import { ICar } from '../components/icons'
import { Avatar, useFaces } from '../components/Avatar'

type Episode = { id: number; week: string; body_he: string; item_ids: number[]; audio_url: string | null }

export default function Home() {
  const { profile, topics, setProfile } = useApp()
  const [nameDraft, setNameDraft] = useState(() => suggestName(profile.email))
  const [nameBusy, setNameBusy] = useState(false)
  const nav = useNavigate()
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [episodeItems, setEpisodeItems] = useState<Item[]>([])
  const [hot, setHot] = useState<Record<string, Item[]>>({})
  const [loading, setLoading] = useState(true)
  const [forYou, setForYou] = useState<{ item: Item; row: FeedRow }[] | null>(null)
  const [bites, setBites] = useState<Item[]>([])
  const [inbox, setInbox] = useState<{ id: number; item: Item; note: string | null; by: string }[]>([])

  const week = weekStart()
  const myTopics = topics.filter((t) => profile.topics.includes(t.slug))

  useEffect(() => {
    let alive = true
    async function load() {
      const [ep, mine] = await Promise.all([
        supabase.from('episodes').select('*').eq('user_id', profile.user_id).order('week', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('items').select(ITEM_COLS).eq('status', 'approved').in('topic_slug', profile.topics).neq('kind', 'internal')
          .order('opens', { ascending: false }).limit(60),
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
        const got = (data as Item[]) ?? []
        // Short episodes are topped up from the person's topics, so there are always 3.
        if (alive) setEpisodeItems([...got, ...pool.filter((i) => !got.some((g) => g.id === i.id))].slice(0, 3))
      } else {
        // No episode generated yet for this person: build a preview from their topics.
        const first = profile.topics.map((s) => byTopic[s]?.[0]).filter(Boolean) as Item[]
        setEpisodeItems([...first, ...pool.filter((i) => !first.some((f) => f.id === i.id))].slice(0, 3))
      }

      setLoading(false)
    }
    load()
    loadSocialFeed().then((r) => { if (alive && r) { setForYou(r.forYou); setInbox(r.inbox) } })
    supabase.rpc('quick_bites', { p_limit: 8 }).then(async ({ data, error }) => {
      const rows = (data as { id: number; minutes: number }[] | null) ?? []
      if (error || !rows.length) return
      const { data: its } = await supabase.from('items').select(ITEM_COLS).in('id', rows.map((r) => r.id))
      const byId = new Map(((its as Item[] | null) ?? []).map((i) => [i.id, i]))
      if (alive) setBites(rows.flatMap((r) => (byId.has(r.id) ? [{ ...byId.get(r.id)!, minutes: r.minutes }] : [])))
    })
    return () => { alive = false }
  }, [profile.user_id, profile.topics.join(','), week])

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
      ? [{ id: x.id, item: inboxItems.get(x.item_id)!, note: x.note, by: sharedBy.get(x.item_id) ?? 'מישהו מהצוות' }] : []))
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

  const picks = forYou && forYou.length > 0
    ? forYou.slice(0, 3).map(({ item, row }) => ({ item, chips: reasonChips(row).slice(0, 1) }))
    : myTopics.flatMap((t) => hot[t.slug] ?? []).slice(0, 3).map((item) => ({ item, chips: [] as string[] }))

  return (
    <div className="home">
      <Headline light={`היי ${firstName},`} black="מה חדש השבוע">
        <MetroLine top={6} />
      </Headline>
      <Link to="/drive" className="drive-pill"><ICar size={18} /> אני בדרך</Link>

      {!profile.display_name && (
        <div className="card name-prompt">
          <h3>איך לקרוא לכם?</h3>
          <p className="muted">ככה תופיעו בטבלה ובתגובות.</p>
          <div className="row">
            <input className="input" style={{ flex: 1 }} value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} />
            <button className="btn" disabled={nameBusy || nameDraft.trim().length < 2} onClick={saveName}>{nameBusy ? 'שומרים' : 'לשמור'}</button>
          </div>
        </div>
      )}

      <EpisodeCard items={episodeItems} loading={loading} audioUrl={episode?.audio_url} sent={!!episode} />

      {inbox.length > 0 && (
        <div className="card inbox-card">
          <h3>שיתפו איתכם</h3>
          <ul className="inbox">
            {inbox.slice(0, 3).map((s) => (
              <li key={s.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{s.item.title_he}</div>
                  <div className="small muted">{s.by}</div>
                </div>
                <button className="btn ghost" onClick={() => openShare(s.id, s.item.id)}>לפתוח</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="section">בשבילכם</h2>
        {loading && picks.length === 0 ? <Skeletons /> : picks.length > 0 ? (
          <div className="lane">
            {picks.map(({ item, chips }) => <ItemCard key={item.id} item={item} reasons={chips} />)}
          </div>
        ) : <Empty>עוד אין תוכן בנושאים שבחרתם. הוא מגיע עם האיסוף הבא.</Empty>}
        <div className="cta-row">
          <Link to="/feed" className="btn">לפיד המלא</Link>
        </div>
      </section>

      <BitesRow items={bites} extra={<FitTime compact />} />

      <LeaderTeaser />

      <Testimonials />

      <nav className="more-links" aria-label="עוד ב-zap UP">
        <Link to="/internal">קורה ב-zap</Link>
        <Link to="/agent">שאלו את הצוותים</Link>
        <Link to="/budget">התקציב שלי</Link>
        <Link to="/me">האזור שלי</Link>
      </nav>
    </div>
  )
}

type Testimonial = { comment_id: number; item_id: number; item_title: string; body: string; author: string; user_id: string; team: string | null }

// "עובדים מספרים": what colleagues took from things they learned, each leading to the item.
function Testimonials() {
  const [rows, setRows] = useState<Testimonial[] | null>(null)
  const face = useFaces((rows ?? []).map((r) => r.user_id))
  useEffect(() => {
    supabase.rpc('testimonials', { p_limit: 3 }).then(({ data, error }) => setRows(error ? null : ((data as Testimonial[]) ?? [])))
  }, [])
  if (!rows || rows.length === 0) return null
  return (
    <section>
      <h2 className="section">עובדים מספרים</h2>
      <div className="testi-row">
        {rows.map((r) => (
          <figure key={r.comment_id} className="card testi">
            <q>{r.body.length > 180 ? r.body.slice(0, 180).replace(/\s+\S*$/, '') + ' ←' : r.body}</q>
            <figcaption className="who">
              <Avatar face={face(r.user_id) ?? { user_id: r.user_id, name: r.author }} size={30} />
              <span><b>{r.author}</b>{r.team ? <span className="small"> · {r.team}</span> : null}</span>
            </figcaption>
            <Link className="learned" to={`/item/${r.item_id}`}>מה למדו: {r.item_title} ←</Link>
          </figure>
        ))}
      </div>
    </section>
  )
}
