import { Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { CompareProvider } from './context/CompareContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyPage from './pages/PropertyPage'
import AnalysisPage from './pages/AnalysisPage'
import Settings from './pages/Settings'
import SavedProperties from './pages/SavedProperties'
import SavedSearches from './pages/SavedSearches'
import MarketAlerts from './pages/MarketAlerts'
import Reports from './pages/Reports'
import Compare from './pages/Compare'

export default function App() {
  return (
    <LanguageProvider>
      <CompareProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"         element={<Dashboard />} />
            <Route path="properties"        element={<Properties />} />
            <Route path="properties/:id"    element={<PropertyPage />} />
            <Route path="analyze/:id"       element={<AnalysisPage />} />
            <Route path="watching"          element={<SavedProperties />} />
            <Route path="saved"             element={<SavedProperties />} />
            <Route path="alerts"            element={<MarketAlerts />} />
            <Route path="reports"           element={<Reports />} />
            <Route path="compare"           element={<Compare />} />
            <Route path="searches"          element={<SavedSearches />} />
            <Route path="settings"          element={<Settings />} />
          </Route>
        </Routes>
      </CompareProvider>
    </LanguageProvider>
  )
}
