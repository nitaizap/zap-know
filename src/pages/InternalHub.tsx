import { useEffect, useMemo, useState } from 'react'
import { Layer } from '../components/Layer'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'
import { PageAgent } from '../components/PageAgent'
import { IClose } from '../components/icons'
import { openAi } from '../components/AiSheet'
import Feed from './Feed'
import { DOC_KIND_HE, DemoNote, teamColor, teamInitials, type AgentTeam, type DocKind, type TeamDoc } from './Doc'
import '../calm.css'
import '../lean.css'

type Tab = 'all' | 'teams' | 'docs' | 'posts'
type Sort = 'top' | 'new' | 'views'
type IF = { team: number | null; kind: DocKind | ''; tool: string; sort: Sort }
const NO_IF: IF = { team: null, kind: '', tool: '', sort: 'top' }
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'הכול' }, { key: 'teams', label: 'צוותים' }, { key: 'docs', label: 'מסמכים' }, { key: 'posts', label: 'קורה ב-zap' },
]
const SORTS: { v: Sort; label: string }[] = [{ v: 'top', label: 'מומלץ' }, { v: 'new', label: 'חדש' }, { v: 'views', label: 'הכי נצפה' }]

// The team a person belongs to, matched loosely ("דאטה" ↔ "דאטה ואנליטיקס").
function myTeamOf(teams: AgentTeam[], role: string | null) {
  if (!role) return null
  const r = role.trim()
  return teams.find((t) => t.team === r) ?? teams.find((t) => t.team.includes(r) || r.includes(t.team)) ?? null
}

// ידע מבפנים: how teams here actually work. Tailored to my team and interests by default,
// the page's agent for anything specific, one filter sheet for manual browsing.
export default function InternalHub() {
  const { profile } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'all'
  const [teams, setTeams] = useState<AgentTeam[] | null>(null)
  const [docs, setDocs] = useState<TeamDoc[] | null>(null)
  const [posts, setPosts] = useState<Item[] | null>(null)
  const [f, setF] = useState<IF>(NO_IF)
  const [q, setQ] = useState(params.get('q') ?? '')

  useEffect(() => {
    supabase.from('team_profiles').select('*').order('team').then(({ data }) => setTeams((data as AgentTeam[]) ?? []))
    supabase.from('team_docs').select('id,team_id,title,kind,summary_he,tools,is_demo,updated_at').order('updated_at', { ascending: false })
      .then(({ data }) => setDocs((data as TeamDoc[]) ?? []))
    supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('kind', 'internal').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setPosts((data as Item[]) ?? []))
  }, [])
  useEffect(() => { const u = params.get('q') ?? ''; if (u !== q) setQ(u) }, [params]) // eslint-disable-line react-hooks/exhaustive-deps

  const mine = useMemo(() => myTeamOf(teams ?? [], profile.role), [teams, profile.role])
  const teamName = (id: number) => teams?.find((t) => t.id === id)?.team ?? ''
  const term = q.trim().toLowerCase()

  // Tailored order: my team first, then teams sharing tools with mine, then the rest.
  const teamScore = (t: AgentTeam) => {
    if (mine && t.id === mine.id) return 0
    const mineTools = new Set((mine?.tools ?? []).map((x) => x.name))
    return t.tools.some((x) => mineTools.has(x.name)) ? 1 : 2
  }
  const shownTeams = (teams ?? [])
    .filter((t) => (!f.team || t.id === f.team) && (!f.tool || t.tools.some((x) => x.name === f.tool)))
    .filter((t) => !term || [t.team, t.summary_he, ...t.tools.map((x) => x.name)].join(' ').toLowerCase().includes(term))
    .sort((a, b) => (f.sort === 'top' ? teamScore(a) - teamScore(b) : a.team.localeCompare(b.team, 'he')))
  const docTeamScore = (d: TeamDoc) => { const t = teams?.find((x) => x.id === d.team_id); return t ? teamScore(t) : 3 }
  const shownDocs = (docs ?? [])
    .filter((d) => (!f.team || d.team_id === f.team) && (!f.kind || d.kind === f.kind) && (!f.tool || (d.tools ?? []).some((x) => x.includes(f.tool))))
    .filter((d) => !term || [d.title, d.summary_he ?? '', ...(d.tools ?? []), teamName(d.team_id)].join(' ').toLowerCase().includes(term))
    .sort((a, b) => (f.sort === 'top' ? docTeamScore(a) - docTeamScore(b) : 0) || +new Date(b.updated_at) - +new Date(a.updated_at))
  const shownPosts = (posts ?? [])
    .filter((p) => !term || [p.title_he, p.summary_he ?? ''].join(' ').toLowerCase().includes(term))
    .sort((a, b) => (f.sort === 'views' ? b.opens - a.opens : f.sort === 'top' ? (profile.topics.includes(b.topic_slug ?? '') ? 1 : 0) - (profile.topics.includes(a.topic_slug ?? '') ? 1 : 0) : 0)
      || +new Date(b.created_at) - +new Date(a.created_at))
  const tools = [...new Set((teams ?? []).flatMap((t) => t.tools.map((x) => x.name)))].sort()

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    if (t === 'all') next.delete('tab'); else next.set('tab', t)
    setParams(next, { replace: true })
  }
  const onType = (v: string) => {
    setQ(v)
    const next = new URLSearchParams(params)
    if (v.trim()) next.set('q', v); else next.delete('q')
    setParams(next, { replace: true })
  }
  const loading = teams === null || docs === null || posts === null
  const anyDemo = (teams ?? []).some((t) => t.is_demo)
  const starters = mine
    ? [`איך צוות ${mine.team} עובד ביום-יום?`, 'איך צוות ה-PPC עובד עם GA4?', 'באילו כלי AI הצוותים משתמשים?']
    : ['איך צוות ה-PPC עובד עם GA4?', 'באילו כלי AI הצוותים משתמשים?', 'מי אחראי על הדשבורדים בחברה?']

  // Default: the same full-screen feed, my team's posts and documents first.
  if (params.get('view') !== 'list') {
    return <Feed source="internal" head={<span className="tk-title">ידע מבפנים</span>} listTo="/internal?view=list"
      agent={<PageAgent mode="internal" teams={teams ?? []} placeholder="שאלו את העמוד, למשל: איך צוות ה-PPC עובד עם GA4?" starters={starters} />} />
  }

  return (
    <div>
      <div className="page-head">
        <Headline light="איך עובדים אצלנו, ומה קורה עכשיו," black="ידע מבפנים" />
        <span className="row" style={{ gap: 8 }}>
          <Link to="/internal" className="tool-pill" aria-label="חזרה לפיד">▶ פיד</Link>
          <Link to="/contribute" className="btn">משתפים</Link>
        </span>
      </div>

      <PageAgent mode="internal" teams={teams ?? []}
        placeholder="שאלו את העמוד, למשל: איך צוות ה-PPC עובד עם GA4?"
        starters={starters} />

      <div className="page-tools">
        <div className="seg2 seg-scroll" role="tablist" aria-label="מה להציג">
          {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>
        <input className="input grow" placeholder="חיפוש צוות, מסמך או כלי" value={q} onChange={(e) => onType(e.target.value)} aria-label="חיפוש" />
      </div>
      <InternalFilters value={f} onChange={setF} teams={teams ?? []} tools={tools} />
      {anyDemo && <p className="small muted" style={{ margin: '8px 0 0' }}><DemoNote /> הפרופילים והמסמכים כאן נבנו לדמו של ההאקתון.</p>}

      {loading ? <div style={{ marginTop: 16 }}><Skeletons n={4} /></div> : (
        <>
          {(tab === 'all' || tab === 'docs') && (
            <section className="block">
              <div className="block-head">
                <h2>{tab === 'all' && mine && f.sort === 'top' && !f.team ? `המסמכים של ${mine.team}, ועוד` : 'מסמכים'}</h2>
                {tab === 'all' && shownDocs.length > 4 && <a onClick={() => setTab('docs')} role="button">לכל המסמכים</a>}
              </div>
              {shownDocs.length ? (
                <div className="card">
                  {(tab === 'all' ? shownDocs.slice(0, 4) : shownDocs).map((d) => (
                    <Link key={d.id} to={`/doc/${d.id}`} className="doc-row">
                      <span className="tavatar" style={{ background: teamColor(d.team_id) }} aria-hidden="true">{teamInitials(teamName(d.team_id))}</span>
                      <span style={{ minWidth: 0 }}><b>{d.title}</b><span className="small">צוות {teamName(d.team_id)}</span></span>
                      <span className="kind">{DOC_KIND_HE[d.kind]}</span>
                    </Link>
                  ))}
                </div>
              ) : <Empty>אין מסמך שמתאים לסינון.</Empty>}
            </section>
          )}

          {(tab === 'all' || tab === 'posts') && (
            <section className="block">
              <div className="block-head">
                <h2>קורה ב-zap</h2>
                {tab === 'all' && shownPosts.length > 3 && <a onClick={() => setTab('posts')} role="button">לכל הפרויקטים</a>}
              </div>
              {shownPosts.length ? (
                <div className="grid three">{(tab === 'all' ? shownPosts.slice(0, 3) : shownPosts).map((i) => <ItemCard key={i.id} item={i} />)}</div>
              ) : <Empty>עוד אין כאן פרויקטים. בניתם משהו? <Link to="/contribute">משתפים בדקה</Link>.</Empty>}
            </section>
          )}

          {(tab === 'all' || tab === 'teams') && (
            <section className="block">
              <div className="block-head">
                <h2>צוותים</h2>
                {tab === 'all' && shownTeams.length > 3 && <a onClick={() => setTab('teams')} role="button">לכל הצוותים</a>}
              </div>
              {shownTeams.length ? (
                <div className="teamgrid">
                  {(tab === 'all' ? shownTeams.slice(0, 3) : shownTeams).map((t) => (
                    <div key={t.id} className="teamcard">
                      <div className="teamcard-head">
                        <span className="tavatar" style={{ background: teamColor(t.id) }} aria-hidden="true">{teamInitials(t.team)}</span>
                        <div><h3>{t.team}{mine?.id === t.id ? <span className="small muted"> · הצוות שלכם</span> : null}</h3>{t.vertical && <span className="small muted">{t.vertical}</span>}</div>
                      </div>
                      <p>{t.summary_he}</p>
                      <div className="teamcard-actions">
                        <button className="btn" onClick={() => openAi('', { teamId: t.id })}>לשאול את הצוות</button>
                        <Link className="textlink" to={`/teams/${t.id}`}>לפרופיל</Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty>לא מצאנו צוות כזה.</Empty>}
            </section>
          )}
        </>
      )}
    </div>
  )
}

// Same look as the external "סינון ומיון" pill, for teams and documents.
function InternalFilters({ value, onChange, teams, tools }: { value: IF; onChange: (f: IF) => void; teams: AgentTeam[]; tools: string[] }) {
  const [open, setOpen] = useState(false)
  const active = (value.team ? 1 : 0) + (value.kind ? 1 : 0) + (value.tool ? 1 : 0)
  const set = (p: Partial<IF>) => onChange({ ...value, ...p })
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  return (
    <div className="fbar">
      <button className={`fbar-pill ${active ? 'on' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        סינון ומיון{active > 0 && <span className="fbar-count">{active}</span>}
      </button>
      <span className="fbar-sum">{SORTS.find((s) => s.v === value.sort)?.label}</span>
      {active > 0 && <button className="fbar-clear" onClick={() => onChange({ ...NO_IF, sort: value.sort })}>ניקוי</button>}
      {open && (
        <Layer>
        <div className="sheet-wrap" onClick={() => setOpen(false)}>
          <div className="sheet card fsheet" role="dialog" aria-label="סינון ומיון" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>סינון ומיון</h3>
              <button className="icon-btn" aria-label="לסגור" onClick={() => setOpen(false)}><IClose /></button>
            </div>
            <div className="fgroup"><div className="fgroup-label">מיון</div><div className="chips" style={{ margin: 0 }}>
              {SORTS.map((s) => <button key={s.v} className={`chip${value.sort === s.v ? ' on' : ''}`} onClick={() => set({ sort: s.v })}>{s.label}</button>)}
            </div></div>
            <div className="fgroup"><div className="fgroup-label">צוות</div><div className="chips" style={{ margin: 0 }}>
              {teams.map((t) => <button key={t.id} className={`chip${value.team === t.id ? ' on' : ''}`} onClick={() => set({ team: value.team === t.id ? null : t.id })}>{t.team}</button>)}
            </div></div>
            <div className="fgroup"><div className="fgroup-label">סוג מסמך</div><div className="chips" style={{ margin: 0 }}>
              {(Object.keys(DOC_KIND_HE) as DocKind[]).map((k) => <button key={k} className={`chip${value.kind === k ? ' on' : ''}`} onClick={() => set({ kind: value.kind === k ? '' : k })}>{DOC_KIND_HE[k]}</button>)}
            </div></div>
            {tools.length > 0 && (
              <div className="fgroup"><div className="fgroup-label">כלי</div><div className="chips" style={{ margin: 0 }}>
                {tools.map((t) => <button key={t} className={`chip${value.tool === t ? ' on' : ''}`} onClick={() => set({ tool: value.tool === t ? '' : t })}><bdi dir="ltr">{t}</bdi></button>)}
              </div></div>
            )}
            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setOpen(false)}>להציג</button>
              <button className="btn ghost" onClick={() => onChange({ ...NO_IF })}>איפוס</button>
            </div>
          </div>
        </div>
        </Layer>
      )}
    </div>
  )
}
