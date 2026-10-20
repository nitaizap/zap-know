import { useState } from 'react'
import '../onboarding.css'
import { ALLOWED_DOMAIN, NEEDS, Profile, Topic, supabase } from '../lib'
import { AvatarPicker } from './Avatar'

// Everything onboarding asks, in one place, so onboarding and "ההעדפות שלי" stay in sync.
export const ROLE_OPTIONS = [
  'PPC', 'SEO ו-GEO', 'סושיאל', 'תוכן', 'קריאייטיב ועיצוב', 'דאטה ואנליטיקס', 'מוצר', 'פיתוח',
  'מכירות', 'ניהול לקוחות', 'שירות לקוחות', 'שיווק', 'HR ו-L&D', 'כספים', 'הנהלה', 'אחר',
]
export const VERTICAL_OPTIONS = [
  'zap', 'zapstore', 'Wisebuy', 'דפי זהב', 'Doctors', 'משפטי', 'REST', 'Weekend', 'zapX', 'zap לעסקים', 'zap Group / מטה',
]
export const SENIORITY_OPTIONS = [
  { value: 'new', label: 'מתחילים בתפקיד', hint: 'פחות משנה בתחום' },
  { value: 'experienced', label: 'כמה שנים בתחום', hint: 'יודעים את העבודה, רוצים להתקדם' },
  { value: 'lead', label: 'מובילים צוות', hint: 'מנהלים אנשים או תחום' },
]
export const FORMAT_OPTIONS = ['וידאו קצר', 'קורס מלא', 'כתבות', 'פודקאסט ואודיו', 'תרגול מעשי']
export const TIME_OPTIONS = ['15 דקות', 'שעה', '2-3 שעות', 'יותר']
export const GOAL_SUGGESTIONS = [
  'להוציא הסמכה של Google Ads', 'להבין איך מופיעים בתשובות של AI', 'לבנות דשבורד ראשון',
  'לשפר את אחוזי ההמרה', 'להוביל פרויקט AI בצוות', 'להכיר לעומק את המותגים של zap',
]
export const CHANNEL_OPTIONS = [
  { value: 'teams', label: 'Teams' }, { value: 'email', label: 'מייל' },
  { value: 'both', label: 'גם וגם' }, { value: 'none', label: 'בלי, תודה' },
]
export const DAY_OPTIONS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']
// Brand palette only (zap-visual-language).
export const AVATAR_COLORS = ['#052b7a', '#485cc7', '#ff5c9e', '#00ab12', '#ffc600', '#ff210d', '#001c32']
export const TOPIC_ICON: Record<string, string> = {
  'digital-marketing': '📣', ppc: '🎯', social: '💬', 'geo-ecommerce': '🛒',
  'data-ai': '📊', 'behavioral-econ': '🧠', decisions: '🧭', cx: '🤝',
}

export type ProfileX = Profile & {
  vertical?: string | null
  seniority?: string | null
  formats?: string[]
  weekly_time?: string | null
  english_ok?: boolean | null
  goal?: string | null
  notify_channel?: string | null
  notify_day?: number | null
  avatar_color?: string | null
  onboarded_at?: string | null
}

const BASE_COLS = ['user_id', 'email', 'display_name', 'role', 'topics', 'needs', 'needs_note', 'manager_email']

// Upsert the profile; if the new columns (patch-009) aren't in the database yet,
// retry with the original ones so onboarding never gets stuck.
export async function saveProfile(row: Record<string, unknown>): Promise<ProfileX | null> {
  const first = await supabase.from('profiles').upsert(row).select('*').single()
  if (!first.error && first.data) return first.data as ProfileX
  if (!/column|schema cache|permission/i.test(first.error?.message ?? '')) return null
  const base = Object.fromEntries(Object.entries(row).filter(([k]) => BASE_COLS.includes(k)))
  const second = await supabase.from('profiles').upsert(base).select('*').single()
  return second.error ? null : (second.data as ProfileX)
}

export function managerOk(m: string) {
  return !m.trim() || m.trim().toLowerCase().endsWith(ALLOWED_DOMAIN)
}

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

function Chips({ options, value, onPick }: { options: string[]; value: string | null | undefined; onPick: (v: string) => void }) {
  return (
    <div className="chips">
      {options.map((o) => <button key={o} type="button" className={`chip ${value === o ? 'on' : ''}`} onClick={() => onPick(o)}>{o}</button>)}
    </div>
  )
}

function Multi({ options, values, onChange }: { options: string[]; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className={`chip ${values.includes(o) ? 'on' : ''}`}
          onClick={() => onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o])}>
          {o}
        </button>
      ))}
    </div>
  )
}

// Change everything onboarding asked, any time. Feeds, discovery and the weekly episode follow.
export function PrefsPanel({ profile, topics, onSaved }: { profile: Profile; topics: Topic[]; onSaved: (p: Profile) => void }) {
  const p = profile as ProfileX
  const [name, setName] = useState(p.display_name ?? suggestName(p.email))
  const [color, setColor] = useState(p.avatar_color ?? AVATAR_COLORS[0])
  const [look, setLook] = useState<{ avatar_url: string | null; avatar_style: string | null }>({
    avatar_url: p.avatar_url ?? null, avatar_style: p.avatar_style ?? (p.avatar_url ? 'photo' : 'initial'),
  })
  const [vertical, setVertical] = useState(p.vertical ?? '')
  const [role, setRole] = useState(p.role ?? '')
  const [seniority, setSeniority] = useState(p.seniority ?? '')
  const [picked, setPicked] = useState<string[]>(p.topics)
  const [needs, setNeeds] = useState<string[]>(p.needs ?? [])
  const [note, setNote] = useState(p.needs_note ?? '')
  const [formats, setFormats] = useState<string[]>(p.formats ?? [])
  const [time, setTime] = useState(p.weekly_time ?? '')
  const [english, setEnglish] = useState<boolean | null>(p.english_ok ?? null)
  const [goal, setGoal] = useState(p.goal ?? '')
  const [channel, setChannel] = useState(p.notify_channel ?? 'both')
  const [day, setDay] = useState<number>(p.notify_day ?? 0)
  const [manager, setManager] = useState(p.manager_email ?? '')
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'err'>('idle')
  const [open, setOpen] = useState<string>('me')

  async function save() {
    setState('busy')
    const data = await saveProfile({
      user_id: p.user_id, email: p.email,
      display_name: name.trim(), role, topics: picked, needs, needs_note: note.trim() || null,
      manager_email: manager.trim().toLowerCase() || null,
      avatar_color: color, avatar_url: look.avatar_url, avatar_style: look.avatar_style, vertical: vertical || null, seniority: seniority || null, formats,
      weekly_time: time || null, english_ok: english, goal: goal.trim() || null,
      notify_channel: channel, notify_day: day,
    })
    if (!data) { setState('err'); return }
    setState('saved')
    onSaved(data)
  }

  const group = (id: string, title: string, body: React.ReactNode) => (
    <div className="ob-prefs-group">
      <button type="button" className="ob-prefs-head" onClick={() => setOpen(open === id ? '' : id)} aria-expanded={open === id}>
        <span>{title}</span><span aria-hidden>{open === id ? '−' : '+'}</span>
      </button>
      {open === id && <div className="ob-prefs-body">{body}</div>}
    </div>
  )

  return (
    <div className="card" id="prefs">
      <h3 style={{ margin: '0 0 4px' }}>ההעדפות שלי</h3>
      <p className="small muted" style={{ margin: 0 }}>מה שתבחרו כאן משנה את הפיד, את ההמלצות ואת הפרק השבועי.</p>

      {group('me', 'מי אני', <>
        <label className="field"><span className="small muted">איך לקרוא לכם</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
        <h4 className="ob-sub">איך תיראו בטבלה ובתגובות</h4>
        <AvatarPicker userId={p.user_id} name={name} value={{ ...look, avatar_color: color }}
          onChange={(v) => { setLook({ avatar_url: v.avatar_url, avatar_style: v.avatar_style }); setColor(v.avatar_color) }} />
      </>)}

      {group('where', 'איפה אני ב-zap', <>
        <h4 className="ob-sub">מותג</h4><Chips options={VERTICAL_OPTIONS} value={vertical} onPick={setVertical} />
        <h4 className="ob-sub">תחום</h4><Chips options={ROLE_OPTIONS} value={role} onPick={setRole} />
        <h4 className="ob-sub">ותק</h4><Chips options={SENIORITY_OPTIONS.map((s) => s.label)} value={SENIORITY_OPTIONS.find((s) => s.value === seniority)?.label}
          onPick={(l) => setSeniority(SENIORITY_OPTIONS.find((s) => s.label === l)!.value)} />
      </>)}

      {group('topics', 'מה מעניין אותי', (
        <div className="chips">
          {topics.map((t) => (
            <button key={t.slug} type="button" className={`chip ${picked.includes(t.slug) ? 'on' : ''}`}
              onClick={() => setPicked((x) => (x.includes(t.slug) ? x.filter((s) => s !== t.slug) : [...x, t.slug]))}>
              {TOPIC_ICON[t.slug] ?? '✨'} {t.name_he}{t.status === 'soon' ? ' · בקרוב' : ''}
            </button>
          ))}
        </div>
      ))}

      {group('needs', 'מה אני צריך/ה עכשיו', <NeedsPicker needs={needs} setNeeds={setNeeds} note={note} setNote={setNote} />)}

      {group('how', 'איך נוח לי ללמוד', <>
        <h4 className="ob-sub">פורמטים</h4><Multi options={FORMAT_OPTIONS} values={formats} onChange={setFormats} />
        <h4 className="ob-sub">זמן בשבוע</h4><Chips options={TIME_OPTIONS} value={time} onPick={setTime} />
        <h4 className="ob-sub">אנגלית</h4>
        <div className="chips">
          <button type="button" className={`chip ${english === false ? 'on' : ''}`} onClick={() => setEnglish(false)}>רק עברית</button>
          <button type="button" className={`chip ${english === true ? 'on' : ''}`} onClick={() => setEnglish(true)}>סבבה עם אנגלית</button>
        </div>
      </>)}

      {group('goal', 'היעד שלי', <>
        <input className="input" value={goal} maxLength={140} onChange={(e) => setGoal(e.target.value)} placeholder="מה תרצו להשיג ב-3 החודשים הקרובים?" />
        <div className="chips">{GOAL_SUGGESTIONS.map((g) => <button key={g} type="button" className="chip" onClick={() => setGoal(g)}>{g}</button>)}</div>
      </>)}

      {group('notify', 'עדכונים', <>
        <h4 className="ob-sub">הפרק השבועי מגיע ב</h4>
        <Chips options={CHANNEL_OPTIONS.map((c) => c.label)} value={CHANNEL_OPTIONS.find((c) => c.value === channel)?.label}
          onPick={(l) => setChannel(CHANNEL_OPTIONS.find((c) => c.label === l)!.value)} />
        <h4 className="ob-sub">ביום</h4>
        <Chips options={DAY_OPTIONS} value={DAY_OPTIONS[day]} onPick={(d) => setDay(DAY_OPTIONS.indexOf(d))} />
        <label className="field"><span className="small muted">המייל של המנהל/ת הישיר/ה (לאישורי תקציב)</span>
          <input className="input" dir="ltr" placeholder={`name${ALLOWED_DOMAIN}`} value={manager} onChange={(e) => setManager(e.target.value)} /></label>
        {!managerOk(manager) && <div className="small" style={{ color: 'var(--red)' }}>המייל צריך להסתיים ב-{ALLOWED_DOMAIN}</div>}
      </>)}

      <div className="row" style={{ marginTop: 12, gap: 10 }}>
        <button className="btn" disabled={name.trim().length < 2 || !role || picked.length < 2 || !managerOk(manager) || state === 'busy'} onClick={save}>
          {state === 'busy' ? 'שומרים' : 'לשמור'}
        </button>
        {state === 'saved' && <span className="small" style={{ color: 'var(--green)' }}>נשמר. הפיד מתעדכן.</span>}
        {state === 'err' && <span className="small" style={{ color: 'var(--red)' }}>משהו נתקע בשמירה. נסו שוב.</span>}
      </div>
    </div>
  )
}
