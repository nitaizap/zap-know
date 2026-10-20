import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Profile, ROLES, Topic, supabase } from '../lib'
import { Headline } from '../components/ui'

export default function Onboarding({ session, topics, existing, onDone }: {
  session: Session; topics: Topic[]; existing: Profile | null; onDone: (p: Profile) => void
}) {
  const [role, setRole] = useState(existing?.role ?? '')
  const [picked, setPicked] = useState<string[]>(existing?.topics ?? [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const live = topics.filter((t) => t.status === 'live')

  function toggle(slug: string) {
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : p.length >= 3 ? p : [...p, slug]))
  }

  async function save() {
    setBusy(true); setErr('')
    const row = {
      user_id: session.user.id,
      email: session.user.email ?? '',
      role,
      topics: picked,
    }
    const { data, error } = await supabase.from('profiles').upsert(row).select('*').single()
    setBusy(false)
    if (error || !data) { setErr('משהו נתקע בשמירה. נסו שוב.'); return }
    onDone(data as Profile)
  }

  return (
    <div className="container" style={{ maxWidth: 640, paddingBottom: 40 }}>
      <div className="texture" />
      <Headline light="שתי שאלות קטנות," black="ומתחילים" hand="10 שניות" />
      <p className="muted">ככה zap KNOW יודע מה להביא לכם כל שבוע. אפשר לשנות את זה מתי שרוצים.</p>

      <h2 className="section">באיזה תחום אתם עובדים?</h2>
      <div className="chips">
        {ROLES.map((r) => (
          <button key={r} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>{r}</button>
        ))}
      </div>

      <h2 className="section">מה מעניין אתכם? <small>2 עד 3 נושאים</small></h2>
      <div className="chips">
        {live.map((t) => (
          <button key={t.slug} className={`chip ${picked.includes(t.slug) ? 'on' : ''}`} onClick={() => toggle(t.slug)}>
            {t.name_he}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn block" disabled={!role || picked.length < 2 || busy} onClick={save}>
          {busy ? 'שומרים' : 'לבית שלי'}
        </button>
        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  )
}
