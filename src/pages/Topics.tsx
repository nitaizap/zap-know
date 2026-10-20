import { Link } from 'react-router-dom'
import { useApp } from '../App'
import { Headline } from '../components/ui'

export default function Topics() {
  const { topics } = useApp()
  return (
    <div>
      <Headline light="כל הנושאים," black="לפי מה שאתם עושים" />
      <div className="grid three">
        {topics.map((t) => (
          <Link key={t.slug} to={`/topic/${t.slug}`} className="card link" style={t.status === 'soon' ? { opacity: .7 } : undefined}>
            {t.status === 'soon' && <span className="badge">בקרוב</span>}
            <h3>{t.name_he}</h3>
            <p className="muted small">{t.blurb_he}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
