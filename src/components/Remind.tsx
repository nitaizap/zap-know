import { useState } from 'react'
import { Layer } from './Layer'
import { supabase } from '../lib'
import { IClock, IClose } from './icons'

// Quick times, computed in the viewer's local time (Israel for everyone at zap).
function at(h: number, m = 0, addDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, m, 0, 0); return d
}
function nextSunday(h: number) {
  const d = new Date(); const add = (7 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + add); d.setHours(h, 0, 0, 0); return d
}
function choices() {
  const now = new Date()
  const tonight = at(20)
  return [
    { label: 'בעוד שעה', when: new Date(now.getTime() + 3600e3) },
    ...(tonight > now ? [{ label: 'הערב ב-20:00', when: tonight }] : []),
    { label: 'מחר ב-8:00', when: at(8, 0, 1) },
    { label: 'ביום א׳ ב-9:00', when: nextSunday(9) },
  ]
}

export const fmtWhen = (d: Date | string) =>
  new Date(d).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

// "שלחו לי את זה ב...": a link by email at a time you choose.
export function Remind({ itemId, docId, trigger: renderTrigger }: {
  itemId?: number; docId?: number; trigger?: (open: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Date | null>(null)
  const [err, setErr] = useState('')

  async function schedule(when: Date) {
    if (when.getTime() < Date.now() + 60e3) { setErr('בחרו זמן בעתיד.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('schedule_reminder', {
      p_item: itemId ?? null, p_doc: docId ?? null, p_at: when.toISOString(), p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) { setErr('לא הצלחנו לקבוע את התזכורת. נסו שוב עוד רגע.'); return }
    setDone(when)
  }

  const trigger = renderTrigger
    ? renderTrigger(() => setOpen(true))
    : <button className="btn ghost" onClick={() => setOpen(true)}><IClock size={18} /> לקבל את זה במייל</button>

  return (
    <>
      {trigger}
      {open && (
        <Layer>
        <div className="sheet-wrap" onClick={(e) => { e.stopPropagation(); setOpen(false) }}>
          <div className="sheet card" role="dialog" aria-label="תזכורת" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>מתי לשלוח לכם?</h3>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="לסגור"><IClose /></button>
            </div>
            {done ? (
              <>
                <div className="notice ok" style={{ marginTop: 12 }}>סגור. נשלח לכם מייל בסביבות {fmtWhen(done)}.</div>
                <button className="btn block" style={{ marginTop: 12 }} onClick={() => { setOpen(false); setDone(null) }}>מעולה</button>
              </>
            ) : (
              <>
                <p className="small muted" style={{ margin: '4px 0 12px' }}>המייל יוצא עד כמה דקות אחרי השעה שבחרתם, עם קישור ישר לכאן.</p>
                <div className="remind-opts">
                  {choices().map((c) => (
                    <button key={c.label} className="chip" disabled={busy} onClick={() => schedule(c.when)}>{c.label}</button>
                  ))}
                </div>
                <label className="field" style={{ marginTop: 12 }}>
                  <span className="small muted">או תאריך ושעה</span>
                  <div className="row">
                    <input className="input" type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn" disabled={!custom || busy} onClick={() => schedule(new Date(custom))}>לקבוע</button>
                  </div>
                </label>
                <label className="field">
                  <span className="small muted">תזכורת לעצמכם <small>(לא חובה)</small></span>
                  <input className="input" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: לעבור על זה לפני הפגישה עם הלקוח" />
                </label>
                {err && <div className="notice err">{err}</div>}
              </>
            )}
          </div>
        </div>
        </Layer>
      )}
    </>
  )
}
