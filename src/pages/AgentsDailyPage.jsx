import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  RefreshCw,
  Loader2,
  Phone,
  PhoneCall,
  Handshake,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  StickyNote,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isManagerAgent, REAL_AGENTS } from '../lib/agents'
import { getMeetingsBookedOnDate } from '../services/meetingsService'
import { getDaySummaries, localDateKey } from '../services/daySummaryService'
import Spinner from '../components/Spinner'

/* Small stat cell used across the table + cards. */
function Stat({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900',
    amber: 'text-amber-600',
    green: 'text-green-600',
  }
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-slate-50 px-2 py-2">
      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
      <span className={`text-lg font-extrabold tabular-nums ${tones[tone]}`}>{value}</span>
    </div>
  )
}

export default function AgentsDailyPage() {
  const { selectedAgent } = useAuth()
  // The role, not the dashboard mode: an agent who also manages belongs here.
  const isManager = isManagerAgent(selectedAgent)

  const [dateKey, setDateKey] = useState(() => localDateKey())
  const [rows, setRows] = useState(null)
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!isManager) return
    setLoading(true)
    setErr('')
    try {
      const [meetings, sums] = await Promise.all([
        getMeetingsBookedOnDate(dateKey),
        getDaySummaries(dateKey),
      ])
      setRows(meetings)
      setSummaries(sums)
    } catch (e) {
      setErr(e.message || 'שגיאה בטעינת הנתונים')
      setRows([])
      setSummaries([])
    } finally {
      setLoading(false)
    }
  }, [dateKey, isManager])

  useEffect(() => {
    load()
  }, [load])

  // One row per agent: meetings come live from the calendar, the rest from the
  // summary that agent filed (if any).
  const perAgent = useMemo(() => {
    const byAgent = new Map(summaries.map((s) => [s.agent_name, s]))
    return REAL_AGENTS.map((name) => {
      const mine = (rows || []).filter((m) => m.agent_name === name)
      const zoom = mine.filter((m) => m.type === 'zoom').length
      const frontal = mine.filter((m) => m.type === 'frontal').length
      const s = byAgent.get(name)
      return {
        name,
        booked: mine.length,
        zoom,
        frontal,
        unknown: mine.length - zoom - frontal,
        reported: Boolean(s),
        calls: s?.calls ?? null,
        longCalls: s?.long_calls ?? null,
        followupsIn: s?.followups_in ?? null,
        followupsOut: s?.followups_out ?? null,
        from: s?.work_from || null,
        to: s?.work_to || null,
        notes: s?.notes || null,
      }
    }).sort((a, b) => b.booked - a.booked)
  }, [rows, summaries])

  const totals = useMemo(
    () => ({
      booked: perAgent.reduce((s, a) => s + a.booked, 0),
      calls: perAgent.reduce((s, a) => s + (a.calls || 0), 0),
      longCalls: perAgent.reduce((s, a) => s + (a.longCalls || 0), 0),
      reported: perAgent.filter((a) => a.reported).length,
    }),
    [perAgent]
  )

  if (!isManager) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col gap-5">
      {/* Header + date picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-gradient">נתונים יומיים</h1>
            <p className="text-sm text-slate-500">מה כל סוכן עשה ביום נבחר.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative">
            <CalendarDays
              className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 pe-10 text-sm font-semibold outline-none transition focus:border-amber-400"
            />
          </span>
          <button
            onClick={load}
            title="רענון"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Day totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card flex flex-col items-center gap-0.5 p-4">
          <span className="text-xs font-semibold text-slate-500">סה״כ פגישות שתואמו</span>
          <span className="text-3xl font-extrabold tabular-nums text-slate-900">
            {totals.booked}
          </span>
        </div>
        <div className="card flex flex-col items-center gap-0.5 p-4">
          <span className="text-xs font-semibold text-slate-500">סה״כ שיחות</span>
          <span className="text-3xl font-extrabold tabular-nums text-slate-900">
            {totals.calls}
          </span>
        </div>
        <div className="card flex flex-col items-center gap-0.5 p-4">
          <span className="text-xs font-semibold text-slate-500">מעל 4 דקות</span>
          <span className="text-3xl font-extrabold tabular-nums text-slate-900">
            {totals.longCalls}
          </span>
        </div>
        <div className="card flex flex-col items-center gap-0.5 p-4">
          <span className="text-xs font-semibold text-slate-500">דיווחו סיכום</span>
          <span className="text-3xl font-extrabold tabular-nums text-slate-900">
            {totals.reported}/{REAL_AGENTS.length}
          </span>
        </div>
      </div>

      {err && (
        <div className="card p-4 text-sm text-red-700">{err}</div>
      )}

      {loading ? (
        <div className="card py-16">
          <Spinner label="טוען נתונים…" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {perAgent.map((a) => (
            <div key={a.name} className="card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold text-slate-900">{a.name}</span>
                {a.reported ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                    דיווח ✓
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                    טרם דיווח
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Stat icon={Handshake} label="תואמו" value={a.booked} />
                <Stat icon={Handshake} label="פרונטלי" value={a.frontal} />
                <Stat icon={Handshake} label="זום" value={a.zoom} />
                <Stat
                  icon={Phone}
                  label="שיחות"
                  value={a.calls ?? '—'}
                  tone={a.calls == null ? 'amber' : 'slate'}
                />
                <Stat
                  icon={PhoneCall}
                  label="מעל 4 דק׳"
                  value={a.longCalls ?? '—'}
                  tone={a.longCalls == null ? 'amber' : 'slate'}
                />
                <Stat
                  icon={ArrowDownToLine}
                  label="פולואפ נכנס"
                  value={a.followupsIn ?? '—'}
                  tone={a.followupsIn == null ? 'amber' : 'slate'}
                />
                <Stat
                  icon={ArrowUpFromLine}
                  label="פולואפ יוצא"
                  value={a.followupsOut ?? '—'}
                  tone={a.followupsOut == null ? 'amber' : 'slate'}
                />
              </div>

              {(a.from || a.to || a.notes) && (
                <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3 text-sm">
                  {(a.from || a.to) && (
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      שעות עבודה: {a.from || '—'} - {a.to || '—'}
                    </span>
                  )}
                  {a.notes && (
                    <span className="flex items-start gap-1.5 text-slate-600">
                      <StickyNote
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                      <span className="whitespace-pre-wrap">{a.notes}</span>
                    </span>
                  )}
                </div>
              )}

              {!a.reported && a.booked === 0 && (
                <p className="text-xs text-slate-400">
                  אין פעילות ליום זה, והסוכן לא שלח סיכום.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-slate-400">
        הפגישות נספרות אוטומטית מהיומן · שיחות, פולואפים ושעות מגיעים מהסיכום שהסוכן שולח.
      </p>
    </div>
  )
}
