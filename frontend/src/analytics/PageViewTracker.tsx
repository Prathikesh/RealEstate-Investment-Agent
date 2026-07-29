import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { logPageView } from './api'

/** No UI — reports each SPA route change so the admin dashboard can show
 * which pages get used the most. Mounted inside the authenticated app shell. */
export default function PageViewTracker() {
  const { user } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (user) logPageView(location.pathname)
  }, [user, location.pathname])

  return null
}
