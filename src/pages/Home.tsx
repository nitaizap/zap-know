import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase } from '../lib'
import { Empty, Headline, ItemCard, MetroLine, Skeletons } from '../components/ui'
import { FeedRow, loadFeed, reasonChips } from '../components/social'
import { LeaderTeaser } from '../components/points'
import { suggestName } from '../components/prefs'
import { PageAgent } from '../components/PageAgent'
import { DOC_KIND_HE, teamColor, teamInitials, type AgentTeam, type TeamDoc } from './Doc'
import '../calm.css'
import '../lean.css'

type Progress = { item_id: number; title_he: string; detail: string | null }

// בית: the highlights of the three pages, tailored to me. Each block leads to its page.
export default function Home() {
  const { profile, setProfile } = useApp()
  const [nameDraft, setNameDraft] = useState(() => suggestName(profile.email))
  const [nameBusy, setNameBusy] = useState(false)
  const [forYou, setForYou] = useState<{ item: Item; row: FeedRow | null }[] | null>(null)
  const [posts, setPosts] = useState<Item[]>([])
  const [doc, setDoc] = useState<{ doc: TeamDoc; team: AgentTeam } | null>(null)
  const [progress, setProgress] = useState<Progress[]>([])

  useEffect(() => {
    let alive = true
    loadFeed(6).then(async (rows) => {
      let picks: { item: Item; row: FeedRow | null }[] = []
      if (rows && rows.length) {
        const { data } = await supabase.from('items').select(ITEM_COLS).in('id', rows.map((r) => r.id))
        const byId = new Map(((data as Item[] | null) ?? []).map((i) => [i.id, i]))
        picks = rows.flatMap((r) => (byId.has(r.id) ? [{ item: byId.get(r.id)!, row: r }] : []))
      }
      if (picks.length < 3) {
        const { data } = await supabase.from('items').select(ITEM_COLS).eq('status', 'approved').neq('kind', 'internal')
          .in('topic_slug', profile.topics).order('opens', { ascending: false }).limit(6)
        for (const i of (data as Item[] | null) ?? []) if (!picks.some((p) => p.item.id === i.id)) picks.push({ item: i, row: null })
      }
      if (alive) setForYou(picks.slice(0, 3))
    })
    supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('kind', 'internal').order('created_at', { ascending: false }).limit(2)
      .then(({ data }) => { if (alive) setPosts((data as Item[]) ?? []) })
    // One document from my team (or the most recent one), so "how we work" is on the home page too.
    Promise.all([
      supabase.from('team_profiles').select('*'),
      supabase.from('team_docs').select('id,team_id,title,kind,summary_he,tools,is_demo,updated_at').order('updated_at', { ascending: false }).limit(40),
    ]).then(([t, d]) => {
      const teams = (t.data as AgentTeam[] | null) ?? []
      const docs = (d.data as TeamDoc[] | null) ?? []
      const role = profile.role ?? ''
      const mine = teams.find((x) => x.team === role) ?? teams.find((x) => role && (x.team.includes(role) || role.includes(x.team)))
      const pick = (mine && docs.find((x) => x.team_id === mine.id)) || docs[0]
      const team = pick && teams.find((x) => x.id === pick.team_id)
      if (alive && pick && team) setDoc({ doc: pick, team })
    })
    supabase.rpc('my_history', { p_q: '', p_type: 'progress', p_limit: 10 }).then(({ data, error }) => {
      if (error || !alive) return
      setProgress(((data as Progress[]) ?? []).filter((r) => {
        const [a, b] = (r.detail ?? '0/0').split('/').map(Number)
        return b > 0 && a < b
      }).slice(0, 2))
    })
    return () => { alive = false }
  }, [profile.user_id, profile.topics.join(','), profile.role])

  const firstName = (profile.display_name || profile.email.split('@')[0]).split(/[.\s_]/)[0]

  async function saveName() {
    setNameBusy(true)
    const { data } = await supabase.from('profiles').update({ display_name: nameDraft.trim() })
      .eq('user_id', profile.user_id).select('*').single()
    setNameBusy(false)
    if (data) setProfile(data as typeof profile)
  }

  return (
    <div className="home">
      <Headline light={`היי ${firstName},`} black="מה חדש בשבילכם">
        <MetroLine top={6} />
      </Headline>

      <PageAgent mode="all" placeholder="שאלו כל דבר: קורס, צוות, או משהו שראיתם"
        starters={['מה כדאי לי ללמוד השבוע?', 'איך צוות ה-PPC עובד עם GA4?', 'ראיתי כתבה ש-GEO הוא הדבר הבא, איפה היא?']} />

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

      <section className="block">
        <div className="block-head"><h2>בשבילכם מבחוץ</h2><Link to="/external">לכל הידע מבחוץ</Link></div>
        {forYou === null ? <Skeletons n={3} /> : forYou.length ? (
          <div className="grid three">{forYou.map(({ item, row }) => <ItemCard key={item.id} item={item} reasons={reasonChips(row).slice(0, 1)} />)}</div>
        ) : <Empty>עוד אין תוכן בנושאים שבחרתם. הוא מגיע עם האיסוף הבא.</Empty>}
      </section>

      <section className="block">
        <div className="block-head"><h2>קורה אצלנו</h2><Link to="/internal">לכל הידע מבפנים</Link></div>
        <div className="grid three">
          {doc && (
            <Link to={`/doc/${doc.doc.id}`} className="card link">
              <span className="row" style={{ gap: 10 }}>
                <span className="tavatar" style={{ background: teamColor(doc.team.id), width: 36, height: 36, borderRadius: 10, fontSize: 13 }} aria-hidden="true">{teamInitials(doc.team.team)}</span>
                <span className="small muted">{DOC_KIND_HE[doc.doc.kind]} · צוות {doc.team.team}</span>
              </span>
              <b style={{ marginTop: 10, display: 'block' }}>{doc.doc.title}</b>
              {doc.doc.summary_he && <span className="small muted">{doc.doc.summary_he}</span>}
            </Link>
          )}
          {posts.map((i) => <ItemCard key={i.id} item={i} />)}
        </div>
      </section>

      <section className="block">
        <div className="block-head"><h2>איפה אתם עומדים</h2><Link to="/me">לאזור שלי</Link></div>
        <div className="standing">
          <LeaderTeaser />
          <div className="card">
            <h3 style={{ margin: '0 0 8px' }}>ממשיכים מאיפה שעצרתם</h3>
            {progress.length ? progress.map((r) => {
              const [a, b] = (r.detail ?? '0/0').split('/').map(Number)
              return (
                <Link key={r.item_id} to={`/item/${r.item_id}`} className="doc-row">
                  <span style={{ flex: 1, minWidth: 0 }}><b>{r.title_he}</b>
                    <span className="bar" style={{ margin: '8px 0 0', display: 'block' }}><i style={{ width: `${Math.round((a / b) * 100)}%` }} /></span>
                  </span>
                  <span className="kind">{a} מתוך {b}</span>
                </Link>
              )
            }) : <p className="small muted" style={{ margin: 0 }}>אין כרגע קורס פתוח. מסמנים שיעור ראשון באחד הקורסים, והוא יחכה לכם כאן.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
