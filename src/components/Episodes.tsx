import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib'
import { Layer } from './Layer'
import { IClose } from './icons'

// The weekly personal podcast: a bell that lights up when there's an episode not yet heard,
// the list of every episode made for me, and one player used everywhere. An episode counts as
// heard at 80% played or when marked (mark_episode_heard, patch-022).

export type Ep = { week: string; body_he: string; audio_url: string | null; segments?: string[] | null; heard_at?: string | null; item_ids?: number[] }
const EVENT = 'zapup:episodes'

let cache: Ep[] | null = null
let inflight: Promise<Ep[]> | null = null
function load(force = false): Promise<Ep[]> {
  if (cache && !force) return Promise.resolve(cache)
  inflight ??= Promise.resolve(supabase.from('episodes').select('*').order('week', { ascending: false }).limit(52))
    .then(({ data, error }) => { cache = error ? [] : ((data ?? []) as Ep[]); inflight = null; return cache })
  return inflight
}

export function useEpisodes() {
  const [eps, setEps] = useState<Ep[] | null>(cache)
  useEffect(() => {
    load().then(setEps)
    const on = () => setEps(cache ? [...cache] : null)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return eps
}

export async function markHeard(week: string) {
  const ep = cache?.find((e) => e.week === week)
  if (ep?.heard_at) return
  if (ep) { ep.heard_at = new Date().toISOString(); window.dispatchEvent(new Event(EVENT)) }
  await supabase.rpc('mark_episode_heard', { p_week: week })
}

// "שבוע 19.10–25.10"
export function weekLabel(week: string) {
  const d = new Date(`${week}T00:00:00`)
  const e = new Date(d); e.setDate(e.getDate() + 6)
  const f = (x: Date) => `${x.getDate()}.${x.getMonth() + 1}`
  return `שבוע ${f(d)}–${f(e)}`
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** One player for every episode: ▶/❚❚ with the length, a thin progress line, heard at 80%. */
export function EpisodePlayer({ ep, big }: { ep: Ep; big?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [dur, setDur] = useState<number | null>(null)
  const [pos, setPos] = useState(0)
  useEffect(() => () => { audio.current?.pause() }, [])
  if (!ep.audio_url) return <span className="ep-noaudio">הקריינות של הפרק הזה לא נוצרה. אפשר לקרוא אותו.</span>
  const get = () => {
    if (!audio.current) {
      const a = new Audio(ep.audio_url!)
      a.preload = 'metadata'
      a.onloadedmetadata = () => setDur(a.duration)
      a.ontimeupdate = () => { setPos(a.currentTime); if (a.duration && a.currentTime / a.duration >= 0.8) markHeard(ep.week) }
      a.onended = () => { setPlaying(false); markHeard(ep.week) }
      audio.current = a
    }
    return audio.current
  }
  const toggle = () => {
    const a = get()
    if (playing) { a.pause(); setPlaying(false) } else a.play().then(() => setPlaying(true), () => setPlaying(false))
  }
  return (
    <div className={`ep-player${big ? ' big' : ''}${playing ? ' on' : ''}`}>
      <button type="button" className="ep-play" onClick={toggle} aria-pressed={playing} aria-label={playing ? 'לעצור' : 'להאזין לפרק'}>
        {playing
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15l12-7.5z" /></svg>}
        <span>{playing ? 'עוצרים' : 'להאזנה'}{dur ? ` · ${mmss(dur)}` : ''}</span>
      </button>
      {dur ? <span className="ep-bar" aria-hidden><i style={{ width: `${Math.min(100, (pos / dur) * 100)}%` }} /></span> : null}
    </div>
  )
}

/** The bell in the header: yellow with a count when something is waiting, grey when all heard. */
export function EpisodeBell() {
  const eps = useEpisodes()
  const [open, setOpen] = useState(false)
  const fresh = (eps ?? []).filter((e) => !e.heard_at).length
  return (
    <>
      <button type="button" className={`ep-bell${fresh ? ' fresh' : ''}`} onClick={() => setOpen(true)}
        aria-label={fresh ? `הפרקים השבועיים שלכם, ${fresh === 1 ? 'פרק חדש אחד' : `${fresh} פרקים חדשים`}` : 'הפרקים השבועיים שלכם'}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill={fresh ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {fresh > 0 && <span className="ep-count">{fresh}</span>}
      </button>
      {open && <EpisodesSheet onClose={() => setOpen(false)} />}
    </>
  )
}

export function EpisodesSheet({ onClose }: { onClose: () => void }) {
  const eps = useEpisodes()
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  useEffect(() => {
    load(true).then(() => window.dispatchEvent(new Event(EVENT)))
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <Layer>
      <div className="dt-back" onClick={onClose}>
        <section className="dt-sheet" role="dialog" aria-modal="true" aria-label="הפרקים השבועיים שלכם" onClick={(e) => e.stopPropagation()}>
          <header className="dt-head"><span className="dt-grab" aria-hidden /><b>הפרקים השבועיים שלכם</b>
            <button className="dt-x" onClick={onClose} aria-label="לסגור"><IClose /></button></header>
          <div className="dt-body">
            {eps === null ? <p className="ep-empty">טוענים</p> : eps.length === 0 ? (
              <div className="ep-empty">
                <b>עוד אין פרקים</b>
                <p>הפרק הראשון יגיע ביום ראשון ב-06:00: מה קרה אצלכם השבוע, מה מחכה לכם, וההמלצות שלכם, בשתי דקות האזנה.</p>
              </div>
            ) : (
              <ol className="ep-list">
                {eps.map((e) => (
                  <li key={e.week} className={e.heard_at ? 'heard' : 'fresh'}>
                    <div className="ep-top">
                      <b>{weekLabel(e.week)}</b>
                      {!e.heard_at && <span className="ep-new">חדש</span>}
                    </div>
                    {(e.segments?.length ?? 0) > 0 && <div className="ep-segs">{e.segments!.map((x) => <span key={x}>{x}</span>)}</div>}
                    <EpisodePlayer ep={e} />
                    <button type="button" className="ep-more" aria-expanded={openWeek === e.week} onClick={() => setOpenWeek(openWeek === e.week ? null : e.week)}>
                      {openWeek === e.week ? 'להסתיר את הכרטיס' : 'לקרוא את הכרטיס'}
                    </button>
                    {openWeek === e.week && <p className="ep-card">{e.body_he}</p>}
                    {!e.heard_at && <button type="button" className="ep-mark" onClick={() => markHeard(e.week)}>סימון כנשמע</button>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </Layer>
  )
}
