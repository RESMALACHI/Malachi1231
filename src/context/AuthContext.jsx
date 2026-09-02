import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { AGENTS, DEFAULT_AGENT, needsPin } from '../lib/agents'

const AuthContext = createContext(null)

const SELECTED_AGENT_KEY = 'mt_selected_agent'
// Per-tab flag: has the user picked an agent on the welcome screen this session?
const AGENT_CONFIRMED_KEY = 'mt_agent_confirmed'
// Which profiles this device has already unlocked. PERMANENT, by request: a
// code is asked once per person per device and never again — including after
// switching to somebody else and back, which used to re-lock it.
const UNLOCKED_KEY = 'mt_unlocked_agents'

function readUnlocked() {
  try {
    const v = JSON.parse(localStorage.getItem(UNLOCKED_KEY))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Which agent's meetings are currently being viewed.
  const [selectedAgent, setSelectedAgentState] = useState(() => {
    const saved = localStorage.getItem(SELECTED_AGENT_KEY)
    return saved && AGENTS.includes(saved) ? saved : DEFAULT_AGENT
  })

  const setSelectedAgent = useCallback((name) => {
    setSelectedAgentState(name)
    localStorage.setItem(SELECTED_AGENT_KEY, name)
  }, [])

  // Whether the user has picked an agent on the welcome screen this session.
  const [agentConfirmed, setAgentConfirmed] = useState(
    () => sessionStorage.getItem(AGENT_CONFIRMED_KEY) === 'true'
  )

  const [unlockedAgents, setUnlockedAgents] = useState(readUnlocked)

  const unlockAgent = useCallback((name) => {
    setUnlockedAgents((prev) => {
      if (prev.includes(name)) return prev
      const next = [...prev, name]
      try {
        localStorage.setItem(UNLOCKED_KEY, JSON.stringify(next))
      } catch {
        /* a blocked storage costs a re-ask, not access */
      }
      return next
    })
  }, [])

  /** Can this profile be entered without asking for anything? */
  const isUnlocked = useCallback(
    (name) => !needsPin(name) || unlockedAgents.includes(name),
    [unlockedAgents]
  )

  // Called from the welcome screen — sets the agent and enters the app.
  const confirmAgent = useCallback(
    (name) => {
      setSelectedAgent(name)
      sessionStorage.setItem(AGENT_CONFIRMED_KEY, 'true')
      setAgentConfirmed(true)
    },
    [setSelectedAgent]
  )

  // Load (or refresh) the user's profile row.
  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[meeting-tracker] failed to load profile:', error.message)
      setProfile(null)
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    let active = true

    // Initial session (e.g. after a reload).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => {
        if (active) setLoading(false)
      })
    })

    // React to sign-in / sign-out / token refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      loadProfile(newSession?.user?.id)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  /**
   * Sign in by answering the team question.
   *
   * The answer is checked by the `team-login` Edge Function, never here: a check
   * in the browser would be decorative, since the bundle carries the public anon
   * key and anyone could query the database around it. The function returns a
   * real session for the shared account, which is what RLS and every other
   * Edge Function require.
   *
   * Sessions persist, so this is asked once per device — not once per visit.
   */
  const signInWithPin = useCallback(async (answer) => {
    const { data, error } = await supabase.functions.invoke('team-login', {
      body: { answer },
    })
    // A wrong answer comes back as a 401, which supabase-js surfaces as `error`.
    if (error || !data?.access_token) return { ok: false }

    const { error: sessErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    if (sessErr) return { ok: false }
    return { ok: true }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      isAdmin: profile?.role === 'admin',
      loading,
      isSupabaseConfigured,
      agents: AGENTS,
      selectedAgent,
      setSelectedAgent,
      agentConfirmed,
      confirmAgent,
      unlockAgent,
      isUnlocked,
      signInWithPin,
      reloadProfile: () => loadProfile(session?.user?.id),
    }),
    [
      session,
      profile,
      loading,
      selectedAgent,
      setSelectedAgent,
      agentConfirmed,
      confirmAgent,
      unlockAgent,
      isUnlocked,
      signInWithPin,
      loadProfile,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
