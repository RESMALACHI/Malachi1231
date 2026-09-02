import { TrendingUp, TrendingDown, Minus, CalendarRange } from 'lucide-react'
import { computeKpis } from '../services/meetingsService'

/**
 * This month against last month.
 *
 * The rest of the report answers "how much" — this one answers "better or
 * worse", which is the question a manager actually opens the page with. Each
 * row is scaled against the larger of the two months, so the bars compare
 * honestly rather than each filling its own width.
 */

/** A rate is compared in percentage points; a count, in percent. */
function delta(current, previous, isRate) {
  // A null rate means nothing was marked that month. There is no movement to
  // report between "unknown" and a number, and treating null as 0 would invent
  // a collapse (or a recovery) that never happened.
  if (current == null || previous == null) {
    return { diff: 0, text: '—', none: true }
  }
  if (isRate) {
    const diff = Math.round(current - previous)
    return { diff, text: `${diff > 0 ? '+' : ''}${diff} נק׳`, none: previous === 0 && current === 0 }
  }
  if (previous === 0) {
    // Growth from nothing is not a percentage — saying "+∞%" or "+100%" would
    // both be inventions.
    return { diff: current > 0 ? 1 : 0, text: current > 0 ? 'חדש' : '—', none: current === 0 }
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { diff: pct, text: `${pct > 0 ? '+' : ''}${pct}%`, none: false }
}

function Row({ label, current, previous, isRate = false, suffix = '', lowerIsBetter = false }) {
  // Null is "not measured", not zero — kept out of the scale and shown as a dash.
  const cur = current ?? 0
  const prevVal = previous ?? 0
  const max = Math.max(cur, prevVal, 1)
  const show = (v) => (v == null ? '—' : `${v}${suffix}`)
  const d = delta(current, previous, isRate)

  // The arrow always points the way the number moved; the COLOUR says whether
  // that was good news. They part company on "לא הגיעו", where a rise is the
  // worst line on the page — painting it green because it went up would tell
  // the manager the opposite of the truth.
  const good = lowerIsBetter ? d.diff < 0 : d.diff > 0
  const bad = lowerIsBetter ? d.diff > 0 : d.diff < 0

  const tone = d.none || d.diff === 0
    ? 'text-slate-500'
    : good
      ? 'text-green-700'
      : bad
        ? 'text-red-700'
        : 'text-slate-500'
  const Icon = d.none || d.diff === 0 ? Minus : d.diff > 0 ? TrendingUp : TrendingDown

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{label}</span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="h-3 flex-1 overflow-hidden rounded-md bg-slate-100">
            <div
              className="h-3 rounded-md bg-slate-900 transition-[width] duration-700"
              style={{ width: `${(cur / max) * 100}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-end text-xs font-extrabold tabular-nums text-slate-900">
            {show(current)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 flex-1 overflow-hidden rounded-md bg-slate-100">
            <div
              className="h-3 rounded-md bg-slate-300 transition-[width] duration-700"
              style={{ width: `${(prevVal / max) * 100}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-end text-xs font-semibold tabular-nums text-slate-400">
            {show(previous)}
          </span>
        </div>
      </div>

      <span
        className={`inline-flex w-16 shrink-0 items-center justify-end gap-1 text-xs font-extrabold tabular-nums ${tone}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {d.text}
      </span>
    </div>
  )
}

export default function MonthComparison({ meetings, prevMeetings, monthLabel, prevMonthLabel }) {
  const now = computeKpis(meetings || [])
  const before = computeKpis(prevMeetings || [])

  // Nothing to compare against — better to say so than to draw a chart where
  // every bar is a 100% improvement over zero.
  const noHistory = (prevMeetings || []).length === 0

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <CalendarRange className="h-4 w-4 text-amber-500" aria-hidden="true" />
          {monthLabel} מול {prevMonthLabel}
        </span>
        <span className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-slate-900" />
            {monthLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-slate-300" />
            {prevMonthLabel}
          </span>
        </span>
      </div>

      {noHistory ? (
        <p className="py-4 text-center text-sm text-slate-500">
          אין נתונים על {prevMonthLabel} — אין מול מה להשוות.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          <Row label="פגישות" current={now.total} previous={before.total} />
          <Row label="הגיעו" current={now.attended} previous={before.attended} />
          <Row label="לא הגיעו" current={now.noShow} previous={before.noShow} lowerIsBetter />
          <Row
            label="אחוז הגעה"
            current={now.attendanceRate}
            previous={before.attendanceRate}
            isRate
            suffix="%"
          />
        </div>
      )}

      {!noHistory && before.pending + now.pending > 0 && (
        // Without this the comparison quietly lies: a month with 40 unmarked
        // meetings looks like a month with 40 fewer arrivals.
        <p className="mt-2 text-[11px] text-slate-400">
          שימו לב: {now.pending + before.pending} פגישות בשני החודשים עדיין לא סומנו, ולכן «הגיעו»
          ו«אחוז הגעה» עשויים להיות נמוכים מהמציאות.
        </p>
      )}
    </div>
  )
}
