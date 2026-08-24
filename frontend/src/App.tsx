import { Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { CompareProvider } from './context/CompareContext'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Login from './auth/Login'
import Register from './auth/Register'
import AdminRoute from './admin/AdminRoute'
import AdminDashboard from './admin/AdminDashboard'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyPage from './pages/PropertyPage'
import AnalysisPage from './pages/AnalysisPage'
import CmhcUnderwritingPage from './pages/CmhcUnderwritingPage'
import Settings from './pages/Settings'
import SavedProperties from './pages/SavedProperties'
import SavedSearches from './pages/SavedSearches'
import MarketAlerts from './pages/MarketAlerts'
import Reports from './pages/Reports'
import Compare from './pages/Compare'

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <CompareProvider>
          <Routes>
            {/* Landing / greeting — outside the sidebar layout, public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* App — inside the sidebar layout, requires an authenticated session */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route path="dashboard"      element={<Dashboard />} />
                <Route path="properties"     element={<Properties />} />
                <Route path="properties/:id" element={<PropertyPage />} />
                <Route path="analyze/:id"    element={<AnalysisPage />} />
                <Route path="underwriting/:id" element={<CmhcUnderwritingPage />} />
                <Route path="watching"       element={<SavedProperties />} />
                <Route path="saved"          element={<SavedProperties />} />
                <Route path="alerts"         element={<MarketAlerts />} />
                <Route path="reports"        element={<Reports />} />
                <Route path="compare"        element={<Compare />} />
                <Route path="searches"       element={<SavedSearches />} />
                <Route path="settings"       element={<Settings />} />
                <Route element={<AdminRoute />}>
                  <Route path="admin"        element={<AdminDashboard />} />
                </Route>
                <Route path="*"              element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </Routes>
        </CompareProvider>
      </LanguageProvider>
    </AuthProvider>
  )
}
