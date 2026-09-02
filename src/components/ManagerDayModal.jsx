import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, Loader2, X } from 'lucide-react'
import { typeIcon } from './MeetingRow'
import { formatFullDay, formatTime } from '../lib/dateUtils'
import { REAL_AGENTS } from '../lib/agents'

const STATUS = {
  attended: { label: 'הגיע', dot: 'bg-green-500' },
  no_show: { label: 'לא הגיע', dot: 'bg-red-500' },
  pending: { label: 'טרם עודכן', dot: 'bg-slate-400' },
}

const AGENT_DOT = {
  'ודיע': 'bg-sky-500',
  'מרים': 'bg-rose-500',
  'עדי': 'bg-indigo-500',
  'מלאכי אזערי': 'bg-amber-500',
}

/**
 * Manager view of a single day: that day's meetings grouped by agent.
 */
export default function ManagerDayModal({ date, meetings, onClose, canTransfer = false, onTransfer, savingId }) {
  const [movingMeeting, setMovingMeeting] = useState(null)
  const [targetAgent, setTargetAgent] = useState('')
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const groups = REAL_AGENTS.map((name) => ({
    name,
    list: meetings
      .filter((m) => m.agent_name === name)
      .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date)),
  }))
    .filter((g) => g.list.length > 0)
    // Busiest agent first — same order as the calendar cells.
    .sort((a, b) => b.list.length - a.list.length)

  const total = groups.reduce((n, g) => n + g.list.length, 0)

  const beginTransfer = (meeting) => {
    setMovingMeeting(meeting)
    setTargetAgent('')
  }

  const confirmTransfer = async () => {
    if (!movingMeeting || !targetAgent || !onTransfer) return
    try {
      await onTransfer(movingMeeting, targetAgent)
      setMovingMeeting(null)
      setTargetAgent('')
    } catch {
      // The parent shows the error banner; keep the sheet open so a different
      // target can be chosen without making the user start again.
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none pb-safe animate-slide-up sm:rounded-3xl sm:pb-0 sm:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle — the phone affordance for "this sheet closes" */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h3 className="font-bold text-slate-900">{formatFullDay(date)}</h3>
            <p className="text-xs text-slate-500">סה"כ {total} פגישות</p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="סגירה">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {groups.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              אין פגישות ביום זה
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="border-b border-slate-100 last:border-0">
                <div className="flex items-center justify-between bg-slate-50 px-5 py-2">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${AGENT_DOT[g.name] || 'bg-slate-500'}`}
                    />
                    {g.name}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {g.list.length} פגישות
                  </span>
                </div>
                {g.list.map((m) => {
                  const Icon = typeIcon(m.type)
                  const status = STATUS[m.status] || STATUS.pending
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-5 py-3 text-right">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {m.title || '(ללא כותרת)'}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="tabular-nums">{formatTime(m.meeting_date)}</span>
                          <span className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </span>
                      </span>
                      {canTransfer && (
                        <button
                          type="button"
                          onClick={() => beginTransfer(m)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 active:scale-[0.97]"
                          aria-label={`העבר את ${m.title || 'הפגישה'} לסוכן אחר`}
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                          העבר
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {movingMeeting && (
          <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <ArrowLeftRight className="h-4 w-4 text-amber-700" aria-hidden="true" />
                  העברת פגישה
                </p>
                <p className="mt-1 truncate text-xs font-medium text-slate-600" title={movingMeeting.title || undefined}>
                  {movingMeeting.title || '(ללא כותרת)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingMeeting(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                ביטול
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={targetAgent}
                onChange={(e) => setTargetAgent(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                aria-label="סוכן יעד"
              >
                <option value="">בחר סוכן יעד…</option>
                {REAL_AGENTS.filter((name) => name !== movingMeeting.agent_name).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!targetAgent || savingId === movingMeeting.id}
                onClick={confirmTransfer}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
              >
                {savingId === movingMeeting.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                העבר פגישה
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
