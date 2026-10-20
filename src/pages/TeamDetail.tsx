import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TeamProfile, fmtDate, supabase } from '../lib'
import { DemoBadge, Empty, Skeletons } from '../components/ui'

export default function TeamDetail() {
  const { id } = useParams()
  const [team, setTeam] = useState<TeamProfile | null | undefined>(undefined)

  useEffect(() => {
    supabase.from('team_profiles').select('*').eq('id', Number(id)).maybeSingle()
      .then(({ data }) => setTeam((data as TeamProfile) ?? null))
  }, [id])

  if (team === undefined) return <div style={{ marginTop: 28 }}><Skeletons n={1} /></div>
  if (team === null) return <Empty>לא מצאנו את הצוות הזה.</Empty>

  return (
    <article style={{ maxWidth: 760 }}>
      <div className="small" style={{ marginTop: 24 }}><Link to="/teams">כל הצוותים</Link></div>
      <div className="row" style={{ marginTop: 8 }}>
        <h1 style={{ fontWeight: 900, fontSize: 'clamp(26px, 5vw, 36px)', margin: 0, color: 'var(--navy)' }}>{team.team}</h1>
        {team.vertical && <span className="badge">{team.vertical}</span>}
      </div>
      {team.is_demo && (
        <div className="notice demo" style={{ marginTop: 12 }}>
          <DemoBadge /> הפרופיל הזה נוצר כנתוני דמו. הוא עוד לא אושר מול הצוות האמיתי.
        </div>
      )}
      <p style={{ fontSize: 17, marginTop: 14 }}>{team.summary_he}</p>

      <h2 className="section">הכלים שהצוות עובד איתם</h2>
      <div className="grid two">
        {team.tools.map((t) => (
          <div key={t.name} className="card">
            <h3 style={{ margin: 0 }} dir="auto">{t.name}</h3>
            {t.what_for_he && <p className="small muted">{t.what_for_he}</p>}
          </div>
        ))}
      </div>

      {team.resources.length > 0 && (
        <>
          <h2 className="section">חומרים ותבניות <small>שם וקישור בלבד. המערכת עצמה בודקת אם יש לכם הרשאה</small></h2>
          <div className="card">
            <ul className="lessons">
              {team.resources.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontWeight: 600 }}>{r.name} ←</a>
                  {r.system && <span className="badge">{r.system}</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {team.processes_he && (
        <>
          <h2 className="section">איך העבודה זורמת</h2>
          <div className="card"><p style={{ whiteSpace: 'pre-line' }}>{team.processes_he}</p></div>
        </>
      )}

      {team.contact_name && (
        <>
          <h2 className="section">למי פונים</h2>
          <div className="card">
            <b style={{ fontWeight: 800 }}>{team.contact_name}</b>
            {team.contact_email && <div><a href={`mailto:${team.contact_email}`} dir="ltr">{team.contact_email}</a></div>}
          </div>
        </>
      )}
      <p className="small muted" style={{ marginTop: 16 }}>
        עודכן לאחרונה: {fmtDate(team.updated_at)}{team.confirmed_at ? ` · אושר מול הצוות: ${fmtDate(team.confirmed_at)}` : ''}
      </p>
    </article>
  )
}
