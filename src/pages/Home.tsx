import { useSearchParams } from 'react-router-dom'
import Feed, { type FeedSource } from './Feed'

// בית: one full-screen feed of everything (feed_all), with four tabs in the overlay.
const TABS: { key: string; source: FeedSource; label: string; short?: string }[] = [
  { key: '', source: 'all', label: 'בשבילכם' },
  { key: 'out', source: 'external', label: 'מה קורה בעולם', short: 'בעולם' },
  { key: 'in', source: 'internal', label: 'מה קורה ב-zap', short: 'ב-zap' },
  { key: 'bites', source: 'bites', label: 'ביס קטן' },
]

export default function Home() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === (params.get('tab') ?? '')) ?? TABS[0]
  const pick = (key: string) => {
    const next = new URLSearchParams(params)
    if (key) next.set('tab', key); else next.delete('tab')
    setParams(next, { replace: true })
  }
  return (
    <Feed key={tab.source} source={tab.source}
      head={TABS.map((t) => (
        <button key={t.key} role="tab" aria-selected={t === tab} className={`tk-tab${t === tab ? ' on' : ''}`} onClick={() => pick(t.key)} aria-label={t.label}>
          {t.short ? <><span className="lbl-long2">{t.label}</span><span className="lbl-short2" aria-hidden>{t.short}</span></> : t.label}
        </button>
      ))} />
  )
}
