import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Sheets and dialogs render straight into <body>, so no feed, card or overflow:hidden parent
// can clip them or stack them under the bottom bar.
export function Layer({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body)
}

// The visible height, kept in --vvh, so a sheet shrinks above the phone keyboard instead of
// hiding its input behind it.
export function useViewportVar() {
  useEffect(() => {
    const vv = window.visualViewport
    const set = () => document.documentElement.style.setProperty('--vvh', `${Math.round(vv ? vv.height : window.innerHeight)}px`)
    set()
    vv?.addEventListener('resize', set)
    window.addEventListener('resize', set)
    return () => { vv?.removeEventListener('resize', set); window.removeEventListener('resize', set) }
  }, [])
}
