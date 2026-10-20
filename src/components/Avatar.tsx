import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib'
// Brand palette only (zap-visual-language); same list as onboarding.
const AVATAR_COLORS = ['#052b7a', '#485cc7', '#ff5c9e', '#00ab12', '#ffc600', '#ff210d', '#001c32']

export type Face = {
  user_id: string
  name: string
  avatar_url?: string | null
  avatar_style?: string | null
  avatar_color?: string | null
  team?: string | null
}

// Small deterministic hash so the same person always gets the same character.
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// A friendly generated character: a rounded blob in a brand color, eyes, a smile, and one accessory.
// Pure SVG, no external service.
export function Character({ seed, color, size }: { seed: string; color?: string | null; size: number }) {
  const h = hash(seed || 'zap')
  const bg = color || AVATAR_COLORS[h % AVATAR_COLORS.length]
  const light = bg === '#ffc600' || bg === '#00ab12'
  const ink = light ? '#001c32' : '#ffffff'
  const eyeGap = 7 + (h % 3)
  const eyeY = 19 + ((h >> 3) % 3)
  const mouth = (h >> 5) % 3
  const extra = (h >> 7) % 4
  const shape = (h >> 9) % 3
  const radius = [16, 12, 9][shape]
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="avatar-svg">
      <rect x="0" y="0" width="40" height="40" rx={radius} fill={bg} />
      {extra === 1 && <path d="M8 13c4-7 20-7 24 0" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.85" />}
      {extra === 2 && <circle cx="31" cy="9" r="3.4" fill={light ? '#ffffff' : '#ffc600'} />}
      {extra === 3 && <path d="M12 11h16" stroke={ink} strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />}
      <circle cx={20 - eyeGap / 2 - 2} cy={eyeY} r="2.3" fill={ink} />
      <circle cx={20 + eyeGap / 2 + 2} cy={eyeY} r="2.3" fill={ink} />
      {mouth === 0 && <path d="M14 27c3 3.5 9 3.5 12 0" stroke={ink} strokeWidth="2.3" fill="none" strokeLinecap="round" />}
      {mouth === 1 && <path d="M15 27.5h10" stroke={ink} strokeWidth="2.3" strokeLinecap="round" />}
      {mouth === 2 && <circle cx="20" cy="28" r="2.6" fill={ink} />}
    </svg>
  )
}

export function Avatar({ face, size = 32, className }: { face: Partial<Face> & { name?: string | null }; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const name = (face.name || '?').trim()
  const style = { width: size, height: size }
  if (face.avatar_url && !broken) {
    return (
      <span className={`avatar ${className ?? ''}`} style={style}>
        <img src={face.avatar_url} alt="" width={size} height={size} onError={() => setBroken(true)} />
      </span>
    )
  }
  if (face.avatar_style === 'character') {
    return <span className={`avatar ${className ?? ''}`} style={style}><Character seed={face.user_id ?? name} color={face.avatar_color} size={size} /></span>
  }
  return (
    <span className={`avatar avatar-initial ${className ?? ''}`}
      style={{ ...style, background: face.avatar_color || '#052b7a', fontSize: Math.round(size * 0.42) }}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// Faces for a set of people, fetched once and cached for the session.
const cache = new Map<string, Face>()
export function useFaces(ids: (string | null | undefined)[]) {
  const key = [...new Set(ids.filter(Boolean) as string[])].sort().join(',')
  const [, bump] = useState(0)
  useEffect(() => {
    const missing = key ? key.split(',').filter((id) => !cache.has(id)) : []
    if (!missing.length) return
    supabase.rpc('faces', { p_ids: missing }).then(({ data, error }) => {
      if (error) return
      for (const f of (data as Face[]) ?? []) cache.set(f.user_id, f)
      bump((n) => n + 1)
    })
  }, [key])
  return (id: string | null | undefined) => (id ? cache.get(id) : undefined)
}
export function rememberFace(f: Face) { cache.set(f.user_id, f) }

// Resize to a 256px square (center crop) before upload, so avatars stay light.
async function toSquare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url
    })
    const s = Math.min(img.width, img.height)
    const c = document.createElement('canvas'); c.width = 256; c.height = 256
    c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256)
    return await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('blob'))), 'image/jpeg', 0.86))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type AvatarChoice = { avatar_url: string | null; avatar_style: string | null; avatar_color: string }

// Pick how you look: upload a photo, or a generated character, plus a brand color.
export function AvatarPicker({ userId, name, value, onChange }: {
  userId: string; name: string; value: AvatarChoice; onChange: (v: AvatarChoice) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function upload(f: File) {
    setErr('')
    if (!f.type.startsWith('image/')) { setErr('אפשר להעלות רק תמונה.'); return }
    if (f.size > 8 * 1024 * 1024) { setErr('התמונה גדולה מדי. עד 8MB.'); return }
    setBusy(true)
    try {
      const blob = await toSquare(f)
      const path = `${userId}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
      onChange({ ...value, avatar_url: url, avatar_style: 'photo' })
    } catch {
      setErr('ההעלאה לא עברה. נסו שוב, או בחרו דמות.')
    }
    setBusy(false)
  }

  const face: Face = { user_id: userId, name, ...value }
  return (
    <div className="avatar-picker">
      <Avatar face={face} size={64} />
      <div className="avatar-picker-ctl">
        <div className="chips">
          <button type="button" className={`chip ${value.avatar_style === 'character' ? 'on' : ''}`}
            onClick={() => onChange({ ...value, avatar_url: null, avatar_style: 'character' })}>דמות</button>
          <button type="button" className={`chip ${!value.avatar_style || value.avatar_style === 'initial' ? 'on' : ''}`}
            onClick={() => onChange({ ...value, avatar_url: null, avatar_style: 'initial' })}>אות</button>
          <button type="button" className={`chip ${value.avatar_style === 'photo' ? 'on' : ''}`} disabled={busy}
            onClick={() => file.current?.click()}>{busy ? 'מעלים' : 'תמונה'}</button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </div>
        {value.avatar_style !== 'photo' && (
          <div className="ob-colors">
            {AVATAR_COLORS.map((c) => (
              <button key={c} type="button" aria-label="צבע" className={`ob-color ${value.avatar_color === c ? 'on' : ''}`}
                style={{ background: c }} onClick={() => onChange({ ...value, avatar_color: c })} />
            ))}
          </div>
        )}
        {err && <div className="small" style={{ color: 'var(--red)' }}>{err}</div>}
      </div>
    </div>
  )
}
