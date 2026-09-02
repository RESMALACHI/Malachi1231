import { useCallback, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Inbox,
  CalendarClock,
  MapPin,
  CalendarDays,
  UserPlus,
  Trash2,
} from 'lucide-react'
import { typeIcon } from '../components/MeetingRow'
import { useAuth } from '../context/AuthContext'
import { useUnassigned } from '../context/UnassignedContext'
import { claimMeeting, dismissMeeting } from '../services/meetingsService'
import { isAdminAgent, managerViewOnly } from '../lib/agents'
import { formatFullDay, formatTime, currentMonth, monthLabel } from '../lib/dateUtils'
import { cleanDescription } from '../lib/cleanText'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Toast from '../components/Toast'

export default function ClaimYardPage() {
  const { user, selectedAgent } = useAuth()
  const { items, loading, error, removeLocally, refresh } = useUnassigned()

  const [claimingId, setClaimingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [removingIds, setRemovingIds] = useState(() => new Set())
  const [toast, setToast] = useState(null)

  // Only the manager agent may delete lost meetings.
  const canDelete = isAdminAgent(selectedAgent)
  // איציק (the overview manager) has no lost-meetings page.
  const blocked = managerViewOnly(selectedAgent)

  const handleClaim = useCallback(
    async (meeting) => {
      if (claimingId) return
      setClaimingId(meeting.id)
      try {
        const row = await claimMeeting(meeting.id, selectedAgent, user?.id)
        if (!row) {
          // Someone grabbed it first.
          setToast({ type: 'error', text: 'הפגישה כבר שויכה לסוכן אחר' })
          setRemovingIds((prev) => new Set(prev).add(meeting.id))
          setTimeout(() => removeLocally(meeting.id), 300)
          return
        }
        setToast({ type: 'success', text: 'הפגישה שויכה אלייך בהצלחה' })
        // Animate the row out, then drop it from the pool.
        setRemovingIds((prev) => new Set(prev).add(meeting.id))
        setTimeout(() => removeLocally(meeting.id), 300)
      } catch (err) {
        setToast({ type: 'error', text: err.message || 'השיוך נכשל' })
      } finally {
        setClaimingId(null)
      }
    },
    [claimingId, selectedAgent, user, removeLocally]
  )

  const handleDelete = useCallback(
    async (meeting) => {
      if (!canDelete || deletingId) return
      setDeletingId(meeting.id)
      try {
        await dismissMeeting(meeting.id)
        setToast({ type: 'success', text: 'הפגישה האבודה נמחקה' })
        setRemovingIds((prev) => new Set(prev).add(meeting.id))
        setTimeout(() => removeLocally(meeting.id), 300)
      } catch (err) {
        setToast({ type: 'error', text: err.message || 'המחיקה נכשלה' })
      } finally {
        setDeletingId(null)
      }
    },
    [canDelete, deletingId, removeLocally]
  )

  // Manager has no lost-meetings page — bounce home.
  if (blocked) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <span className="text-gradient">פגישות אבודות</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            פגישות שלא שויכו לאף סוכן בחודש {monthLabel(currentMonth().year, currentMonth().month)} — שייכו אליכם את שלכם.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          ישויך לסוכן: {selectedAgent}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="card py-16">
          <Spinner label="טוען פגישות ללא שיוך…" />
        </div>
      ) : error ? (
        <div className="card p-4 text-sm text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Inbox}
            title="אין פגישות הממתינות לשיוך"
            description="כל הפגישות שויכו. פגישות חדשות שלא יזוהו עם סוכן יופיעו כאן אוטומטית."
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((m, i) => {
            const removing = removingIds.has(m.id)
            const Icon = typeIcon(m.type)
            return (
              <li
                key={m.id}
                className={`overflow-hidden transition-all duration-300 ${
                  removing ? 'max-h-0 -translate-x-4 opacity-0' : 'max-h-60 opacity-100'
                }`}
              >
                <div
                  className="card flex animate-fade-up flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  {/* Details */}
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">
                        {m.title || '(ללא כותרת)'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatFullDay(m.meeting_date)} · {formatTime(m.meeting_date)}
                        </span>
                        {m.source && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                            {m.source}
                          </span>
                        )}
                        {m.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="max-w-[12rem] truncate">{m.location}</span>
                          </span>
                        )}
                      </div>
                      {cleanDescription(m.description) && (
                        <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">
                          {cleanDescription(m.description)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2 self-stretch sm:self-auto">
                    <button
                      onClick={() => handleClaim(m)}
                      disabled={claimingId === m.id || removing}
                      className="btn-gradient flex-1 sm:flex-none"
                    >
                      {claimingId === m.id ? (
                        <Spinner label="משייך…" />
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" aria-hidden="true" />
                          שיוך אליי
                        </>
                      )}
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(m)}
                        disabled={deletingId === m.id || removing}
                        title="מחיקת הפגישה האבודה"
                        aria-label="מחיקת הפגישה האבודה"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === m.id ? (
                          <Spinner />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
