import { Trophy } from 'lucide-react'
import { formatRate } from '../services/meetingsService'

const AGENT_DOT = {
  'ודיע': 'bg-sky-500',
  'מרים': 'bg-rose-500',
  'עדי': 'bg-indigo-500',
  'מלאכי אזערי': 'bg-amber-500',
}
const MEDALS = ['🥇', '🥈', '🥉']

/** "2.3" — a per-day average, one decimal, or "—" when there is nothing yet. */
function avg1(n) {
  return n == null ? '—' : n.toFixed(1)
}

/**
 * Agent leaderboard — ranked by how many meetings each agent scheduled.
 * @param {{ rows: {name, total, attended, attendanceRate, avgPerDay, bookedThisMonth}[] }} props
 *   rows sorted desc by total
 */
export default function Leaderboard({ rows }) {
  const maxTotal = Math.max(1, ...rows.map((r) => r.total))
  const maxAvg = Math.max(0.1, ...rows.map((r) => r.avgPerDay || 0))

  return (
    <div className="card overflow-hidden rounded-3xl border-slate-100 shadow-md shadow-slate-200/50">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-slate-100 px-5 py-3.5">
        <Trophy className="h-5 w-5 text-amber-500" aria-hidden="true" />
        <h3 className="font-bold text-slate-900">טבלת מובילים — הכי הרבה פגישות</h3>
        <span className="text-xs font-medium text-slate-400">
          · ממוצע קביעה ליום = פגישות שנקבעו החודש, לחלק לימי עבודה (א׳–ה׳)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-4 py-2.5 font-semibold">מקום</th>
              <th className="px-4 py-2.5 font-semibold">סוכן</th>
              <th className="px-4 py-2.5 font-semibold">סה"כ פגישות</th>
              <th className="px-4 py-2.5 font-semibold">ממוצע קביעה ליום</th>
              <th className="px-4 py-2.5 font-semibold">הגיעו</th>
              <th className="px-4 py-2.5 font-semibold">טרם עודכנו</th>
              <th className="px-4 py-2.5 font-semibold">אחוז הגעה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.name} className={i === 0 ? 'bg-amber-50/60' : ''}>
                <td className="px-4 py-3 text-center text-base font-bold text-slate-700">
                  {MEDALS[i] || i + 1}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${AGENT_DOT[r.name] || 'bg-slate-500'}`}
                    />
                    {r.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-slate-900"
                        style={{ width: `${Math.round((r.total / maxTotal) * 100)}%` }}
                      />
                    </div>
                    <span className="font-extrabold tabular-nums text-slate-900">
                      {r.total}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-amber-500"
                        style={{ width: `${Math.round(((r.avgPerDay || 0) / maxAvg) * 100)}%` }}
                      />
                    </div>
                    <span className="font-extrabold tabular-nums text-slate-900">
                      {avg1(r.avgPerDay)}
                    </span>
                    {r.bookedThisMonth != null && (
                      <span className="text-[11px] tabular-nums text-slate-400">
                        ({r.bookedThisMonth})
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium tabular-nums text-green-700">
                  {r.attended}
                </td>
                <td className="px-4 py-3 font-medium tabular-nums text-amber-600">
                  {r.pending}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">
                    {formatRate(r.attendanceRate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
