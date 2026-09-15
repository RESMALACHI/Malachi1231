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
import { getNav, saveNav } from '../services/settingsService'
import { getRoster, writeRosterCache } from '../services/rosterService'
import { applyRoster, isAdminAgent, isManagerAgent } from '../lib/agents'
import { decide, ruleFor, withLegacyHidden } from '../lib/access'

const SettingsContext = createContext(null)

// Refresh interval so control-panel changes reach every user. Settings rarely
// change — a slow poll is plenty, and it keeps weak machines free of busywork.
const POLL_MS = 120_000
// The last-known menu settings, so a reload applies them INSTANTLY (no flash of
// a page that's supposed to be hidden) before Supabase responds.
const HIDDEN_CACHE_KEY = 'mt_hidden_pages'
const ACCESS_CACHE_KEY = 'mt_access'

function readCache(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v && typeof v === 'object' ? v : fallback
  } catch {
    return fallback
  }
}
function writeCache(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/**
 * App-wide settings, shared via Supabase so the admin's ניהול page affects
 * everyone: which pages each person sees and which actions they may use
 * (lib/access.js), and the old list of pages hidden for all.
 */
export function SettingsProvider({ children }) {
  const { user, selectedAgent } = useAuth()
  // Seeded from the cache so hidden pages are already hidden on first paint.
  const [hiddenPages, setHiddenPages] = useState(() => {
    const v = readCache(HIDDEN_CACHE_KEY, [])
    return Array.isArray(v) ? v : []
  })
  const [access, setAccess] = useState(() => readCache(ACCESS_CACHE_KEY, {}))
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(false)

  const load = useCallback(async ({ background = false } = {}) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!background) setLoading(true)
    try {
      const nav = await getNav()
      setHiddenPages(nav.hidden)
      setAccess(nav.access)
      writeCache(HIDDEN_CACHE_KEY, nav.hidden)
      writeCache(ACCESS_CACHE_KEY, nav.access)
    } catch {
      /* ignore — the cached (or default) settings stand */
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

  /**
   * Save who-sees-what — optimistically, and cached at once. Pages the old
   * "hidden" list switched off stay hidden (withLegacyHidden).
   */
  const saveAccess = useCallback(
    async (next) => {
      const { access: merged, hidden } = withLegacyHidden(next, hiddenPages)
      setAccess(merged)
      setHiddenPages(hidden)
      writeCache(ACCESS_CACHE_KEY, merged)
      writeCache(HIDDEN_CACHE_KEY, hidden)
      await saveNav({ hidden, access: merged })
    },
    [hiddenPages]
  )

  const value = useMemo(() => {
    const who = { name: selectedAgent, isAdmin: isAdminAgent(selectedAgent), isManager: isManagerAgent(selectedAgent) }
    return {
      hiddenPages,
      access,
      loading,
      /** May the person using this device see this page / use this action? */
      can: (key) => decide(ruleFor(key, access, hiddenPages), who),
      /** The rule in force for an item — for the ניהול page. */
      ruleOf: (key) => ruleFor(key, access, hiddenPages),
      saveAccess,
      refresh: () => load({ background: true }),
    }
  }, [hiddenPages, access, loading, selectedAgent, saveAccess, load])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
