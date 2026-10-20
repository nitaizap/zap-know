import { useState } from 'react'
import { DetailLink } from './detail'
import { ITEM_COLS, Item, KIND_LABEL, fmtMinutes, supabase } from '../lib'

const OPTIONS = [5, 10, 15, 30, 60]

// "יש לי ___ דקות": the best items for me that together fit the time I have.
export function FitTime({ compact }: { compact?: boolean }) {
  const [mins, setMins] = useState<number | null>(null)
  const [list, setList] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(m: number) {
    if (mins === m) { setMins(null); setList(null); return }
    setMins(m); setBusy(true)
    const { data, error } = await supabase.rpc('fit_time', { p_minutes: m, p_audio_only: false })
    const rows = (data as { id: number; minutes: number }[] | null) ?? []
    if (error || !rows.length) { setList([]); setBusy(false); return }
    const { data: its } = await supabase.from('items').select(ITEM_COLS).in('id', rows.map((r) => r.id))
    const byId = new Map(((its as Item[] | null) ?? []).map((i) => [i.id, i]))
    setList(rows.flatMap((r) => (byId.has(r.id) ? [{ ...byId.get(r.id)!, minutes: r.minutes }] : [])))
    setBusy(false)
  }

  const total = (list ?? []).reduce((a, i) => a + (i.minutes ?? 0), 0)

  return (
    <div className={`fit ${compact ? 'fit-compact' : ''}`}>
      <div className="fit-pick" role="group" aria-label="כמה זמן יש לכם">
        <span className="fit-label">יש לי</span>
        {OPTIONS.map((m) => (
          <button key={m} className={`chip ${mins === m ? 'on' : ''}`} onClick={() => pick(m)} aria-pressed={mins === m}>{m}</button>
        ))}
        <span className="fit-label">דקות</span>
      </div>
      {mins !== null && (
        <div className="fit-list">
          {busy && <div className="small muted">מרכיבים לכם חבילה</div>}
          {!busy && list && list.length === 0 && <div className="small muted">לא מצאנו משהו שנכנס ב-{mins} דקות. נסו קצת יותר זמן.</div>}
          {!busy && list && list.length > 0 && (
            <>
              <ol>
                {list.map((i) => (
                  <li key={i.id}>
                    <DetailLink kind="item" id={i.id}><b>{i.title_he}</b></DetailLink>
                    <span className="small muted">{KIND_LABEL[i.kind]} · {fmtMinutes(i.minutes)}</span>
                  </li>
                ))}
              </ol>
              <div className="small muted">סה״כ {fmtMinutes(total)} מתוך {mins} שיש לכם</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
