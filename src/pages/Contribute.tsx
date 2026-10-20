import { useEffect, useRef, useState } from 'react'
import { useApp } from '../App'
import { callFn, supabase } from '../lib'
import { DetailLink } from '../components/detail'
import { officeText } from '../officeText'
import { Headline } from '../components/ui'
import { earn } from '../components/points'
import '../contribute.css'

// "משתפים ב-zap UP": record a voice note, drop a document or paste a link; the AI drafts a title,
// summary, bullets, topic and tags; the person edits and sends. Nothing goes out before they do.
type Purpose = 'internal' | 'external'
type Mode = 'voice' | 'doc' | 'link' | 'text'
type Draft = { title_he: string; summary_he: string; bullets: string[]; topic_slug: string; tags: string[]; transcript_he?: string; source_url?: string | null }
type Input = { mode: 'voice' | 'doc' | 'link' | 'text'; data?: string; mime?: string; url?: string; text?: string }

const MAX_MB = 15

function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

// Feeds that keep publishing: offered as a recurring source after the post goes up.
function recurringOf(url: string | null | undefined): { kind: string; ref: string; label: string } | null {
  if (!url) return null
  const list = url.match(/youtube\.com\/(?:playlist|watch)\?(?:[^#]*&)?list=([\w-]+)/)?.[1]
  if (list) return { kind: 'youtube_playlist', ref: list, label: 'פלייליסט ביוטיוב' }
  const ch = url.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1]
  if (ch) return { kind: 'youtube_channel', ref: ch, label: 'ערוץ יוטיוב' }
  if (/anchor\.fm\/s\/|feeds\.simplecast|omnycontent|podbean\.com\/.*feed|\/podcast\.rss|itunes|buzzsprout\.com\/\d+\.rss/i.test(url)) return { kind: 'podcast', ref: url, label: 'פודקאסט' }
  if (/(\/feed\/?$|\/rss\/?$|\.rss$|\.xml$|\/feeds\/)/i.test(url)) return { kind: 'rss', ref: url, label: 'פיד RSS' }
  return null
}

export default function Contribute() {
  return (
    <div className="contribute">
      <Headline light="מספרים בקול," black="ה-AI כותב" hand="בלי לכתוב מאפס" />
      <ContributeFlow />
    </div>
  )
}

/** The whole "add a post" flow, on its page or in a sheet (האזור שלי). By default it publishes
 *  straight away once the AI has the draft; "עריכה לפני פרסום" stops to review first. */
export function ContributeFlow({ embedded }: { embedded?: boolean }) {
  const { topics, profile } = useApp()
  const [purpose, setPurpose] = useState<Purpose>('internal')
  const [mode, setMode] = useState<Mode>(embedded ? 'link' : 'voice')
  const [input, setInput] = useState<Input | null>(null)
  const [step, setStep] = useState<'input' | 'thinking' | 'draft' | 'sending' | 'done'>('input')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [team, setTeam] = useState('')
  const [err, setErr] = useState('')
  const [editFirst, setEditFirst] = useState(false)
  const [posted, setPosted] = useState<{ id: number; link: string | null } | null>(null)
  const [srcState, setSrcState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle')

  async function makeDraft(src: Input) {
    setInput(src); setErr(''); setStep('thinking')
    try {
      const d = await callFn<Partial<Draft>>('draft', { ...src, purpose })
      const next: Draft = {
        title_he: d.title_he ?? '', summary_he: d.summary_he ?? '', bullets: d.bullets ?? [],
        topic_slug: d.topic_slug ?? '', tags: d.tags ?? [], transcript_he: d.transcript_he, source_url: d.source_url ?? src.url ?? null,
      }
      setDraft(next)
      if (editFirst || !next.title_he.trim()) setStep('draft')
      else await send(next)
    } catch {
      setErr('ה-AI לא הצליח לקרוא את זה הפעם. אפשר לנסות שוב, או לכתוב כמה מילים בטקסט.')
      setStep('input')
    }
  }

  async function send(d: Draft | null = draft) {
    if (!d) return
    setStep('sending'); setErr('')
    try {
      const r = await callFn<{ id: number }>('ingest-internal', {
        channel: 'form', purpose, team: team || profile.role || undefined,
        text: d.transcript_he || [d.summary_he, ...d.bullets].join('\n'),
        link: d.source_url ?? undefined,
        draft: { title_he: d.title_he, summary_he: d.summary_he, bullets: d.bullets.filter(Boolean), topic_slug: d.topic_slug, tags: d.tags },
      })
      earn('post')
      setPosted({ id: r.id, link: d.source_url ?? null })
      setStep('done')
    } catch {
      setErr('הפרסום לא עבר. נסו שוב בעוד רגע.')
      setStep('draft')
    }
  }

  async function addSource(rec: { kind: string; ref: string; label: string }) {
    setSrcState('busy')
    const { error } = await supabase.from('sources').insert({
      name: draft?.title_he || rec.label, kind: rec.kind, ref: rec.ref, topic_slug: draft?.topic_slug || null,
      status: profile.is_admin ? 'active' : 'proposed', score: 0,
      reason_he: `הוצע על ידי ${profile.display_name || profile.email.split('@')[0]} מתוך פוסט ב-zap UP`,
    })
    setSrcState(error ? 'err' : 'done')
  }

  function restart() { setDraft(null); setInput(null); setPosted(null); setSrcState('idle'); setStep('input'); setErr('') }

  if (step === 'done' && posted) {
    const rec = recurringOf(posted.link)
    return (
      <div className={`card done-card${embedded ? ' cf-embedded' : ''}`}>
        <h2>פורסם, עם הקרדיט שלכם</h2>
        <p className="muted">{purpose === 'internal' ? 'הפוסט כבר במה קורה ב-zap, ועמיתים יכולים להגיב ולשתף. התמונה מהמקור מתווספת תוך כמה דקות.' : 'זה כבר במה קורה בעולם. מצאו טעות? בכל פריט יש "לדווח על טעות".'}</p>
        <div className="row">
          <DetailLink className="btn" kind="item" id={posted.id}>לפתוח את הפוסט</DetailLink>
          <button className="btn ghost" onClick={restart}>להוסיף עוד משהו</button>
        </div>
        {rec && (
          <div className="cf-source">
            {srcState === 'done'
              ? <p className="small">{profile.is_admin ? `נוסף כמקור קבוע (${rec.label}). האיסוף הבא כבר יביא ממנו.` : 'נשלח כהצעה ל-L&D. כשיאשרו, הוא ייאסף באופן קבוע.'}</p>
              : <>
                <p className="small">זה {rec.label} שמתעדכן. רוצים שכל פרק או פוסט חדש ממנו ייכנס לבד?</p>
                <button className="btn ghost sm" disabled={srcState === 'busy'} onClick={() => addSource(rec)}>להוסיף כמקור קבוע</button>
                {srcState === 'err' && <p className="small err-text">לא הצלחנו להוסיף. אולי הוא כבר ברשימה.</p>}
              </>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={embedded ? 'cf-embedded' : undefined}>
      <div className="seg" role="tablist" aria-label="מה משתפים">
        <button role="tab" aria-selected={purpose === 'internal'} className={purpose === 'internal' ? 'on' : ''} onClick={() => setPurpose('internal')}>
          פרויקט או השקה שלנו<span className="small">קורה ב-zap</span>
        </button>
        <button role="tab" aria-selected={purpose === 'external'} className={purpose === 'external' ? 'on' : ''} onClick={() => setPurpose('external')}>
          מה קורה בעולם<span className="small">תוכן מבחוץ שכדאי לכולם להכיר</span>
        </button>
      </div>

      {step === 'input' && (
        <>
          <div className="tabs-line" role="tablist" aria-label="איך משתפים">
            {([['link', 'קישור'], ['doc', 'קובץ'], ['voice', 'הקלטה'], ['text', 'טקסט']] as [Mode, string][]).map(([m, l]) => (
              <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{l}</button>
            ))}
          </div>
          <div className="card input-card">
            {mode === 'voice' && <VoiceInput onReady={makeDraft} />}
            {mode === 'doc' && <DocInput onReady={makeDraft} onError={setErr} />}
            {mode === 'link' && <LinkInput onReady={makeDraft} />}
            {mode === 'text' && <TextInput onReady={makeDraft} />}
          </div>
          <label className="cf-edit">
            <input type="checkbox" checked={editFirst} onChange={(e) => setEditFirst(e.target.checked)} /> עריכה לפני פרסום
          </label>
        </>
      )}

      {(step === 'thinking' || (step === 'sending' && !editFirst)) && (
        <div className="card thinking" role="status">
          <span className="bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <b>{step === 'thinking' ? 'ה-AI מכין את הפוסט…' : 'מפרסמים…'}</b>
          <span className="small muted">כותרת, תקציר, נקודות עיקריות ותחום</span>
        </div>
      )}

      {(step === 'draft' || (step === 'sending' && editFirst)) && draft && (
        <DraftForm draft={draft} setDraft={setDraft} topics={topics.map((t) => ({ slug: t.slug, name: t.name_he }))}
          purpose={purpose} team={team} setTeam={setTeam}
          onSend={() => send()} onRedo={() => input && makeDraft(input)} sending={step === 'sending'} />
      )}

      {err && <div className="notice err" style={{ marginTop: 12 }}>{err}</div>}
      <p className="trust small muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" /></svg>
        החומר נשלח רק לכלי ה-AI שאושר. מתוכן מבחוץ מסכמים רק מידע פומבי. כל פוסט אפשר לדווח או למחוק אחר כך.
      </p>
    </div>
  )
}

function TextInput({ onReady }: { onReady: (i: Input) => void }) {
  const [t, setT] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (t.trim().length >= 20) onReady({ mode: 'text', text: t.trim() }) }}>
      <label className="field"><span>כמה מילים על מה שרוצים לשתף</span>
        <textarea className="textarea" rows={5} value={t} onChange={(e) => setT(e.target.value)} placeholder="למשל: בנינו דשבורד שחוסך לנו שעה בשבוע, וזה איך" />
      </label>
      <button className="btn" disabled={t.trim().length < 20}>לפרסם</button>
    </form>
  )
}

function VoiceInput({ onReady }: { onReady: (i: Input) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState('')
  const chunks = useRef<Blob[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [rec])

  async function start() {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? ''
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })
        onReady({ mode: 'voice', data: await toBase64(blob), mime: blob.type.split(';')[0] })
      }
      r.start()
      setSecs(0)
      setRec(r)
    } catch {
      setErr('אין גישה למיקרופון. אפשר לאשר בדפדפן, או להעלות קובץ אודיו.')
    }
  }

  function stop() { rec?.stop(); setRec(null) }

  async function onFile(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`הקובץ גדול מ-${MAX_MB}MB.`); return }
    onReady({ mode: 'voice', data: await toBase64(f), mime: f.type || 'audio/mpeg' })
  }

  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  return (
    <div className="voice">
      <button className={`mic ${rec ? 'live' : ''}`} onClick={rec ? stop : start} aria-label={rec ? 'לסיים את ההקלטה' : 'להתחיל להקליט'}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {rec ? <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}
        </svg>
      </button>
      {rec ? (
        <div className="rec-live">
          <span className="bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <b dir="ltr">{mm}</b>
          <button className="btn" onClick={stop}>לסיים</button>
        </div>
      ) : (
        <>
          <p><b>מספרים בקול מה בניתם או מה למדתם.</b> דקה או שתיים מספיקות.</p>
          <p className="small muted">הבעיה, מה בניתם, מה יצא מזה, ואיך אחרים יכולים להעתיק. את השאר ה-AI מסדר.</p>
          <button className="btn ghost sm" onClick={() => fileRef.current?.click()}>או להעלות קובץ אודיו</button>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </>
      )}
      {err && <p className="small err-text">{err}</p>}
    </div>
  )
}

function DocInput({ onReady, onError }: { onReady: (i: Input) => void; onError: (s: string) => void }) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function take(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_MB * 1024 * 1024) { onError(`הקובץ גדול מ-${MAX_MB}MB.`); return }
    const name = f.name.toLowerCase()
    if (/\.(docx|pptx)$/.test(name)) {
      try { const text = await officeText(f); if (text.length < 20) throw new Error('empty'); onReady({ mode: 'text', text: text.slice(0, 12000) }) }
      catch { onError('לא הצלחנו לקרוא את הקובץ. אפשר לשמור אותו כ-PDF ולהעלות.') }
      return
    }
    if (/\.(doc|ppt)$/.test(name)) { onError('את הפורמט הישן של Word ו-PowerPoint כדאי לשמור כ-docx, pptx או PDF.'); return }
    if (f.type.startsWith('image/')) { onReady({ mode: 'doc', data: await toBase64(f), mime: f.type }); return }
    if (name.endsWith('.pdf') || f.type === 'application/pdf') { onReady({ mode: 'doc', data: await toBase64(f), mime: 'application/pdf' }); return }
    if (/\.(txt|md|markdown)$/.test(name) || f.type.startsWith('text/')) { onReady({ mode: 'text', text: await f.text() }); return }
    onError('אפשר להעלות PDF, Word, PowerPoint, תמונה, txt או md.')
  }

  return (
    <div className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]) }}>
      <p><b>גוררים לכאן מצגת, מסמך או סיכום</b></p>
      <p className="small muted">PDF, Word, PowerPoint, תמונה, txt או md, עד {MAX_MB}MB.</p>
      <button className="btn ghost sm" onClick={() => ref.current?.click()}>לבחור קובץ</button>
      <input ref={ref} type="file" accept=".pdf,.docx,.pptx,.txt,.md,image/*,text/plain,application/pdf" hidden onChange={(e) => take(e.target.files?.[0])} />
    </div>
  )
}

function LinkInput({ onReady }: { onReady: (i: Input) => void }) {
  const [url, setUrl] = useState('')
  const ok = /^https:\/\/\S+\.\S+/.test(url.trim())
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ok) onReady({ mode: 'link', url: url.trim() }) }}>
      <label className="field"><span>הקישור</span>
        <input className="input" dir="ltr" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      {url && !ok && <p className="small err-text">צריך קישור מלא שמתחיל ב-https://</p>}
      <button className="btn" disabled={!ok}>לסכם</button>
    </form>
  )
}

function DraftForm({ draft, setDraft, topics, purpose, team, setTeam, onSend, onRedo, sending }: {
  draft: Draft; setDraft: (d: Draft) => void; topics: { slug: string; name: string }[]; purpose: Purpose
  team: string; setTeam: (s: string) => void; onSend: () => void; onRedo: () => void; sending: boolean
}) {
  const [tag, setTag] = useState('')
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const setBullet = (n: number, v: string) => set({ bullets: draft.bullets.map((b, i) => (i === n ? v : b)) })

  return (
    <form className="card draft" onSubmit={(e) => { e.preventDefault(); onSend() }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>הטיוטה שלכם</h2>
        <span className="ai-tag">סוכם ב-AI · אפשר לערוך הכול</span>
      </div>
      <label className="field"><span>כותרת</span>
        <input className="input" value={draft.title_he} onChange={(e) => set({ title_he: e.target.value })} required />
      </label>
      <label className="field"><span>תקציר</span>
        <textarea className="textarea" rows={3} value={draft.summary_he} onChange={(e) => set({ summary_he: e.target.value })} required />
      </label>
      <div className="field"><span>{purpose === 'internal' ? 'הנקודות העיקריות' : 'מה יש בפנים'}</span>
        {draft.bullets.map((b, n) => (
          <div className="bullet-row" key={n}>
            <input className="input" value={b} onChange={(e) => setBullet(n, e.target.value)} />
            <button type="button" className="icon-btn" aria-label="למחוק נקודה" onClick={() => set({ bullets: draft.bullets.filter((_, i) => i !== n) })}>×</button>
          </div>
        ))}
        <button type="button" className="fbar-clear" onClick={() => set({ bullets: [...draft.bullets, ''] })}>להוסיף נקודה</button>
      </div>
      <div className="row two-col">
        <label className="field"><span>תחום</span>
          <select className="input" value={draft.topic_slug} onChange={(e) => set({ topic_slug: e.target.value })}>
            <option value="">בלי תחום</option>
            {topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        </label>
        {purpose === 'internal' && (
          <label className="field"><span>הצוות</span>
            <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="למשל: PPC, דאטה, REST" />
          </label>
        )}
      </div>
      <div className="field"><span>תגיות</span>
        <div className="chips" style={{ margin: 0 }}>
          {draft.tags.map((t) => (
            <button type="button" key={t} className="chip on" onClick={() => set({ tags: draft.tags.filter((x) => x !== t) })} aria-label={`להסיר את ${t}`}>
              <bdi>{t}</bdi> ×
            </button>
          ))}
          <input className="input tag-in" value={tag} placeholder="תגית חדשה" onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && tag.trim()) { e.preventDefault(); set({ tags: [...new Set([...draft.tags, tag.trim()])] }); setTag('') } }} />
        </div>
      </div>
      {draft.transcript_he && (
        <details className="transcript"><summary>התמלול המלא</summary><p>{draft.transcript_he}</p></details>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" disabled={sending || !draft.title_he.trim()}>{sending ? 'שולחים' : 'לשלוח'}</button>
        <button type="button" className="btn ghost" onClick={onRedo} disabled={sending}>לסכם מחדש</button>
      </div>
    </form>
  )
}
