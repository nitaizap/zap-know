import { useState } from 'react'
import { NEEDS, Profile, ROLES, Topic, supabase } from '../lib'

// Needs chips + optional free text. Shared by onboarding and "ההעדפות שלי".
export function NeedsPicker({ needs, setNeeds, note, setNote }: {
  needs: string[]; setNeeds: (n: string[]) => void; note: string; setNote: (s: string) => void
}) {
  function toggle(n: string) {
    setNeeds(needs.includes(n) ? needs.filter((x) => x !== n) : [...needs, n])
  }
  return (
    <>
      <div className="chips">
        {NEEDS.map((n) => (
          <button key={n} type="button" className={`chip ${needs.includes(n) ? 'on' : ''}`} onClick={() => toggle(n)}>{n}</button>
        ))}
      </div>
      <label className="field">
        <span className="small muted" style={{ fontWeight: 300 }}>רוצים לפרט? משפט אחד מספיק <small>(לא חובה)</small></span>
        <input className="input" maxLength={200} placeholder="למשל: עוברים לקמפיינים ב-Performance Max" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </>
  )
}

// A starting suggestion from the work email: "dana.cohen@" → "Dana Cohen". People edit it.
export function suggestName(email: string) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Change name, role, interests and needs any time. Feeds, discovery and the weekly episode follow.
export function PrefsPanel({ profile, topics, onSaved }: { profile: Profile; topics: Topic[]; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile.display_name ?? suggestName(profile.email))
  const [role, setRole] = useState(profile.role ?? '')
  const [picked, setPicked] = useState<string[]>(profile.topics)
  const [needs, setNeeds] = useState<string[]>(profile.needs ?? [])
  const [note, setNote] = useState(profile.needs_note ?? '')
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'err'>('idle')
  const live = topics.filter((t) => t.status === 'live')

  function toggleTopic(slug: string) {
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : p.length >= 3 ? p : [...p, slug]))
  }

  async function save() {
    setState('busy')
    const { data, error } = await supabase.from('profiles')
      .update({ display_name: name.trim(), role, topics: picked, needs, needs_note: note.trim() || null })
      .eq('user_id', profile.user_id).select('*').single()
    if (error || !data) { setState('err'); return }
    setState('saved')
    onSaved(data as Profile)
  }

  return (
    <div className="card" id="prefs">
      <h3 style={{ margin: '0 0 4px' }}>ההעדפות שלי</h3>
      <p className="small muted" style={{ margin: 0 }}>מה שתבחרו כאן משנה את הפיד, את ההמלצות ואת הפרק השבועי.</p>

      <h4 style={{ margin: '14px 0 0' }}>איך לקרוא לכם</h4>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} style={{ marginTop: 6 }} />

      <h4 style={{ margin: '14px 0 0' }}>התחום שלכם</h4>
      <div className="chips">
        {ROLES.map((r) => <button key={r} type="button" className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>{r}</button>)}
      </div>

      <h4 style={{ margin: '14px 0 0' }}>מה מעניין אתכם <small className="muted">2 עד 3</small></h4>
      <div className="chips">
        {live.map((t) => (
          <button key={t.slug} type="button" className={`chip ${picked.includes(t.slug) ? 'on' : ''}`} onClick={() => toggleTopic(t.slug)}>{t.name_he}</button>
        ))}
      </div>

      <h4 style={{ margin: '14px 0 0' }}>מה אתם צריכים עכשיו בעבודה</h4>
      <NeedsPicker needs={needs} setNeeds={setNeeds} note={note} setNote={setNote} />

      <div className="row" style={{ marginTop: 12, gap: 10 }}>
        <button className="btn" disabled={name.trim().length < 2 || !role || picked.length < 2 || state === 'busy'} onClick={save}>
          {state === 'busy' ? 'שומרים' : 'לשמור'}
        </button>
        {state === 'saved' && <span className="small" style={{ color: 'var(--green)' }}>נשמר. הפיד מתעדכן.</span>}
        {state === 'err' && <span className="small" style={{ color: 'var(--red)' }}>משהו נתקע בשמירה. נסו שוב.</span>}
      </div>
    </div>
  )
}
