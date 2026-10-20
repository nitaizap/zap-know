import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib'
import { BoardRow, rankLine, useRankGap } from './points'
import { Avatar } from './Avatar'
import { Layer } from './Layer'
import { IClose } from './icons'
import Leaderboard from '../pages/Leaderboard'

// The leaderboard that fits: as many compact rows as the space allows (never an inner scroll),
// my own rank pinned last when I'm outside them, and the full table one tap away in a sheet.

const ROW = 46

export function BoardCard({ dark }: { dark?: boolean }) {
  const [scope, setScope] = useState<'people' | 'teams'>('people')
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [fit, setFit] = useState(5)
  const [full, setFull] = useState(false)
  const list = useRef<HTMLOListElement>(null)
  const gap = useRankGap()

  useEffect(() => {
    setRows(null)
    supabase.rpc('leaderboard', { p_period: period, p_scope: scope, p_limit: 50 })
      .then(({ data, error }) => setRows(error ? [] : ((data as BoardRow[]) ?? [])))
  }, [scope, period])

  // How many rows fit in the space the card gives the list.
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const ro = new ResizeObserver(() => setFit(Math.max(3, Math.min(10, Math.floor(el.clientHeight / ROW)))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const all = rows ?? []
  const meRow = all.find((r) => r.is_me) ?? null
  const pinMe = scope === 'people' && period === 'month' && !(meRow && meRow.rank <= fit) && (meRow || (gap?.rank ?? null))
  const top = all.slice(0, pinMe ? fit - 1 : fit)
  const mine: BoardRow | null = !pinMe ? null : meRow ?? (gap?.rank ? { rank: gap.rank, name: 'אתם', team: '', points: gap.points, members: 0, is_me: true } : null)

  const Row = ({ r }: { r: BoardRow }) => (
    <li className={r.is_me ? 'me' : ''}>
      <span className="bc-rank">{r.rank}</span>
      {r.user_id ? <Avatar face={{ ...r, user_id: r.user_id }} size={30} /> : <span className="bc-av" aria-hidden>{r.name.charAt(0)}</span>}
      <span className="bc-name"><b>{r.name}{r.is_me && r.name !== 'אתם' ? ' (אתם)' : ''}</b>{scope === 'teams' ? <small>{r.members} פעילים</small> : r.team ? <small>{r.team}</small> : null}</span>
      <span className="bc-pts">{r.points.toLocaleString('he-IL')}</span>
    </li>
  )

  return (
    <section className={`bc${dark ? ' dark' : ''}`} aria-label="טבלת המובילים">
      <header className="bc-head">
        <b>המובילים</b>
        <span className="bc-toggles">
          <span role="group" aria-label="מי">
            <button aria-pressed={scope === 'people'} onClick={() => setScope('people')}>אנשים</button>
            <button aria-pressed={scope === 'teams'} onClick={() => setScope('teams')}>צוותים</button>
          </span>
          <span role="group" aria-label="מתי">
            <button aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>החודש</button>
            <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>מאז ומעולם</button>
          </span>
        </span>
      </header>
      <ol className="bc-list" ref={list}>
        {rows === null ? null : all.length === 0
          ? <li className="bc-empty">הטבלה עוד ריקה. המקום הראשון מחכה למי שיתחיל.</li>
          : <>{top.map((r) => <Row key={r.rank + r.name} r={r} />)}{mine && <Row r={mine} />}</>}
      </ol>
      <footer className="bc-foot">
        {gap && scope === 'people' && <span>{rankLine(gap)}</span>}
        <button className="bc-more" onClick={() => setFull(true)}>לטבלה המלאה ←</button>
      </footer>
      {full && (
        <Layer>
          <div className="dt-back" onClick={() => setFull(false)}>
            <section className="dt-sheet" role="dialog" aria-modal="true" aria-label="הטבלה המלאה" onClick={(e) => e.stopPropagation()}>
              <header className="dt-head"><span className="dt-grab" aria-hidden /><b>הטבלה המלאה</b>
                <button className="dt-x" onClick={() => setFull(false)} aria-label="לסגור"><IClose /></button></header>
              <div className="dt-body"><Leaderboard embedded /></div>
            </section>
          </div>
        </Layer>
      )}
    </section>
  )
}
