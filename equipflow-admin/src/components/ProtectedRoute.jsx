import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import Layout from './Layout'
import Loading from './Loading'

// Wraps every page that needs an admin login. Not signed in? Go to /login, and remember where
// the person was heading so we can send them back after they sign in.
export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading text="Checking your login..." count={1} />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <Layout />
}
