import { useSearchParams } from 'react-router-dom'
import Feed, { type FeedSource } from './Feed'

// בית: one full-screen feed per lane (feed_v2), with the lane row in the overlay. "חם ב-zap" and
// "חם בצוות שלכם" aren't in the row: they open from their cards inside בשבילך, or the filter sheet.
const TABS: { key: string; source: FeedSource; label: string; hidden?: boolean }[] = [
  { key: '', source: 'all', label: 'בשבילך' },
  { key: 'in', source: 'internal', label: 'בזאפ' },
  { key: 'out', source: 'external', label: 'בעולם' },
  { key: 'bites', source: 'bites', label: 'בקצרה' },
  { key: 'hot', source: 'trending', label: 'חם ב-zap', hidden: true },
  { key: 'team', source: 'team', label: 'חם בצוות שלכם', hidden: true },
]

export default function Home() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === (params.get('tab') ?? '')) ?? TABS[0]
  const pick = (key: string) => {
    const next = new URLSearchParams(params)
    if (key) next.set('tab', key); else next.delete('tab')
    setParams(next, { replace: true })
  }
  const head = tab.hidden
    ? <>
        <button type="button" className="tk-tab tk-back" onClick={() => pick('')}>✕ חזרה לבשבילך</button>
        <span className="tk-tab on" data-lane={tab.key}>{tab.label}</span>
      </>
    : TABS.filter((t) => !t.hidden).map((t) => (
        <button key={t.key} role="tab" aria-selected={t === tab} className={`tk-tab${t === tab ? ' on' : ''}`} data-lane={t.key || 'all'} onClick={() => pick(t.key)}>{t.label}</button>
      ))
  const extra = (
    <div className="hot-links">
      <button type="button" className="chip" onClick={() => pick('hot')}>🔥 חם ב-zap</button>
      <button type="button" className="chip" onClick={() => pick('team')}>👥 חם בצוות שלכם</button>
    </div>
  )
  return <Feed key={tab.source} source={tab.source} head={head} agent={extra} onLane={(l) => pick(l === 'trending' ? 'hot' : 'team')} />
}
