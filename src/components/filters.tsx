import { useEffect, useState } from 'react'
import { Item, Topic, VERTICALS, supabase } from '../lib'
import { IClose } from './icons'

// One lightweight filter/sort bar for every browsing surface: collapsed into a single
// "סינון ומיון" pill (with an active-filter count) that opens a compact sheet.
export type Sort = 'top' | 'new' | 'short' | 'long' | 'liked'
export type Len = '' | '5' | '10' | '15' | '60' | 'more'
export type Lang = '' | 'he' | 'en'
export type Level = '' | 'beginner' | 'intermediate' | 'advanced'
export type Filters = {
  topic: string; kind: '' | Item['kind']; len: Len; vertical: string; saved: boolean; sort: Sort
  lang: Lang; level: Level; tool: string
}

export const NO_FILTERS: Filters = { topic: '', kind: '', len: '', vertical: '', saved: false, sort: 'top', lang: '', level: '', tool: '' }

const LENS: { v: Len; label: string }[] = [
  { v: '5', label: "עד 5 דק'" }, { v: '15', label: "עד 15 דק'" }, { v: '60', label: 'עד שעה' }, { v: 'more', label: 'יותר' },
]
const SORTS: { v: Sort; label: string }[] = [
  { v: 'top', label: 'מומלץ' }, { v: 'new', label: 'חדש' }, { v: 'short', label: 'הכי קצר' }, { v: 'long', label: 'הכי ארוך' }, { v: 'liked', label: 'הכי אהוב' },
]
const LANGS: { v: Lang; label: string }[] = [{ v: 'he', label: 'עברית' }, { v: 'en', label: 'אנגלית' }]
const LEVELS: { v: Level; label: string }[] = [{ v: 'beginner', label: 'מתחילים' }, { v: 'intermediate', label: 'בינוני' }, { v: 'advanced', label: 'מתקדם' }]
const KINDS: { v: Filters['kind']; label: string }[] = [{ v: 'course', label: 'קורס' }, { v: 'news', label: 'עדכון' }, { v: 'podcast', label: 'פודקאסט' }, { v: 'internal', label: 'פנימי' }]

// Remembers the last choice per page; storage can be unavailable, so every access is guarded.
export function useFilters(page: string, base: Partial<Filters> = {}): [Filters, (f: Filters) => void] {
  const key = `zapup.filters.${page}`
  const [f, setF] = useState<Filters>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return { ...NO_FILTERS, ...base, ...JSON.parse(raw) }
    } catch { /* private mode etc. */ }
    return { ...NO_FILTERS, ...base }
  })
  const set = (next: Filters) => {
    setF(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
  }
  return [f, set]
}

// Ids I saved, for the "saved only" filter.
export function useSavedIds(enabled: boolean) {
  const [ids, setIds] = useState<Set<number> | null>(null)
  useEffect(() => {
    if (!enabled || ids) return
    supabase.from('saves').select('item_id').then(({ data }) =>
      setIds(new Set(((data ?? []) as { item_id: number }[]).map((r) => r.item_id))))
  }, [enabled, ids])
  return ids
}

const lenOk = (m: number | null | undefined, len: Len) => {
  if (!len) return true
  if (!m) return false
  return len === 'more' ? m > 60 : m <= Number(len)
}

// Filters, then sorts. "מומלץ" keeps the incoming (ranked) order unless a rank map is given.
export function applyFilters<T extends Item>(items: T[], f: Filters, opts: { saved?: Set<number> | null; rank?: Map<number, number> } = {}): T[] {
  const out = items.filter((i) =>
    (!f.topic || i.topic_slug === f.topic) &&
    (!f.kind || i.kind === f.kind) &&
    lenOk(i.minutes, f.len) &&
    (!f.vertical || i.verticals?.includes(f.vertical)) &&
    (!f.saved || !!opts.saved?.has(i.id)) &&
    (!f.lang || i.lang === f.lang) &&
    (!f.level || i.level === f.level) &&
    (!f.tool || !!i.tools?.includes(f.tool)))
  const when = (i: Item) => new Date(i.published_at || i.created_at).getTime()
  // Hebrew first on ties; in a ranked feed, a Hebrew item moves up two places.
  const he = (i: Item) => (i.lang === 'he' ? 1 : 0)
  switch (f.sort) {
    case 'new': return out.sort((a, b) => when(b) - when(a) || he(b) - he(a))
    case 'short': return out.sort((a, b) => (a.minutes ?? 1e6) - (b.minutes ?? 1e6) || he(b) - he(a))
    case 'long': return out.sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1) || he(b) - he(a))
    case 'liked': return out.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0) || he(b) - he(a) || b.opens - a.opens)
    default: {
      if (opts.rank) return out.sort((a, b) => (opts.rank!.get(a.id) ?? 1e9) - (opts.rank!.get(b.id) ?? 1e9) || he(b) - he(a))
      const pos = new Map(out.map((i, n) => [i.id, n - 2.5 * he(i)]))
      return out.sort((a, b) => pos.get(a.id)! - pos.get(b.id)!)
    }
  }
}

type Show = { topic?: Topic[]; kind?: boolean; len?: boolean; vertical?: boolean; saved?: boolean; lang?: boolean; level?: boolean; tools?: string[] }

export function FilterBar({ value, onChange, show, total, icon, extra }: {
  value: Filters; onChange: (f: Filters) => void; show: Show; total?: number
  icon?: boolean            // feed overlay: one round icon instead of the pill row
  extra?: React.ReactNode   // top of the sheet: the page's "שאלו את העמוד" bar
}) {
  const [open, setOpen] = useState(false)
  const active = [value.topic, value.kind, value.len, value.vertical, value.lang, value.level, value.tool].filter(Boolean).length + (value.saved ? 1 : 0)
  const sortLabel = SORTS.find((s) => s.v === value.sort)?.label
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={icon ? 'fbar-ico' : 'fbar'}>
      {icon ? (
        <button className={`tk-ico${active ? ' on' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog"
          aria-label={active ? `סינון ומיון, ${active} פעילים` : 'סינון ומיון'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          {active > 0 && <span className="tk-ico-n">{active}</span>}
        </button>
      ) : <>
      <button className={`fbar-pill ${active ? 'on' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        סינון ומיון
        {active > 0 && <span className="fbar-count">{active}</span>}
      </button>
      <span className="fbar-sum">{sortLabel}{total !== undefined ? ` · ${total === 1 ? "תוצאה אחת" : `${total} תוצאות`}` : ''}</span>
      {active > 0 && <button className="fbar-clear" onClick={() => onChange({ ...NO_FILTERS, sort: value.sort })}>ניקוי</button>}
      </>}

      {open && (
        <div className="sheet-wrap" onClick={() => setOpen(false)}>
          <div className="sheet card fsheet" role="dialog" aria-label="סינון ומיון" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>סינון ומיון</h3>
              <button className="icon-btn" aria-label="לסגור" onClick={() => setOpen(false)}><IClose /></button>
            </div>
            {extra}

            <Group label="מיון">
              {SORTS.map((s) => <Chip key={s.v} on={value.sort === s.v} onClick={() => set({ sort: s.v })}>{s.label}</Chip>)}
            </Group>
            {show.len && (
              <Group label="אורך">
                {LENS.map((l) => <Chip key={l.v} on={value.len === l.v} onClick={() => set({ len: value.len === l.v ? '' : l.v })}>{l.label}</Chip>)}
              </Group>
            )}
            {show.kind && (
              <Group label="סוג">
                {KINDS.map((k) => <Chip key={k.v} on={value.kind === k.v} onClick={() => set({ kind: value.kind === k.v ? '' : k.v })}>{k.label}</Chip>)}
              </Group>
            )}
            {show.topic && show.topic.length > 0 && (
              <Group label="נושא">
                {show.topic.filter((t) => t.status === 'live').map((t) => (
                  <Chip key={t.slug} on={value.topic === t.slug} onClick={() => set({ topic: value.topic === t.slug ? '' : t.slug })}>{t.name_he}</Chip>
                ))}
              </Group>
            )}
            {show.level && (
              <Group label="רמה">
                {LEVELS.map((l) => <Chip key={l.v} on={value.level === l.v} onClick={() => set({ level: value.level === l.v ? '' : l.v })}>{l.label}</Chip>)}
              </Group>
            )}
            {show.lang && (
              <Group label="שפת המקור">
                {LANGS.map((l) => <Chip key={l.v} on={value.lang === l.v} onClick={() => set({ lang: value.lang === l.v ? '' : l.v })}>{l.label}</Chip>)}
              </Group>
            )}
            {show.tools && show.tools.length > 0 && (
              <Group label="כלי">
                {show.tools.map((t) => <Chip key={t} on={value.tool === t} onClick={() => set({ tool: value.tool === t ? '' : t })}><bdi dir="ltr">{t}</bdi></Chip>)}
              </Group>
            )}
            {show.vertical && (
              <Group label="מותג">
                {VERTICALS.map((v) => <Chip key={v} on={value.vertical === v} onClick={() => set({ vertical: value.vertical === v ? '' : v })}>{v}</Chip>)}
              </Group>
            )}
            {show.saved && (
              <Group label="אצלי">
                <Chip on={value.saved} onClick={() => set({ saved: !value.saved })}>רק מה ששמרתי</Chip>
              </Group>
            )}

            <div className="row" style={{ marginTop: 18 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setOpen(false)}>להציג</button>
              <button className="btn ghost" onClick={() => onChange({ ...NO_FILTERS })}>איפוס</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fgroup">
      <div className="fgroup-label">{label}</div>
      <div className="chips" style={{ margin: 0 }}>{children}</div>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{children}</button>
}
