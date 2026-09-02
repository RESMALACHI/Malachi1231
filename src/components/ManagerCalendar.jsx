import { ChevronLeft, CalendarDays } from 'lucide-react'
import { WEEKDAYS_FULL, WEEKDAYS_SHORT, buildMonthMatrix } from '../lib/dateUtils'
import { REAL_AGENTS } from '../lib/agents'
import {
  LINE,
  hueFor,
  HEAD_LABEL,
  CHROME_GREY,
  todayCircle,
  SURFACE,
  SURFACE_BG,
} from '../lib/calendarTheme'

/** Agent hues come from the shared theme, so a person is one colour app-wide. */
function styleFor(name) {
  return { dot: hueFor(name) }
}
function shortName(name) {
  return String(name).split(' ')[0]
}
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * Manager overview calendar. Each day shows the total, a proportion bar and a
 * per-agent breakdown sorted by who has the most meetings that day.
 */
export default function ManagerCalendar({ year, month, meetings, onSelectDay }) {
  const cells = buildMonthMatrix(year, month)

  // day → { total, counts: { agentName: n } }
  const byDay = new Map()
  for (const m of meetings) {
    if (!REAL_AGENTS.includes(m.agent_name)) continue
    const k = dayKey(new Date(m.meeting_date))
    const entry = byDay.get(k) || { total: 0, counts: {} }
    entry.total += 1
    entry.counts[m.agent_name] = (entry.counts[m.agent_name] || 0) + 1
    byDay.set(k, entry)
  }

  // Phone agenda: days with meetings as rows, each with the per-agent split as
  // coloured chips — the 7-column grid is unreadable at phone width.
  const today = new Date()
  const agendaDays = [...byDay.entries()]
    .map(([k, entry]) => {
      const [y, mo, d] = k.split('-').map(Number)
      return { date: new Date(y, mo, d), entry }
    })
    .filter(({ date }) => date.getFullYear() === year && date.getMonth() === month)
    .sort((a, b) => a.date - b.date)

  const isToday = (d) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  return (
    <div className="flex flex-col gap-3">
      {/* ── Phone agenda ── */}
      {agendaDays.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center sm:hidden">
          <CalendarDays className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm text-slate-500">אין פגישות בחודש זה</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden sm:hidden">
          {agendaDays.map(({ date, entry }, i) => {
            const now = isToday(date)
            const sortedAgents = Object.entries(entry.counts).sort((a, b) => b[1] - a[1])
            return (
              <button
                key={date.getDate()}
                onClick={() => onSelectDay && onSelectDay(date)}
                style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                className="flex w-full animate-fade-up items-center gap-3 p-3 text-right transition-colors active:bg-amber-50/60"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl ${
                    now
                      ? 'bg-slate-900 text-white ring-2 ring-amber-400'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className="text-lg font-extrabold leading-none tabular-nums">
                    {date.getDate()}
                  </span>
                  <span className="mt-0.5 text-[9px] font-medium opacity-70">
                    {WEEKDAYS_SHORT[date.getDay()]}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-bold tabular-nums text-slate-900">
                      {entry.total} {entry.total === 1 ? 'פגישה' : 'פגישות'}
                    </span>
                    {now && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        היום
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {sortedAgents.map(([name, n]) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: styleFor(name).dot }}
                        />
                        {shortName(name)} · {n}
                      </span>
                    ))}
                  </span>
                </span>

                <ChevronLeft className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}

      {/* ── Desktop grid ── */}
      <div
        className={`${SURFACE} hidden overflow-hidden sm:block`}
        style={{ background: SURFACE_BG }}
      >
        <div className="grid grid-cols-7 gap-px" style={{ background: LINE.column }}>
          {WEEKDAYS_FULL.map((name, i) => (
            <div
              key={`h-${i}`}
              // The same light weekday strip as every other calendar view.
              className={`bg-white/45 px-1 py-2.5 text-center ${HEAD_LABEL}`}
              style={{ color: CHROME_GREY }}
            >
              <span className="hidden sm:inline">{name}</span>
              <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
            </div>
          ))}

          {cells.map((cell, idx) => {
            const entry = cell.inMonth ? byDay.get(dayKey(cell.date)) : null
            const isSaturday = cell.weekday === 6
            const clickable = !!entry && entry.total > 0 && !!onSelectDay
            // Busiest agent first — the order people actually want to scan.
            const sorted = entry
              ? Object.entries(entry.counts).sort((a, b) => b[1] - a[1])
              : []
            return (
              <div
                key={idx}
                onClick={() => clickable && onSelectDay(cell.date)}
                className={`flex min-h-[118px] select-none flex-col p-1.5 transition-colors sm:min-h-[148px] ${
                  cell.inMonth
                    ? cell.isToday
                      ? 'bg-amber-100/35'
                      : isSaturday
                        ? 'bg-slate-200/25'
                        : 'bg-white/45'
                    : 'bg-slate-200/15'
                } ${clickable ? 'cursor-pointer hover:bg-amber-100/30' : ''}`}
              >
                {/* Day number + compact total chip */}
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
                  {entry && entry.total > 0 && (
                    <span className="inline-flex items-baseline gap-1 rounded-lg bg-slate-900 px-2 py-1 text-white shadow-sm">
                      <span className="text-sm font-extrabold leading-none tabular-nums">
                        {entry.total}
                      </span>
                      <span className="text-[9px] font-medium leading-none text-slate-300">
                        {entry.total === 1 ? 'פגישה' : 'פגישות'}
                      </span>
                    </span>
                  )}
                </div>

                {entry && entry.total > 0 && (
                  <div className="mt-2 flex flex-1 flex-col gap-1.5">
                    {/* Proportion bar — who owns the day, at a glance */}
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      {sorted.map(([name, n]) => (
                        <div
                          key={name}
                          style={{
                            width: `${(n / entry.total) * 100}%`,
                            background: styleFor(name).dot,
                          }}
                        />
                      ))}
                    </div>

                    {/* Per-agent rows, busiest first */}
                    <div className="space-y-0.5 text-[11px] leading-tight">
                      {sorted.map(([name, n]) => {
                        const s = styleFor(name)
                        return (
                          <div
                            key={name}
                            className="flex items-center justify-between gap-1 rounded-md px-1 py-0.5"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: s.dot }}
                              />
                              <span className="truncate font-semibold text-slate-700">
                                {shortName(name)}
                              </span>
                            </span>
                            <span className="shrink-0 font-extrabold tabular-nums text-slate-900">
                              {n}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend — grid colours only exist on desktop; the phone chips carry names */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-slate-500 sm:flex">
        {REAL_AGENTS.map((a) => {
          const s = styleFor(a)
          return (
            <span key={a} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.dot }} />
              {a}
            </span>
          )
        })}
        <span className="hidden text-slate-400 sm:ms-auto sm:inline">
          לחצו על יום כדי לראות את הפגישות לפי סוכן
        </span>
      </div>
    </div>
  )
}
