import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  CalendarClock,
  MapPin,
  AlignRight,
  History,
  Loader2,
  Phone,
  MessageCircle,
  ChevronDown,
  Send,
} from 'lucide-react'
import { WA_TEMPLATES, meetingTemplateValues } from '../lib/waTemplates'
import { listMyTemplates, toRuntime } from '../services/waCustomTemplates'
import { useAuth } from '../context/AuthContext'
import { openWhatsApp } from '../lib/whatsappLink'
import ToggleGroup from './ToggleGroup'
import { ATTENDANCE_OPTIONS, TYPE_OPTIONS } from './MeetingRow'
import { formatFullDay, formatTime, formatDay } from '../lib/dateUtils'
import { cleanDescription } from '../lib/cleanText'
import { clientPhone, clientName, meetingState, STATE_BADGE } from '../lib/meetingTitle'
import { getClientHistory } from '../services/meetingsService'
import AiWhatsAppComposer from './AiWhatsAppComposer'

// Kept as a reversible feature flag: the user currently wants the focused AI
// composer only, without the older green quick-template WhatsApp button.
const SHOW_QUICK_WHATSAPP_TEMPLATES = false

/**
 * One-tap WhatsApp to the client, with the message already written.
 *
 * Opens the desktop app rather than a browser tab when WhatsApp is installed
 * (see openWhatsApp), and pre-fills one of the college's standard templates —
 * the same wording the WhatsApp page sends, filled from this meeting.
 *
 * It never sends. The agent reads the message and presses send themselves, from
 * their own number.
 */
function WhatsAppTemplates({ meeting, phone }) {
  const [open, setOpen] = useState(false)
  const values = meetingTemplateValues(meeting)

  // The personal templates of whoever is USING the device — not the meeting's
  // owner. The person pressing send introduces themselves, and their own
  // wording follows them to every screen that offers templates.
  const { selectedAgent } = useAuth()
  const [mine, setMine] = useState([])
  useEffect(() => {
    let alive = true
    listMyTemplates(selectedAgent)
      .then((rows) => alive && setMine(rows.map(toRuntime)))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [selectedAgent])
  const templates = [...WA_TEMPLATES, ...mine]

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-[#25d366] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-105 active:scale-95"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        הודעה בווצאפ
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 animate-fade-up">
          {templates.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                openWhatsApp(phone, t.build(values))
                setOpen(false)
              }}
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-right text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-green-50 active:scale-[0.98]"
            >
              <Send className="h-3.5 w-3.5 shrink-0 -scale-x-100 text-[#25d366]" aria-hidden="true" />
              <span className="flex-1">{t.title}</span>
              <span className="text-[11px] font-normal text-slate-400">{t.hint}</span>
            </button>
          ))}
          <p className="px-1 pt-0.5 text-[11px] text-slate-400">
            ההודעה תיפתח מוכנה בווצאפ שלכם — השליחה בידיים שלכם.
          </p>
        </div>
      )}
    </div>
  )
}

// Dot colour per outcome — the same language the calendar chips speak.
const HISTORY_DOT = {
  attended: 'bg-green-500',
  no_show: 'bg-red-500',
  cancelled: 'bg-red-400',
  confirmed: 'bg-green-400',
  no_answer: 'bg-amber-400',
  none: 'bg-slate-300',
}

/**
 * Everything this client has done with the college, newest first.
 *
 * Loads on its own after the modal is open so the meeting's own details never
 * wait on it, and stays silent when there's no history worth showing — a first
 * meeting shouldn't be padded with an empty section.
 */
function ClientHistory({ meeting, agentName, allAgents }) {
  const [rows, setRows] = useState(null) // null = still loading

  useEffect(() => {
    let alive = true
    setRows(null)
    getClientHistory(agentName, meeting, { allAgents })
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [meeting?.id, agentName, allAgents])

  if (rows === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        בודק היסטוריה…
      </p>
    )
  }
  if (rows.length === 0) return null

  const attended = rows.filter((r) => r.status === 'attended').length
  const noShow = rows.filter((r) => r.status === 'no_show').length

  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
        <History className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        היסטוריה עם הלקוח
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
          {rows.length} {rows.length === 1 ? 'פגישה קודמת' : 'פגישות קודמות'}
        </span>
        {noShow > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
            {noShow} לא הגיע
          </span>
        )}
        {attended > 0 && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
            {attended} הגיע
          </span>
        )}
      </span>

      <ol className="me-1 border-e-2 border-slate-100 pe-3">
        {rows.slice(0, 8).map((r) => {
          const state = meetingState(r)
          const badge = STATE_BADGE[state]
          return (
            <li key={r.id} className="relative pb-3 last:pb-0">
              <span
                className={`absolute -end-[19px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${HISTORY_DOT[state]}`}
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-bold tabular-nums text-slate-700">
                  {formatDay(new Date(r.meeting_date))}
                </span>
                {badge && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
                {r.agent_name && r.agent_name !== meeting.agent_name && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {r.agent_name}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-slate-500" title={r.title || undefined}>
                {clientName(r.title, r.agent_name)}
              </p>
            </li>
          )
        })}
      </ol>
      {rows.length > 8 && (
        <span className="text-[11px] text-slate-400">ועוד {rows.length - 8} פגישות קודמות</span>
      )}
    </div>
  )
}

/**
 * Detailed view of a single meeting: title, date/time, description, location,
 * and large comfortable buttons for attendance (נוכחות) and type (סוג פגישה).
 */
export default function MeetingDetailModal({
  meeting,
  onClose,
  onStatusChange,
  onTypeChange,
  saving,
  agentName,
  allAgents = false,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!meeting) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-b-none pb-safe animate-slide-up sm:rounded-3xl sm:pb-0 sm:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle — the phone affordance for "this sheet closes" */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <h2 className="text-xl font-extrabold leading-tight text-slate-900">
            {meeting.title || '(ללא כותרת)'}
          </h2>
          <button onClick={onClose} className="btn-ghost shrink-0 px-2" aria-label="סגירה">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          {/* Date / location / description */}
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <CalendarClock className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="font-medium">
                {formatFullDay(meeting.meeting_date)} · {formatTime(meeting.meeting_date)}
              </span>
            </div>
            {meeting.location && (
              <div className="flex items-center gap-2 text-slate-700">
                <MapPin className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                <span>{meeting.location}</span>
              </div>
            )}
            {/* A tappable number saves digging it out of the title by hand. */}
            {clientPhone(meeting) && (
              <>
                <div className="flex items-center gap-2 text-slate-700">
                  <Phone className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                  <a
                    href={`tel:${clientPhone(meeting)}`}
                    className="font-semibold tabular-nums text-slate-800 underline decoration-slate-300 underline-offset-2"
                    dir="ltr"
                  >
                    {clientPhone(meeting)}
                  </a>
                </div>
                <div className="flex flex-col gap-2.5">
                  <AiWhatsAppComposer meeting={meeting} phone={clientPhone(meeting)} />
                  {SHOW_QUICK_WHATSAPP_TEMPLATES && (
                    <WhatsAppTemplates meeting={meeting} phone={clientPhone(meeting)} />
                  )}
                </div>
              </>
            )}
            {cleanDescription(meeting.description) && (
              <div className="flex items-start gap-2 text-slate-600">
                <AlignRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                <p className="whitespace-pre-line leading-relaxed">
                  {cleanDescription(meeting.description)}
                </p>
              </div>
            )}
          </div>

          {/* Attendance */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">נוכחות</span>
            <ToggleGroup
              ariaLabel="נוכחות"
              value={meeting.status}
              options={ATTENDANCE_OPTIONS}
              onChange={(v) => onStatusChange(meeting, v)}
              disabled={saving}
              size="lg"
              grow
            />
          </div>

          {/* Type */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">סוג פגישה</span>
            <ToggleGroup
              ariaLabel="סוג פגישה"
              value={meeting.type}
              options={TYPE_OPTIONS}
              onChange={(v) => onTypeChange(meeting, v)}
              disabled={saving}
              size="lg"
              grow
            />
          </div>

          {/* What happened with this client before — the context you want in
              hand as they walk in, not after. */}
          <ClientHistory meeting={meeting} agentName={agentName} allAgents={allAgents} />
        </div>
      </div>
    </div>,
    document.body
  )
}
