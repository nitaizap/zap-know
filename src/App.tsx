import { Suspense, createContext, lazy, useContext, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Profile, Topic, probeMediaCols, supabase } from './lib'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import External from './pages/External'
import InternalHub from './pages/InternalHub'
import ItemPage from './pages/Item'
import TeamDetail from './pages/TeamDetail'
import Admin from './pages/Admin'
import Me from './pages/Me'
import { PointsPill, Toaster } from './components/points'
import { IBook, IClose, IHome, ILogout, IMenu, IShield, IUser, IUsers } from './components/icons'
import { Avatar } from './components/Avatar'
import { SearchBox } from './components/SearchBox'
import { AiButton, AiSheet } from './components/AiSheet'
import { useViewportVar } from './components/Layer'

const Doc = lazy(() => import('./pages/Doc'))
const Drive = lazy(() => import('./pages/Drive'))
const Contribute = lazy(() => import('./pages/Contribute'))
const page = (P: React.ComponentType) => <Suspense fallback={<div className="skeleton" style={{ marginTop: 28 }} />}><P /></Suspense>

// Old addresses keep working: each lands on its place inside the four pages.
function To({ path, keep = [] }: { path: string; keep?: [string, string][] }) {
  const [params] = useSearchParams()
  const next = new URLSearchParams()
  for (const [from, to] of keep) { const v = params.get(from); if (v) next.set(to, v) }
  const [base, hash] = path.split('#')
  const qs = next.toString()
  return <Navigate to={`${base}${qs ? (base.includes('?') ? '&' : '?') + qs : ''}${hash ? '#' + hash : ''}`} replace />
}
function TopicRedirect() {
  const { slug } = useParams()
  return <Navigate to={`/external?topic=${slug ?? ''}`} replace />
}

type Ctx = {
  session: Session
  profile: Profile
  topics: Topic[]
  setProfile: (p: Profile) => void
}
const AppCtx = createContext<Ctx | null>(null)
export function useApp() {
  const c = useContext(AppCtx)
  if (!c) throw new Error('no app context')
  return c
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [topics, setTopics] = useState<Topic[]>([])
  useViewportVar()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(session === null ? null : undefined); return }
    // Probe the optional media columns before any page queries items.
    Promise.all([
      supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
      probeMediaCols(),
    ]).then(([{ data }]) => setProfile((data as Profile) ?? null))
    supabase.from('topics').select('*').order('sort')
      .then(({ data }) => setTopics((data as Topic[]) ?? []))
  }, [session])

  if (session === undefined) return <div className="login-wrap"><div className="skeleton" style={{ width: 320 }} /></div>
  if (!session) return <Login />
  if (profile === undefined) return <div className="login-wrap"><div className="skeleton" style={{ width: 320 }} /></div>
  if (!profile || profile.topics.length === 0)
    return <Onboarding session={session} topics={topics} existing={profile} onDone={setProfile} />

  return (
    <AppCtx.Provider value={{ session, profile, topics, setProfile }}>
      <Shell profile={profile} topics={topics}>
        <main className="container main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/external" element={<External />} />
            <Route path="/internal" element={<InternalHub />} />
            <Route path="/me" element={<Me />} />
            <Route path="/item/:id" element={<ItemPage />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            <Route path="/doc/:id" element={page(Doc)} />
            <Route path="/contribute" element={page(Contribute)} />
            <Route path="/drive" element={page(Drive)} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/feed" element={<To path="/external?view=feed" />} />
            <Route path="/library" element={<To path="/external" keep={[['q', 'q'], ['topic', 'topic']]} />} />
            <Route path="/topics" element={<To path="/external" />} />
            <Route path="/topic/:slug" element={<TopicRedirect />} />
            <Route path="/agent" element={<To path="/internal" keep={[['q', 'ask'], ['team', 'team']]} />} />
            <Route path="/ask" element={<To path="/external" keep={[['q', 'ask']]} />} />
            <Route path="/teams" element={<To path="/internal?tab=teams" />} />
            <Route path="/budget" element={<To path="/me#budget" />} />
            <Route path="/leaderboard" element={<To path="/me#leaderboard" />} />
            <Route path="*" element={<Home />} />
          </Routes>
          <footer className="footer">
            <div className="footer-brand"><b>zap UP</b> <bdi dir="ltr">Learn. Level Up. zap.</bdi></div>
            <p>
              מרכז הלמידה והידע של zap. ה-AI מסכם מידע פומבי, וכל קורס ועדכון מוביל למקור.
              מצאתם טעות? בכל קורס ועדכון יש "לדווח על טעות".
            </p>
          </footer>
        </main>
      </Shell>
      <AiSheet />
      <Toaster />
    </AppCtx.Provider>
  )
}

// Four pages, nothing else in the nav. Admin and sign-out live in the avatar menu.
const PRIMARY = [
  { to: '/', label: 'בית', icon: IHome, end: true },
  { to: '/external', label: 'ידע מבחוץ', icon: IBook },
  { to: '/internal', label: 'ידע מבפנים', icon: IUsers },
  { to: '/me', label: 'האזור שלי', icon: IUser },
]

function Shell({ profile, topics, children }: { profile: Profile; topics: Topic[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const loc = useLocation()
  const [params] = useSearchParams()
  // Feed pages own the whole screen.
  const imm = loc.pathname === '/' || (['/external', '/internal'].includes(loc.pathname) && params.get('view') !== 'list')
  useEffect(() => { setOpen(false); setMenu(false) }, [loc.pathname])
  // A new page starts at the top; /me#section scrolls itself.
  useEffect(() => { if (!loc.hash) window.scrollTo(0, 0) }, [loc.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`app${imm ? ' imm' : ''}`}>
      {imm && (
        <aside className="imm-side" aria-label="ניווט">
          <NavLink to="/" className="brand" aria-label="zap UP, הבית">
            <img src="/zap-know/img/zap-group.svg" alt="zap group" />
            <span className="brand-up">UP</span>
          </NavLink>
          <p className="imm-tag">Learn. Level Up. zap.</p>
          <nav>{PRIMARY.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={22} />{n.label}</NavLink>)}</nav>
          <AiButton />
          <PointsPill />
          <NavLink to="/me" className="imm-me">
            <Avatar face={{ ...profile, name: profile.display_name || profile.email }} size={38} />
            <span><b>{profile.display_name || profile.email.split('@')[0]}</b><small>{profile.role ?? 'האזור שלי'}</small></span>
          </NavLink>
          <p className="imm-keys">→ שומר לי · ← לא בשבילי</p>
        </aside>
      )}
      <header className="topbar">
        <div className="container topbar-in">
          <NavLink to="/" className="brand" aria-label="zap UP, הבית">
            <img src="/zap-know/img/zap-group.svg" alt="zap group" />
            <span className="brand-up">UP</span>
          </NavLink>

          <nav className="topnav" aria-label="ניווט ראשי">
            {PRIMARY.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>

          <SearchBox topics={topics} />
          <AiButton />

          <div className="topbar-end">
            <PointsPill />
            <div className={`more ${menu ? 'open' : ''}`}>
              <button className="me-link more-btn" aria-label="התפריט שלי" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <Avatar face={{ ...profile, name: profile.display_name || profile.email }} size={34} className="me-avatar-img" />
              </button>
              {menu && (
                <div className="more-menu" role="menu">
                  <NavLink to="/me" role="menuitem"><IUser size={18} />האזור שלי</NavLink>
                  {profile.is_admin && <NavLink to="/admin" role="menuitem"><IShield size={18} />ניהול ואישורים</NavLink>}
                  <button role="menuitem" onClick={() => supabase.auth.signOut()}><ILogout size={18} />לצאת</button>
                </div>
              )}
            </div>
            <button className="icon-btn menu-btn" aria-label="תפריט" aria-expanded={open} onClick={() => setOpen(true)}><IMenu /></button>
          </div>
        </div>
      </header>

      {open && (
        <div className="drawer-wrap" onClick={() => setOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="תפריט">
            <div className="drawer-head">
              <span className="brand"><img src="/zap-know/img/zap-group.svg" alt="zap group" /><span className="brand-up">UP</span></span>
              <button className="icon-btn" aria-label="לסגור" onClick={() => setOpen(false)}><IClose /></button>
            </div>
            <div className="drawer-me">
              <Avatar face={{ ...profile, name: profile.display_name || profile.email }} size={40} />
              <div><b>{profile.display_name || profile.email.split('@')[0]}</b><div className="small muted">{profile.role ?? ''}</div></div>
            </div>
            <nav className="drawer-nav">
              {PRIMARY.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon />{n.label}</NavLink>)}
              {profile.is_admin && <NavLink to="/admin"><IShield />ניהול ואישורים</NavLink>}
              <button onClick={() => supabase.auth.signOut()}><ILogout />לצאת</button>
            </nav>
          </aside>
        </div>
      )}

      {children}

      <AiButton fab />
      <nav className="tabbar" aria-label="ניווט">
        {PRIMARY.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={22} /><span>{n.label}</span></NavLink>)}
      </nav>
    </div>
  )
}
