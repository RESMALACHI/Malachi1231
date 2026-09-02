// The newer analysis panels — trends over months, when meetings actually
// happen, how far ahead they're booked, and frontal vs zoom.
//
// All hand-drawn SVG like the rest of ReportCharts: no chart library, full
// control over RTL labels, and the colors are Tailwind classes so the night
// theme restyles the charts the same way it restyles everything else.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarClock,
  Clock3,
  Landmark,
  MonitorSmartphone,
  TrendingUp,
} from 'lucide-react'
import { getFunnel } from '../services/funnelService'
import Spinner from './Spinner'

const HE_MONTHS_SHORT = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
  'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
]

function Panel({ title, icon: Icon, hint, children, className = '' }) {
  return (
    <div className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
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

const shekels = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('en-US')}`

/**
 * The last six months (ending at the picked month), one funnel call each.
 *
 * Scoped: null agent = company totals; a name = that person's row. Six RPCs in
 * parallel — each is one aggregate read, and the result is cached per
 * (anchor, scope) so tab-hopping doesn't refetch.
 */
function useSixMonths(year, month, agentName) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setRows(null)
    setError('')

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(year, month - 5 + i, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })

    Promise.all(months.map(({ y, m }) => getFunnel(y, m)))
      .then((funnels) => {
        if (!alive) return
        setRows(
          funnels.map((f, i) => {
            const src = agentName
              ? (f?.by_agent || []).find((a) => a.name === agentName) || {}
              : f?.totals || {}
            return {
              label: `${HE_MONTHS_SHORT[months[i].m]}`,
              booked: src.booked || 0,
              attended: src.attended || 0,
              noShow: src.no_show || 0,
              deals: src.deals || 0,
              revenue: Number(src.revenue || 0),
              collected: Number(src.collected || 0),
            }
          })
        )
      })
      .catch((e) => alive && setError(e?.message || 'הטעינה נכשלה'))

    return () => {
      alive = false
    }
  }, [year, month, agentName])

  return { rows, error }
}

/**
 * Rendered width of an element, live.
 *
 * The line chart draws in viewBox units; with a fixed 620-unit width a phone
 * scales the whole drawing to ~0.58 and 11px labels become 6px lint. Measuring
 * the container and using ITS width as the viewBox makes one unit one pixel on
 * every screen. ResizeObserver, not a resize listener — resize events don't
 * fire in every embedded browser, and an observer also catches layout shifts.
 */
function useMeasuredWidth() {
  const [w, setW] = useState(0)
  const roRef = useRef(null)
  // A CALLBACK ref, not an effect: the measured div mounts only after the data
  // arrives, and an effect that ran during the loading return has already
  // missed it — which rendered an empty panel where the chart should be.
  const ref = useCallback((node) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (node) {
      const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width))
      ro.observe(node)
      roRef.current = ro
    }
  }, [])
  useEffect(() => () => roRef.current?.disconnect(), [])
  return [ref, w]
}

function Loading() {
  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  )
}

/* ── מגמת חצי שנה: פגישות ─────────────────────────────────────────────── */

/**
 * Booked vs attended, six months, as two smooth lines with an area under the
 * booked one. The gap BETWEEN the lines is the no-show story — which is why
 * they share one chart instead of getting one each.
 */
export function TrendPanel({ year, month, agentName }) {
  const { rows, error } = useSixMonths(year, month, agentName)
  const [boxRef, boxW] = useMeasuredWidth()

  if (error) return <Panel title="מגמת חצי שנה" icon={TrendingUp}><p className="text-sm text-red-600">{error}</p></Panel>
  if (!rows) return <Panel title="מגמת חצי שנה" icon={TrendingUp}><Loading /></Panel>

  const W = Math.max(300, Math.round(boxW) || 620)
  const H = 210
  const PAD = { top: 18, bottom: 30, side: 30 }
  const max = Math.max(4, ...rows.map((r) => r.booked))
  const x = (i) => PAD.side + (i * (W - PAD.side * 2)) / (rows.length - 1)
  const y = (v) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom)

  const path = (key) => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r[key])}`).join(' ')
  const area =
    path('booked') +
    ` L${x(rows.length - 1)},${H - PAD.bottom} L${x(0)},${H - PAD.bottom} Z`

  const gridLines = [0.5, 1].map((f) => Math.round(max * f))
  const latest = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const dir = prev && prev.booked > 0 ? Math.round(((latest.booked - prev.booked) / prev.booked) * 100) : null

  return (
    <Panel
      title="מגמת חצי שנה · פגישות"
      icon={TrendingUp}
      hint="המרווח בין הקווים הוא אי-ההגעה"
    >
      <div ref={boxRef}>
      {boxW > 0 && (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} dir="ltr">
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridLines.map((v) => (
          <g key={v}>
            <line x1={PAD.side} x2={W - PAD.side} y1={y(v)} y2={y(v)} className="stroke-slate-200 dark:stroke-slate-700" strokeDasharray="3 5" />
            <text x={PAD.side - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-400 dark:fill-slate-500 text-[10px] font-semibold">
              {v}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#trendArea)" />
        <path d={path('booked')} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path('attended')} fill="none" stroke="#10b981" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1 7" />

        {rows.map((r, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(r.booked)} r="4.5" fill="#f59e0b" className="stroke-white dark:stroke-slate-900" strokeWidth="2" />
            <circle cx={x(i)} cy={y(r.attended)} r="4" fill="#10b981" className="stroke-white dark:stroke-slate-900" strokeWidth="2" />
            <text x={x(i)} y={y(r.booked) - 10} textAnchor="middle" className="fill-slate-700 dark:fill-slate-200 text-[11px] font-bold">
              {r.booked}
            </text>
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[11px] font-semibold">
              {r.label}
            </text>
          </g>
        ))}
      </svg>
      )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5 font-semibold text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> נקבעו
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> התקיימו
        </span>
        {dir !== null && (
          <span className={`ms-auto font-bold ${dir >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {dir >= 0 ? '+' : ''}
            {dir}% מול החודש הקודם
          </span>
        )}
      </div>
    </Panel>
  )
}

/* ── מגמת חצי שנה: כסף ────────────────────────────────────────────────── */

/** Revenue as bars, the collected part filled in — the hollow top is debt. */
export function MoneyTrendPanel({ year, month, agentName }) {
  const { rows, error } = useSixMonths(year, month, agentName)

  if (error) return <Panel title="הכנסות וגבייה" icon={Landmark}><p className="text-sm text-red-600">{error}</p></Panel>
  if (!rows) return <Panel title="הכנסות וגבייה" icon={Landmark}><Loading /></Panel>

  const max = Math.max(1, ...rows.map((r) => r.revenue))
  const total = rows.reduce((s, r) => s + r.revenue, 0)
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0)

  return (
    <Panel
      title="הכנסות וגבייה · חצי שנה"
      icon={Landmark}
      hint="החלק המלא נגבה; השקוף עוד לא"
    >
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">אין עסקאות בתקופה הזאת.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2" style={{ height: 170 }} dir="ltr">
            {rows.map((r, i) => {
              const hRev = Math.round((r.revenue / max) * 130)
              const hCol = r.revenue > 0 ? Math.round((r.collected / r.revenue) * hRev) : 0
              return (
                <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                  {r.revenue > 0 && (
                    <span className="text-[10px] font-bold text-slate-600">
                      {r.deals > 0 ? `${r.deals} עסק׳` : ''}
                    </span>
                  )}
                  <div
                    className="relative w-full max-w-[46px] overflow-hidden rounded-t-lg border border-indigo-300/60 bg-indigo-100/50 dark:border-indigo-700 dark:bg-indigo-950/60"
                    style={{ height: Math.max(hRev, 3) }}
                    title={`${r.label}: ${shekels(r.revenue)} · נגבה ${shekels(r.collected)}`}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-indigo-600 to-indigo-400"
                      style={{ height: hCol }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">{r.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2.5 text-[11px] font-semibold text-slate-600">
            <span>סה"כ נמכר: <b className="text-slate-900">{shekels(total)}</b></span>
            <span>נגבה: <b className="text-green-700">{shekels(totalCollected)}</b></span>
            <span>פתוח: <b className="text-red-600">{shekels(total - totalCollected)}</b></span>
          </div>
        </>
      )}
    </Panel>
  )
}

/* ── פרונטלי מול זום ──────────────────────────────────────────────────── */

/**
 * The same month, split by meeting type. Each column stacks what actually
 * happened; the headline is the show-rate, because that is where the two
 * types genuinely differ.
 */
export function TypeComparePanel({ meetings }) {
  const data = useMemo(() => {
    const mk = () => ({ attended: 0, noShow: 0, pending: 0, total: 0 })
    const t = { frontal: mk(), zoom: mk() }
    for (const m of meetings) {
      const bucket = t[m.type]
      if (!bucket) continue
      bucket.total++
      if (m.status === 'attended') bucket.attended++
      else if (m.status === 'no_show') bucket.noShow++
      else bucket.pending++
    }
    for (const k of Object.keys(t)) {
      const settled = t[k].attended + t[k].noShow
      t[k].rate = settled > 0 ? Math.round((t[k].attended / settled) * 100) : null
      t[k].settled = settled
    }
    return t
  }, [meetings])

  const COLS = [
    { key: 'frontal', label: 'פרונטלי' },
    { key: 'zoom', label: 'זום' },
  ]
  const max = Math.max(1, data.frontal.total, data.zoom.total)

  const both = data.frontal.settled >= 10 && data.zoom.settled >= 10
  const verdict =
    both && data.frontal.rate !== null && data.zoom.rate !== null
      ? data.frontal.rate === data.zoom.rate
        ? 'אחוז הגעה זהה — ההבדל בין הסוגים הוא בנוחות, לא בתוצאה.'
        : data.frontal.rate > data.zoom.rate
          ? `לפרונטלי מגיעים יותר (${data.frontal.rate}% מול ${data.zoom.rate}%) — מי שנוסע, מגיע.`
          : `לזום מגיעים יותר (${data.zoom.rate}% מול ${data.frontal.rate}%) — הנסיעה מפילה פגישות פרונטליות.`
      : ''

  return (
    <Panel
      title="פרונטלי מול זום"
      icon={MonitorSmartphone}
      hint="אותו חודש, שני סוגי פגישה"
    >
      <div className="grid grid-cols-2 gap-4">
        {COLS.map(({ key, label }) => {
          const d = data[key]
          const h = (n) => (d.total ? Math.round((n / max) * 120) : 0)
          return (
            <div key={key} className="flex flex-col items-center">
              <span className="mb-1 text-2xl font-extrabold text-slate-900">
                {d.rate === null ? '—' : `${d.rate}%`}
              </span>
              <span className="mb-2 text-[11px] font-semibold text-slate-400">אחוז הגעה</span>
              <div className="flex w-full max-w-[120px] flex-col-reverse overflow-hidden rounded-xl" style={{ minHeight: 8 }}>
                <div className="bg-emerald-500" style={{ height: h(d.attended) }} title={`הגיעו ${d.attended}`} />
                <div className="bg-red-400" style={{ height: h(d.noShow) }} title={`לא הגיעו ${d.noShow}`} />
                <div className="bg-slate-300 dark:bg-slate-600" style={{ height: h(d.pending) }} title={`טרם סומנו ${d.pending}`} />
              </div>
              <span className="mt-2 text-sm font-bold text-slate-800">{label}</span>
              <span className="text-[11px] text-slate-500">{d.total} פגישות</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> הגיעו</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> לא הגיעו</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" /> טרם סומנו</span>
      </div>

      {verdict && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          {verdict}
        </p>
      )}
    </Panel>
  )
}

/* ── מפת חום: מתי הפגישות ─────────────────────────────────────────────── */

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳']
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

/** Day-of-week × hour grid of when meetings are scheduled. Darker = busier. */
export function HourHeatPanel({ meetings }) {
  const { grid, top } = useMemo(() => {
    const g = DAY_NAMES.map(() => HOURS.map(() => 0))
    for (const m of meetings) {
      const d = new Date(m.meeting_date)
      const day = d.getDay()
      const hi = HOURS.indexOf(d.getHours())
      if (day <= 5 && hi >= 0) g[day][hi]++
    }
    let best = { day: -1, hi: -1, n: 0 }
    g.forEach((row, day) =>
      row.forEach((n, hi) => {
        if (n > best.n) best = { day, hi, n }
      })
    )
    return { grid: g, top: best }
  }, [meetings])

  const max = Math.max(1, ...grid.flat())

  return (
    <Panel title="מתי נקבעות הפגישות" icon={Clock3} hint="כהה יותר = עמוס יותר">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] border-separate" style={{ borderSpacing: 3 }} dir="ltr">
          <thead>
            <tr>
              <th />
              {HOURS.map((h) => (
                <th key={h} className="pb-1 text-center text-[9px] font-bold text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_NAMES.map((name, day) => (
              <tr key={name}>
                <td className="pe-1.5 text-end text-[10px] font-bold text-slate-500">{name}</td>
                {HOURS.map((h, hi) => {
                  const n = grid[day][hi]
                  const hot = top.day === day && top.hi === hi && n > 0
                  return (
                    <td key={h} className="p-0">
                      <div
                        title={`יום ${name} ${h}:00 — ${n} פגישות`}
                        className={`flex h-6 items-center justify-center rounded-md text-[9px] font-bold transition ${
                          hot ? 'ring-2 ring-amber-500' : ''
                        } ${n === 0 ? 'bg-slate-100 dark:bg-slate-800/60' : 'text-white'}`}
                        style={
                          n > 0
                            ? { backgroundColor: `rgba(217, 119, 6, ${0.25 + (n / max) * 0.75})` }
                            : undefined
                        }
                      >
                        {n > 0 ? n : ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {top.n > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          החלון העמוס: יום {DAY_NAMES[top.day]} בשעה {HOURS[top.hi]}:00 ({top.n} פגישות).
        </p>
      )}
    </Panel>
  )
}

/* ── כמה זמן מראש נקבעות פגישות — והאם זה משנה ───────────────────────── */

const AHEAD_BUCKETS = [
  { label: 'אותו יום', min: 0, max: 0 },
  { label: '1–2 ימים', min: 1, max: 2 },
  { label: '3–7 ימים', min: 3, max: 7 },
  { label: 'שבוע–שבועיים', min: 8, max: 14 },
  { label: 'מעל שבועיים', min: 15, max: Infinity },
]

/**
 * How far ahead meetings are booked, and the no-show rate of each distance.
 *
 * This is the report that answers "does booking far ahead kill attendance" —
 * a question the office argues about from feeling. event_created_at is when
 * the calendar event was born, so the distance is real, not reported.
 */
export function LeadTimePanel({ meetings }) {
  const rows = useMemo(() => {
    const out = AHEAD_BUCKETS.map((b) => ({ ...b, total: 0, attended: 0, noShow: 0 }))
    for (const m of meetings) {
      if (!m.event_created_at) continue
      const days = Math.floor(
        (new Date(m.meeting_date) - new Date(m.event_created_at)) / 86400000
      )
      if (days < 0) continue
      const b = out.find((x) => days >= x.min && days <= x.max)
      if (!b) continue
      b.total++
      if (m.status === 'attended') b.attended++
      else if (m.status === 'no_show') b.noShow++
    }
    for (const b of out) {
      const settled = b.attended + b.noShow
      b.showRate = settled >= 5 ? Math.round((b.attended / settled) * 100) : null
    }
    return out
  }, [meetings])

  const max = Math.max(1, ...rows.map((r) => r.total))
  const rated = rows.filter((r) => r.showRate !== null)
  const best = rated.length > 1 ? [...rated].sort((a, b) => b.showRate - a.showRate)[0] : null
  const worst = rated.length > 1 ? [...rated].sort((a, b) => a.showRate - b.showRate)[0] : null

  return (
    <Panel
      title="כמה זמן מראש נקבעות פגישות"
      icon={CalendarClock}
      hint="והאם המרחק הורג הגעה"
    >
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs font-semibold text-slate-600">{r.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/60">
              <div
                className="flex h-full items-center rounded-lg bg-gradient-to-l from-amber-500 to-amber-400 px-2"
                style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }}
              >
                {r.total > 0 && <span className="text-[10px] font-bold text-white">{r.total}</span>}
              </div>
            </div>
            <span
              className={`w-14 shrink-0 text-end text-xs font-bold ${
                r.showRate === null
                  ? 'text-slate-300'
                  : r.showRate >= 55
                    ? 'text-green-700'
                    : r.showRate <= 35
                      ? 'text-red-600'
                      : 'text-slate-600'
              }`}
            >
              {r.showRate === null ? '—' : `${r.showRate}% הגעה`}
            </span>
          </div>
        ))}
      </div>

      {best && worst && best.label !== worst.label && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          הכי טוב מגיעים כשנקבע <b>{best.label}</b> מראש ({best.showRate}%), הכי פחות —{' '}
          <b>{worst.label}</b> ({worst.showRate}%). אחוז מוצג רק כשיש לפחות 5 פגישות שהוכרעו.
        </p>
      )}
    </Panel>
  )
}
