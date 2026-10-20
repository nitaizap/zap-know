import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ALLOWED_DOMAIN, Profile, ROLES, Topic, supabase } from '../lib'
import { Headline } from '../components/ui'
import { NeedsPicker } from '../components/prefs'

export default function Onboarding({ session, topics, existing, onDone }: {
  session: Session; topics: Topic[]; existing: Profile | null; onDone: (p: Profile) => void
}) {
  const [role, setRole] = useState(existing?.role ?? '')
  const [picked, setPicked] = useState<string[]>(existing?.topics ?? [])
  const [manager, setManager] = useState(existing?.manager_email ?? '')
  const [needs, setNeeds] = useState<string[]>(existing?.needs ?? [])
  const [note, setNote] = useState(existing?.needs_note ?? '')
  const [step, setStep] = useState<1 | 2>(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const managerOk = !manager.trim() || manager.trim().toLowerCase().endsWith(ALLOWED_DOMAIN)
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
      needs,
      needs_note: note.trim() || null,
      ...(manager.trim() ? { manager_email: manager.trim().toLowerCase() } : {}),
    }
    const { data, error } = await supabase.from('profiles').upsert(row).select('*').single()
    setBusy(false)
    if (error || !data) { setErr('משהו נתקע בשמירה. נסו שוב.'); return }
    onDone(data as Profile)
  }

  if (step === 2) {
    return (
      <div className="container" style={{ maxWidth: 640, paddingBottom: 40 }}>
        <div className="texture" />
        <Headline light="ומה אתם צריכים" black="עכשיו בעבודה?" hand="עוד רגע" />
        <p className="muted">ככה נביא לכם גם את מה שיעזור לכם החודש, לא רק את מה שמעניין. אפשר לבחור כמה שרוצים.</p>
        <NeedsPicker needs={needs} setNeeds={setNeeds} note={note} setNote={setNote} />
        <div className="row" style={{ marginTop: 24, gap: 10 }}>
          <button className="btn ghost" onClick={() => setStep(1)} disabled={busy}>חזרה</button>
          <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={save}>
            {busy ? 'שומרים' : needs.length ? 'לבית שלי' : 'דילוג, לבית שלי'}
          </button>
        </div>
        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
        <p className="small muted" style={{ marginTop: 14 }}>אפשר לשנות הכול אחר כך ב"ההעדפות שלי".</p>
      </div>
    )
  }

  return (
    <div className="container" style={{ maxWidth: 640, paddingBottom: 40 }}>
      <div className="texture" />
      <Headline light="כמה שאלות קטנות," black="ומתחילים" hand="15 שניות" />
      <p className="muted">ככה zap UP יודע מה להביא לכם כל שבוע. אפשר לשנות את זה מתי שרוצים.</p>

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

      <h2 className="section">מי המנהל/ת הישיר/ה שלכם? <small>לא חובה</small></h2>
      <label className="field">
        <span className="small muted" style={{ fontWeight: 300 }}>
          המייל של המנהל/ת הישיר/ה. צריך אותו רק כשרוצים לקנות משהו מעל תקציב הלמידה. בגרסה המלאה הוא מגיע אוטומטית מ-M365.
        </span>
        <input className="input" dir="ltr" placeholder={`name${ALLOWED_DOMAIN}`} value={manager} onChange={(e) => setManager(e.target.value)} />
      </label>
      {manager.trim() && !managerOk && <div className="small" style={{ color: 'var(--red)' }}>המייל צריך להסתיים ב-{ALLOWED_DOMAIN}</div>}

      <div style={{ marginTop: 24 }}>
        <button className="btn block" disabled={!role || picked.length < 2 || !managerOk} onClick={() => setStep(2)}>
          ממשיכים
        </button>
        <div className="small muted" style={{ marginTop: 8, textAlign: 'center' }}>שלב 1 מתוך 2</div>
      </div>
    </div>
  )
}
