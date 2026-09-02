import { useMemo } from 'react'
import { Users, UserCheck, Repeat, CalendarDays, PieChart, TrendingUp } from 'lucide-react'
import { clientName, clientPhone } from '../lib/meetingTitle'
import { formatRate } from '../services/meetingsService'

/**
 * The charts on the reports page.
 *
 * Drawn by hand in SVG rather than pulled from a charting library: the office
 * machines are weak, the whole app is ~140 KB gzipped, and a chart pack would
 * have added most of that again for four small figures. It also keeps the
 * palette identical to the rest of the report — the same greens, ambers and
 * slates the KPI cards already use.
 *
 * Every figure here answers a question the manager actually asks, and each one
 * refuses to invent data: a month with nothing marked shows "—", not 0%.
 */

const GREEN = '#16a34a'
const RED = '#dc2626'
const AMBER = '#f59e0b'
const SLATE = '#cbd5e1'

function Panel({ title, icon: Icon, hint, children, className = '' }) {
  return (
    <div className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {Icon && <Icon className="h-4 w-4 text-amber-500" aria-hidden="true" />}
          {title}
        </span>
        {hint && <span className="text-[11px] font-medium text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** A donut of attended / no-show / not-yet-marked. */
export function StatusDonut({ kpis }) {
  const slices = [
    { label: 'הגיעו', value: kpis.attended, color: GREEN },
    { label: 'לא הגיעו', value: kpis.noShow, color: RED },
    { label: 'טרם סומנו', value: kpis.pending, color: SLATE },
  ].filter((s) => s.value > 0)

  const total = slices.reduce((n, s) => n + s.value, 0)
  const R = 54
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <Panel title="סטטוס הפגישות" icon={PieChart} hint={`${kpis.total} פגישות`}>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">אין פגישות בחודש זה</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <svg viewBox="0 0 140 140" className="h-32 w-32 -rotate-90">
              {slices.map((s) => {
                const len = (s.value / total) * C
                const dash = <circle
                  key={s.label}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="18"
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                />
                offset += len
                return dash
              })}
            </svg>
            {/* The rate belongs in the hole: it is the one number this figure
                exists to deliver. */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold leading-none text-slate-900">
                {formatRate(kpis.attendanceRate)}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold text-slate-400">הגעה</span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-2">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="flex-1 truncate text-slate-600">{s.label}</span>
                <span className="font-extrabold tabular-nums text-slate-900">{s.value}</span>
                <span className="w-10 text-end text-xs tabular-nums text-slate-400">
                  {Math.round((s.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">
        אחוז ההגעה מחושב מתוך {kpis.decided} הפגישות שסומנו (הגיעו + לא הגיעו). פגישות שטרם
        סומנו אינן נספרות.
      </p>
    </Panel>
  )
}

/**
 * One client, several meetings.
 *
 * Written as three plain sentences rather than a grid of figures. The first
 * version put "כפילויות 4" beside "4 לקוחות · 8 פגישות" — two different fours
 * that happened to collide, and nobody could tell which was which. Numbers here
 * are only ever counts of one thing, each with the noun attached.
 */
export function ClientsPanel({ kpis }) {
  const { total, uniqueClients, repeatClients, repeatMeetings, onceOnlyClients } = kpis

  return (
    <Panel title="לקוחות מול פגישות" icon={Users}>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">אין פגישות בחודש זה</p>
      ) : (
        <>
          <p className="text-[15px] font-semibold leading-relaxed text-slate-700">
            <span className="text-2xl font-extrabold tabular-nums text-slate-900">{total}</span>{' '}
            פגישות נקבעו ל־
            <span className="text-2xl font-extrabold tabular-nums text-slate-900">
              {uniqueClients}
            </span>{' '}
            לקוחות שונים.
          </p>

          <ul className="mt-3 space-y-2">
            <li className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3">
              <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="text-sm leading-relaxed text-slate-700">
                <b className="tabular-nums text-slate-900">{onceOnlyClients}</b> לקוחות נקבעה להם{' '}
                <b>פגישה אחת</b> בלבד.
              </span>
            </li>
            <li
              className={`flex items-start gap-2.5 rounded-2xl p-3 ${
                repeatClients > 0 ? 'bg-amber-50' : 'bg-slate-50'
              }`}
            >
              <Repeat
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  repeatClients > 0 ? 'text-amber-500' : 'text-slate-400'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-sm leading-relaxed ${
                  repeatClients > 0 ? 'text-amber-900' : 'text-slate-700'
                }`}
              >
                {repeatClients > 0 ? (
                  <>
                    <b className="tabular-nums">{repeatClients}</b> לקוחות נקבעו{' '}
                    <b>יותר מפעם אחת</b> — ביחד{' '}
                    <b className="tabular-nums">{repeatMeetings}</b> פגישות.
                  </>
                ) : (
                  <>אף לקוח לא נקבע פעמיים החודש.</>
                )}
              </span>
            </li>
          </ul>

          {/* How the month's meetings split between first-timers and returns. */}
          {repeatClients > 0 && (
            <div className="mt-3">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="origin-right bg-slate-800 animate-bar-grow"
                  style={{ width: `${((total - repeatMeetings) / total) * 100}%` }}
                />
                <div
                  className="origin-right bg-amber-400 animate-bar-grow"
                  style={{ width: `${(repeatMeetings / total) * 100}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11.5px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-800" />
                  {total - repeatMeetings} פגישות עם לקוח שנקבע פעם אחת
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {repeatMeetings} עם לקוח חוזר
                </span>
              </div>
            </div>
          )}
        </>
      )}
      <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">
        לקוח מזוהה לפי מספר הטלפון שביומן, ולפי השם כשאין מספר — כך שאותו אדם נספר פעם אחת גם
        אם השם נכתב אחרת בכל פגישה.
      </p>
    </Panel>
  )
}

/**
 * Meetings per day across the month, each column stacked by outcome.
 *
 * The columns are percentage-height children of a full-height cell. The first
 * version made them children of an auto-height flex item, so every percentage
 * resolved against nothing and the whole chart flattened to a 3px line —
 * measured in the browser: a bar asking for 47% rendered 3px tall.
 */
export function DailyChart({ meetings, year, month }) {
  const days = useMemo(() => {
    const count = new Date(year, month + 1, 0).getDate()
    const rows = Array.from({ length: count }, (_, i) => ({
      day: i + 1,
      total: 0,
      attended: 0,
      noShow: 0,
      pending: 0,
    }))
    for (const m of meetings) {
      const d = new Date(m.meeting_date)
      if (d.getFullYear() !== year || d.getMonth() !== month) continue
      const row = rows[d.getDate() - 1]
      if (!row) continue
      row.total++
      if (m.status === 'attended') row.attended++
      else if (m.status === 'no_show') row.noShow++
      else row.pending++
    }
    return rows
  }, [meetings, year, month])

  const max = Math.max(1, ...days.map((d) => d.total))
  const busiest = days.reduce((a, b) => (b.total > a.total ? b : a), days[0] || { total: 0 })
  const half = Math.round(max / 2)

  const Seg = ({ n, className }) =>
    n > 0 ? <div className={className} style={{ height: `${(n / max) * 100}%` }} /> : null

  return (
    <Panel
      title="פגישות לפי יום בחודש"
      icon={CalendarDays}
      hint={busiest?.total ? `היום העמוס: ${busiest.day} בחודש · ${busiest.total} פגישות` : undefined}
    >
      <div className="flex gap-2">
        {/* Scale, so a column height means a number instead of a vibe. */}
        <div className="flex h-40 w-5 shrink-0 flex-col justify-between text-[10px] tabular-nums text-slate-400">
          <span>{max}</span>
          <span>{half}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-40">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200" aria-hidden="true" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-200" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 border-t border-slate-300" aria-hidden="true" />

            <div className="flex h-full items-stretch gap-px">
              {days.map((d) => (
                <div
                  key={d.day}
                  className="group flex h-full flex-1 flex-col justify-end"
                  title={
                    d.total
                      ? `${d.day} בחודש · ${d.total} פגישות` +
                        (d.attended ? ` · ${d.attended} הגיעו` : '') +
                        (d.noShow ? ` · ${d.noShow} לא הגיעו` : '') +
                        (d.pending ? ` · ${d.pending} טרם סומנו` : '')
                      : `${d.day} בחודש · אין פגישות`
                  }
                >
                  <Seg n={d.pending} className="w-full bg-slate-300" />
                  <Seg n={d.noShow} className="w-full bg-red-400" />
                  <Seg n={d.attended} className="w-full bg-green-500" />
                </div>
              ))}
            </div>
          </div>

          {/* Day numbers, in the same flex grid so each label sits under its bar. */}
          <div className="mt-1 flex gap-px">
            {days.map((d) => (
              <span
                key={d.day}
                className="flex-1 text-center text-[9px] tabular-nums text-slate-400"
              >
                {d.day === 1 || d.day % 5 === 0 ? d.day : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-100 pt-2 text-[11.5px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> הגיעו
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> לא הגיעו
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> טרם סומנו
        </span>
      </div>
    </Panel>
  )
}

/**
 * Attendance rate by weekday.
 *
 * The most actionable figure on the page: if Sunday converts at 60% and
 * Thursday at 25%, that is a booking policy, not a curiosity. Days with too
 * little marked data say so instead of showing a number built on one meeting.
 */
export function WeekdayChart({ meetings }) {
  const NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const rows = useMemo(() => {
    const base = NAMES.map((name) => ({ name, attended: 0, noShow: 0, total: 0 }))
    for (const m of meetings) {
      const r = base[new Date(m.meeting_date).getDay()]
      if (!r) continue
      r.total++
      if (m.status === 'attended') r.attended++
      else if (m.status === 'no_show') r.noShow++
    }
    return base.map((r) => {
      const decided = r.attended + r.noShow
      return { ...r, decided, rate: decided > 0 ? Math.round((r.attended / decided) * 100) : null }
    })
  }, [meetings])

  const active = rows.filter((r) => r.total > 0)
  const best = active.filter((r) => r.rate != null).sort((a, b) => b.rate - a.rate)[0]

  return (
    <Panel
      title="אחוז הגעה לפי יום בשבוע"
      icon={TrendingUp}
      hint={best ? `הכי גבוה: יום ${best.name} (${best.rate}%)` : undefined}
    >
      {active.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">אין פגישות בחודש זה</p>
      ) : (
        <ul className="space-y-2">
          {active.map((r) => (
            <li key={r.name} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs font-medium text-slate-500">{r.name}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div
                  className="h-3 rounded-md transition-[width] duration-700"
                  style={{
                    width: `${r.rate ?? 0}%`,
                    background: r.rate == null ? SLATE : r.rate >= 50 ? GREEN : AMBER,
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-end text-xs font-extrabold tabular-nums text-slate-900">
                {formatRate(r.rate)}
              </span>
              <span className="w-16 shrink-0 text-end text-[11px] tabular-nums text-slate-400">
                {r.decided ? `${r.attended}/${r.decided}` : `${r.total} נקבעו`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">
        מחושב רק מפגישות שסומנו. יום שכולו טרם סומן מוצג כ־«—» ולא כאפס.
      </p>
    </Panel>
  )
}

/** Per-agent attendance rate — manager only. */
export function AgentRatesChart({ rows }) {
  const ranked = [...rows].sort((a, b) => (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1))
  return (
    <Panel title="אחוז הגעה לפי סוכן" icon={Users}>
      {ranked.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">אין נתונים</p>
      ) : (
        <ul className="space-y-2.5">
          {ranked.map((r) => (
            <li key={r.name} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-xs font-medium text-slate-600">
                {r.name}
              </span>
              <div className="h-3.5 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div
                  className="h-3.5 rounded-md transition-[width] duration-700"
                  style={{
                    width: `${r.attendanceRate ?? 0}%`,
                    background:
                      r.attendanceRate == null ? SLATE : r.attendanceRate >= 50 ? GREEN : AMBER,
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-end text-xs font-extrabold tabular-nums text-slate-900">
                {formatRate(r.attendanceRate)}
              </span>
              <span className="w-16 shrink-0 text-end text-[11px] tabular-nums text-slate-400">
                {r.attended}/{r.decided ?? 0}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Repeat clients, listed — who is taking more than one slot. */
export function RepeatClientsTable({ meetings }) {
  const rows = useMemo(() => {
    const byKey = new Map()
    for (const m of meetings) {
      const phone = clientPhone(m)
      const name = clientName(m.title, m.agent_name)
      const key = phone ? `p:${phone}` : `n:${name}`
      const cur = byKey.get(key) || { name, phone, meetings: [] }
      // Prefer the longest spelling seen — usually the fullest name.
      if (name.length > cur.name.length) cur.name = name
      cur.meetings.push(m)
      byKey.set(key, cur)
    }
    return [...byKey.values()]
      .filter((c) => c.meetings.length > 1)
      .sort((a, b) => b.meetings.length - a.meetings.length)
  }, [meetings])

  if (rows.length === 0) return null

  return (
    <Panel
      title="לקוחות עם יותר מפגישה אחת"
      icon={Repeat}
      hint={`${rows.length} לקוחות`}
    >
      <ul className="divide-y divide-slate-100">
        {rows.slice(0, 12).map((c, i) => {
          const attended = c.meetings.filter((m) => m.status === 'attended').length
          const noShow = c.meetings.filter((m) => m.status === 'no_show').length
          return (
            <li key={i} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {c.name}
                </span>
                {c.phone && (
                  <span className="block text-[11px] tabular-nums text-slate-400" dir="ltr">
                    {c.phone}
                  </span>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {c.meetings.length} פגישות
              </span>
              {attended > 0 && (
                <span className="shrink-0 text-[11px] font-bold text-green-700">
                  {attended} הגיע
                </span>
              )}
              {noShow > 0 && (
                <span className="shrink-0 text-[11px] font-bold text-red-600">
                  {noShow} לא
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > 12 && (
        <p className="mt-2 text-[11px] text-slate-400">ועוד {rows.length - 12} לקוחות…</p>
      )}
    </Panel>
  )
}
