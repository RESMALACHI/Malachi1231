import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, MoveHorizontal } from 'lucide-react'
import { typeIcon } from './MeetingRow'
import RiskBadge from './RiskBadge'
import SwipeToMark from './SwipeToMark'
import { formatFullDay, formatTime } from '../lib/dateUtils'
import { scoreMeeting, isUpcoming } from '../services/riskService'

const STATUS = {
  attended: { label: 'הגיע', dot: 'bg-green-500' },
  no_show: { label: 'לא הגיע', dot: 'bg-red-500' },
  pending: { label: 'טרם עודכן', dot: 'bg-slate-400' },
}

/**
 * Lists a day's meetings as tappable rows. Selecting one opens the detail view;
 * on a phone, swiping a row sets its attendance without opening anything.
 */
export default function DayMeetingsModal({
  date,
  meetings,
  onClose,
  onSelectMeeting,
  onStatusChange,
  riskModel = null,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

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
            <p className="text-xs text-slate-500">{meetings.length} פגישות</p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="סגירה">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* A gesture nobody is told about is a gesture nobody uses. Phones only —
            there is nothing to swipe with a mouse. */}
        {onStatusChange && meetings.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 bg-amber-50/70 py-1.5 text-[11px] font-medium text-amber-800 sm:hidden">
            <MoveHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            החליקו שורה ימינה לסימון «הגיע», שמאלה ל«לא הגיע»
          </p>
        )}

        <div className="divide-y divide-slate-100 overflow-y-auto">
          {meetings.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">אין פגישות ביום זה</p>
          ) : (
            meetings.map((m, i) => {
              const Icon = typeIcon(m.type)
              const status = STATUS[m.status] || STATUS.pending
              const risk = riskModel && isUpcoming(m) ? scoreMeeting(riskModel, m) : null
              return (
                <SwipeToMark
                  key={m.id}
                  disabled={!onStatusChange}
                  onMark={(next) => onStatusChange?.(m, next)}
                >
                  <div
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="flex animate-fade-up items-center gap-2 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <button
                      onClick={() => onSelectMeeting(m)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-right"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-semibold text-slate-800">
                            {m.title || '(ללא כותרת)'}
                          </span>
                          <RiskBadge risk={risk} />
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="tabular-nums">{formatTime(m.meeting_date)}</span>
                          <span className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                        </span>
                      </span>
                      <ChevronLeft className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
                    </button>
                  </div>
                </SwipeToMark>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
