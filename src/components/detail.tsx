import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ITEM_COLS, Item, supabase } from '../lib'
import { ItemDetail } from '../pages/Item'
import { DocDetail } from '../pages/Doc'
import { Comments } from './social'
import { Layer } from './Layer'
import { IClose } from './icons'
import '../detail.css'

// "לפתוח" never leaves the feed: an item or a team document opens in place, in the desktop
// feed's panel or as a full-height sheet (and as a side panel on other desktop pages). Only the
// source itself (course, article, video, checkout) leaves, always in a new tab.

export type Target = { kind: 'item' | 'doc'; id: number }

type Open = (t: Target) => void
let host: Open | null = null       // the desktop feed's panel, when it's on screen
let listener: Open | null = null   // the global sheet
let pending: Target | null = null  // opened before anyone was listening (a deep link)

/** The desktop feed takes over opening while it's mounted. */
export function setDetailHost(h: Open) {
  host = h
  if (pending) { h(pending); pending = null }
  return () => { if (host === h) host = null }
}

export function openDetail(t: Target) {
  if (host) host(t)
  else if (listener) listener(t)
  else pending = t
}

/** A real link (shareable, opens in a new tab with ⌘/Ctrl) that opens in place on a plain click. */
export function DetailLink({ kind, id, className, children, label }: {
  kind: Target['kind']; id: number; className?: string; children: React.ReactNode; label?: string
}) {
  return (
    <a href={`#/${kind}/${id}`} className={className} aria-label={label}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault(); e.stopPropagation()
        openDetail({ kind, id })
      }}>
      {children}
    </a>
  )
}

// Comments for a team document live on its mirrored feed item.
function DocComments({ docId }: { docId: number }) {
  const [item, setItem] = useState<Item | null>(null)
  const [myId, setMyId] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? ''))
    supabase.from('items').select(ITEM_COLS).eq('doc_id', docId).maybeSingle().then(({ data }) => setItem((data as unknown as Item) ?? null))
  }, [docId])
  if (!item) return null
  return <div className="dt-doc-talk"><h2>מה אומרים פה</h2><Comments item={item} myId={myId} bare /></div>
}

export function DetailBody({ target, onOpen }: { target: Target; onOpen: (t: Target) => void }) {
  return target.kind === 'item'
    ? <ItemDetail key={`i${target.id}`} itemId={target.id} embedded />
    : (
      <div key={`d${target.id}`}>
        <DocDetail docId={target.id} embedded onOpenDoc={(id) => onOpen({ kind: 'doc', id })} />
        <DocComments docId={target.id} />
      </div>
    )
}

// The global sheet: full height on a phone, a side panel on a desktop page without a feed.
// Opening adds a history entry, so the phone's back button closes it without leaving the page.
export function DetailHost() {
  const [target, setTarget] = useState<Target | null>(null)
  const [dy, setDy] = useState(0)
  const drag = useRef<number | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const isOpen = useRef(false)
  const loc = useLocation()
  isOpen.current = !!target

  useEffect(() => {
    const open: Open = (t) => {
      if (!isOpen.current) { try { history.pushState({ ...(history.state ?? {}), zapDetail: 1 }, '') } catch { /* ignore */ } }
      isOpen.current = true
      setTarget(t)
      body.current?.scrollTo({ top: 0 })
    }
    listener = open
    if (pending) { open(pending); pending = null }
    const onPop = () => setTarget(null)
    window.addEventListener('popstate', onPop)
    return () => { if (listener === open) listener = null; window.removeEventListener('popstate', onPop) }
  }, [])

  // A link inside the sheet that goes to another page closes it.
  const lastPath = useRef(loc.pathname)
  useEffect(() => {
    if (lastPath.current === loc.pathname) return
    lastPath.current = loc.pathname
    setTarget(null)
  }, [loc.pathname])

  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setDy(0)
    if ((history.state as { zapDetail?: number } | null)?.zapDetail) history.back()
    else setTarget(null)
  }

  if (!target) return null
  return (
    <Layer>
      <div className="dt-back" onClick={close}>
        <section className="dt-sheet" role="dialog" aria-modal="true" aria-label="פרטים" onClick={(e) => e.stopPropagation()}
          style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
          <header className="dt-head"
            onPointerDown={(e) => { drag.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
            onPointerMove={(e) => { if (drag.current !== null) setDy(Math.max(0, e.clientY - drag.current)) }}
            onPointerUp={() => { const d = dy; drag.current = null; if (d > 90) close(); else setDy(0) }}
            onPointerCancel={() => { drag.current = null; setDy(0) }}>
            <span className="dt-grab" aria-hidden />
            <b>{target.kind === 'doc' ? 'מסמך צוות' : 'פרטים'}</b>
            <button className="dt-x" onClick={close} aria-label="לסגור ולחזור לפיד"><IClose /></button>
          </header>
          <div className="dt-body" ref={body}><DetailBody target={target} onOpen={(t) => { setTarget(t); body.current?.scrollTo({ top: 0 }) }} /></div>
        </section>
      </div>
    </Layer>
  )
}
