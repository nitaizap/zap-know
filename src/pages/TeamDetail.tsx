import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TeamProfile, fmtDate, supabase } from '../lib'
import { Empty, Skeletons } from '../components/ui'
import { IArrow, IBook, IChat } from '../components/icons'
import { DemoNote, IconExternal, teamColor, teamInitials } from './Doc'
import '../calm.css'

type Tool = { name: string; what_for_he?: string; url?: string }

const safeUrl = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : null)

export default function TeamDetail() {
  const { id } = useParams()
  const [team, setTeam] = useState<TeamProfile | null | undefined>(undefined)

  useEffect(() => {
    supabase.from('team_profiles').select('*').eq('id', Number(id)).maybeSingle()
      .then(({ data }) => setTeam((data as TeamProfile) ?? null))
  }, [id])

  if (team === undefined) return <div style={{ marginTop: 28 }}><Skeletons n={1} /></div>
  if (team === null) return <Empty>לא מצאנו את הצוות הזה.</Empty>

  const tools = team.tools as Tool[]
  const ask = `/internal?team=${team.id}`

  return (
    <article className="calm-narrow">
      <div className="small" style={{ marginTop: 24 }}><Link className="textlink" to="/teams">כל הצוותים</Link></div>

      <header className="profile-head">
        <span className="tavatar lg" style={{ background: teamColor(team.id) }} aria-hidden="true">{teamInitials(team.team)}</span>
        <div>
          <h1>{team.team}</h1>
          <div className="profile-sub">
            {team.vertical && <span>{team.vertical}</span>}
            {team.is_demo && <DemoNote />}
          </div>
        </div>
      </header>
      <p style={{ fontSize: 'var(--fs-lg, 18px)', margin: 0 }}>{team.summary_he}</p>
      <Link className="btn" to={ask} style={{ marginTop: 'var(--s5, 20px)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <IChat size={18} /> שאלו את הצוות
      </Link>

      {tools.length > 0 && (
        <section className="calm-section">
          <h2>הכלים של הצוות</h2>
          <div className="toolchips">
            {tools.map((t) => {
              const url = safeUrl(t.url)
              return url
                ? <a key={t.name} className="toolchip" href={url} target="_blank" rel="noopener noreferrer" title={t.what_for_he} dir="auto">{t.name} <IconExternal /></a>
                : <span key={t.name} className="toolchip" title={t.what_for_he} dir="auto">{t.name}</span>
            })}
          </div>
        </section>
      )}

      {team.resources.length > 0 && (
        <section className="calm-section">
          <h2>מדריכים ותבניות</h2>
          <div className="doclist">
            {team.resources.map((r) => {
              const inside = r.url.startsWith('#/')
              return inside
                ? (
                  <Link key={r.url} className="docrow" to={r.url.slice(1)}>
                    <span className="docicon"><IBook size={20} /></span>
                    <span><b>{r.name}</b><span>{r.system ?? 'zap UP'}</span></span>
                    <span className="go"><IArrow size={18} /></span>
                  </Link>
                )
                : (
                  <a key={r.url} className="docrow" href={r.url} target="_blank" rel="noopener noreferrer">
                    <span className="docicon"><IBook size={20} /></span>
                    <span><b>{r.name}</b>{r.system && <span>{r.system}</span>}</span>
                    <span className="go"><IconExternal /></span>
                  </a>
                )
            })}
          </div>
        </section>
      )}

      {team.processes_he && (
        <section className="calm-section">
          <h2>איך העבודה זורמת</h2>
          <p style={{ whiteSpace: 'pre-line', margin: 0, lineHeight: 1.7 }}>{team.processes_he}</p>
        </section>
      )}

      {team.contact_name && (
        <section className="calm-section">
          <h2>למי פונים</h2>
          <div className="card contact-card">
            <b style={{ fontWeight: 800 }}>{team.contact_name}</b>
            {team.contact_email
              ? <a className="btn ghost" href={`mailto:${team.contact_email}`}>לכתוב מייל</a>
              : <Link className="btn ghost" to={ask}>לשאול כאן</Link>}
          </div>
        </section>
      )}

      <p className="small muted" style={{ marginTop: 'var(--s8, 32px)' }}>
        עודכן ב-{fmtDate(team.updated_at)}{team.confirmed_at ? ` · אושר מול הצוות ב-${fmtDate(team.confirmed_at)}` : ''}
      </p>
    </article>
  )
}
