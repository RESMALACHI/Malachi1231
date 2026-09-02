import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import { getHiddenPages, saveHiddenPages } from '../services/settingsService'
import { getRoster, writeRosterCache } from '../services/rosterService'
import { applyRoster } from '../lib/agents'

const SettingsContext = createContext(null)

// Refresh interval so control-panel changes reach every user. Settings rarely
// change — a slow poll is plenty, and it keeps weak machines free of busywork.
const POLL_MS = 120_000
// Cache the last-known hidden list so a reload applies it INSTANTLY (no flash of
// a page that's supposed to be hidden) before Supabase responds.
const HIDDEN_CACHE_KEY = 'mt_hidden_pages'

function readCache() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIDDEN_CACHE_KEY))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function writeCache(hidden) {
  try {
    localStorage.setItem(HIDDEN_CACHE_KEY, JSON.stringify(hidden))
  } catch {
    /* ignore */
  }
}

/**
 * App-wide settings — currently which nav pages are hidden. Shared via Supabase
 * so the admin's control panel affects everyone.
 */
export function SettingsProvider({ children }) {
  const { user } = useAuth()
  // Seed from the cache so hidden pages are already hidden on first paint.
  const [hiddenPages, setHiddenPagesState] = useState(readCache)
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(false)

  const load = useCallback(async ({ background = false } = {}) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!background) setLoading(true)
    try {
      const hidden = await getHiddenPages()
      setHiddenPagesState(hidden)
      writeCache(hidden) // keep the cache in sync with the server
    } catch {
      /* ignore — e.g. migration not run yet; default to nothing hidden */
    }
    try {
      // The roster the admin last saved. Applied and cached, but NOT forced
      // onto the screen: a poll that reloaded the page under someone mid-call
      // would be a worse bug than a sidebar that lists last week's team until
      // their next refresh. The admin's own device reloads when they save.
      const roster = await getRoster()
      if (roster && applyRoster(roster)) writeRosterCache(roster)
    } catch {
      /* ignore — the built-in roster is a working team, not a blank list */
    }
    loadingRef.current = false
    if (!background) setLoading(false)
  }, [])

  useEffect(() => {
    if (!user) return
    load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load({ background: true })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [user, load])

  // Save + optimistically update (and cache immediately).
  const setHidden = useCallback(async (next) => {
    setHiddenPagesState(next)
    writeCache(next)
    await saveHiddenPages(next)
  }, [])

  const value = useMemo(
    () => ({
      hiddenPages,
      loading,
      isHidden: (key) => hiddenPages.includes(key),
      setHidden,
      refresh: () => load({ background: true }),
    }),
    [hiddenPages, loading, setHidden, load]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
