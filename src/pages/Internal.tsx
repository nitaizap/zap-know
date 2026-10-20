import { useEffect, useState } from 'react'
import { ITEM_COLS, Item, callFn, supabase } from '../lib'
import { Empty, Headline, ItemCard, Skeletons } from '../components/ui'
import { earn } from '../components/points'
import { FilterBar, applyFilters, useFilters, useSavedIds } from '../components/filters'

export default function Internal() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [f, setF] = useFilters('internal', { sort: 'new' })
  const saved = useSavedIds(f.saved)
  const [form, setForm] = useState({ title: '', team: '', what: '', link: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')

  useEffect(() => {
    supabase.from('items').select(ITEM_COLS).eq('status', 'approved').eq('kind', 'internal')
      .order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setItems((data as Item[]) ?? []))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      await callFn('ingest-internal', { ...form, channel: 'form' })
      setState('ok')
      earn('post')
      setForm({ title: '', team: '', what: '', link: '' })
    } catch {
      setState('err')
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <div>
      <Headline light="מה צוותים אחרים בנו," black="קורה ב-zap" hand="מי עושה זאפ על זה?" />
      <p className="muted">פרויקטים, חידושים ואוטומציות מתוך zap. כל פרויקט מגיע מערוץ ה-Teams, מקבוצת המייל או מהטופס כאן, ו-AI מסכם אותו בשבילכם.</p>

      <FilterBar value={f} onChange={setF} total={items ? applyFilters(items, f, { saved }).length : undefined} show={{ len: true, vertical: true, saved: true }} />
      <section>
        {items === null ? <Skeletons n={4} /> : items.length ? (
          <div className="grid two">{applyFilters(items, f, { saved }).map((i) => <ItemCard key={i.id} item={i} />)}</div>
        ) : <Empty>עוד אין פרויקטים. אולי שלכם יהיה הראשון?</Empty>}
      </section>

      <h2 className="section">בניתם משהו? ספרו לכולם</h2>
      <form className="card" onSubmit={submit} style={{ maxWidth: 640 }}>
        <label className="field"><span>איך קוראים לפרויקט?</span>
          <input className="input" value={form.title} onChange={set('title')} required />
        </label>
        <label className="field"><span>איזה צוות?</span>
          <input className="input" value={form.team} onChange={set('team')} placeholder="למשל: PPC, דאטה, REST" required />
        </label>
        <label className="field"><span>מה בניתם, ולמה זה עוזר?</span>
          <textarea className="textarea" value={form.what} onChange={set('what')} placeholder="כמה משפטים מספיקים. את הסיכום ה-AI כותב." required />
        </label>
        <label className="field"><span>קישור (לא חובה)</span>
          <input className="input" dir="ltr" type="url" value={form.link} onChange={set('link')} placeholder="https://" />
        </label>
        <button className="btn" disabled={state === 'sending'}>{state === 'sending' ? 'שולחים' : 'שליחה'}</button>
        {state === 'ok' && <div className="notice ok" style={{ marginTop: 10 }}>קיבלנו. ה-AI מסכם, צוות L&D מאשר, והפרויקט עולה לכאן.</div>}
        {state === 'err' && <div className="notice err" style={{ marginTop: 10 }}>השליחה לא עברה. נסו שוב, או פרסמו בערוץ ה-Teams של קורה ב-zap.</div>}
      </form>
    </div>
  )
}
