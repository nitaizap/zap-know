import { useEffect, useState } from 'react'
import { supabase } from '../lib'
import { Empty, Headline, MetroLine, Skeletons } from '../components/ui'
import { BoardRow, RulesPanel, useMyPoints } from '../components/points'
import { Avatar } from '../components/Avatar'

type Scope = 'people' | 'teams'
type Period = 'month' | 'all'

export default function Leaderboard() {
  const [scope, setScope] = useState<Scope>('people')
  const [period, setPeriod] = useState<Period>('month')
  const [rows, setRows] = useState<BoardRow[] | null | undefined>(undefined)
  const me = useMyPoints()

  useEffect(() => {
    setRows(undefined)
    supabase.rpc('leaderboard', { p_period: period, p_scope: scope, p_limit: 30 })
      .then(({ data, error }) => setRows(error ? null : ((data as BoardRow[]) ?? [])))
  }, [scope, period])

  const top = rows?.[0]?.points || 1
  const podium = (rows ?? []).slice(0, 3)
  const unit = scope === 'teams' ? 'נק\' לחבר/ה' : 'נק\''

  return (
    <div style={{ position: 'relative' }}>
      <Headline light="מי לומד, משתף ומשתדרג הכי הרבה," black="הטבלה" hand="בהצלחה">
        <MetroLine top={6} />
      </Headline>

      <div className="board-controls">
        <div className="seg" role="tablist" aria-label="מי מתחרה">
          <button role="tab" aria-selected={scope === 'people'} className={scope === 'people' ? 'on' : ''} onClick={() => setScope('people')}>אנשים</button>
          <button role="tab" aria-selected={scope === 'teams'} className={scope === 'teams' ? 'on' : ''} onClick={() => setScope('teams')}>צוותים</button>
        </div>
        <div className="seg" role="tablist" aria-label="תקופה">
          <button role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>החודש</button>
          <button role="tab" aria-selected={period === 'all'} className={period === 'all' ? 'on' : ''} onClick={() => setPeriod('all')}>כל הזמנים</button>
        </div>
      </div>

      <p className="small muted" style={{ margin: '10px 0 0' }}>
        {period === 'month'
          ? 'הטבלה החודשית מתאפסת ב-1 לחודש. שלושת המובילים מקבלים תוספת לתקציב הלמידה.'
          : 'כל הנקודות מאז שהתחלנו. הרמות שלכם נשמרות לתמיד.'}
        {scope === 'teams' ? ' צוותים מדורגים לפי ממוצע לחבר/ה פעיל/ה, כדי שגם צוות קטן יכול לנצח.' : ''}
      </p>

      {rows === undefined && <div style={{ marginTop: 18 }}><Skeletons n={3} /></div>}
      {rows === null && <Empty>הטבלה לא נטענה כרגע. נסו לרענן בעוד רגע.</Empty>}
      {rows && rows.length === 0 && (
        <Empty>עוד אין נקודות {period === 'month' ? 'החודש' : ''}. שיעור אחד שמסמנים וכבר אתם בטבלה.</Empty>
      )}

      {podium.length > 0 && (
        <div className="podium" aria-label="שלושת המובילים">
          {podium.map((r, i) => (
            <div key={r.rank + r.name} className={`pod pod-${i + 1}${r.is_me ? ' me' : ''}`}>
              {r.user_id && <Avatar face={{ ...r, user_id: r.user_id }} size={i === 0 ? 56 : 46} className="pod-avatar" />}
              <span className="pod-name">{r.name}</span>
              <span className="small pod-team">{scope === 'teams' ? `${r.members} פעילים` : r.team}</span>
              <span className="pod-pts">{r.points.toLocaleString('he-IL')}</span>
              <div className="pod-block"><span className="pod-rank">{r.rank}</span></div>
            </div>
          ))}
        </div>
      )}

      {rows && rows.length > 0 && (
        <ol className="board" aria-label="הדירוג המלא">
          {rows.map((r) => (
            <li key={r.rank + r.name} className={r.is_me ? 'me' : ''} title={`${r.name}: ${r.points} ${unit}`}>
              <span className="board-rank">{r.rank}</span>
              <span className="board-who">
                {r.user_id ? <Avatar face={{ ...r, user_id: r.user_id }} size={30} className="board-av" /> : null}
                <b>{r.name}{r.is_me ? ' (אתם)' : ''}</b>
                <span className="small muted">{scope === 'teams' ? `${r.members} פעילים` : r.team}</span>
              </span>
              <span className="board-bar" aria-hidden><i style={{ width: `${Math.max(3, Math.round((r.points / top) * 100))}%` }} /></span>
              <span className="board-pts">{r.points.toLocaleString('he-IL')} <span className="small muted">{unit}</span></span>
            </li>
          ))}
        </ol>
      )}

      {me && rows && rows.length > 0 && scope === 'people' && !rows.some((r) => r.is_me) && (
        <div className="notice info" style={{ marginTop: 12 }}>
          {me.month > 0 ? `יש לכם ${me.month} נקודות החודש. עוד קצת וזה בטבלה.` : 'עוד אין לכם נקודות החודש. שיעור, תגובה או שיתוף, וזה מתחיל.'}
        </div>
      )}

      <div style={{ marginTop: 20 }}><RulesPanel /></div>
    </div>
  )
}
