import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarRange,
  Percent,
  Video,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Camera,
  BarChart3,
  Handshake,
  Filter,
  TrendingUp,
} from 'lucide-react'
import { toPng } from 'html-to-image'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import FunnelReport from '../components/FunnelReport'
import {
  HourHeatPanel,
  LeadTimePanel,
  MoneyTrendPanel,
  TrendPanel,
  TypeComparePanel,
} from '../components/InsightCharts'
import MonthFilter from '../components/MonthFilter'
import KpiCard from '../components/KpiCard'
import AnimatedNumber from '../components/AnimatedNumber'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import { LogoMark } from '../components/Logo'
import Leaderboard from '../components/Leaderboard'
import MonthComparison from '../components/MonthComparison'
import BonusCard from '../components/BonusCard'
import DealsPanel from '../components/DealsPanel'
import {
  currentMonth,
  monthLabel,
  formatDay,
  formatTime,
  workingDaysElapsedInMonth,
} from '../lib/dateUtils'
import {
  getMonthlyMeetings,
  getAllMeetingsForMonth,
  getMeetingsBookedInMonth,
  computeKpis,
  formatRate,
} from '../services/meetingsService'
import {
  StatusDonut,
  ClientsPanel,
  DailyChart,
  WeekdayChart,
  AgentRatesChart,
  RepeatClientsTable,
} from '../components/ReportCharts'
import { isAdminAgent, isFieldAgent, isManagerAgent, managerViewOnly, REAL_AGENTS } from '../lib/agents'
import { openWhatsApp } from '../lib/whatsappLink'

function accountingMessage({ agent, label, kpis }) {
  return (
    `שלום אפרת,\n\n` +
    `🧾 *דוח פגישות חודשי*\n` +
    `👤 *סוכן:* ${agent}\n` +
    `📅 *חודש:* ${label}\n\n` +
    `📊 סה״כ פגישות: ${kpis.total}\n` +
    `✅ הגיעו: ${kpis.attended}\n` +
    `❌ לא הגיעו: ${kpis.noShow}\n` +
    `⏳ טרם עודכנו: ${kpis.pending}\n` +
    `💻 מתוך המגיעים — זום: ${kpis.attendedZoom}, פרונטלי: ${kpis.attendedFrontal}\n\n` +
    `📎 מצורפת תמונת הפגישות שהגיעו.\n\n` +
    `_הופק ממערכת הפגישות של מכללת R.E.S_`
  )
}

async function prepareReportImage(dataUrl, filename) {
  const blob = await fetch(dataUrl).then((res) => res.blob())

  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      return 'copied'
    } catch {
      // Some mobile browsers do not permit image clipboard writes. Downloading
      // keeps the report available for attachment in the WhatsApp picker.
    }
  }

  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
  return 'downloaded'
}

function SplitBar({ zoom, frontal }) {
  const total = zoom + frontal
  const zoomPct = total ? Math.round((zoom / total) * 100) : 0
  const frontalPct = total ? 100 - zoomPct : 0
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="origin-right bg-sky-400 animate-bar-grow"
          style={{ width: `${zoomPct}%` }}
        />
        <div
          className="origin-right bg-orange-400 animate-bar-grow"
          style={{ width: `${frontalPct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-400" /> זום {zoom} ({zoomPct}%)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-orange-400" /> פרונטלי {frontal} (
          {frontalPct}%)
        </span>
      </div>
    </div>
  )
}

// Branded header shown ONLY inside the exported PNG (hidden on screen) so the
// shared image is self-explanatory.
function ExportBanner({ agent, year, month }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <LogoMark className="h-12 w-12" rounded="rounded-2xl" />
        <div>
          <div className="text-lg font-extrabold leading-tight text-slate-900">
            מכללת R.E.S · דוח חודשי
          </div>
          <div className="text-sm font-semibold text-amber-600">
            {agent} · {monthLabel(year, month)}
          </div>
        </div>
      </div>
      <div className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-400">
        הופק ב-{new Intl.DateTimeFormat('he-IL').format(new Date())}
      </div>
    </div>
  )
}

// Meetings that actually arrived, shown only inside the exported image.
function AttendedMeetingsExportTable({ meetings }) {
  if (!meetings.length) {
    return (
      <div className="card rounded-3xl border-slate-100 p-6 text-center text-sm text-slate-500 shadow-md shadow-slate-200/50">
        אין פגישות שסומנו „הגיע” בחודש זה
      </div>
    )
  }
  return (
    <div className="card overflow-hidden rounded-3xl border-slate-100 shadow-md shadow-slate-200/50">
      <div className="border-b border-slate-100 px-5 py-3">
        <h3 className="font-bold text-slate-900">פגישות שהגיעו ({meetings.length})</h3>
      </div>
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="px-4 py-2.5 font-semibold">#</th>
            <th className="px-4 py-2.5 font-semibold">שם</th>
            <th className="px-4 py-2.5 font-semibold">תאריך</th>
            <th className="px-4 py-2.5 font-semibold">שעה</th>
            <th className="px-4 py-2.5 font-semibold">סוג</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {meetings.map((m, i) => (
            <tr key={m.id}>
              <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
              <td className="px-4 py-2.5 font-medium text-slate-800">
                {m.title || '(ללא כותרת)'}
              </td>
              <td className="px-4 py-2.5 text-slate-600">{formatDay(m.meeting_date)}</td>
              <td className="px-4 py-2.5 tabular-nums text-slate-600">
                {formatTime(m.meeting_date)}
              </td>
              <td className="px-4 py-2.5">
                {m.type === 'zoom' ? (
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
                    זום
                  </span>
                ) : m.type === 'frontal' ? (
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                    פרונטלי
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    לא ידוע
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ReportsPage() {
  const { user, selectedAgent } = useAuth()
  // A manager who also sells can look at either. The default is whichever the
  // person mostly is — איציק opens on everyone, ויטלי opens on himself — and the
  // switch below only appears when there is genuinely something to switch.
  const canSeeAll = isManagerAgent(selectedAgent)
  const canSwitch = canSeeAll && isFieldAgent(selectedAgent)
  const [allAgents, setAllAgents] = useState(() => managerViewOnly(selectedAgent))
  const isManager = canSeeAll && allAgents
  const [{ year, month }, setPeriod] = useState(currentMonth)
  // Deep link from the global search: /reports?tab=deals opens straight on the
  // right tab. The funnel is gated, so a link to it falls back for non-managers.
  const [urlParams, setUrlParams] = useSearchParams()
  const allowedTabs = ['stats', 'trends', 'deals'].concat(
    canSeeAll || isAdminAgent(selectedAgent) ? ['funnel'] : []
  )
  const urlTab = urlParams.get('tab')
  const [tab, setTab] = useState(() =>
    allowedTabs.includes(urlTab) ? urlTab : 'stats'
  ) // 'stats' | 'trends' | 'funnel' | 'deals'
  useEffect(() => {
    if (!urlTab) return
    if (allowedTabs.includes(urlTab)) setTab(urlTab)
    setUrlParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab])
  const [meetings, setMeetings] = useState([])
  const [prevMeetings, setPrevMeetings] = useState([]) // last month, manager only
  const [bookedThisMonth, setBookedThisMonth] = useState([]) // by event_created_at, manager only
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [preparingEfratExport, setPreparingEfratExport] = useState(false)
  const [toast, setToast] = useState(null)

  const exportRef = useRef(null)

  // The month before the one on screen. Crossing January has to roll the year
  // back too, which `new Date(year, month - 1)` handles for us.
  const prev = useMemo(() => {
    const d = new Date(year, month - 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  }, [year, month])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      // Manager's reports cover ALL agents' meetings; a regular agent sees theirs.
      const data = isManager
        ? (await getAllMeetingsForMonth(year, month)).filter((m) =>
            REAL_AGENTS.includes(m.agent_name)
          )
        : await getMonthlyMeetings(selectedAgent, year, month)
      setMeetings(data)

      // Last month (for the comparison) + this month's bookings by creation date
      // (for the per-agent daily average) — manager only, so an agent's report
      // never waits on the extra queries.
      if (isManager) {
        const [before, booked] = await Promise.all([
          getAllMeetingsForMonth(prev.year, prev.month),
          getMeetingsBookedInMonth(year, month),
        ])
        setPrevMeetings(before.filter((m) => REAL_AGENTS.includes(m.agent_name)))
        setBookedThisMonth(booked.filter((m) => REAL_AGENTS.includes(m.agent_name)))
      } else {
        setPrevMeetings([])
        setBookedThisMonth([])
      }
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת הנתונים')
    } finally {
      setLoading(false)
    }
  }, [user, isManager, selectedAgent, year, month, prev])

  useEffect(() => {
    load()
  }, [load])

  const kpis = useMemo(() => computeKpis(meetings), [meetings])

  // Agent leaderboard (manager only) — ranked by total meetings scheduled.
  const leaderboard = useMemo(() => {
    if (!isManager) return []
    const byName = new Map()
    for (const m of meetings) {
      if (!REAL_AGENTS.includes(m.agent_name)) continue
      byName.set(m.agent_name, [...(byName.get(m.agent_name) || []), m])
    }

    // How many meetings each agent BOOKED this month (by creation date), so the
    // daily average measures the work of setting appointments — not how many
    // happen to fall in the month.
    const bookedByName = new Map()
    for (const m of bookedThisMonth) {
      bookedByName.set(m.agent_name, (bookedByName.get(m.agent_name) || 0) + 1)
    }
    const days = workingDaysElapsedInMonth(year, month)

    return REAL_AGENTS.map((name) => {
      const k = computeKpis(byName.get(name) || [])
      const booked = bookedByName.get(name) || 0
      return {
        name,
        total: k.total,
        attended: k.attended,
        pending: k.pending,
        decided: k.decided,
        attendanceRate: k.attendanceRate,
        bookedThisMonth: booked,
        avgPerDay: days > 0 ? booked / days : null,
      }
    }).sort((a, b) => b.total - a.total)
  }, [isManager, meetings, bookedThisMonth, year, month])

  // Only meetings marked as attended, chronological — listed in the image.
  const exportMeetings = useMemo(
    () =>
      [...meetings]
        .filter((m) => m.status === 'attended')
        .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date)),
    [meetings]
  )

  const buildFilename = useCallback(() => {
    const monthEn = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(year, month, 1)
    )
    const agent = (selectedAgent || 'agent').trim().replace(/\s+/g, '-')
    return `RES-Report-${agent}-${monthEn}-${year}.png`
  }, [selectedAgent, year, month])

  // Snapshot the report container to a PNG data URL. Adds .report-capture (white
  // padded box + frozen transforms) and the export banner while capturing, so
  // the downloaded image is flat and clean.
  const captureReportPng = useCallback(async () => {
    const node = exportRef.current
    if (!node) return null
    setExporting(true)
    try {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready
        } catch {
          /* ignore */
        }
      }
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r))
      )
      return await toPng(node, {
        pixelRatio: 2, // crisp on mobile / retina
        cacheBust: true, // avoid stale image/pattern glitches
        backgroundColor: '#ffffff', // solid bg instead of the page's pattern
        width: node.offsetWidth,
        height: node.offsetHeight,
      })
    } finally {
      setExporting(false)
    }
  }, [])

  const handleExportToEfrat = useCallback(async () => {
    if (exporting || preparingEfratExport) return
    setPreparingEfratExport(true)
    try {
      const dataUrl = await captureReportPng()
      if (!dataUrl) throw new Error('capture_failed')

      const { data, error: fnError } = await supabase.functions.invoke(
        'send-whatsapp-report',
        {
          body: {
            preview: true,
            agentName: selectedAgent,
            monthNum: month + 1,
            year,
          },
        }
      )
      if (fnError || !data?.ok || !data?.recipientNumber) {
        throw new Error(data?.error || fnError?.message || 'contact_failed')
      }

      const agent = isManager ? 'כל הסוכנים' : selectedAgent
      const message = accountingMessage({ agent, label: monthLabel(year, month), kpis })
      const imageMode = await prepareReportImage(dataUrl, buildFilename())
      if (!openWhatsApp(data.recipientNumber, message)) throw new Error('invalid_number')
      setToast({
        type: 'success',
        text:
          imageMode === 'copied'
            ? 'התמונה הועתקה — הדביקו אותה בווצאפ שנפתח ושלחו לאפרת'
            : 'התמונה הורדה — צרפו אותה בווצאפ שנפתח ושלחו לאפרת',
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[reports] Efrat export failed:', err)
      setToast({
        type: 'error',
        text: `ייצוא התמונה לאפרת נכשל: ${err.message || ''}`,
      })
    } finally {
      setPreparingEfratExport(false)
    }
  }, [
    exporting,
    preparingEfratExport,
    captureReportPng,
    buildFilename,
    selectedAgent,
    year,
    month,
    isManager,
    kpis,
  ])

  const busy = exporting || preparingEfratExport
  // The export button snapshots `exportRef`, which is only mounted on the stats
  // tab — so it is hidden entirely while the deals tab is open.
  const canExport = !loading && !error && tab === 'stats'

  // The funnel is a whole-company view, so it belongs to whoever may look at
  // the whole company — not to whichever scope the switch happens to be on.
  // The admin is included: whoever runs the system owns the numbers, even
  // without the manager role ticked.
  const TABS = [
    { key: 'stats', label: 'סטטיסטיקות', icon: BarChart3 },
    // Everyone gets trends — an agent sees their own six months, a manager the
    // company's, following the same scope switch as the rest of the page.
    { key: 'trends', label: 'מגמות', icon: TrendingUp },
    ...(canSeeAll || isAdminAgent(selectedAgent)
      ? [{ key: 'funnel', label: 'משפך', icon: Filter }]
      : []),
    { key: 'deals', label: 'עסקאות', icon: Handshake },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">דוחות וסטטיסטיקות</h1>
          <p className="text-sm text-slate-500">
            {isManager ? 'כל הסוכנים' : selectedAgent} · סיכום לחודש{' '}
            {monthLabel(year, month)}
          </p>
          {canSwitch && (
            <div className="mt-2 inline-flex rounded-xl bg-slate-100 p-1">
              {[
                [false, 'שלי'],
                [true, 'כל הסוכנים'],
              ].map(([val, label]) => (
                <button
                  key={label}
                  onClick={() => setAllAgents(val)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                    allAgents === val ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions — the export button lives OUTSIDE the captured ref, so it can
            never appear inside the downloaded image. */}
        <div className="flex flex-wrap items-center gap-2">
          <MonthFilter year={year} month={month} onChange={setPeriod} disabled={loading} />
          {tab === 'stats' && (
          <button
            onClick={handleExportToEfrat}
            disabled={!canExport || busy}
            title="ייצוא תמונת הפגישות שהגיעו ופתיחת ווצאפ של הסוכן"
            className="btn-gradient group min-h-[3.25rem] min-w-[13.5rem] !gap-2.5 !rounded-2xl !px-3.5 !py-2 hover:shadow-amber-500/20 focus:ring-amber-400"
          >
            {preparingEfratExport ? (
              <Spinner label="מכין תמונה…" />
            ) : (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 shadow-sm shadow-black/20 ring-1 ring-amber-200/70 transition-transform duration-200 ease-out group-hover:scale-105">
                  <Camera className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                </span>
                <span className="flex flex-col items-start gap-0.5 leading-tight">
                  <span>ייצוא כתמונה לאפרת</span>
                  <span className="text-[10px] font-medium text-amber-200/80">פגישות שהגיעו בלבד</span>
                </span>
              </>
            )}
          </button>
          )}
        </div>
      </div>

      {/* Stats ↔ deals. Four tabs with icons are wider than a phone — this was
          the one element in the app that overflowed 390px and dragged the whole
          layout sideways. On phones it scrolls inside itself; desktop unchanged. */}
      <div className="flex max-w-full self-start overflow-x-auto rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm sm:inline-flex sm:overflow-visible">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-200 sm:px-4 ${
                active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'trends' ? (
        <div className="grid grid-cols-1 gap-4">
          <TrendPanel year={year} month={month} agentName={isManager ? null : selectedAgent} />
          <MoneyTrendPanel year={year} month={month} agentName={isManager ? null : selectedAgent} />
        </div>
      ) : tab === 'funnel' ? (
        <FunnelReport year={year} month={month} monthLabel={monthLabel(year, month)} />
      ) : tab === 'deals' ? (
        <DealsPanel
          agentName={selectedAgent}
          isManager={isManager}
          meetings={meetings}
          year={year}
          month={month}
          monthLabel={monthLabel(year, month)}
        />
      ) : loading ? (
        <div className="card py-16">
          <Spinner label="טוען נתונים…" />
        </div>
      ) : error ? (
        <div className="card p-4 text-sm text-red-700">{error}</div>
      ) : (
        // Everything inside this ref is what gets captured into the PNG. The
        // .report-capture class is added only while exporting (white padded
        // box + frozen transforms) so the snapshot is flat and clean.
        <div
          ref={exportRef}
          className={`flex flex-col gap-5 ${exporting ? 'report-capture' : ''}`}
        >
          {exporting && (
            <ExportBanner
              agent={isManager ? 'כל הסוכנים' : selectedAgent}
              year={year}
              month={month}
            />
          )}

          {/* Full dashboard — on screen only (hidden while exporting). */}
          {!exporting && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  title='סה"כ פגישות שנקבעו'
                  value={<AnimatedNumber value={kpis.total} />}
                  subtitle={`${monthLabel(year, month)}`}
                  icon={CalendarRange}
                  accent="brand"
                />
                <KpiCard
                  title="אחוז הגעה"
                  value={formatRate(kpis.attendanceRate)}
                  subtitle={
                    kpis.decided > 0
                      ? `${kpis.attended} מתוך ${kpis.decided} שסומנו`
                      : 'אף פגישה עדיין לא סומנה'
                  }
                  icon={Percent}
                  accent="green"
                />
                <KpiCard
                  title="פילוח: זום מול פרונטלי"
                  value={
                    <span>
                      <span className="text-sky-500">
                        <AnimatedNumber value={kpis.zoom} />
                      </span>{' '}
                      /{' '}
                      <span className="text-orange-500">
                        <AnimatedNumber value={kpis.frontal} />
                      </span>
                    </span>
                  }
                  icon={Video}
                  accent="sky"
                >
                  <SplitBar zoom={kpis.zoom} frontal={kpis.frontal} />
                </KpiCard>
              </div>

              {/* Status breakdown */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  title="הגיעו"
                  value={<AnimatedNumber value={kpis.attended} />}
                  icon={CheckCircle2}
                  accent="green"
                />
                <KpiCard
                  title="לא הגיעו"
                  value={<AnimatedNumber value={kpis.noShow} />}
                  icon={XCircle}
                  accent="red"
                />
                <KpiCard
                  title="טרם עודכנו"
                  value={<AnimatedNumber value={kpis.pending} />}
                  icon={Clock}
                  accent="amber"
                />
              </div>

              {/* Charts. On screen only: the exported PNG goes to accounting,
                  which needs the totals, not the analysis. */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <StatusDonut kpis={kpis} />
                <ClientsPanel kpis={kpis} />
              </div>

              <DailyChart meetings={meetings} year={year} month={month} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <WeekdayChart meetings={meetings} />
                {isManager ? (
                  <AgentRatesChart rows={leaderboard} />
                ) : (
                  <RepeatClientsTable meetings={meetings} />
                )}
              </div>

              {isManager && <RepeatClientsTable meetings={meetings} />}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TypeComparePanel meetings={meetings} />
                <HourHeatPanel meetings={meetings} />
              </div>

              <LeadTimePanel meetings={meetings} />

              {/* Black separator between the main block and "מבין שהגיעו". */}
              <div className="h-0.5 w-full rounded-full bg-slate-900" />
            </>
          )}

          {/* Of those who arrived — how many zoom vs frontal (shown on screen AND
              in the export). */}
          <KpiCard
            title="מבין שהגיעו: זום מול פרונטלי"
            value={
              <span>
                <span className="text-sky-500">
                  <AnimatedNumber value={kpis.attendedZoom} />
                </span>{' '}
                /{' '}
                <span className="text-orange-500">
                  <AnimatedNumber value={kpis.attendedFrontal} />
                </span>
              </span>
            }
            subtitle={`מתוך ${kpis.attended} שהגיעו`}
            icon={Video}
            accent="sky"
          >
            <SplitBar zoom={kpis.attendedZoom} frontal={kpis.attendedFrontal} />
          </KpiCard>

          {/* Attended meetings table — export only. */}
          {exporting && <AttendedMeetingsExportTable meetings={exportMeetings} />}

          {/* Month-on-month + leaderboard — manager only, on screen.
              Kept out of the export for the same reason the leaderboard is:
              the image goes to accounting, which needs this month's numbers,
              not a running commentary on the team's direction. */}
          {!exporting && isManager && (
            <>
              <div className="h-0.5 w-full rounded-full bg-slate-900" />
              <MonthComparison
                meetings={meetings}
                prevMeetings={prevMeetings}
                monthLabel={monthLabel(year, month)}
                prevMonthLabel={monthLabel(prev.year, prev.month)}
              />
              <Leaderboard rows={leaderboard} />
            </>
          )}
        </div>
      )}

      {/* Meeting bonus — personal pay, so deliberately outside `exportRef`:
          it must not land in the report image sent to accounting. */}
      {tab === 'stats' && !loading && !error && !isManager && (
        <BonusCard meetings={meetings} monthLabel={monthLabel(year, month)} />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
