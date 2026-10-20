import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../App'
import { ITEM_COLS, Item, TeamProfile, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'
import { FeedRow, loadFeed, reasonChips } from '../components/social'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'
import '../contribute.css'

export default function TopicPage() {
  const { slug } = useParams()
  const { topics } = useApp()
  const topic = topics.find((t) => t.slug === slug)
  const [items, setItems] = useState<Item[] | null>(null)
  const [f, setF] = useFilters('topic')
  const saved = useSavedIds(f.saved)
  const [ranked, setRanked] = useState<FeedRow[] | null>(null)
  const [expert, setExpert] = useState<TeamProfile | null>(null)

  useEffect(() => {
    setItems(null)
    supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('topic_slug', slug ?? '')
      .neq('kind', 'internal').order('published_at', { ascending: false, nullsFirst: false }).limit(200)
      .then(({ data }) => setItems((data as Item[]) ?? []))
    setRanked(null)
    loadFeed(200, slug).then(setRanked)
  }, [slug])

  useEffect(() => {
    setExpert(null)
    if (!topic?.expert_team_id) return
    supabase.from('team_profiles').select('*').eq('id', topic.expert_team_id).maybeSingle()
      .then(({ data }) => setExpert((data as TeamProfile) ?? null))
  }, [topic?.expert_team_id])

  if (!topic) return <Empty>לא מצאנו את הנושא הזה.</Empty>

  if (topic.status === 'soon') {
    return (
      <div>
        <Headline light={topic.name_he} black="עולה בקרוב" hand="שווה לחכות" />
        <div className="card soon-card">
          <p>{topic.blurb_he}</p>
          <p className="muted small">אנחנו כבר בוחרים מקורות לתחום הזה. ברגע שנאשר אותם, התוכן יגיע לכאן לבד.</p>
          <WatchButton slug={topic.slug} />
        </div>
        {expert && <ExpertCard team={expert} />}
      </div>
    )
  }

  const rank = new Map((ranked ?? []).map((r, n) => [r.id, n]))
  const rowOf = new Map((ranked ?? []).map((r) => [r.id, r]))
  const shown = items ? applyFilters(items, { ...f, topic: '' }, { saved, rank: ranked ? rank : undefined }) : null
  const toolsPresent = [...new Set((items ?? []).flatMap((i) => i.tools ?? []))].sort()

  return (
    <div>
      <Headline light={topic.blurb_he ?? ''} black={topic.name_he} />
      {expert && <ExpertCard team={expert} />}
      <FilterBar value={f} onChange={setF} total={shown?.length}
        show={{ kind: true, len: true, vertical: true, saved: true, lang: true, level: true, tools: toolsPresent }} />
      {shown === null ? <Skeletons n={6} /> : shown.length ? (
        <div className="grid three">{shown.map((i) => <ItemCard key={i.id} item={i} reasons={f.sort === 'top' ? reasonChips(rowOf.get(i.id)).slice(0, 1) : undefined} />)}</div>
      ) : <Empty>אין כאן עדיין תוכן שמתאים לסינון. אפשר לנסות סינון אחר.</Empty>}
    </div>
  )
}

// "מי ב-zap מבין בזה": the team that knows this topic, one tap from asking them.
function ExpertCard({ team }: { team: TeamProfile }) {
  return (
    <div className="card expert-card">
      <span className="expert-badge" aria-hidden="true">{team.team.slice(0, 2)}</span>
      <div className="expert-body">
        <div className="small muted">מי ב-zap מבין בזה</div>
        <b>צוות {team.team}</b>
        <p className="small expert-sum">{team.summary_he}</p>
      </div>
      <div className="expert-actions">
        <Link className="btn sm" to={`/agent?team=${team.id}`}>לשאול את הצוות</Link>
        <Link className="small" to={`/teams/${team.id}`}>לפרופיל</Link>
      </div>
    </div>
  )
}

// "עדכנו אותי כשזה באוויר": a quiet subscription, emailed when the topic goes live.
function WatchButton({ slug }: { slug: string }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('topic_watch').select('topic_slug').eq('topic_slug', slug).maybeSingle()
      .then(({ data, error }) => setOn(error ? null : !!data))
  }, [slug])

  async function toggle() {
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    if (on) await supabase.from('topic_watch').delete().eq('topic_slug', slug)
    else await supabase.from('topic_watch').upsert({ user_id: u.user?.id, topic_slug: slug })
    setOn(!on)
    setBusy(false)
  }

  if (on === null) return null
  return on ? (
    <div className="watch-on">
      <span>נעדכן אתכם במייל ברגע שהתחום עולה.</span>
      <button className="fbar-clear" onClick={toggle} disabled={busy}>לבטל</button>
    </div>
  ) : (
    <button className="btn" onClick={toggle} disabled={busy}>עדכנו אותי כשזה באוויר</button>
  )
}
