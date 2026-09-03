import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Video,
  Users,
  Search,
  X,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import MonthFilter from '../components/MonthFilter'
import MeetingCalendar from '../components/MeetingCalendar'
import ManagerCalendar from '../components/ManagerCalendar'
import ManagerDayModal from '../components/ManagerDayModal'
import DayMeetingsModal from '../components/DayMeetingsModal'
import MeetingDetailModal from '../components/MeetingDetailModal'
import { DayView, WeekView } from '../components/DayWeekView'
import Spinner from '../components/Spinner'
import {
  monthLabel,
  monthRange,
  dayRange,
  weekRange,
  weekLabel,
  isSameDay,
  formatDay,
  formatTime,
  formatFullDay,
} from '../lib/dateUtils'
import {
  getMeetingsInRange,
  getAllMeetingsInRange,
  getMeetingById,
  searchMeetings,
  transferMeeting,
  updateMeetingStatus,
  updateMeetingType,
} from '../services/meetingsService'
import { syncMonth, FeedConfigError } from '../services/syncService'
import { getNoShowModel } from '../services/riskService'
import GoalCard from '../components/GoalCard'
import { isAdminAgent, isFieldAgent, isManagerAgent, managerViewOnly, REAL_AGENTS } from '../lib/agents'
import { STATUS_TONE, solidChip } from '../lib/calendarTheme'

// How often the view re-reads meetings from the DB. The heavy iCal sync runs
// on the SERVER (sync-meetings cron, every 5 min) — the browser only does this
// cheap read, which is what keeps the app smooth on weak office machines.
const REFRESH_MS = 60_000

const RESULT_STATUS = {
  attended: { label: 'הגיע', cls: 'bg-green-100 text-green-700' },
  no_show: { label: 'לא הגיע', cls: 'bg-red-100 text-red-700' },
  pending: { label: 'טרם עודכן', cls: 'bg-slate-100 text-slate-600' },
}

const VIEWS = [
  { key: 'day', label: 'יום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
]

/** Segmented יום · שבוע · חודש switch. */
function ViewToggle({ view, onChange }) {
  return (
    <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-white p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 sm:py-1.5 ${
            view === v.key
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

/**
 * שלי · כל הסוכנים — shown only to someone who is BOTH an agent and a manager.
 *
 * A manager who does not sell has no "שלי" to show, and an agent who does not
 * manage has no business seeing everyone. The switch exists exactly where both
 * are true.
 */
function ScopeToggle({ all, onChange }) {
  return (
    <div className="inline-flex shrink-0 rounded-xl border border-indigo-200 bg-white p-0.5">
      {[
        [false, 'שלי'],
        [true, 'כל הסוכנים'],
      ].map(([val, label]) => (
        <button
          key={label}
          onClick={() => onChange(val)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 sm:py-1.5 ${
            all === val ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Results list — each row says which month it's from, since search spans all. */
function SearchResults({ results, searching, showAgent, onPick }) {
  if (searching && results.length === 0) {
    return (
      <div className="card py-12">
        <Spinner label="מחפש…" />
      </div>
    )
  }
  if (results.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-12 text-center">
        <Search className="h-8 w-8 text-slate-300" aria-hidden="true" />
        <p className="text-sm text-slate-500">לא נמצאו פגישות תואמות</p>
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <span className="text-sm font-bold text-slate-700">תוצאות החיפוש</span>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          {searching && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {results.length} פגישות
        </span>
      </div>
      <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
        {results.map((m, i) => {
          const d = new Date(m.meeting_date)
          const st = RESULT_STATUS[m.status] || RESULT_STATUS.pending
          const Icon = m.type === 'zoom' ? Video : Users
          return (
            <button
              key={m.id}
              onClick={() => onPick(m)}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              className="flex w-full animate-fade-up items-center gap-3 px-5 py-3 text-right transition-colors hover:bg-slate-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-800">
                  {m.title || '(ללא כותרת)'}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="tabular-nums">
                    {formatDay(d)} · {formatTime(m.meeting_date)}
                  </span>
                  {showAgent && m.agent_name && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      {m.agent_name}
                    </span>
                  )}
                  {/* Say so when the hit is only in the details — otherwise a
                      result with no visible match looks like a bug. */}
                  {!m.inTitle && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-600">
                      נמצא בתוכן הפגישה
                    </span>
                  )}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
                {st.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AgentDashboard() {
  const { user, selectedAgent } = useAuth()

  // `anchor` is the single source of truth for "where am I in time": the month
  // view reads its month, the week/day views read its week/day. Keeping one
  // date (rather than a period + a separate cursor) is what stops the two from
  // ever drifting apart when you page across a month boundary.
  const [anchor, setAnchor] = useState(() => new Date())
  const [view, setView] = useState('month') // 'day' | 'week' | 'month'
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const setPeriod = useCallback(({ year: y, month: m }) => setAnchor(new Date(y, m, 1)), [])

  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [banner, setBanner] = useState(null) // { type: 'success'|'error'|'reauth', text }
  const [savingIds, setSavingIds] = useState(() => new Set())
  const [selectedDate, setSelectedDate] = useState(null) // open day list
  const [selectedMeetingId, setSelectedMeetingId] = useState(null) // open detail
  const [lastSynced, setLastSynced] = useState(null)

  // Search runs across ALL months — "where's that meeting with דני?" rarely
  // knows which month it was in. Collapsed to a button until asked for.
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = not searching
  const [searching, setSearching] = useState(false)
  const searchRef = useRef(null)

  const syncingRef = useRef(false) // guards against overlapping syncs
  const autoSyncStopped = useRef(false) // pause auto-sync after a reauth prompt

  // The no-show model — built once from the office's own settled meetings, and
  // null forever if there isn't enough history (the badges just don't appear).
  const [riskModel, setRiskModel] = useState(null)
  useEffect(() => {
    let alive = true
    getNoShowModel().then((m) => alive && setRiskModel(m)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const firstName = (selectedAgent || '').split(' ')[0] || 'סוכן'
  // Someone who only manages always sees everyone; someone who does both
  // starts on their own calendar and can switch. The toggle drives the whole
  // page — the query, the counts, the day modal — so it is one boolean.
  const canSeeAll = isManagerAgent(selectedAgent)
  const canSwitchScope = canSeeAll && isFieldAgent(selectedAgent)
  const [allAgents, setAllAgents] = useState(() => managerViewOnly(selectedAgent))
  const isManager = canSeeAll && allAgents
  const canTransferMeetings = isAdminAgent(selectedAgent)

  // For the manager overview, count only real agents' meetings (not lost/null).
  const displayCount = isManager
    ? meetings.filter((m) => REAL_AGENTS.includes(m.agent_name)).length
    : meetings.length

  // Meetings for the day whose list is open — derived from live state.
  const dayMeetings = useMemo(() => {
    if (!selectedDate) return []
    return meetings
      .filter((m) => isSameDay(new Date(m.meeting_date), selectedDate))
      .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))
  }, [meetings, selectedDate])

  // The meeting shown in the detail modal — derived so toggles reflect live.
  const selectedMeeting = useMemo(
    () => meetings.find((m) => m.id === selectedMeetingId) || null,
    [meetings, selectedMeetingId]
  )

  // Opening the box should let you type straight away.
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  /** Close and clear — clearing the query returns the calendar. */
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
  }, [])

  // Debounced search — one query after typing settles, not one per keystroke.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    let alive = true
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const found = await searchMeetings(selectedAgent, q, { allAgents: isManager })
        if (alive) setResults(found)
      } catch {
        if (alive) setResults([])
      } finally {
        if (alive) setSearching(false)
      }
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, selectedAgent, isManager])

  /**
   * Open a result. It may live in another month, so jump the period there first —
   * the detail modal reads from the loaded month, and would otherwise find nothing.
   */
  const openResult = useCallback(
    (m) => {
      const d = new Date(m.meeting_date)
      // Move the anchor onto the meeting itself — that lands whichever view is
      // active (day / week / month) on it, not just the right month.
      setAnchor(d)
      if (isManager) setSelectedDate(d)
      else setSelectedMeetingId(m.id)
      closeSearch() // back to the calendar; the modal opens once the range loads
    },
    [isManager, closeSearch]
  )

  // Deep link from the global search: /?meeting=<id> (or a legacy
  // /calendar?meeting= link) lands the calendar on that meeting — same path a
  // local search result takes. Consumed once and stripped so back/refresh
  // don't re-open it.
  const [urlParams, setUrlParams] = useSearchParams()
  const wantedMeetingId = urlParams.get('meeting')
  useEffect(() => {
    if (!wantedMeetingId) return
    // The URL is stripped only AFTER the fetch settles — stripping first
    // re-runs this effect and would cancel the fetch it belongs to.
    getMeetingById(wantedMeetingId)
      .then((m) => {
        if (m) openResult(m)
      })
      .catch(() => {})
      .finally(() => setUrlParams({}, { replace: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedMeetingId])

  // The exact window the current view shows.
  const range = useMemo(() => {
    if (view === 'day') return dayRange(anchor)
    if (view === 'week') return weekRange(anchor)
    return monthRange(year, month)
  }, [view, anchor, year, month])

  const periodLabel =
    view === 'day' ? formatFullDay(anchor) : view === 'week' ? weekLabel(anchor) : monthLabel(year, month)

  /** Step the anchor by whole days or weeks. Crossing a month boundary just
   *  moves the anchor — the month filter reads from it, so they stay in step. */
  const step = useCallback(
    (dir) => {
      setAnchor((prev) => {
        const next = new Date(prev)
        next.setDate(next.getDate() + dir * (view === 'week' ? 7 : 1))
        return next
      })
    },
    [view]
  )

  // Load meetings from the DB. `background` skips the full-page spinner so an
  // auto-sync refresh updates the grid in place.
  const loadMeetings = useCallback(
    async ({ background = false } = {}) => {
      if (!user) return
      if (!background) {
        setLoading(true)
        setLoadError(null)
      }
      try {
        // Load exactly the window on screen — a week may straddle two months,
        // so a month-scoped query would hide half of it.
        const { timeMin, timeMax } = range
        // Follows the scope switch, not the role: ויטלי toggling to
        // "כל הסוכנים" has to actually fetch everyone, and back again.
        const data = isManager
          ? await getAllMeetingsInRange(timeMin, timeMax)
          : await getMeetingsInRange(selectedAgent, timeMin, timeMax)
        setMeetings(data)
      } catch (err) {
        if (!background) setLoadError(err.message || 'שגיאה בטעינת הפגישות')
      } finally {
        if (!background) setLoading(false)
      }
    },
    [user, selectedAgent, range, isManager]
  )

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  const handleTransfer = useCallback(
    async (meeting, targetAgent) => {
      if (!canTransferMeetings) return
      setSavingIds((prev) => new Set(prev).add(meeting.id))
      try {
        const updated = await transferMeeting(meeting.id, targetAgent)
        setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
        setBanner({ type: 'success', text: `הפגישה הועברה ל${targetAgent}` })
        return updated
      } catch (err) {
        setBanner({ type: 'error', text: err.message || 'לא הצלחנו להעביר את הפגישה' })
        throw err
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev)
          next.delete(meeting.id)
          return next
        })
      }
    },
    [canTransferMeetings]
  )

  // Core sync. silent=true (auto-sync): no success banner, and no nagging when
  // the Google token is simply absent.
  const runSync = useCallback(
    async ({ silent }) => {
      if (syncingRef.current || !user) return

      syncingRef.current = true
      setSyncing(true)
      if (!silent) setBanner(null)
      try {
        const r = await syncMonth({
          agentId: user.id,
          year,
          month,
        })
        setLastSynced(new Date())
        // A feed that didn't answer is shown even on a silent auto-sync: the
        // month is then only partly synced, and staying quiet about it is how a
        // broken calendar goes unnoticed for weeks.
        if (r.incomplete) {
          setBanner({
            type: 'error',
            text: `סנכרון חלקי — יומן ${r.failedFeeds.join(', ')} לא נענה. הפגישות ממנו לא עודכנו (ולא נמחקו). נסו שוב או בדקו את קישור היומן.`,
          })
        } else if (!silent) {
          setBanner({
            type: 'success',
            text: `סנכרון הושלם: ${r.inserted} חדשות, ${r.updated} עודכנו, ${r.deleted} נמחקו, ${r.skipped} ללא שינוי.`,
          })
        }
        if (r.inserted || r.updated || r.deleted) {
          await loadMeetings({ background: true })
        }
      } catch (err) {
        if (err instanceof FeedConfigError) {
          autoSyncStopped.current = true // stop hammering until configured
          setBanner({ type: 'config', text: err.message })
        } else if (!silent) {
          setBanner({ type: 'error', text: err.message || 'הסנכרון נכשל' })
        }
      } finally {
        syncingRef.current = false
        setSyncing(false)
      }
    },
    [user, selectedAgent, year, month, loadMeetings]
  )

  // Light auto-refresh: re-read the DB on an interval and when the tab regains
  // focus. The calendars themselves are synced server-side by the sync-meetings
  // cron — no browser ever fetches or parses an iCal feed automatically again.
  // The manual "סנכרן" button still runs a full client sync on demand.
  useEffect(() => {
    if (!user) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadMeetings({ background: true })
    }, REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadMeetings({ background: true })
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, loadMeetings])

  const markSaving = (id, on) =>
    setSavingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // Optimistic field update with rollback on failure.
  const patchMeeting = async (meeting, field, value, persist) => {
    const previous = meeting[field]
    if (previous === value) return
    setMeetings((prev) =>
      prev.map((m) => (m.id === meeting.id ? { ...m, [field]: value } : m))
    )
    markSaving(meeting.id, true)
    try {
      await persist(meeting.id, value)
    } catch (err) {
      // rollback
      setMeetings((prev) =>
        prev.map((m) => (m.id === meeting.id ? { ...m, [field]: previous } : m))
      )
      setBanner({ type: 'error', text: err.message || 'שמירה נכשלה' })
    } finally {
      markSaving(meeting.id, false)
    }
  }

  // Desktop keyboard paging: in RTL "forward" is the LEFT chevron, so ArrowLeft
  // advances and ArrowRight goes back — the keys mirror the on-screen arrows.
  // Silent while typing, searching, or with a modal open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (searchOpen || selectedDate || selectedMeetingId) return
      const dir = e.key === 'ArrowLeft' ? 1 : -1
      if (view === 'month') {
        setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1))
      } else {
        step(dir)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, step, searchOpen, selectedDate, selectedMeetingId])

  const handleStatusChange = (meeting, status) =>
    patchMeeting(meeting, 'status', status, updateMeetingStatus)

  const handleTypeChange = (meeting, type) =>
    patchMeeting(meeting, 'type', type, updateMeetingType)

  return (
    <div className="flex flex-col gap-5">
      {/* Page header: greeting + prominent sync */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">
            <span className="text-gradient">שלום, {firstName}</span>{' '}
            <span className="inline-block origin-bottom-right animate-wiggle">👋</span>
          </h1>
          <p className="text-sm text-slate-500">
            {isManager ? 'סקירת כלל הפגישות · ' : 'הפגישות שלך · '}
            {periodLabel}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            onClick={() => runSync({ silent: false })}
            disabled={syncing}
            className="btn-gradient"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {syncing ? 'מסנכרן…' : 'סנכרן יומן'}
          </button>
          <span className="text-center text-xs text-slate-400 sm:text-right">
            {syncing
              ? 'מסנכרן…'
              : lastSynced
                ? `סנכרון אוטומטי · עודכן ${formatTime(lastSynced)}`
                : 'סנכרון אוטומטי פעיל'}
          </span>
        </div>
      </div>

      {/* The agent's day against their target — hidden in the all-agents view,
          where there is no single person's goal to show. */}
      {!isManager && <GoalCard agentName={selectedAgent} />}

      {/* Filter · search · count. The search sits to the right of the count
          (first child = rightmost in RTL) and expands in place when opened. */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        {/* Month view pages by month; day/week page by day/week. */}
        {view === 'month' ? (
          <MonthFilter
            year={year}
            month={month}
            onChange={setPeriod}
            disabled={loading || syncing}
          />
        ) : (
          <div className="inline-flex items-center gap-1.5">
            <button
              onClick={() => step(-1)}
              aria-label={view === 'week' ? 'שבוע קודם' : 'יום קודם'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              היום
            </button>
            <button
              onClick={() => step(1)}
              aria-label={view === 'week' ? 'שבוע הבא' : 'יום הבא'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:flex-nowrap">
          {/* First child = rightmost in RTL — the scope switch sits furthest
              right, beside the day/week/month one. */}
          {canSwitchScope && <ScopeToggle all={allAgents} onChange={setAllAgents} />}
          <ViewToggle view={view} onChange={setView} />

          {searchOpen ? (
            <div className="relative flex-1 sm:w-64">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
                placeholder="שם לקוח, טלפון או תוכן…"
                className="w-full rounded-xl border border-amber-400 bg-white px-4 py-2 pe-10 text-sm outline-none"
              />
              <button
                onClick={closeSearch}
                aria-label="סגירת החיפוש"
                className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700 active:scale-95 sm:w-44 sm:flex-none"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              חיפוש פגישה
            </button>
          )}

          <div className="inline-flex shrink-0 items-center gap-2 text-sm text-slate-500">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {isManager ? `סה"כ ${displayCount} פגישות` : `${displayCount} פגישות`}
          </div>
        </div>
      </div>

      {/* Banner */}
      {banner && <Banner banner={banner} />}

      {/* Content — search results take over the calendar while searching */}
      {results !== null ? (
        <SearchResults
          results={results}
          searching={searching}
          showAgent={isManager}
          onPick={openResult}
        />
      ) : loading ? (
        <div className="card py-16">
          <Spinner label="טוען פגישות…" />
        </div>
      ) : loadError ? (
        <div className="card p-4 text-sm text-red-700">{loadError}</div>
      ) : view === 'day' ? (
        <>
          <DayView
            date={anchor}
            meetings={meetings}
            showAgent={isManager}
            riskModel={isManager ? null : riskModel}
            // The manager has no per-meeting editor — send him to the day panel,
            // which is where his per-agent breakdown lives.
            onPick={(m) => (isManager ? setSelectedDate(new Date(m.meeting_date)) : setSelectedMeetingId(m.id))}
          />
          {/* The grid colours meetings by attendance, so the key belongs here
              too — not only under the month view it started in. */}
          <Legend />
        </>
      ) : view === 'week' ? (
        <>
          <WeekView
            anchor={anchor}
            meetings={meetings}
            showAgent={isManager}
            riskModel={isManager ? null : riskModel}
            onPick={(m) => (isManager ? setSelectedDate(new Date(m.meeting_date)) : setSelectedMeetingId(m.id))}
          />
          <Legend />
        </>
      ) : isManager ? (
        <ManagerCalendar
          year={year}
          month={month}
          meetings={meetings}
          onSelectDay={setSelectedDate}
        />
      ) : (
        <>
          <MeetingCalendar
            year={year}
            month={month}
            meetings={meetings}
            riskModel={riskModel}
            onSelectDay={setSelectedDate}
            onSelectMeeting={(m) => setSelectedMeetingId(m.id)}
          />
          <Legend />
        </>
      )}

      {/* Manager: that day's meetings grouped by agent */}
      {isManager && selectedDate && (
        <ManagerDayModal
          date={selectedDate}
          meetings={dayMeetings}
          onClose={() => setSelectedDate(null)}
          canTransfer={canTransferMeetings}
          onTransfer={handleTransfer}
          savingId={savingIds.values().next().value}
        />
      )}

      {/* Day list — opens a meeting's detail on tap */}
      {!isManager && selectedDate && (
        <DayMeetingsModal
          date={selectedDate}
          meetings={dayMeetings}
          riskModel={riskModel}
          onClose={() => setSelectedDate(null)}
          onStatusChange={handleStatusChange}
          onSelectMeeting={(m) => {
            setSelectedMeetingId(m.id)
            setSelectedDate(null)
          }}
        />
      )}

      {/* Single meeting — detailed view with big buttons */}
      {!isManager && selectedMeeting && (
        <MeetingDetailModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeetingId(null)}
          onStatusChange={handleStatusChange}
          onTypeChange={handleTypeChange}
          saving={savingIds.has(selectedMeeting.id)}
          agentName={selectedAgent}
          allAgents={isManager}
        />
      )}
    </div>
  )
}

function Legend() {
  // Swatches are the actual chip fills from the shared calendar theme — a key
  // painted in different colours than the thing it explains is worse than none.
  const swatch = (key) => (
    <span
      className="h-3.5 w-3.5"
      style={solidChip(STATUS_TONE[key], { radius: 5 })}
      aria-hidden="true"
    />
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        {swatch('attended')}
        הגיע
      </span>
      <span className="inline-flex items-center gap-1.5">
        {swatch('no_show')}
        לא הגיע
      </span>
      <span className="inline-flex items-center gap-1.5">
        {swatch('pending')}
        טרם עודכן
      </span>
      <span className="mx-1 hidden h-3 w-px bg-slate-200 sm:inline-block" />
      <span className="inline-flex items-center gap-1.5">
        <Video className="h-3.5 w-3.5" aria-hidden="true" />
        זום
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        פרונטלי
      </span>
      <span className="hidden text-slate-400 sm:ms-auto sm:inline">
        לחיצה על פגישה פותחת אותה · חיצי המקלדת מדפדפים קדימה ואחורה
      </span>
    </div>
  )
}

function Banner({ banner, onReauth }) {
  const styles = {
    success: 'border-green-200 bg-green-50 text-green-800',
    error: 'border-red-200 bg-red-50 text-red-700',
    reauth: 'border-amber-200 bg-amber-50 text-amber-800',
    config: 'border-amber-200 bg-amber-50 text-amber-800',
  }
  const Icon = banner.type === 'success' ? CheckCircle2 : AlertTriangle
  return (
    <div
      className={`flex animate-fade-up items-center justify-between gap-3 rounded-xl border p-3 text-sm ${styles[banner.type]}`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {banner.text}
      </span>
      {banner.type === 'reauth' && (
        <button onClick={onReauth} className="btn-ghost shrink-0 text-amber-800">
          התחבר מחדש
        </button>
      )}
    </div>
  )
}
