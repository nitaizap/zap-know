import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Listen } from '../components/Listen'
import { Remind } from '../components/Remind'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fmtDate, supabase } from '../lib'
import '../agent.css'

export type DocKind = 'playbook' | 'howto' | 'checklist' | 'template'

export type TeamDoc = {
  id: number
  team_id: number
  title: string
  kind: DocKind
  summary_he: string | null
  body_md: string | null
  tools: string[] | null
  is_demo: boolean
  updated_at: string
}

export type AgentTeam = {
  id: number
  team: string
  vertical: string | null
  summary_he: string
  tools: { name: string; what_for_he?: string; url?: string }[]
  resources: { name: string; url: string; system?: string }[]
  processes_he: string | null
  contact_name: string | null
  contact_email: string | null
  is_demo: boolean
}

export const DOC_KIND_HE: Record<DocKind, string> = {
  playbook: 'פלייבוק',
  howto: 'מדריך',
  checklist: 'צ׳קליסט',
  template: 'תבנית',
}

// Each team gets a stable brand color, so its avatar looks the same everywhere.
const TEAM_COLORS = ['#052b7a', '#ff5c9e', '#485cc7', '#00ab12', '#ff210d', '#263e51', '#ffc600']
export function teamColor(id: number) {
  return TEAM_COLORS[Math.abs(id) % TEAM_COLORS.length]
}
export function teamInitials(name: string) {
  const words = name.replace(/[()]/g, '').split(/[\s-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (/^[A-Za-z]/.test(words[0])) return words[0].slice(0, 3).toUpperCase()
  return words.slice(0, 2).map((w) => w[0]).join('')
}

export function DemoNote() {
  return <span className="ag-demo" title="נבנה לדמו של ההאקתון. בפרודקשן הצוות עצמו מעדכן את זה.">נתוני דמו</span>
}

// --- A small, safe markdown renderer: builds React nodes, never injects HTML. ---

function safeHref(url: string) {
  const u = url.trim()
  return /^(https?:\/\/|mailto:|#\/)/i.test(u) ? u : null
}

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], k)}</strong>)
    else if (m[3] !== undefined) out.push(<code key={k}>{m[3]}</code>)
    else {
      const href = safeHref(m[5])
      const external = href && !href.startsWith('#')
      out.push(href
        ? <a key={k} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{m[4]}</a>
        : <Fragment key={k}>{m[4]}</Fragment>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const k = `b${i}`
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(<pre key={k}><code>{code.join('\n')}</code></pre>)
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const content = inline(h[2], k)
      blocks.push(level === 1 ? <h1 key={k}>{content}</h1> : level === 2 ? <h2 key={k}>{content}</h2> : <h3 key={k}>{content}</h3>)
      i++
      continue
    }
    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={k}>{inline(quote.join(' '), k)}</blockquote>)
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      blocks.push(
        <div className="tbl" key={k}><table>
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
        </table></div>,
      )
      continue
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*]|\d+[.)])\s+/, '').replace(/^\[( |x)\]\s*/i, (_m, x) => (x.trim() ? '✓ ' : '☐ ')))
      }
      const lis = items.map((t, j) => <li key={j}>{inline(t, `${k}l${j}`)}</li>)
      blocks.push(ordered ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>)
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|```|\s*([-*]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={k}>{inline(para.join(' '), k)}</p>)
  }
  return <>{blocks}</>
}

// --- Icons ---

export function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  )
}
export function IconExternal() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

export function toolUrl(team: AgentTeam | null, name: string) {
  const t = team?.tools?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return t?.url && safeHref(t.url) ? t.url : null
}

export default function Doc() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<TeamDoc | null>(null)
  const [team, setTeam] = useState<AgentTeam | null>(null)
  const [related, setRelated] = useState<TeamDoc[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    ;(async () => {
      const { data, error } = await supabase.from('team_docs').select('*').eq('id', Number(id)).maybeSingle()
      if (!alive) return
      if (error) { setState('error'); return }
      if (!data) { setState('missing'); return }
      const d = data as TeamDoc
      setDoc(d)
      setState('ok')
      const [{ data: t }, { data: rel }] = await Promise.all([
        supabase.from('team_profiles').select('*').eq('id', d.team_id).maybeSingle(),
        supabase.from('team_docs').select('id,team_id,title,kind,summary_he,tools,is_demo,updated_at,body_md')
          .eq('team_id', d.team_id).neq('id', d.id).order('updated_at', { ascending: false }).limit(4),
      ])
      if (!alive) return
      setTeam((t as AgentTeam) ?? null)
      setRelated((rel as TeamDoc[]) ?? [])
    })()
    return () => { alive = false }
  }, [id])

  if (state === 'loading') return <div className="ag"><p className="doc-state">פותחים את המסמך</p></div>
  if (state === 'error') return <div className="ag"><p className="doc-state">משהו לא נטען כרגע. שווה לרענן בעוד רגע.</p></div>
  if (state === 'missing' || !doc) {
    return (
      <div className="ag">
        <p className="doc-state">המסמך הזה כבר לא כאן. אולי הצוות עדכן או הזיז אותו.</p>
        <p style={{ textAlign: 'center' }}><Link className="doc-btn ghost" to="/internal">לשאול את הצוותים</Link></p>
      </div>
    )
  }

  const ask = () => {
    const q = `ספרו לי עוד על "${doc.title}"${team ? ` של צוות ${team.team}` : ''}`
    navigate(`/internal?ask=${encodeURIComponent(q)}${team ? `&team=${team.id}` : ''}`)
  }

  return (
    <div className="ag">
      <header className="doc-head">
        <div className="doc-meta">
          <span className="ag-chip">{DOC_KIND_HE[doc.kind] ?? doc.kind}</span>
          {team && <Link to={`/teams/${team.id}`}>צוות {team.team}</Link>}
          <span>עודכן ב-{fmtDate(doc.updated_at)}</span>
          {doc.is_demo && <DemoNote />}
        </div>
        <h1>{doc.title}</h1>
        {doc.summary_he && <p className="doc-summary">{doc.summary_he}</p>}
        {(doc.tools?.length ?? 0) > 0 && (
          <div className="ag-tools" aria-label="כלים במסמך">
            {doc.tools!.map((name) => {
              const url = toolUrl(team, name)
              return url
                ? <a key={name} className="ag-tool" href={url} target="_blank" rel="noopener noreferrer">{name} <IconExternal /></a>
                : <span key={name} className="ag-tool">{name}</span>
            })}
          </div>
        )}
      </header>

      <Listen kind="doc" id={doc.id} />

      <div className="doc-actions">
        <button type="button" className="doc-btn" onClick={ask}><IconChat /> לשאול על המסמך הזה</button>
        {team?.contact_email && (
          <a className="doc-btn ghost" href={`mailto:${team.contact_email}?subject=${encodeURIComponent(doc.title)}`}>
            לכתוב ל{team.contact_name ?? `צוות ${team.team}`}
          </a>
        )}
        <Remind docId={doc.id} trigger={(open) => <button type="button" className="doc-btn ghost" onClick={open}>לקבל את זה במייל</button>} />
      </div>

      <article className="doc-body">
        {doc.body_md ? <Markdown source={doc.body_md} /> : <p>עוד אין כאן תוכן מלא. אפשר לשאול את הצוות ישירות.</p>}
      </article>

      {related.length > 0 && (
        <section className="doc-related">
          <h2>עוד מצוות {team?.team ?? 'הזה'}</h2>
          <div className="ag-sources">
            {related.map((r) => (
              <Link key={r.id} className="ag-src" to={`/doc/${r.id}`}>
                <span className="ag-chip">{DOC_KIND_HE[r.kind] ?? r.kind}</span>
                <b>{r.title}</b>
                {r.summary_he && <small>{r.summary_he}</small>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
