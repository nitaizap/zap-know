import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ITEM_COLS, Item, KIND_LABEL, callFn, fmtMinutes, supabase, track } from '../lib'
import { ICar, INext, IPause, IPlayFill, IPrev } from '../components/icons'
import '../drive.css'

type Track = { item: Item; src: string | null; state: 'wait' | 'making' | 'ready' | 'failed' }

const DURATIONS = [15, 30, 45]

// "אני בדרך": choose how long the drive is, get an audio playlist that fits, hands-free.
// Podcasts play their own audio; everything else plays its "להאזנה" conversation, made on the fly.
export default function Drive() {
  const [mins, setMins] = useState<number | null>(null)
  const [list, setList] = useState<Track[] | null>(null)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const audio = useRef<HTMLAudioElement>(null)
  const making = useRef(new Set<number>())
  const wake = useRef<{ release: () => Promise<void> } | null>(null)

  async function start(m: number) {
    setMins(m); setList(null); setCur(0)
    const { data } = await supabase.rpc('fit_time', { p_minutes: m, p_audio_only: true })
    const rows = (data as { id: number; minutes: number }[] | null) ?? []
    if (!rows.length) { setList([]); return }
    const { data: its } = await supabase.from('items').select(ITEM_COLS).in('id', rows.map((r) => r.id))
    const byId = new Map(((its as Item[] | null) ?? []).map((i) => [i.id, i]))
    setList(rows.flatMap((r) => {
      const it = byId.get(r.id)
      if (!it) return []
      const own = it.kind === 'podcast' && it.audio_url
      return [{ item: { ...it, minutes: r.minutes }, src: own ? it.audio_url! : null, state: own ? 'ready' as const : 'wait' as const }]
    }))
  }

  // Make the conversation for track n (if it needs one). Called for the current and the next track.
  const prepare = useCallback(async (n: number) => {
    const tr = list?.[n]
    if (!tr || tr.state !== 'wait' || making.current.has(tr.item.id)) return
    making.current.add(tr.item.id)
    setList((l) => l && l.map((x, i) => (i === n ? { ...x, state: 'making' } : x)))
    try {
      const r = await callFn<{ audio_url: string | null }>('listen', { kind: 'item', id: tr.item.id })
      let src = r.audio_url
      // The voice may still be recording in the background: wait for it (up to ~2 minutes).
      for (let k = 0; !src && k < 24; k++) {
        await new Promise((ok) => setTimeout(ok, 5000))
        const { data } = await supabase.from('listens').select('audio_url').eq('kind', 'item').eq('ref_id', tr.item.id).maybeSingle()
        src = (data as { audio_url: string | null } | null)?.audio_url ?? null
      }
      setList((l) => l && l.map((x, i) => (i === n ? { ...x, src, state: src ? 'ready' : 'failed' } : x)))
    } catch {
      setList((l) => l && l.map((x, i) => (i === n ? { ...x, state: 'failed' } : x)))
    }
  }, [list])

  useEffect(() => { prepare(cur); prepare(cur + 1) }, [cur, prepare])

  // Skip tracks that failed.
  useEffect(() => {
    if (list && list[cur]?.state === 'failed' && cur < list.length - 1) setCur(cur + 1)
  }, [list, cur])

  const now = list?.[cur]

  // Lock screen / car controls.
  useEffect(() => {
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession
    if (!ms || !now) return
    try {
      ms.metadata = new MediaMetadata({ title: now.item.title_he, artist: now.item.kind === 'podcast' ? now.item.source_name : 'zap UP · שיחה', album: 'אני בדרך' })
      ms.setActionHandler('play', () => audio.current?.play())
      ms.setActionHandler('pause', () => audio.current?.pause())
      ms.setActionHandler('nexttrack', () => next())
      ms.setActionHandler('previoustrack', () => prev())
    } catch { /* not supported */ }
  })

  // Keep the screen awake while playing, where the browser allows it.
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    if (playing && nav.wakeLock && !wake.current) nav.wakeLock.request('screen').then((w) => { wake.current = w }).catch(() => {})
    if (!playing && wake.current) { wake.current.release().catch(() => {}); wake.current = null }
  }, [playing])

  function next() { if (list && cur < list.length - 1) setCur(cur + 1) }
  function prev() {
    if (audio.current && audio.current.currentTime > 5) { audio.current.currentTime = 0; return }
    if (cur > 0) setCur(cur - 1)
  }
  function toggle() {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play().catch(() => {}); else a.pause()
  }

  const left = (list ?? []).slice(cur).reduce((a, x) => a + (x.item.minutes ?? 0), 0)

  if (mins === null) {
    return (
      <div className="drive">
        <div className="drive-hero">
          <span className="drive-ico"><ICar size={40} /></span>
          <h1>אני בדרך</h1>
          <p>כמה זמן הנסיעה? נרכיב לכם פלייליסט שנכנס בדיוק בזה, ותוכלו פשוט להקשיב.</p>
        </div>
        <div className="drive-pick">
          {DURATIONS.map((m) => <button key={m} className="drive-dur" onClick={() => start(m)}><b>{m}</b><span>דקות</span></button>)}
        </div>
        <p className="small muted drive-note">פודקאסטים מתנגנים כמו שהם. כל השאר הופך לשיחה קצרה בין נועה לעידו. שמרו על העיניים על הכביש.</p>
      </div>
    )
  }

  return (
    <div className="drive">
      {list === null && <div className="drive-loading">מרכיבים לכם פלייליסט של {mins} דקות</div>}
      {list && list.length === 0 && (
        <div className="drive-loading">
          לא מצאנו מספיק תוכן להאזנה כרגע.
          <button className="btn" style={{ marginTop: 14 }} onClick={() => setMins(null)}>לבחור זמן אחר</button>
        </div>
      )}
      {list && list.length > 0 && now && (
        <>
          <div className="drive-now">
            <span className="drive-kind">{KIND_LABEL[now.item.kind]} · {cur + 1} מתוך {list.length}</span>
            <h1>{now.item.title_he}</h1>
            <span className="small">{now.item.source_name}</span>
            {now.state === 'making' && <p className="drive-making">נועה ועידו מתכוננים, עוד כמה שניות</p>}
            {now.state === 'failed' && <p className="drive-making">את זה לא הצלחנו להכין. ממשיכים לפריט הבא.</p>}
          </div>

          {now.src && (
            <audio ref={audio} src={now.src} autoPlay key={now.src}
              onPlay={() => { setPlaying(true); track(now.item.id, 'open') }} onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
              onEnded={() => { setPlaying(false); next() }} />
          )}

          <div className="drive-progress" aria-hidden><i style={{ width: dur ? `${Math.min(100, (t / dur) * 100)}%` : '0%' }} /></div>

          <div className="drive-ctl">
            <button onClick={prev} aria-label="הקודם"><IPrev size={34} /></button>
            <button className="drive-main" onClick={toggle} disabled={!now.src} aria-label={playing ? 'השהיה' : 'ניגון'}>
              {playing ? <IPause size={48} /> : <IPlayFill size={48} />}
            </button>
            <button onClick={next} disabled={cur >= list.length - 1} aria-label="הבא"><INext size={34} /></button>
          </div>

          <p className="drive-left">נשארו בערך {fmtMinutes(left) || '0 דק׳'}</p>

          <ol className="drive-list">
            {list.map((x, i) => (
              <li key={x.item.id} className={i === cur ? 'on' : i < cur ? 'done' : ''}>
                <button onClick={() => setCur(i)}>
                  <b>{x.item.title_he}</b>
                  <span className="small">{fmtMinutes(x.item.minutes)}{x.state === 'making' ? ' · מתכוננים' : x.state === 'failed' ? ' · דילגנו' : ''}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="btn ghost" onClick={() => { audio.current?.pause(); setMins(null) }}>זמן אחר</button>
            <Link className="btn ghost" to="/">לבית</Link>
          </div>
        </>
      )}
    </div>
  )
}
