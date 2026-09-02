import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { applyRoster } from './lib/agents.js'
import { applyTheme, savedTheme } from './lib/theme.js'
import { readRosterCache } from './services/rosterService.js'
import './index.css'

// The roster goes in BEFORE the first render.
//
// Half the app reads the agent list at module load — the welcome screen, the
// sidebar, the reports — so a roster that arrives after mounting would be a
// render late everywhere. The cached copy is applied synchronously here; the
// live one is fetched by SettingsContext once there is a session, and only
// forces a reload if it actually differs.
applyRoster(readRosterCache())

// Same reasoning as the roster: the theme goes on <html> before React paints,
// or every load flashes daylight at someone who chose night.
applyTheme(savedTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Outside the router and the providers on purpose: a crash in any of them
        would otherwise still blank the screen with nothing to click. */}
    <ErrorBoundary>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

// Register the offline shell — production only. In dev a service worker would
// sit in front of Vite's module server and serve yesterday's code, which is a
// miserable way to spend an afternoon.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // A failed registration costs offline support and notifications, not the
      // app — so it is logged and swallowed rather than surfaced.
      console.warn('[sw] registration failed:', err)
    })
  })
}
