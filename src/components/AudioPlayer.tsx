import { useEffect, useRef, useState } from 'react'
import { IForward, IPause, IPlayFill, IRewind } from './icons'

const SPEEDS = [1, 1.25, 1.5]

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60), r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

// A calm podcast player: play/pause, ±15 seconds, speed, and a scrubber.
export function AudioPlayer({ src, title, autoPlay, onEnded }: { src: string; title?: string; autoPlay?: boolean; onEnded?: () => void }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => { if (ref.current) ref.current.playbackRate = speed }, [speed, src])

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) a.play().catch(() => {}); else a.pause()
  }
  const jump = (d: number) => { const a = ref.current; if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + d)) }

  return (
    <div className="aplayer" aria-label={title ? `נגן: ${title}` : 'נגן'}>
      <audio ref={ref} src={src} preload="metadata" autoPlay={autoPlay}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); onEnded?.() }} />
      <div className="aplayer-ctl">
        <button className="aplayer-skip" onClick={() => jump(-15)} aria-label="15 שניות אחורה"><IRewind size={20} /><span>15</span></button>
        <button className="aplayer-main" onClick={toggle} aria-label={playing ? 'השהיה' : 'ניגון'}>
          {playing ? <IPause size={26} /> : <IPlayFill size={26} />}
        </button>
        <button className="aplayer-skip" onClick={() => jump(15)} aria-label="15 שניות קדימה"><IForward size={20} /><span>15</span></button>
        <button className="aplayer-speed" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          aria-label="מהירות">{speed}x</button>
      </div>
      <div className="aplayer-bar">
        <span className="small muted">{fmt(t)}</span>
        <input type="range" min={0} max={dur || 0} step={1} value={t} aria-label="מיקום בפרק"
          onChange={(e) => { if (ref.current) ref.current.currentTime = Number(e.target.value) }} />
        <span className="small muted">{fmt(dur)}</span>
      </div>
    </div>
  )
}
