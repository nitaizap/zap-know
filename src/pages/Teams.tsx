import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TeamProfile, supabase } from '../lib'
import { Empty, Headline, Skeletons } from '../components/ui'
import { DemoNote, teamColor, teamInitials } from './Doc'
import '../calm.css'

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
    <div className="calm">
      <Headline light="ככה עובדים פה," black="צוות אחרי צוות" />
      <p className="calm-lead">באילו כלים כל צוות עובד, ואיפה החומרים שלו. יש שאלה? שואלים את הצוות ישירות.</p>
      <input className="input input-lg" placeholder="חיפוש צוות או כלי, למשל GA4" value={q} onChange={(e) => setQ(e.target.value)} />
      {anyDemo && <p className="small muted" style={{ margin: '10px 0 0' }}><DemoNote /> הפרופילים כאן נבנו לדמו של ההאקתון.</p>}

      <div style={{ marginTop: 'var(--s6, 24px)' }}>
        {teams === null ? <Skeletons n={6} /> : shown.length ? (
          <div className="teamgrid">
            {shown.map((t) => (
              <div key={t.id} className="teamcard">
                <div className="teamcard-head">
                  <span className="tavatar" style={{ background: teamColor(t.id) }} aria-hidden="true">{teamInitials(t.team)}</span>
                  <div>
                    <h3>{t.team}</h3>
                    {t.vertical && <span className="small muted">{t.vertical}</span>}
                  </div>
                </div>
                <p>{t.summary_he}</p>
                <div className="teamcard-actions">
                  <Link className="btn" to={`/agent?team=${t.id}`}>לשאול את הצוות</Link>
                  <Link className="textlink" to={`/teams/${t.id}`}>לפרופיל</Link>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty>לא מצאנו צוות כזה. אולי בשם אחר?</Empty>}
      </div>
    </div>
  )
}
