import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Inbox, X } from 'lucide-react'
import { typeIcon } from '../components/MeetingRow'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatDay, formatTime } from '../lib/dateUtils'
import {
  getMeetingsSince,
  getAllMeetingsSince,
  closeTask,
} from '../services/meetingsService'
import { managerViewOnly, REAL_AGENTS } from '../lib/agents'

// Tasks are shown from the start of the season (June 2026) onward, not just the
// current month.
const TASKS_SINCE = new Date(2026, 5, 1).toISOString()

const AGENT_DOT = {
  'ודיע': 'bg-sky-500',
  'מרים': 'bg-rose-500',
  'עדי': 'bg-indigo-500',
  'מלאכי אזערי': 'bg-amber-500',
}

const TONES = {
  green: { header: 'border-green-100 bg-green-50', title: 'text-green-800', badge: 'bg-green-600' },
  red: { header: 'border-red-100 bg-red-50', title: 'text-red-700', badge: 'bg-red-600' },
}

function TaskRow({ meeting, showAgent, index, removing, onClose }) {
  const Icon = typeIcon(meeting.type)
  return (
    <div
      className={`overflow-hidden transition-all duration-300 ${
        removing ? 'max-h-0 -translate-x-4 opacity-0' : 'max-h-40 opacity-100'
      }`}
    >
      <div
        className="flex animate-fade-up items-center gap-3 px-4 py-3"
        style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-800">
            {meeting.title || '(ללא כותרת)'}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span className="tabular-nums">
              {formatDay(meeting.meeting_date)} · {formatTime(meeting.meeting_date)}
            </span>
            {showAgent && meeting.agent_name && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${AGENT_DOT[meeting.agent_name] || 'bg-slate-500'}`}
                />
                {meeting.agent_name}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onClose(meeting)}
            title="סגירת המשימה"
            aria-label="סגירת המשימה"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskColumn({ icon: Icon, title, subtitle, tone, meetings, showAgent, emptyText, removingIds, onCloseTask }) {
  const t = TONES[tone]
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className={`flex items-center justify-between border-b px-5 py-3.5 ${t.header}`}>
        <div>
          <span className={`inline-flex items-center gap-2 font-bold ${t.title}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
            {title}
          </span>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span
          className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold text-white ${t.badge}`}
        >
          {meetings.length}
        </span>
      </div>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-slate-400">
          <Inbox className="h-8 w-8" aria-hidden="true" />
          {emptyText}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {meetings.map((m, i) => (
            <TaskRow
              key={m.id}
              meeting={m}
              showAgent={showAgent}
              index={i}
              removing={removingIds.has(m.id)}
              onClose={onCloseTask}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  const { user, selectedAgent } = useAuth()
  const isManager = managerViewOnly(selectedAgent)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [confirming, setConfirming] = useState(null) // meeting pending close
  const [closingId, setClosingId] = useState(null)
  const [removingIds, setRemovingIds] = useState(() => new Set())
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    if (!user || isManager) return
    setLoading(true)
    setError(null)
    try {
      const data = isManager
        ? (await getAllMeetingsSince(TASKS_SINCE)).filter((m) =>
            REAL_AGENTS.includes(m.agent_name)
          )
        : await getMeetingsSince(selectedAgent, TASKS_SINCE)
      setMeetings(data)
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת המשימות')
    } finally {
      setLoading(false)
    }
  }, [user, isManager, selectedAgent])

  useEffect(() => {
    load()
  }, [load])

  const byDate = (a, b) => new Date(a.meeting_date) - new Date(b.meeting_date)
  const followUps = useMemo(
    () => meetings.filter((m) => m.status === 'attended' && !m.task_done).sort(byDate),
    [meetings]
  )
  const reschedules = useMemo(
    () => meetings.filter((m) => m.status === 'no_show' && !m.task_done).sort(byDate),
    [meetings]
  )

  const handleCloseConfirmed = useCallback(async () => {
    const meeting = confirming
    if (!meeting) return
    setClosingId(meeting.id)
    try {
      await closeTask(meeting.id)
      setConfirming(null)
      setRemovingIds((prev) => new Set(prev).add(meeting.id))
      setToast({ type: 'success', text: 'המשימה נסגרה' })
      // Drop from state after the exit animation.
      setTimeout(() => {
        setMeetings((prev) => prev.filter((m) => m.id !== meeting.id))
      }, 300)
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'סגירת המשימה נכשלה' })
      setConfirming(null)
    } finally {
      setClosingId(null)
    }
  }, [confirming])

  // The manager (איציק) has no tasks page — bounce home.
  if (isManager) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-gradient">משימות</h1>
        <p className="text-sm text-slate-500">
          {isManager ? 'כל הסוכנים' : selectedAgent} · מחודש יוני 2026 ואילך
        </p>
      </div>

      {loading ? (
        <div className="card py-16">
          <Spinner label="טוען משימות…" />
        </div>
      ) : error ? (
        <div className="card p-4 text-sm text-red-700">{error}</div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <TaskColumn
            icon={CheckCircle2}
            title="אחרי פגישה | פולואפ"
            subtitle="לקוחות שהגיעו לפגישה — חזרו אליהם להמשך תהליך"
            tone="green"
            meetings={followUps}
            showAgent={isManager}
            emptyText="אין פגישות לפולואפ החודש"
            removingIds={removingIds}
            onCloseTask={setConfirming}
          />
          <TaskColumn
            icon={XCircle}
            title="לא הגיעו | תיאום מחדש"
            subtitle="לקוחות שלא הגיעו — התקשרו לתאם פגישה חדשה"
            tone="red"
            meetings={reschedules}
            showAgent={isManager}
            emptyText="אין פגישות לתיאום מחדש החודש"
            removingIds={removingIds}
            onCloseTask={setConfirming}
          />
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="לסגור את המשימה?"
          message={`"${confirming.title || 'ללא כותרת'}" תוסר מרשימת המשימות.`}
          confirmLabel="כן, סגור"
          cancelLabel="ביטול"
          busy={closingId === confirming.id}
          onConfirm={handleCloseConfirmed}
          onCancel={() => setConfirming(null)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
