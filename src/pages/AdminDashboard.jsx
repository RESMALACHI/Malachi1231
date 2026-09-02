import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users, CalendarRange, Percent, ShieldAlert } from 'lucide-react'
import MonthFilter from '../components/MonthFilter'
import KpiCard from '../components/KpiCard'
import AnimatedNumber from '../components/AnimatedNumber'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { currentMonth, monthLabel } from '../lib/dateUtils'
import { getAllMeetingsForMonth, computeKpis, formatRate } from '../services/meetingsService'
import { REAL_AGENTS } from '../lib/agents'

export default function AdminDashboard() {
  const [{ year, month }, setPeriod] = useState(currentMonth)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setMeetings(await getAllMeetingsForMonth(year, month))
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת הנתונים')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  // One row per known agent (by name), including those with zero meetings.
  const rows = useMemo(() => {
    const byName = new Map()
    for (const m of meetings) {
      const name = m.agent_name || '—'
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name).push(m)
    }
    return REAL_AGENTS.map((name) => ({
      name,
      kpis: computeKpis(byName.get(name) || []),
    })).sort((a, b) => b.kpis.total - a.kpis.total)
  }, [meetings])

  const orgKpis = useMemo(() => computeKpis(meetings), [meetings])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">ממשק מנהל</h1>
          <p className="text-sm text-slate-500">
            סיכום ביצועי הסוכנים לחודש {monthLabel(year, month)}
          </p>
        </div>
        <MonthFilter year={year} month={month} onChange={setPeriod} disabled={loading} />
      </div>

      {loading ? (
        <div className="card py-16">
          <Spinner label="טוען נתוני סוכנים…" />
        </div>
      ) : error ? (
        <div className="card p-4 text-sm text-red-700">{error}</div>
      ) : (
        <>
          {/* Org-wide KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              title="סוכנים"
              value={<AnimatedNumber value={REAL_AGENTS.length} />}
              icon={Users}
              accent="brand"
            />
            <KpiCard
              title='סה"כ פגישות'
              value={<AnimatedNumber value={orgKpis.total} />}
              icon={CalendarRange}
              accent="blue"
            />
            <KpiCard
              title="אחוז הגעה כולל"
              value={formatRate(orgKpis.attendanceRate)}
              icon={Percent}
              accent="green"
            />
          </div>

          {/* Per-agent table */}
          {rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={ShieldAlert}
                title="אין סוכנים להצגה"
                description="לאחר שסוכנים יתחברו וירשמו במערכת, הם יופיעו כאן."
              />
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-semibold">סוכן</th>
                    <th className="px-4 py-3 font-semibold">סה"כ</th>
                    <th className="px-4 py-3 font-semibold">הגיעו</th>
                    <th className="px-4 py-3 font-semibold">לא הגיעו</th>
                    <th className="px-4 py-3 font-semibold">טרם עודכן</th>
                    <th className="px-4 py-3 font-semibold">אחוז הגעה</th>
                    <th className="px-4 py-3 font-semibold">זום / פרונטלי</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ name, kpis }, i) => (
                    <tr
                      key={name}
                      className="animate-fade-up transition-colors hover:bg-slate-50"
                      style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{name}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{kpis.total}</td>
                      <td className="px-4 py-3 text-green-700">{kpis.attended}</td>
                      <td className="px-4 py-3 text-red-600">{kpis.noShow}</td>
                      <td className="px-4 py-3 text-slate-500">{kpis.pending}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">
                          {formatRate(kpis.attendanceRate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="font-semibold text-slate-900">{kpis.zoom}</span>
                        {' / '}
                        <span className="text-slate-400">{kpis.frontal}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
