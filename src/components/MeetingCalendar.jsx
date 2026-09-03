import { ChevronLeft, CalendarDays, AlertTriangle } from 'lucide-react'
import {
  WEEKDAYS_FULL,
  WEEKDAYS_SHORT,
  buildMonthMatrix,
  formatTime,
} from '../lib/dateUtils'
import { scoreMeeting, isUpcoming } from '../services/riskService'
import {
  LINE,
  toneFor,
  solidChip,
  HEAD_LABEL,
  CHROME_GREY,
  todayCircle,
  CHIP_BASE,
  SURFACE,
  SURFACE_BG,
} from '../lib/calendarTheme'

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** How many meeting chips fit a desktop day cell before "+N עוד" takes over. */
const MAX_CHIPS = 3

/**
 * Phone view: an agenda list of the days that actually have meetings. Squeezing
 * the 7-column month grid into ~50px cells made it unreadable — a tappable list
 * with a date chip and a titles preview is what a phone calendar should be.
 */
function MobileAgenda({ year, month, meetings, onSelectDay }) {
  const today = new Date()
  const isToday = (d) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  // Group this month's meetings per day, keeping the first two titles as a peek.
  const byDay = new Map()
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.meeting_date) - new Date(b.meeting_date)
  )
  for (const m of sorted) {
    const d = new Date(m.meeting_date)
    if (d.getFullYear() !== year || d.getMonth() !== month) continue
    const k = d.getDate()
    const e = byDay.get(k) || {
      date: new Date(year, month, k),
      count: 0,
      titles: [],
    }
    e.count += 1
    if (e.titles.length < 2 && m.title) e.titles.push(m.title)
    byDay.set(k, e)
  }
  const days = [...byDay.values()].sort((a, b) => a.date - b.date)

  if (days.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-12 text-center sm:hidden">
        <CalendarDays className="h-8 w-8 text-slate-300" aria-hidden="true" />
        <p className="text-sm text-slate-500">אין פגישות בחודש זה</p>
      </div>
    )
  }

  return (
    <div className="card divide-y divide-slate-100 overflow-hidden sm:hidden">
      {days.map((e, i) => {
        const now = isToday(e.date)
        return (
          <button
            key={e.date.getDate()}
            onClick={() => onSelectDay(e.date)}
            style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
            className="flex w-full animate-fade-up items-center gap-3 p-3 text-right transition-colors active:bg-amber-50/60"
          >
            {/* Date chip */}
            <span
              className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl ${
                now
                  ? 'bg-slate-900 text-white ring-2 ring-amber-400'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <span className="text-lg font-extrabold leading-none tabular-nums">
                {e.date.getDate()}
              </span>
              <span className="mt-0.5 text-[9px] font-medium opacity-70">
                {WEEKDAYS_SHORT[e.date.getDay()]}
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-bold tabular-nums text-slate-900">
                  {e.count} {e.count === 1 ? 'פגישה' : 'פגישות'}
                </span>
                {now && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    היום
                  </span>
                )}
              </span>
              {e.titles.length > 0 && (
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {e.titles.join(' · ')}
                </span>
              )}
            </span>

            <ChevronLeft className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Month calendar. Desktop shows each day's actual meetings as status-coloured
 * chips (time + client), like a real calendar — a chip opens the meeting, the
 * day itself opens the full list. Phones get the agenda list above.
 */
export default function MeetingCalendar({
  year,
  month,
  meetings,
  onSelectDay,
  onSelectMeeting,
  riskModel = null,
}) {
  const cells = buildMonthMatrix(year, month)

  const highRisk = (m) =>
    riskModel && isUpcoming(m) && scoreMeeting(riskModel, m)?.level === 'high'

  // The meetings of each day, in time order (grid view).
  const listByDay = new Map()
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.meeting_date) - new Date(b.meeting_date)
  )
  for (const m of sorted) {
    const k = dayKey(new Date(m.meeting_date))
    const list = listByDay.get(k) || []
    list.push(m)
    listByDay.set(k, list)
  }

  return (
    <>
      <MobileAgenda year={year} month={month} meetings={meetings} onSelectDay={onSelectDay} />

      <div
        className={`${SURFACE} hidden overflow-hidden sm:block`}
        style={{ background: SURFACE_BG }}
      >
        <div className="grid grid-cols-7 gap-px" style={{ background: LINE.column }}>
          {WEEKDAYS_FULL.map((name, i) => (
            <div
              key={`h-${i}`}
              // Light strip with quiet grey labels — the same header the day and
              // week grids use. It was a black bar here and white there, which
              // is most of why the views looked like different products.
              className={`bg-white/45 px-1 py-2.5 text-center ${HEAD_LABEL}`}
              style={{ color: CHROME_GREY }}
            >
              {name}
            </div>
          ))}

          {cells.map((cell, idx) => {
            const list = cell.inMonth ? listByDay.get(dayKey(cell.date)) || [] : []
            const count = list.length
            const isSaturday = cell.weekday === 6
            const clickable = count > 0
            const overflow = count - MAX_CHIPS
            return (
              <div
                key={idx}
                onClick={() => clickable && onSelectDay(cell.date)}
                className={`group flex min-h-[124px] select-none flex-col p-1.5 transition-colors ${
                  cell.inMonth
                    ? cell.isToday
                      ? 'bg-amber-100/35'
                      : isSaturday
                        ? 'bg-slate-200/25'
                        : 'bg-white/45'
                    : 'bg-slate-200/15'
                } ${clickable ? 'cursor-pointer hover:bg-amber-100/30' : ''}`}
              >
                {/* Day number + quiet total */}
                <div className="flex items-center justify-between">
                  <span
                    className={`${todayCircle()} ${
                      cell.isToday
                        ? 'bg-slate-900 text-white'
                        : cell.inMonth
                          ? 'text-slate-800'
                          : 'text-slate-300'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {count > 0 && (
                    <span className="text-[10px] font-bold tabular-nums text-slate-400">
                      {count}
                    </span>
                  )}
                </div>

                {/* The day's meetings — a chip opens the meeting itself */}
                {count > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {list.slice(0, MAX_CHIPS).map((m) => {
                      // The meeting's colour is deliberately flat and direct:
                      // the block reads as a status marker, not a decoration.
                      const tone = toneFor(m)
                      const atRisk = highRisk(m)
                      return (
                        <button
                          key={m.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (onSelectMeeting) onSelectMeeting(m)
                            else onSelectDay(cell.date)
                          }}
                          title={
                            atRisk
                              ? `${m.title || 'פגישה'} — סיכון לאי-הגעה`
                              : m.title || undefined
                          }
                          style={{
                            ...solidChip(tone, { radius: 6 }),
                            ...(atRisk ? { boxShadow: 'inset 0 0 0 1.5px #f59e0b' } : null),
                          }}
                          className={`${CHIP_BASE} flex w-full items-center gap-1 px-1.5 py-1
                            text-[11px] font-semibold`}
                        >
                          {atRisk && (
                            <AlertTriangle
                              className="h-3 w-3 shrink-0 text-amber-600"
                              aria-hidden="true"
                            />
                          )}
                          <span className="shrink-0 tabular-nums">
                            {formatTime(m.meeting_date)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-normal">
                            {m.title || '(ללא כותרת)'}
                          </span>
                        </button>
                      )
                    })}
                    {overflow > 0 && (
                      <span className="px-1.5 text-[10px] font-bold text-slate-400 transition-colors group-hover:text-amber-600">
                        +{overflow} עוד
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
