import { Suspense, createContext, lazy, useContext, useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Profile, Topic, probeMediaCols, supabase } from './lib'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import TopicPage from './pages/Topic'
import Library from './pages/Library'
import ItemPage from './pages/Item'
import Internal from './pages/Internal'
import Teams from './pages/Teams'
import TeamDetail from './pages/TeamDetail'
import Ask from './pages/Ask'
import Admin from './pages/Admin'
import Topics from './pages/Topics'
import BudgetPage from './pages/Budget'
import Me from './pages/Me'
import Leaderboard from './pages/Leaderboard'
import { PointsPill, Toaster } from './components/points'
import { IBook, ICar, IChat, IClose, IGrid, IHome, ILogout, IMenu, INews, IPlay, IShield, ITrophy, IUser, IUsers, IWallet } from './components/icons'
import { Avatar } from './components/Avatar'

// Pages built separately load lazily; a route appears only once its file exists.
const pageModules = import.meta.glob(['./pages/Feed.tsx', './pages/TeamAgent.tsx', './pages/Doc.tsx'])
const lazyPage = (path: string) =>
  pageModules[path] ? lazy(pageModules[path] as () => Promise<{ default: React.ComponentType }>) : null
const Feed = lazyPage('./pages/Feed.tsx')
const TeamAgent = lazyPage('./pages/TeamAgent.tsx')
const Doc = lazyPage('./pages/Doc.tsx')
const Drive = lazy(() => import('./pages/Drive'))
const page = (P: React.ComponentType | null) =>
  P ? <Suspense fallback={<div className="skeleton" style={{ marginTop: 28 }} />}><P /></Suspense> : <Home />

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
      <Shell profile={profile}>
        <main className="container main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/feed" element={page(Feed)} />
            <Route path="/agent" element={page(TeamAgent)} />
            <Route path="/doc/:id" element={page(Doc)} />
            <Route path="/drive" element={page(Drive)} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/topic/:slug" element={<TopicPage />} />
            <Route path="/library" element={<Library />} />
            <Route path="/item/:id" element={<ItemPage />} />
            <Route path="/internal" element={<Internal />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/me" element={<Me />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Home />} />
          </Routes>
          <footer className="footer">
            <div className="footer-brand"><b>zap UP</b> <bdi dir="ltr">Learn. Level Up. zap.</bdi></div>
            <p>
              <bdi dir="ltr">zap KNOW</bdi>, מרכז הלמידה והידע של zap. התקצירים נכתבים ב-AI מתוך מידע פומבי, וכל פריט מוביל למקור.
              מצאתם טעות? בכל פריט יש "דווח על טעות".
            </p>
          </footer>
        </main>
      </Shell>
      <Toaster />
    </AppCtx.Provider>
  )
}

// Primary destinations stay in the header; everything else lives in the "עוד" menu, so the nav
// is always one line. Below 1024px the header collapses to a drawer and the bottom tab bar.
const PRIMARY = [
  { to: '/', label: 'הבית', icon: IHome, end: true },
  { to: '/feed', label: 'פיד', icon: IPlay },
  { to: '/agent', label: 'שאלו את הצוותים', icon: IUsers },
  { to: '/topics', label: 'נושאים', icon: IGrid },
  { to: '/leaderboard', label: 'הטבלה', icon: ITrophy },
]

function Shell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const loc = useLocation()
  useEffect(() => { setOpen(false); setMore(false) }, [loc.pathname])

  const secondary = [
    { to: '/me', label: 'האזור שלי', icon: IUser },
    { to: '/drive', label: 'אני בדרך', icon: ICar },
    { to: '/library', label: 'מאגר', icon: IBook },
    { to: '/internal', label: 'קורה ב-zap', icon: INews },
    { to: '/ask', label: 'שאלו את zap UP', icon: IChat },
    { to: '/teams', label: 'איך עובדים פה', icon: IUsers },
    { to: '/budget', label: 'התקציב שלי', icon: IWallet },
    ...(profile.is_admin ? [{ to: '/admin', label: 'אישורים וניהול', icon: IShield }] : []),
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-in">
          <NavLink to="/" className="brand" aria-label="zap UP, הבית">
            <img src="/zap-know/img/zap-group.svg" alt="zap group" />
            <span className="brand-up">UP</span>
          </NavLink>

          <nav className="topnav" aria-label="ניווט ראשי">
            {PRIMARY.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
            <div className={`more ${more ? 'open' : ''}`}>
              <button className="more-btn" aria-expanded={more} onClick={() => setMore((m) => !m)}>עוד</button>
              {more && (
                <div className="more-menu" role="menu">
                  {secondary.map((n) => <NavLink key={n.to} to={n.to} role="menuitem"><n.icon size={18} />{n.label}</NavLink>)}
                  <button role="menuitem" onClick={() => supabase.auth.signOut()}><ILogout size={18} />יציאה</button>
                </div>
              )}
            </div>
          </nav>

          <div className="topbar-end">
            <PointsPill />
            <NavLink to="/me" className="me-link" aria-label="האזור שלי">
              <Avatar face={{ ...profile, name: profile.display_name || profile.email }} size={34} className="me-avatar-img" />
            </NavLink>
            <button className="icon-btn menu-btn" aria-label="תפריט" aria-expanded={open} onClick={() => setOpen(true)}><IMenu /></button>
          </div>
        </div>
      </header>

      {open && (
        <div className="drawer-wrap" onClick={() => setOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="תפריט">
            <div className="drawer-head">
              <span className="brand"><img src="/zap-know/img/zap-group.svg" alt="zap group" /><span className="brand-up">UP</span></span>
              <button className="icon-btn" aria-label="סגירה" onClick={() => setOpen(false)}><IClose /></button>
            </div>
            <div className="drawer-me">
              <Avatar face={{ ...profile, name: profile.display_name || profile.email }} size={40} />
              <div><b>{profile.display_name || profile.email.split('@')[0]}</b><div className="small muted">{profile.role ?? ''}</div></div>
            </div>
            <nav className="drawer-nav">
              {[...PRIMARY, ...secondary].map((n) => (
                <NavLink key={n.to} to={n.to} end={'end' in n ? Boolean(n.end) : undefined}><n.icon />{n.label}</NavLink>
              ))}
              <button onClick={() => supabase.auth.signOut()}><ILogout />יציאה</button>
            </nav>
          </aside>
        </div>
      )}

      {children}

      <nav className="tabbar" aria-label="ניווט">
        <NavLink to="/feed"><IPlay size={22} /><span>פיד</span></NavLink>
        <NavLink to="/" end><IHome size={22} /><span>הבית</span></NavLink>
        <NavLink to="/agent"><IUsers size={22} /><span>צוותים</span></NavLink>
        <NavLink to="/leaderboard"><ITrophy size={22} /><span>הטבלה</span></NavLink>
        <NavLink to="/me"><IUser size={22} /><span>שלי</span></NavLink>
      </nav>
    </div>
  )
}
