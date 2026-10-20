import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ALLOWED_DOMAIN, Profile, Topic } from '../lib'
import {
  AVATAR_COLORS, CHANNEL_OPTIONS, DAY_OPTIONS, FORMAT_OPTIONS, GOAL_SUGGESTIONS, NeedsPicker, ProfileX,
  ROLE_OPTIONS, SENIORITY_OPTIONS, TIME_OPTIONS, TOPIC_ICON, VERTICAL_OPTIONS, managerOk, saveProfile, suggestName,
} from '../components/prefs'
import '../onboarding.css'
import { Avatar, AvatarPicker } from '../components/Avatar'

// A short, game-like intro: one question per screen, big tappable cards, about a minute.
export default function Onboarding({ session, topics, existing, onDone }: {
  session: Session; topics: Topic[]; existing: Profile | null; onDone: (p: Profile) => void
}) {
  const ex = (existing ?? {}) as Partial<ProfileX>
  const [step, setStep] = useState(0)
  const [name, setName] = useState(ex.display_name ?? suggestName(session.user.email ?? ''))
  const [color, setColor] = useState(ex.avatar_color ?? AVATAR_COLORS[0])
  const [look, setLook] = useState<{ avatar_url: string | null; avatar_style: string | null }>({
    avatar_url: ex.avatar_url ?? null, avatar_style: ex.avatar_style ?? 'character',
  })
  const [vertical, setVertical] = useState(ex.vertical ?? '')
  const [role, setRole] = useState(ex.role ?? '')
  const [seniority, setSeniority] = useState(ex.seniority ?? '')
  const [picked, setPicked] = useState<string[]>(ex.topics ?? [])
  const [needs, setNeeds] = useState<string[]>(ex.needs ?? [])
  const [note, setNote] = useState(ex.needs_note ?? '')
  const [formats, setFormats] = useState<string[]>(ex.formats ?? [])
  const [time, setTime] = useState(ex.weekly_time ?? '')
  const [english, setEnglish] = useState<boolean | null>(ex.english_ok ?? null)
  const [goal, setGoal] = useState(ex.goal ?? '')
  const [channel, setChannel] = useState(ex.notify_channel ?? 'both')
  const [day, setDay] = useState<number>(ex.notify_day ?? 0)
  const [manager, setManager] = useState(ex.manager_email ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState<Profile | null>(null)

  const first = name.trim().split(' ')[0] || 'שם'
  const canNext = [name.trim().length >= 2, !!role, picked.length >= 2, true, true, true, managerOk(manager), true][step]

  function toggle(list: string[], set: (v: string[]) => void, v: string) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  }

  async function finish() {
    setBusy(true); setErr('')
    const data = await saveProfile({
      user_id: session.user.id,
      email: session.user.email ?? '',
      display_name: name.trim(),
      role,
      topics: picked,
      needs,
      needs_note: note.trim() || null,
      ...(manager.trim() ? { manager_email: manager.trim().toLowerCase() } : {}),
      avatar_color: color, avatar_url: look.avatar_url, avatar_style: look.avatar_style,
      vertical: vertical || null,
      seniority: seniority || null,
      formats,
      weekly_time: time || null,
      english_ok: english,
      goal: goal.trim() || null,
      notify_channel: channel,
      notify_day: day,
      onboarded_at: new Date().toISOString(),
    })
    setBusy(false)
    if (!data) { setErr('משהו נתקע בשמירה. נסו שוב.'); return }
    setSaved(data)
    setStep(7)
  }

  const next = () => (step === 6 ? finish() : setStep((s) => Math.min(s + 1, 7)))
  const back = () => setStep((s) => Math.max(s - 1, 0))
  const optional = step >= 3 && step <= 6
  const topicName = (slug: string) => topics.find((t) => t.slug === slug)?.name_he ?? slug
  const sen = SENIORITY_OPTIONS.find((s) => s.value === seniority)

  return (
    <div className="ob-wrap">
      <div className="texture" />
      <div className="ob-card">
        {step < 7 && (
          <div className="ob-top">
            <button type="button" className="ob-back" onClick={back} disabled={step === 0 || busy} aria-label="חזרה">→</button>
            <div className="ob-progress" aria-label={`שלב ${step + 1} מתוך 7`}>
              <div className="ob-progress-bar" style={{ width: `${((step + 1) / 7) * 100}%` }} />
            </div>
            <span className="ob-count">{step + 1}/7</span>
          </div>
        )}

        <div className="ob-step" key={step}>
          {step === 0 && <>
            <p className="ob-kicker">ברוכים הבאים ל-zap UP</p>
            <h1 className="ob-title"><span className="ob-light">קודם כל,</span> איך לקרוא לכם?</h1>
            <p className="ob-help">ככה תופיעו בטבלת המובילים, בתגובות ובשיתופים.</p>
            <input className="input ob-big-input" value={name} maxLength={40} autoFocus
              onChange={(e) => setName(e.target.value)} placeholder="שם פרטי ושם משפחה" />
            <p className="ob-help">ואיך תיראו? דמות, אות או תמונה שלכם:</p>
            <AvatarPicker userId={session.user.id} name={name || first} value={{ ...look, avatar_color: color }}
              onChange={(v) => { setLook({ avatar_url: v.avatar_url, avatar_style: v.avatar_style }); setColor(v.avatar_color) }} />
          </>}

          {step === 1 && <>
            <p className="ob-kicker">נעים מאוד, {first}</p>
            <h1 className="ob-title"><span className="ob-light">איפה אתם</span> ב-zap?</h1>
            <h3 className="ob-q">באיזה מותג</h3>
            <div className="ob-chips">
              {VERTICAL_OPTIONS.map((v) => (
                <button key={v} type="button" className={`ob-chip ${vertical === v ? 'on' : ''}`} onClick={() => setVertical(v)}>{v}</button>
              ))}
            </div>
            <h3 className="ob-q">באיזה תחום <span className="ob-req">חובה</span></h3>
            <div className="ob-chips">
              {ROLE_OPTIONS.map((r) => (
                <button key={r} type="button" className={`ob-chip ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>{r}</button>
              ))}
            </div>
            <h3 className="ob-q">כמה זמן בתחום</h3>
            <div className="ob-cards three">
              {SENIORITY_OPTIONS.map((s) => (
                <button key={s.value} type="button" className={`ob-option ${seniority === s.value ? 'on' : ''}`} onClick={() => setSeniority(s.value)}>
                  <strong>{s.label}</strong><span>{s.hint}</span>
                </button>
              ))}
            </div>
          </>}

          {step === 2 && <>
            <p className="ob-kicker">החלק הכיפי</p>
            <h1 className="ob-title"><span className="ob-light">מה</span> מעניין אתכם?</h1>
            <p className="ob-help">בחרו לפחות 2. נושאים שמסומנים "בקרוב" ייפתחו בהמשך, ונעדכן אתכם.</p>
            <div className="ob-cards">
              {topics.map((t) => (
                <button key={t.slug} type="button" className={`ob-option topic ${picked.includes(t.slug) ? 'on' : ''}`}
                  onClick={() => toggle(picked, setPicked, t.slug)}>
                  <span className="ob-emoji" aria-hidden>{TOPIC_ICON[t.slug] ?? '✨'}</span>
                  <strong>{t.name_he}</strong>
                  {t.blurb_he && <span>{t.blurb_he}</span>}
                  {t.status === 'soon' && <em className="ob-soon">בקרוב</em>}
                </button>
              ))}
            </div>
            <p className="ob-help">{picked.length < 2 ? `עוד ${2 - picked.length} ונמשיך` : `${picked.length} נושאים, מעולה`}</p>
          </>}

          {step === 3 && <>
            <p className="ob-kicker">כדי שנביא את מה שבאמת עוזר</p>
            <h1 className="ob-title"><span className="ob-light">מה אתם צריכים</span> עכשיו בעבודה?</h1>
            <NeedsPicker needs={needs} setNeeds={setNeeds} note={note} setNote={setNote} />
          </>}

          {step === 4 && <>
            <p className="ob-kicker">כל אחד לומד אחרת</p>
            <h1 className="ob-title"><span className="ob-light">איך נוח לכם</span> ללמוד?</h1>
            <h3 className="ob-q">פורמטים שאתם אוהבים</h3>
            <div className="ob-chips">
              {FORMAT_OPTIONS.map((f) => (
                <button key={f} type="button" className={`ob-chip ${formats.includes(f) ? 'on' : ''}`} onClick={() => toggle(formats, setFormats, f)}>{f}</button>
              ))}
            </div>
            <h3 className="ob-q">כמה זמן בשבוע</h3>
            <div className="ob-chips">
              {TIME_OPTIONS.map((t) => (
                <button key={t} type="button" className={`ob-chip ${time === t ? 'on' : ''}`} onClick={() => setTime(t)}>{t}</button>
              ))}
            </div>
            <h3 className="ob-q">ומה עם אנגלית</h3>
            <div className="ob-cards two">
              <button type="button" className={`ob-option ${english === false ? 'on' : ''}`} onClick={() => setEnglish(false)}>
                <strong>רק עברית</strong><span>נעדיף תוכן בעברית ותקצירים מלאים</span>
              </button>
              <button type="button" className={`ob-option ${english === true ? 'on' : ''}`} onClick={() => setEnglish(true)}>
                <strong>סבבה עם אנגלית</strong><span>הקורס המקורי באנגלית, התקציר בעברית</span>
              </button>
            </div>
          </>}

          {step === 5 && <>
            <p className="ob-kicker">לאן הולכים</p>
            <h1 className="ob-title"><span className="ob-light">מה היעד שלכם</span> ל-3 החודשים הקרובים?</h1>
            <p className="ob-help">משפט אחד. נשתמש בו כדי להמליץ, וגם כדי לפרגן כשתגיעו אליו.</p>
            <textarea className="input ob-big-input" rows={2} maxLength={140} value={goal}
              onChange={(e) => setGoal(e.target.value)} placeholder="למשל: להבין איך מופיעים בתשובות של AI" />
            <div className="ob-chips">
              {GOAL_SUGGESTIONS.map((g) => (
                <button key={g} type="button" className={`ob-chip ${goal === g ? 'on' : ''}`} onClick={() => setGoal(g)}>{g}</button>
              ))}
            </div>
          </>}

          {step === 6 && <>
            <p className="ob-kicker">כמעט סיימנו</p>
            <h1 className="ob-title"><span className="ob-light">איך לעדכן</span> אתכם?</h1>
            <h3 className="ob-q">הפרק השבועי האישי מגיע ב</h3>
            <div className="ob-chips">
              {CHANNEL_OPTIONS.map((c) => (
                <button key={c.value} type="button" className={`ob-chip ${channel === c.value ? 'on' : ''}`} onClick={() => setChannel(c.value)}>{c.label}</button>
              ))}
            </div>
            {channel !== 'none' && <>
              <h3 className="ob-q">ובאיזה יום</h3>
              <div className="ob-chips">
                {DAY_OPTIONS.map((d, i) => (
                  <button key={d} type="button" className={`ob-chip ${day === i ? 'on' : ''}`} onClick={() => setDay(i)}>יום {d}</button>
                ))}
              </div>
            </>}
            <h3 className="ob-q">המייל של המנהל/ת הישיר/ה <span className="ob-opt">לא חובה</span></h3>
            <p className="ob-help">צריך אותו רק כשרוצים לקנות משהו מעל תקציב הלמידה, לאישור בקליק. בגרסה המלאה הוא מגיע אוטומטית מ-M365.</p>
            <input className="input" dir="ltr" placeholder={`name${ALLOWED_DOMAIN}`} value={manager} onChange={(e) => setManager(e.target.value)} />
            {!managerOk(manager) && <p className="ob-error">המייל צריך להסתיים ב-{ALLOWED_DOMAIN}</p>}
          </>}

          {step === 7 && <div className="ob-done">
            <div className="ob-burst" aria-hidden>
              {AVATAR_COLORS.slice(0, 6).map((c, i) => <span key={c} style={{ background: c, ['--i' as string]: i } as React.CSSProperties} />)}
            </div>
            <Avatar face={{ user_id: session.user.id, name: name || first, ...look, avatar_color: color }} size={84} className="ob-avatar-big" />
            <h1 className="ob-title center"><span className="ob-light">הכל מוכן,</span> {first}</h1>
            <p className="ob-hand">עוד זאפ קטן ואתם בפנים</p>
            <div className="ob-summary">
              <div><span>תחום</span><strong>{role}{vertical ? ` · ${vertical}` : ''}{sen ? ` · ${sen.label}` : ''}</strong></div>
              <div><span>נושאים</span><strong>{picked.map(topicName).join(', ')}</strong></div>
              {needs.length > 0 && <div><span>צריכים עכשיו</span><strong>{needs.join(', ')}</strong></div>}
              {(formats.length > 0 || time) && <div><span>סגנון</span><strong>{[...formats, time].filter(Boolean).join(', ')}</strong></div>}
              {goal.trim() && <div><span>היעד</span><strong>{goal.trim()}</strong></div>}
              <div><span>הפרק השבועי</span><strong>{channel === 'none' ? 'בלי' : `${CHANNEL_OPTIONS.find((c) => c.value === channel)?.label}, יום ${DAY_OPTIONS[day]}`}</strong></div>
            </div>
            <div className="ob-reward">
              <span className="ob-badge" aria-hidden>🏅</span>
              <div>
                <strong>zapper מתחיל</strong>
                <span>הרמה הראשונה שלכם. כל שיעור, תגובה ושיתוף מקדמים אתכם בטבלה.</span>
              </div>
            </div>
            <button className="btn block ob-cta" onClick={() => saved && onDone(saved)} disabled={!saved}>לבית שלי</button>
            <p className="ob-help center">אפשר לשנות הכול מתי שרוצים ב"האזור שלי".</p>
          </div>}
        </div>

        {step < 7 && (
          <div className="ob-actions">
            {optional && <button type="button" className="btn ghost" onClick={next} disabled={busy}>{step === 6 ? 'דילוג וסיום' : 'דילוג'}</button>}
            <button type="button" className="btn ob-next" onClick={next} disabled={!canNext || busy}>
              {busy ? 'שומרים' : step === 6 ? 'סיימנו' : 'ממשיכים'}
            </button>
          </div>
        )}
        {err && <p className="ob-error">{err}</p>}
      </div>
    </div>
  )
}
