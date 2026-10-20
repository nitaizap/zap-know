import { useEffect, useRef, useState } from 'react'
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '../lib'
import { useApp } from '../App'
import { Avatar } from './Avatar'
import { Layer } from './Layer'
import { IClose } from './icons'

// "ליצור אווטאר": a photo (uploaded or taken now) becomes a Mii-style character and a profile
// picture. The photo is resized here (max 768px) and only travels to the `avatar` function.

type Result = { avatar_url: string; sheet_url: string; left: number }
type State =
  | { s: 'idle' } | { s: 'busy'; step: number } | { s: 'done'; r: Result }
  | { s: 'error'; msg: string } | { s: 'soon' } | { s: 'limit' }

const STEPS = ['מעלים את התמונה', 'יוצרים את כרטיס הדמות', 'מכינים את תמונת הפרופיל']

async function shrink(file: File): Promise<{ data: string; mime: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url })
    const k = Math.min(1, 768 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const data = c.toDataURL('image/jpeg', 0.8).split(',')[1]
    return { data, mime: 'image/jpeg' }
  } finally { URL.revokeObjectURL(url) }
}

async function call(body: unknown): Promise<Response | null> {
  const { data } = await supabase.auth.getSession()
  try {
    return await fetch(`${SUPABASE_URL}/functions/v1/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    })
  } catch { return null }
}

export function AiAvatarMaker({ onSaved, onSkip, skipLabel = 'להשאיר את האות' }: {
  onSaved?: (r: { avatar_url: string; sheet_url: string }) => void; onSkip?: () => void; skipLabel?: string
}) {
  const { profile, setProfile } = useApp()
  const [st, setSt] = useState<State>({ s: 'idle' })
  const [left, setLeft] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const name = profile.display_name || profile.email.split('@')[0]

  // Is the function live, and how many tries are left today?
  useEffect(() => {
    call({ check: true }).then(async (r) => {
      if (!r || r.status === 404) { setSt({ s: 'soon' }); return }
      const j = await r.json().catch(() => ({}))
      if (typeof j.left === 'number') { setLeft(j.left); if (j.left === 0) setSt({ s: 'limit' }) }
    })
  }, [])

  async function go(f: File) {
    if (!f.type.startsWith('image/')) { setSt({ s: 'error', msg: 'אפשר להעלות רק תמונה.' }); return }
    setSt({ s: 'busy', step: 0 })
    const img = await shrink(f).catch(() => null)
    if (!img) { setSt({ s: 'error', msg: 'לא הצלחנו לקרוא את התמונה. נסו תמונה אחרת.' }); return }
    const t1 = setTimeout(() => setSt({ s: 'busy', step: 1 }), 1200)
    const t2 = setTimeout(() => setSt({ s: 'busy', step: 2 }), 16000)
    const r = await call({ image: img.data, mime: img.mime })
    clearTimeout(t1); clearTimeout(t2)
    if (!r || r.status === 404) { setSt({ s: 'soon' }); return }
    const j = await r.json().catch(() => ({}))
    if (typeof j.left === 'number') setLeft(j.left)
    if (r.status === 429) { setSt({ s: 'limit' }); return }
    if (!r.ok || !j.avatar_url) {
      setSt({ s: 'error', msg: j.error === 'budget' ? 'תקציב ה-AI של ההאקתון נגמר להיום. האות נשארת בינתיים.' : 'משהו לא הסתדר ביצירה. אפשר לנסות שוב.' })
      return
    }
    setSt({ s: 'done', r: j as Result })
  }

  async function accept(r: Result) {
    setSaving(true)
    const patch = { avatar_url: r.avatar_url, avatar_style: 'ai', sheet_url: r.sheet_url }
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', profile.user_id)
    setSaving(false)
    if (error) { setSt({ s: 'error', msg: 'לא הצלחנו לשמור. נסו שוב.' }); return }
    setProfile({ ...profile, ...patch } as typeof profile)
    onSaved?.(r)
  }

  const pickers = (
    <div className="aa-pick">
      <button type="button" className="aa-btn" onClick={() => cam.current?.click()}>לצלם עכשיו</button>
      <button type="button" className="aa-btn ghost" onClick={() => file.current?.click()}>להעלות תמונה</button>
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) go(f); e.target.value = '' }} />
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) go(f); e.target.value = '' }} />
    </div>
  )

  return (
    <div className="aa">
      {st.s === 'soon' && <p className="aa-note">יצירת אווטאר תיפתח בקרוב. בינתיים האות שלכם כאן.</p>}
      {st.s === 'limit' && <p className="aa-note">ניסיתם 3 פעמים היום. מחר אפשר שוב.</p>}

      {(st.s === 'idle' || st.s === 'error') && <>
        <div className="aa-row"><Avatar face={{ ...profile, name }} size={64} /><p>תמונה אחת שלכם, ו-AI הופך אותה לדמות בסגנון Mii, עם כרטיס דמות מלא.</p></div>
        <p className="aa-consent">התמונה נשלחת ל-Google Gemini רק כדי ליצור את האווטאר, ולא נשמרת אחרי זה.</p>
        {pickers}
        {st.s === 'error' && <p className="aa-err" role="alert">{st.msg}</p>}
        {left !== null && <p className="aa-left">{left === 1 ? 'נשאר ניסיון אחד היום' : `נשארו ${left} ניסיונות היום`}</p>}
      </>}

      {st.s === 'busy' && (
        <div className="aa-busy" role="status" aria-live="polite">
          <div className="aa-bar"><i style={{ width: `${(st.step + 1) * 30}%` }} /></div>
          <b>{STEPS[st.step]}</b>
          <span>זה לוקח בערך חצי דקה.</span>
        </div>
      )}

      {st.s === 'done' && (
        <div className="aa-done">
          <img className="aa-face" src={st.r.avatar_url} alt="האווטאר החדש שלכם" width={120} height={120} />
          <img className="aa-sheet" src={st.r.sheet_url} alt="כרטיס הדמות שלכם" loading="lazy" />
          <div className="aa-pick">
            <button type="button" className="aa-btn" disabled={saving} onClick={() => accept(st.r)}>{saving ? 'שומרים' : 'זה אני, לשמור'}</button>
            {st.r.left > 0 && <button type="button" className="aa-btn ghost" onClick={() => setSt({ s: 'idle' })}>לנסות שוב ({st.r.left})</button>}
          </div>
        </div>
      )}

      {onSkip && st.s !== 'busy' && <button type="button" className="aa-skip" onClick={onSkip}>{skipLabel}</button>}
    </div>
  )
}

/** The maker in the standard sheet, from האזור שלי. */
export function AiAvatarSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <Layer>
      <div className="dt-back" onClick={onClose}>
        <section className="dt-sheet" role="dialog" aria-modal="true" aria-label="ליצור אווטאר" onClick={(e) => e.stopPropagation()}>
          <header className="dt-head"><span className="dt-grab" aria-hidden /><b>ליצור אווטאר</b>
            <button className="dt-x" onClick={onClose} aria-label="לסגור"><IClose /></button></header>
          <div className="dt-body"><AiAvatarMaker onSaved={onClose} onSkip={onClose} /></div>
        </section>
      </div>
    </Layer>
  )
}
