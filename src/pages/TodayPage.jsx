import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  CheckSquare,
  ClipboardCheck,
  MessageCircle,
  Phone,
  RefreshCw,
  Target,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { managerViewOnly } from '../lib/agents'
import { clientName, clientPhone } from '../lib/meetingTitle'
import { cleanDescription } from '../lib/cleanText'
import { formatTime } from '../lib/dateUtils'
import { detectBranch, toWaNumber } from '../lib/waTemplates'
import { updateMeetingStatus } from '../services/meetingsService'
import { setActivityDone, setLeadHandled } from '../services/leadsService'
import { getTodayBundle } from '../services/todayService'
import { getNoShowModel, scoreMeeting, isUpcoming } from '../services/riskService'
import GoalCard from '../components/GoalCard'
import RiskBadge from '../components/RiskBadge'
import Spinner from '../components/Spinner'

const REFRESH_MS = 60_000
const pad = (n) => String(n).padStart(2, '0')

/** "יום שישי, 28 באוגוסט" — the page's date, in words. */
function todayLabel() {
  return new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "27/08/26" — the red date an unmarked meeting carries, BMBY-style. */
function shortDate(iso) {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`
}

/** "זום" / "פרונטלי רמת גן" — the type label exactly as the office says it. */
function typeLabel(m) {
  if (m.type === 'zoom') return 'זום'
  const branch = detectBranch(m)
  return branch ? `פרונטלי ${branch.label}` : m.type === 'frontal' ? 'פרונטלי' : 'פגישה'
}

/** First meaningful line of the description — the row's one-line story. */
function snippet(m) {
  const text = cleanDescription(m.description || '')
  const line = text
    .split('\n')
    .map((s) => s.trim())
    // The structured fields (סוג/יומן/טלפון/שם/תאריך/שעה) repeat what the row
    // already shows — the story is the free-text line after them.
    .find((s) => s.length > 15 && !/^(סוג|יומן|טלפון|מספר|שם|תאריך|שעה|יום|מתאם|מבצע)/.test(s))
  return line ? (line.length > 90 ? line.slice(0, 90) + '…' : line) : ''
}

/**
 * The opening screen — a day-planner in the layout the team already reads all
 * day in BMBY: meetings on one side, tasks on the other, each panel split into
 * "להיום", the coming days, and the red "לא מעודכנות" backlog.
 *
 * Same content rules as BMBY, better verbs: every row still acts — ✓/✗ writes
 * attendance, a task ticks closed, a lead row opens its file.
 */
export default function TodayPage() {
  const { selectedAgent } = useAuth()
  const viewAll = managerViewOnly(selectedAgent)
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Built once from the office's own settled meetings; null until it loads, and
  // null forever if there isn't enough history — the badges just don't appear.
  const [riskModel, setRiskModel] = useState(null)

  useEffect(() => {
    let alive = true
    getNoShowModel()
      .then((m) => alive && setRiskModel(m))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const load = useCallback(
    async ({ background = false } = {}) => {
      if (!background) setData(null)
      try {
        setData(await getTodayBundle(selectedAgent, viewAll))
        setError('')
      } catch (e) {
        setError(e?.message || 'הטעינה נכשלה')
        setData(null)
      }
    },
    [selectedAgent, viewAll]
  )

  useEffect(() => {
    load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load({ background: true })
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const mark = async (m, status) => {
    const next = m.status === status ? 'pending' : status
    setData((d) => {
      const patch = (list) => list.map((x) => (x.id === m.id ? { ...x, status: next } : x))
      return {
        ...d,
        todayMeetings: patch(d.todayMeetings),
        pastPending: d.pastPending.filter((x) => x.id !== m.id || next === 'pending'),
        upcoming: d.upcoming.map((g) => ({ ...g, items: patch(g.items) })),
      }
    })
    try {
      await updateMeetingStatus(m.id, next)
    } catch {
      load({ background: true })
    }
  }

  if (error && !data) {
    return (
      <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
    )
  }
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const {
    todayMeetings,
    upcoming,
    pastPending,
    counts,
    leads,
    leadTasksToday,
    leadTasksOverdue,
    followupsOpen,
    summaryFiled,
  } = data

  const tickLeadTask = (t) => {
    setData((d) => ({
      ...d,
      leadTasksToday: d.leadTasksToday.filter((x) => x.id !== t.id),
      leadTasksOverdue: d.leadTasksOverdue.filter((x) => x.id !== t.id),
    }))
    setActivityDone(t.id, true).catch(() => load({ background: true }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page title — plain, like the planner it copies */}
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">היום שלי</h1>
          <p className="mt-0.5 text-sm text-slate-500">{todayLabel()}</p>
        </div>
      </header>

      {/* A manager looking at everyone has no personal target to hit. */}
      {!viewAll && <GoalCard agentName={selectedAgent} />}

      {/* The two planner panels: meetings (start = right in RTL), tasks */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* ── פגישות ── */}
        <section className="card overflow-hidden">
          <PanelHead
            title="פגישות"
            agent={viewAll ? 'כל הסוכנים' : selectedAgent}
            onRefresh={async () => {
              setBusy(true)
              await load({ background: true })
              setBusy(false)
            }}
            busy={busy}
          />
          <p className="border-b border-slate-100 px-4 pb-2 text-xs text-slate-500">
            מתוכנן להיום: <b className="text-slate-800">{counts.plannedToday}</b>
            <span className="mx-1.5 text-slate-300">|</span>
            עודכנו: <b className="text-green-700">{counts.doneToday}</b>
            <span className="mx-1.5 text-slate-300">|</span>
            לא עודכנו: <b className={counts.unmarked ? 'text-red-600' : 'text-slate-800'}>{counts.unmarked}</b>
          </p>

          <SectionHead label="פגישות להיום" />
          {todayMeetings.length === 0 ? (
            <Empty text="אין פגישות ביומן היום." />
          ) : (
            todayMeetings.map((m) => (
              <MeetingRow
                key={m.id}
                m={m}
                viewAll={viewAll}
                onMark={mark}
                risk={isUpcoming(m) ? scoreMeeting(riskModel, m) : null}
              />
            ))
          )}

          {upcoming.map((g) => (
            <div key={g.key}>
              <SectionHead label={`פגישות ${g.label}`} italic />
              {g.items.map((m) => (
                <MeetingRow
                  key={m.id}
                  m={m}
                  viewAll={viewAll}
                  onMark={mark}
                  future
                  risk={isUpcoming(m) ? scoreMeeting(riskModel, m) : null}
                />
              ))}
            </div>
          ))}

          {pastPending.length > 0 && (
            <>
              <SectionHead label="פגישות לא מעודכנות" tone="red" />
              {pastPending.map((m) => (
                <MeetingRow key={m.id} m={m} viewAll={viewAll} onMark={mark} overdue />
              ))}
            </>
          )}

          <Link
            to="/"
            className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            ליומן המלא
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>

        {/* ── משימות ── */}
        <section className="card overflow-hidden">
          <PanelHead title="משימות" agent={viewAll ? 'כל הסוכנים' : selectedAgent} />
          <p className="border-b border-slate-100 px-4 pb-2 text-xs text-slate-500">
            להיום: <b className="text-slate-800">{leadTasksToday.length}</b>
            <span className="mx-1.5 text-slate-300">|</span>
            באיחור: <b className={leadTasksOverdue.length ? 'text-red-600' : 'text-slate-800'}>{leadTasksOverdue.length}</b>
            <span className="mx-1.5 text-slate-300">|</span>
            לידים לטיפול: <b className={leads.length ? 'text-red-600' : 'text-slate-800'}>{leads.length}</b>
          </p>

          <SectionHead label="משימות להיום" />
          {leadTasksToday.length === 0 ? (
            <Empty text="אין משימות להיום." />
          ) : (
            leadTasksToday.map((t) => <TaskRow key={t.id} t={t} onDone={() => tickLeadTask(t)} />)
          )}

          {leadTasksOverdue.length > 0 && (
            <>
              <SectionHead label="משימות לא מעודכנות" tone="red" />
              {leadTasksOverdue.map((t) => (
                <TaskRow key={t.id} t={t} overdue onDone={() => tickLeadTask(t)} />
              ))}
            </>
          )}

          {leads.length > 0 && (
            <>
              <SectionHead label="לידים חדשים לטיפול" tone="amber" />
              {leads.slice(0, 6).map((l) => (
                <div
                  key={l.id}
                  onClick={() => navigate(`/leads/${l.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/leads/${l.id}`)}
                  className="flex cursor-pointer items-center gap-3 border-b border-slate-50 px-4 py-2.5 transition hover:bg-slate-50/70"
                >
                  <Target className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {l.name || 'ללא שם'}
                    </span>
                    <span className="block font-mono text-[11px] text-slate-400" dir="ltr">
                      {l.phone || ''}
                    </span>
                  </span>
                  {l.phone && (
                    <span className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <a href={`tel:${l.phone}`} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="חיוג">
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                      <a href={`https://wa.me/${toWaNumber(l.phone)}`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-green-600 transition hover:bg-green-50" aria-label="ווצאפ">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setData((d) => ({ ...d, leads: d.leads.filter((x) => x.id !== l.id) }))
                      setLeadHandled(l.id, true).catch(() => load({ background: true }))
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-slate-200 text-transparent transition hover:border-green-400 hover:text-green-600 active:scale-95"
                    aria-label="סימון כטופל"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </>
          )}

          {!viewAll && (
            <Link
              to="/tasks"
              className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
              צפה ברשימה המלאה
              {followupsOpen > 0 && ` (${followupsOpen} פולואפים פתוחים)`}
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </section>
      </div>

      {summaryFiled === false && (
        <Link
          to="/day-summary"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 transition hover:bg-amber-100"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-amber-900">סיכום היום עוד לא נשלח</span>
          </span>
          <ChevronLeft className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

/** Panel header — title on the start side, agent name and refresh at the end. */
function PanelHead({ title, agent, onRefresh, busy }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1 pt-3">
      <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
      <span className="ms-auto text-xs font-semibold text-slate-400">{agent}</span>
      {onRefresh && (
        <button onClick={onRefresh} className="btn-ghost -me-1.5 px-1.5" aria-label="רענון">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** The BMBY section stripe: a small label with a colored tick at its start. */
function SectionHead({ label, tone = 'sky', italic = false }) {
  const bar =
    tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-sky-500'
  return (
    <div className="flex items-center gap-2 border-y border-slate-100 bg-slate-50/70 px-4 py-1.5">
      <span className={`h-3.5 w-1 shrink-0 rounded-full ${bar}`} aria-hidden="true" />
      <span className={`text-xs font-bold text-slate-500 ${italic ? 'italic' : ''}`}>{label}</span>
    </div>
  )
}

function Empty({ text }) {
  return <p className="px-4 py-4 text-center text-sm text-slate-400">{text}</p>
}

/**
 * One meeting line, read like BMBY's: time (or a red date when unmarked),
 * the type in words, the client, the story line, the phone — and the outcome
 * buttons, which BMBY's checkbox only wishes it was.
 */
function MeetingRow({ m, viewAll, onMark, overdue = false, future = false, risk = null }) {
  const phone = clientPhone(m)
  const name = clientName(m.title, m.agent_name)
  const story = snippet(m)
  const end = new Date(new Date(m.meeting_date).getTime() + 3600_000)

  return (
    <div className="flex items-start gap-3 border-b border-slate-50 px-4 py-2.5">
      {/* Time / red date */}
      <span className="w-12 shrink-0 pt-0.5 text-center">
        {overdue ? (
          <span className="text-xs font-bold text-red-600">{shortDate(m.meeting_date)}</span>
        ) : (
          <>
            <span className="block text-sm font-extrabold leading-tight text-slate-900">
              {formatTime(m.meeting_date)}
            </span>
            <span className="block text-[11px] leading-tight text-slate-400">
              {formatTime(end)}
            </span>
          </>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <b className="text-slate-900">{typeLabel(m)}</b>
          <span className="font-semibold text-slate-700">{name}</span>
          {viewAll && <span className="text-[11px] text-indigo-600">{m.agent_name}</span>}
          <RiskBadge risk={risk} />
        </p>
        {story && <p className="mt-0.5 truncate text-xs text-slate-500">{story}</p>}
        {phone && (
          <p className="mt-0.5 font-mono text-[11px] text-slate-400" dir="ltr">
            {phone}
          </p>
        )}
      </div>

      <span className="flex shrink-0 items-center gap-0.5 pt-0.5">
        {phone && (
          <>
            <a href={`tel:${phone}`} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={`חיוג ל${name}`}>
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a href={`https://wa.me/${toWaNumber(phone)}`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-green-600 transition hover:bg-green-50" aria-label={`ווצאפ ל${name}`}>
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </>
        )}
        {!viewAll && !future && (
          <>
            <button
              onClick={() => onMark(m, 'no_show')}
              aria-pressed={m.status === 'no_show'}
              aria-label="לא הגיע"
              title="לא הגיע"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 transition active:scale-95 ${
                m.status === 'no_show'
                  ? 'border-red-500 bg-red-500 text-white'
                  : 'border-slate-200 text-slate-300 hover:border-red-300 hover:text-red-500'
              }`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => onMark(m, 'attended')}
              aria-pressed={m.status === 'attended'}
              aria-label="הגיע"
              title="הגיע"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 transition active:scale-95 ${
                m.status === 'attended'
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-slate-200 text-slate-300 hover:border-green-400 hover:text-green-600'
              }`}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </span>
    </div>
  )
}

/** One lead-task line: what to do, for whom, ticked closed in place. */
function TaskRow({ t, overdue = false, onDone }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/leads/${t.lead_id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/leads/${t.lead_id}`)}
      className="flex cursor-pointer items-start gap-3 border-b border-slate-50 px-4 py-2.5 transition hover:bg-slate-50/70"
    >
      <span className="w-12 shrink-0 pt-0.5 text-center">
        <span className={`text-xs font-bold ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
          {overdue ? shortDate(t.due_date + 'T00:00') : 'היום'}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{t.content}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {t.leads?.name || 'ליד'}
          {t.leads?.phone && (
            <span className="ms-2 font-mono" dir="ltr">
              {t.leads.phone}
            </span>
          )}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDone()
        }}
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-slate-200 text-transparent transition hover:border-green-400 hover:text-green-600 active:scale-95"
        aria-label="סימון המשימה כבוצעה"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
