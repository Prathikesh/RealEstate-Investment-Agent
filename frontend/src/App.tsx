import { Routes, Route, Navigate } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyPage from './pages/PropertyPage'
import Settings from './pages/Settings'
import WatchingPlaceholder from './pages/WatchingPlaceholder'

export default function App() {
  return (
    <LanguageProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"         element={<Dashboard />} />
          <Route path="properties"        element={<Properties />} />
          <Route path="properties/:id"    element={<PropertyPage />} />
          <Route path="watching"          element={<WatchingPlaceholder />} />
          <Route path="settings"          element={<Settings />} />
        </Route>
      </Routes>
    </LanguageProvider>
  )
}
