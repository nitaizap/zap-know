import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TeamProfile, supabase } from '../lib'
import { DemoBadge, Empty, Headline, Skeletons } from '../components/ui'

export default function Teams() {
  const [teams, setTeams] = useState<TeamProfile[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('team_profiles').select('*').order('team')
      .then(({ data }) => setTeams((data as TeamProfile[]) ?? []))
  }, [])

  const term = q.trim().toLowerCase()
  const shown = (teams ?? []).filter((t) => !term || [t.team, t.summary_he, ...t.tools.map((x) => x.name)].join(' ').toLowerCase().includes(term))
  const anyDemo = (teams ?? []).some((t) => t.is_demo)

  return (
    <div>
      <Headline light="ככה עובדים פה," black="צוות אחרי צוות" />
      <p className="muted">באילו כלים כל צוות משתמש, איפה החומרים שלו ולמי פונים. רוצים תשובה מהירה? <Link to="/ask">שאלו את zap UP</Link>.</p>
      {anyDemo && (
        <div className="notice demo" style={{ margin: '12px 0' }}>
          <DemoBadge /> הפרופילים כאן הם נתוני דמו להאקתון. בגרסה המלאה הם נבנים משיחה חודשית קצרה עם כל צוות ומהמקומות שכל צוות בחר לשתף.
        </div>
      )}
      <input className="input" placeholder="חפשו צוות או כלי, למשל Looker Studio" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />
      {teams === null ? <Skeletons n={6} /> : shown.length ? (
        <div className="grid three">
          {shown.map((t) => (
            <Link key={t.id} to={`/teams/${t.id}`} className="card link">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                {t.vertical && <span className="badge">{t.vertical}</span>}
                {t.is_demo && <DemoBadge />}
              </div>
              <h3>{t.team}</h3>
              <p className="muted small">{t.summary_he}</p>
              <div className="meta">{t.tools.slice(0, 4).map((x) => <span key={x.name} className="badge">{x.name}</span>)}</div>
            </Link>
          ))}
        </div>
      ) : <Empty>לא מצאנו צוות כזה.</Empty>}
    </div>
  )
}
