import { Navigate } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import Loader from './Loader'

/**
 * A page only for whoever ניהול → עמודים והרשאות lets see it — reached from the
 * menu or typed into the address bar alike. While the settings are still on
 * their way it waits instead of bouncing, so a permission granted since this
 * device last looked is not refused on the first try.
 */
export default function PageGate({ page, children }) {
  const { can, loading } = useSettings()
  if (can(page)) return children
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader label="טוען…" size="lg" />
      </div>
    )
  }
  return <Navigate to="/" replace />
}
