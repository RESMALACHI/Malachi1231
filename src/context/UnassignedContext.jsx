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
import { getUnassignedMeetings } from '../services/meetingsService'
import { currentMonth } from '../lib/dateUtils'

const UnassignedContext = createContext(null)

// How often the unassigned list / badge refreshes. Also refreshes on focus, so
// a slower interval doesn't make the Claim Yard feel stale.
const POLL_MS = 60_000

/**
 * Tracks the pool of unassigned meetings (the Claim Yard). Provides the live
 * list + count for the nav badge, polls periodically, and supports optimistic
 * removal when a meeting is claimed.
 */
export function UnassignedProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const loadingRef = useRef(false)

  const refresh = useCallback(async ({ background = false } = {}) => {
    if (!user || loadingRef.current) return
    loadingRef.current = true
    if (!background) setLoading(true)
    try {
      // Only the current month's lost meetings (not previous months).
      const { year, month } = currentMonth()
      const data = await getUnassignedMeetings(year, month)
      setItems(data)
      setError(null)
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת פגישות אבודות')
    } finally {
      loadingRef.current = false
      if (!background) setLoading(false)
    }
  }, [user])

  // Drop a meeting from the local pool immediately (after a successful claim).
  const removeLocally = useCallback((id) => {
    setItems((prev) => prev.filter((m) => m.id !== id))
  }, [])

  useEffect(() => {
    if (!user) {
      setItems([])
      setLoading(false)
      return
    }
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh({ background: true })
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh({ background: true })
    }
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onVisible)
    }
  }, [user, refresh])

  const value = useMemo(
    () => ({ items, count: items.length, loading, error, refresh, removeLocally }),
    [items, loading, error, refresh, removeLocally]
  )

  return <UnassignedContext.Provider value={value}>{children}</UnassignedContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUnassigned() {
  const ctx = useContext(UnassignedContext)
  if (!ctx) throw new Error('useUnassigned must be used within an UnassignedProvider')
  return ctx
}
