import { useSearchParams } from 'react-router-dom'
import Feed, { type FeedSource } from './Feed'

// בית: one full-screen feed of everything (feed_all), with four tabs in the overlay.
const TABS: { key: string; source: FeedSource; label: string }[] = [
  { key: 'in', source: 'internal', label: 'בזאפ' },
  { key: 'out', source: 'external', label: 'בעולם' },
  { key: '', source: 'all', label: 'בשבילך' },
  { key: 'bites', source: 'bites', label: 'בקצרה' },
]

export default function Home() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === (params.get('tab') ?? '')) ?? TABS[2]
  const pick = (key: string) => {
    const next = new URLSearchParams(params)
    if (key) next.set('tab', key); else next.delete('tab')
    setParams(next, { replace: true })
  }
  return (
    <Feed key={tab.source} source={tab.source}
      head={TABS.map((t) => (
        <button key={t.key} role="tab" aria-selected={t === tab} className={`tk-tab${t === tab ? ' on' : ''}`} onClick={() => pick(t.key)}>{t.label}</button>
      ))} />
  )
}
