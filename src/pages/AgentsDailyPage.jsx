import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  FileBarChart2,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  CalendarPlus,
  UserCheck,
  Handshake,
  Wallet,
  Phone,
  ClipboardCheck,
  AlertTriangle,
  MessageCircle,
  Copy,
  Printer,
  StickyNote,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isManagerAgent, REAL_AGENTS } from '../lib/agents'
import { buildDailyReport, reportText } from '../lib/dailyReport'
import { shareWhatsApp } from '../lib/whatsappLink'
import { localDateKey } from '../services/daySummaryService'
import { loadDailyReport } from '../services/dailyReportService'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'

/**
 * דוח יומי — the office's day on one page, for a manager to read, forward and
 * print. It used to be "נתונים יומיים": meetings booked plus whatever each
 * agent typed into their summary. A report also has to say what HAPPENED —
 * which meetings took place and who came, what was signed, what was collected —
 * and what still needs a hand (unmarked meetings, missing summaries).
 */

const shekel = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

const longDate = (key) =>
  new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${key}T12:00:00`)
  )
const shortDate = (key) => {
  const d = new Date(`${key}T12:00:00`)
  const wd = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(d)
  return `${wd} ${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`
}
const shiftDay = (key, by) => {
  const d = new Date(`${key}T12:00:00`)
  d.setDate(d.getDate() + by)
  return localDateKey(d)
}

/** A headline figure. `sub` explains it; `chip` compares it. */
function Kpi({ icon: Icon, tone, label, value, sub, chip }) {
  return (
    <div className="card flex flex-col gap-1 p-4 print:border print:shadow-none">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {label}
      </span>
      <span className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</span>
      {sub && <span className="text-[11px] font-semibold text-slate-500">{sub}</span>}
      {chip}
    </div>
  )
}

const dash = (v) => (v === null || v === undefined ? '—' : v)

export default function AgentsDailyPage() {
  const { selectedAgent } = useAuth()
  // The role, not the dashboard mode: an agent who also manages belongs here.
  if (!isManagerAgent(selectedAgent)) return <Navigate to="/" replace />
  return <DailyReport />
}

/** The report itself — the page above only decides who may see it. */
export function DailyReport() {
  const today = localDateKey()

  const [dateKey, setDateKey] = useState(today)
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      setRaw(await loadDailyReport(dateKey))
    } catch (e) {
      setErr(e.message || 'שגיאה בטעינת הדוח')
      setRaw(null)
    } finally {
      setLoading(false)
    }
  }, [dateKey])

  useEffect(() => {
    load()
  }, [load])

  // Rebuilt with every load, so "later today" vs "unmarked" follows the clock
  // as of the last refresh.
  const report = useMemo(
    () =>
      raw
        ? buildDailyReport({ agents: REAL_AGENTS, ...raw, now: Date.now(), inProgress: dateKey === today })
        : null,
    [raw, dateKey, today]
  )
  const text = useMemo(() => (report ? reportText(report, shortDate(dateKey)) : ''), [report, dateKey])

  const t = report?.totals
  const pace =
    t && t.paceAvg ? (
      <span
        className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
          t.booked >= t.paceAvg ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {t.booked >= t.paceAvg ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        ממוצע יומי {t.paceAvg}
      </span>
    ) : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setToast({ type: 'success', text: 'הדוח הועתק' })
    } catch {
      setToast({ type: 'error', text: 'ההעתקה נחסמה בדפדפן' })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Title, day, actions ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-amber-300 shadow-md print:hidden">
            <FileBarChart2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-gradient print:text-slate-900">דוח יומי</h1>
            <p className="text-sm font-semibold text-slate-600">{longDate(dateKey)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {/* Day by day — RTL, so "back in time" points right. */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white">
            <button
              onClick={() => setDateKey((k) => shiftDay(k, -1))}
              className="flex h-10 w-10 items-center justify-center text-slate-600 transition hover:bg-slate-50"
              aria-label="היום הקודם"
              title="היום הקודם"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              type="date"
              value={dateKey}
              max={today}
              onChange={(e) => e.target.value && setDateKey(e.target.value)}
              className="h-10 border-x border-slate-200 bg-transparent px-2 text-sm font-semibold outline-none"
              aria-label="תאריך הדוח"
            />
            <button
              onClick={() => setDateKey((k) => shiftDay(k, 1))}
              disabled={dateKey >= today}
              className="flex h-10 w-10 items-center justify-center text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
              aria-label="היום הבא"
              title="היום הבא"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {dateKey !== today && (
            <button
              onClick={() => setDateKey(today)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              היום
            </button>
          )}
          <button
            onClick={load}
            title="רענון"
            aria-label="רענון"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>

          <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />

          <button
            onClick={() => shareWhatsApp(text)}
            disabled={!report}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-green-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:scale-95 disabled:opacity-50"
            title="פתיחת הדוח בווצאפ — בוחרים לאן לשלוח"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            שליחה בווצאפ
          </button>
          <button
            onClick={copy}
            disabled={!report}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
            aria-label="העתקת הדוח"
            title="העתקת הדוח כטקסט"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => window.print()}
            disabled={!report}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
            aria-label="הדפסה או שמירה כ-PDF"
            title="הדפסה / שמירה כ-PDF"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {err && <div className="card p-4 text-sm text-red-700">{err}</div>}

      {loading && !report ? (
        <div className="card py-16">
          <Spinner label="מכין את הדוח…" />
        </div>
      ) : report ? (
        <>
          {/* ── The day in six numbers ── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              icon={CalendarPlus}
              tone="bg-amber-100 text-amber-700"
              label="פגישות שנקבעו"
              value={t.booked}
              sub={`פרונטלי ${t.frontal} · זום ${t.zoom}`}
              chip={pace}
            />
            <Kpi
              icon={UserCheck}
              tone="bg-green-100 text-green-700"
              label="הגיעו לפגישות"
              // Came, out of those MARKED — unmarked and still-to-come are said
              // separately underneath, never counted as misses.
              value={t.attended + t.noShow ? `${t.attended}/${t.attended + t.noShow}` : '—'}
              sub={
                t.held
                  ? [
                      t.attendanceRate != null && `${t.attendanceRate}% הגעה`,
                      t.unmarked && `${t.unmarked} לא סומנו`,
                      t.upcoming && `${t.upcoming} בהמשך היום`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || `${t.held} פגישות ביום זה`
                  : 'אין פגישות ביום זה'
              }
            />
            <Kpi
              icon={Handshake}
              tone="bg-violet-100 text-violet-700"
              label="עסקאות"
              value={t.deals}
              sub={t.deals ? shekel.format(t.dealAmount) : 'לא נסגרו עסקאות'}
            />
            <Kpi
              icon={Wallet}
              tone="bg-emerald-100 text-emerald-700"
              label="נגבה"
              value={shekel.format(t.collected)}
              sub="חיובים שנרשמו לתאריך זה"
            />
            <Kpi
              icon={Phone}
              tone="bg-sky-100 text-sky-700"
              label="שיחות"
              value={t.calls}
              sub={`מעל 4 דק׳: ${t.longCalls}`}
            />
            <Kpi
              icon={ClipboardCheck}
              tone="bg-slate-100 text-slate-700"
              label="שלחו סיכום"
              value={`${t.reported}/${t.expected}`}
              sub={t.reported === t.expected ? 'כולם דיווחו' : `חסרים ${t.expected - t.reported}`}
            />
          </div>

          {/* ── Needs a hand ── */}
          {report.flags.length > 0 && (
            <div className="card flex flex-col gap-1.5 border-amber-200 bg-amber-50/70 p-4">
              {report.flags.map((f) => (
                <p key={f.kind} className="flex items-start gap-2 text-sm font-semibold text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  {f.text}
                </p>
              ))}
            </div>
          )}

          {/* ── Per agent: a table where there is room, cards on a phone ── */}
          <div className="card hidden overflow-x-auto p-0 md:block print:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500">
                  <th className="px-3 py-2.5 text-start">סוכן</th>
                  <th className="px-2 py-2.5">נקבעו</th>
                  <th className="px-2 py-2.5">פרונטלי / זום</th>
                  <th className="px-2 py-2.5">הגיעו</th>
                  <th className="px-2 py-2.5">לא הגיעו</th>
                  <th className="px-2 py-2.5">לא סומנו</th>
                  <th className="px-2 py-2.5">עסקאות</th>
                  <th className="px-2 py-2.5">נגבה</th>
                  <th className="px-2 py-2.5">שיחות</th>
                  <th className="px-2 py-2.5" title="פגישות שנקבעו על כל 100 שיחות">קביעות ל-100</th>
                  <th className="px-2 py-2.5">פולואפ נכנס / יוצא</th>
                  <th className="px-2 py-2.5">שעות</th>
                  <th className="px-3 py-2.5">סיכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((r) => {
                  const quiet = !r.booked && !r.held && !r.deals && !r.collected && !r.reported
                  return (
                    <tr key={r.name} className={quiet ? 'text-slate-400' : 'text-slate-800'}>
                      <td className="px-3 py-2.5 font-bold">{r.name}</td>
                      <td className="px-2 py-2.5 text-center text-base font-extrabold tabular-nums">{r.booked}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums text-slate-500">
                        {r.booked ? `${r.frontal} / ${r.zoom}` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold tabular-nums text-green-700">{r.held ? r.attended : '—'}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums text-rose-600">{r.held ? r.noShow : '—'}</td>
                      <td className={`px-2 py-2.5 text-center tabular-nums ${r.unmarked ? 'font-bold text-amber-600' : ''}`}>
                        {r.held ? r.unmarked : '—'}
                        {r.upcoming > 0 && (
                          <span className="ms-1 text-[11px] font-semibold text-slate-400" title="פגישות שעוד לא התקיימו">
                            +{r.upcoming} בהמשך
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums">
                        {r.deals ? (
                          <span className="font-bold text-violet-700">
                            {r.deals} · {shekel.format(r.dealAmount)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{r.collected ? shekel.format(r.collected) : '—'}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums">
                        {r.calls == null ? '—' : `${r.calls}${r.longCalls ? ` (${r.longCalls})` : ''}`}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums">{dash(r.perHundred)}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums">
                        {r.reported ? `${dash(r.followupsIn)} / ${dash(r.followupsOut)}` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-center text-xs tabular-nums">
                        {r.from || r.to ? `${r.from || '—'}–${r.to || '—'}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.reported ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">✓</span>
                        ) : REAL_AGENTS.includes(r.name) ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">חסר</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-extrabold text-slate-900">
                  <td className="px-3 py-2.5">סה״כ</td>
                  <td className="px-2 py-2.5 text-center text-base tabular-nums">{t.booked}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{t.frontal} / {t.zoom}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-green-700">{t.attended}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-rose-600">{t.noShow}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-amber-600">
                    {t.unmarked}
                    {t.upcoming > 0 && <span className="ms-1 text-[11px] font-semibold text-slate-400">+{t.upcoming}</span>}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-violet-700">
                    {t.deals} · {shekel.format(t.dealAmount)}
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{shekel.format(t.collected)}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">
                    {t.calls} ({t.longCalls})
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums">
                    {t.calls ? Math.round((t.booked / t.calls) * 1000) / 10 : '—'}
                  </td>
                  <td className="px-2 py-2.5" />
                  <td className="px-2 py-2.5" />
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {t.reported}/{t.expected}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-col gap-3 md:hidden print:hidden">
            {report.rows.map((r) => {
              const quiet = !r.booked && !r.held && !r.deals && !r.collected && !r.reported
              return (
                <div key={r.name} className={`card flex flex-col gap-3 p-4 ${quiet ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-slate-900">{r.name}</span>
                    {r.reported ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">סיכום ✓</span>
                    ) : REAL_AGENTS.includes(r.name) ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">טרם דיווח</span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ['נקבעו', r.booked, 'text-slate-900'],
                      ['הגיעו', r.attended + r.noShow ? `${r.attended}/${r.attended + r.noShow}` : '—', 'text-green-700'],
                      [
                        r.upcoming ? `לא סומנו (+${r.upcoming} בהמשך)` : 'לא סומנו',
                        r.held ? r.unmarked : '—',
                        r.unmarked ? 'text-amber-600' : 'text-slate-900',
                      ],
                      ['עסקאות', r.deals ? shekel.format(r.dealAmount) : '—', 'text-violet-700'],
                      ['נגבה', r.collected ? shekel.format(r.collected) : '—', 'text-emerald-700'],
                      ['שיחות', r.calls == null ? '—' : r.calls, 'text-slate-900'],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="rounded-xl bg-slate-50 px-1.5 py-2">
                        <p className="text-[10px] font-semibold text-slate-500">{label}</p>
                        <p className={`text-base font-extrabold tabular-nums ${tone}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── What was signed ── */}
          {raw.deals.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                <Handshake className="h-4 w-4 text-violet-600" aria-hidden="true" />
                העסקאות של היום
              </p>
              <div className="divide-y divide-slate-100">
                {raw.deals.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="font-extrabold tabular-nums text-slate-900">{shekel.format(Number(d.amount) || 0)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{d.client_name || 'ללא שם לקוח'}</span>
                    {d.kind === 'course' && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">קורס בודד</span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{d.agent_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── In the agents' own words ── */}
          {report.rows.some((r) => r.notes) && (
            <div className="card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                <StickyNote className="h-4 w-4 text-amber-600" aria-hidden="true" />
                הערות מהסיכומים
              </p>
              <div className="flex flex-col gap-2">
                {report.rows
                  .filter((r) => r.notes)
                  .map((r) => (
                    <p key={r.name} className="text-sm text-slate-700">
                      <span className="font-bold text-slate-900">{r.name}: </span>
                      <span className="whitespace-pre-wrap">{r.notes}</span>
                    </p>
                  ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      <p className="text-center text-[11px] text-slate-400">
        פגישות שנקבעו — לפי מועד יצירתן ביומן · התקיימו — לפי מועד הפגישה · עסקאות — לפי תאריך העסקה · נגבה — לפי תאריך
        החיוב · שיחות, פולואפים, שעות והערות — מהסיכום שהסוכן שולח.
      </p>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
