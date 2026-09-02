import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import PatternBackground from './PatternBackground'
import GlobalSearch from './GlobalSearch'
import { LogoMark } from './Logo'
import SkyToggle from './SkyToggle'
import { applyTheme, isDark } from '../lib/theme'
import { UnassignedProvider } from '../context/UnassignedContext'
import { SettingsProvider } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import AgentSelectPage from '../pages/AgentSelectPage'

// The mobile top bar names the page you're on — with the drawer closed there is
// otherwise nothing on a phone that says where you are. Keys match App.jsx routes.
const PAGE_TITLES = {
  '/today': 'היום שלי',
  '/calendar': 'היומן',
  '/leads': 'לידים',
  '/assistant': 'עוזר AI',
  '/manage': 'ניהול',
  '/claim-yard': 'פגישות אבודות',
  '/tasks': 'משימות',
  '/whatsapp': 'ווצאפ',
  '/clients': 'לקוחות',
  '/day-summary': 'סיכום יום',
  '/agents-daily': 'נתונים יומיים',
  '/info': 'מידע שימושי',
  '/speech': 'ספיץ',
  '/objections': 'ספריית התנגדויות',
  '/reports': 'דוחות',
  '/admin': 'ניהול',
}

export default function Layout() {
  const location = useLocation()
  const { agentConfirmed } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Day/night. Applied to <html> so the whole app follows; remembered per device.
  const [dark, setDark] = useState(isDark)
  const setTheme = (on) => {
    setDark(on)
    applyTheme(on ? 'dark' : 'light')
  }

  const pageTitle =
    PAGE_TITLES[location.pathname] ||
    (location.pathname.startsWith('/leads/') ? 'תיק ליד' : null) ||
    'היומן' // the home route — the calendar

  // On route change: close the mobile drawer, and start the new page from the
  // top — an SPA keeps the previous scroll position, which on a phone means
  // landing mid-page with the header out of sight.
  useEffect(() => {
    setDrawerOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  // After login, show the fancy agent picker before entering the app.
  if (!agentConfirmed) return <AgentSelectPage />

  return (
    <UnassignedProvider>
        <SettingsProvider>
        <div className="min-h-screen">
          <PatternBackground />

          {/* Signature brand hairline across the very top */}
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] bg-gradient-to-l from-amber-600 via-yellow-300 to-amber-500"
            aria-hidden="true"
          />

          {/* Right-side navigation (persistent on desktop, drawer on mobile).
              Its brand row carries the day/night switch on desktop; the phone's
              switch stays in the top header below. */}
          <Sidebar
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            dark={dark}
            onTheme={setTheme}
          />

          {/* Content — shifted clear of the sidebar on desktop. */}
          <div className="sm:ms-64">
            {/* Desktop top bar — the persistent quick-search rectangle that
                lives on every page. One box, everything: meetings, leads,
                deals, and the app's own pages. */}
            <header className="sticky top-0 z-30 hidden items-center justify-center border-b border-white/60 bg-white/70 px-6 py-2.5 backdrop-blur-xl sm:flex">
              <GlobalSearch />
              {/* The date is decoration, so it floats at the far end — keeping
                  the search box itself dead-centre over the content. */}
              {/* xl and up only — below that the centred box would run into it. */}
              <span className="absolute end-6 top-1/2 hidden -translate-y-1/2 text-xs font-bold text-slate-400 xl:block">
                {new Date().toLocaleDateString('he-IL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
            </header>

            {/* Mobile top bar */}
            {/* Installed on iOS, the web view runs full-bleed beneath the status
                bar — so this header has to reserve that height itself or the
                clock and battery land on top of the menu button. The inset is 0
                in an ordinary browser tab, so the same rule serves both. */}
            <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/60 bg-white/70 px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur-xl sm:hidden">
              <button
                onClick={() => setDrawerOpen(true)}
                className="btn-ghost shrink-0 px-2"
                aria-label="פתיחת התפריט"
              >
                <Menu className="h-6 w-6" aria-hidden="true" />
              </button>
              <span className="flex min-w-0 items-center gap-2">
                <LogoMark className="h-7 w-7 shrink-0" />
                <span className="truncate text-sm font-extrabold text-slate-900">
                  {pageTitle}
                </span>
              </span>
              <span className="ms-auto shrink-0">
                <SkyToggle dark={dark} onChange={setTheme} />
              </span>
            </header>

            {/* Mobile: the same quick search, a row of its own under the header. */}
            <div className="px-4 pt-3 sm:hidden">
              <GlobalSearch />
            </div>

            {/* The bottom tab bar is gone, so the page no longer needs to
                reserve room for it — just ordinary breathing space. */}
            <main className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 sm:pb-6">
              {/* Re-key on route change so each page animates in. */}
              <div key={location.pathname} className="animate-fade-up">
                <Outlet />
              </div>
            </main>
          </div>

        </div>
        </SettingsProvider>
    </UnassignedProvider>
  )
}
