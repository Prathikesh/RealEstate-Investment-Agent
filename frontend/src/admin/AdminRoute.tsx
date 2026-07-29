import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function AdminRoute() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user || user.role !== 'admin') return <Navigate to="/dashboard" replace />

  return <Outlet />
}
