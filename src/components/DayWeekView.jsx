import { CalendarDays, ChevronLeft } from 'lucide-react'
import { formatTime, formatFullDay, weekDays, isSameDay, WEEKDAYS_FULL } from '../lib/dateUtils'
import { scoreMeeting, isUpcoming } from '../services/riskService'
import { typeIcon } from './MeetingRow'
import RiskBadge from './RiskBadge'

const STATUS = {
  attended: { label: 'הגיע', cls: 'bg-green-100 text-green-700' },
  no_show: { label: 'לא הגיע', cls: 'bg-red-100 text-red-700' },
  pending: { label: 'טרם עודכן', cls: 'bg-slate-100 text-slate-600' },
}

const byTime = (a, b) => new Date(a.meeting_date) - new Date(b.meeting_date)

/** One meeting row — the shared unit of both the day and week views. */
function MeetingLine({ m, showAgent, onPick, index = 0, risk = null }) {
  const Icon = typeIcon(m.type)
  const st = STATUS[m.status] || STATUS.pending
  return (
    <button
      onClick={() => onPick(m)}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      className="flex w-full animate-fade-up items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-slate-50 active:bg-amber-50/60"
    >
      <span className="w-12 shrink-0 text-sm font-bold tabular-nums text-slate-900">
        {formatTime(m.meeting_date)}
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-slate-800">
            {m.title || '(ללא כותרת)'}
          </span>
          <RiskBadge risk={risk} />
        </span>
        {showAgent && m.agent_name && (
          <span className="mt-0.5 block text-xs text-slate-500">{m.agent_name}</span>
        )}
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
        {st.label}
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
    </button>
  )
}

/** The risk read for a meeting, or null when it isn't ahead of us / no model. */
const riskFor = (model, m) => (model && isUpcoming(m) ? scoreMeeting(model, m) : null)

function Empty({ text }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <CalendarDays className="h-7 w-7 text-slate-300" aria-hidden="true" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  )
}

/** A single day, as a plain ordered list of its meetings. */
export function DayView({ date, meetings, showAgent, onPick, riskModel = null }) {
  const list = meetings.filter((m) => isSameDay(new Date(m.meeting_date), date)).sort(byTime)
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h3 className="font-bold text-slate-900">{formatFullDay(date)}</h3>
        <span className="text-xs text-slate-500">
          {list.length} {list.length === 1 ? 'פגישה' : 'פגישות'}
        </span>
      </div>
      {list.length === 0 ? (
        <Empty text="אין פגישות ביום זה" />
      ) : (
        <div className="divide-y divide-slate-100">
          {list.map((m, i) => (
            <MeetingLine
              key={m.id}
              m={m}
              showAgent={showAgent}
              onPick={onPick}
              index={i}
              risk={riskFor(riskModel, m)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The week as seven day sections, Sunday first. Deliberately a vertical list
 * rather than seven columns: meeting titles are long Hebrew strings, and a
 * column ~150px wide truncates every one of them into uselessness.
 */
export function WeekView({ anchor, meetings, showAgent, onPick, riskModel = null }) {
  const days = weekDays(anchor)
  const today = new Date()

  return (
    <div className="flex flex-col gap-3">
      {days.map((d) => {
        const list = meetings.filter((m) => isSameDay(new Date(m.meeting_date), d)).sort(byTime)
        const now = isSameDay(d, today)
        return (
          <div key={d.toISOString()} className="card overflow-hidden">
            <div
              className={`flex items-center justify-between border-b px-4 py-2.5 ${
                now ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-extrabold tabular-nums ${
                    now ? 'bg-slate-900 text-white ring-2 ring-amber-400' : 'bg-white text-slate-700'
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className="text-sm font-bold text-slate-800">
                  {WEEKDAYS_FULL[d.getDay()]}
                </span>
                {now && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    היום
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-500">
                {list.length ? `${list.length} ${list.length === 1 ? 'פגישה' : 'פגישות'}` : '—'}
              </span>
            </div>
            {list.length > 0 && (
              <div className="divide-y divide-slate-100">
                {list.map((m, i) => (
                  <MeetingLine
                    key={m.id}
                    m={m}
                    showAgent={showAgent}
                    onPick={onPick}
                    index={i}
                    risk={riskFor(riskModel, m)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
