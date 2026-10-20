import { Navigate, useSearchParams } from 'react-router-dom'

// The general chat now lives in the team agent page, which answers both "how does a team work"
// and learning questions. Old /ask links (including ?q=) keep working.
export default function Ask() {
  const [params] = useSearchParams()
  const q = params.get('q')
  return <Navigate to={q ? `/agent?q=${encodeURIComponent(q)}` : '/agent'} replace />
}
