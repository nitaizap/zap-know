import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Profile, Topic, supabase } from './lib'
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
    supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile((data as Profile) ?? null))
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
      <div className="app">
        <div className="texture" />
        <header className="topbar">
          <div className="container">
            <NavLink to="/" className="brand" aria-label="zap UP">
              <img src="/zap-know/img/zap-group.svg" alt="zap group" />
              <span className="brand-name"><b>UP</b><small><bdi dir="ltr">zap KNOW</bdi> · מרכז הלמידה והידע של zap</small></span>
            </NavLink>
            <nav className="topnav">
              <NavLink to="/" end>הבית שלי</NavLink>
              <NavLink to="/topics">נושאים</NavLink>
              <NavLink to="/library">מאגר</NavLink>
              <NavLink to="/internal">קורה ב-zap</NavLink>
              <NavLink to="/teams">איך עובדים פה</NavLink>
              <NavLink to="/ask">שאלו את zap UP</NavLink>
              <NavLink to="/me">האזור שלי</NavLink>
              <NavLink to="/budget">התקציב שלי</NavLink>
              {profile.is_admin && <NavLink to="/admin">אישורים</NavLink>}
            </nav>
            <NavLink to="/me" className="me-link" aria-label="האזור שלי">
              <span className="me-avatar">{(profile.display_name || profile.email).trim().charAt(0).toUpperCase()}</span>
              <span className="me-text">האזור שלי</span>
            </NavLink>
          </div>
        </header>
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
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
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Home />} />
          </Routes>
          <footer className="footer">
            zap UP · Learn. Level Up. zap. · התקצירים נכתבים ב-AI מתוך מידע פומבי על כל קורס ועדכון, וכל פריט מוביל למקור המקורי.
            מצאתם טעות? יש כפתור "דווח על טעות" בכל פריט.
            {' '}
            <button className="chip" style={{ fontSize: 12, padding: '2px 10px' }} onClick={() => supabase.auth.signOut()}>יציאה</button>
          </footer>
        </main>
        <nav className="tabbar">
          <NavLink to="/" end><span className="ico">⌂</span>הבית</NavLink>
          <NavLink to="/topics"><span className="ico">▦</span>נושאים</NavLink>
          <NavLink to="/ask"><span className="ico">✦</span>שאלו</NavLink>
          <NavLink to="/teams"><span className="ico">◎</span>צוותים</NavLink>
          <NavLink to={profile.is_admin ? '/admin' : '/internal'}>
            <span className="ico">{profile.is_admin ? '✓' : '⚑'}</span>{profile.is_admin ? 'אישורים' : 'קורה ב-zap'}
          </NavLink>
        </nav>
      </div>
    </AppCtx.Provider>
  )
}
