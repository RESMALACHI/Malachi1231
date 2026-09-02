import { Check, X, Clock, Video, Users, Calendar, HelpCircle } from 'lucide-react'
import ToggleGroup from './ToggleGroup'
import { formatDateTime } from '../lib/dateUtils'

export const ATTENDANCE_OPTIONS = [
  {
    value: 'attended',
    label: 'הגיע',
    icon: Check,
    activeClass: 'bg-green-600 text-white shadow-sm',
  },
  {
    value: 'no_show',
    label: 'לא הגיע',
    icon: X,
    activeClass: 'bg-red-600 text-white shadow-sm',
  },
  {
    value: 'pending',
    label: 'טרם עודכן',
    icon: Clock,
    activeClass: 'bg-slate-500 text-white shadow-sm',
  },
]

export const TYPE_OPTIONS = [
  {
    value: 'zoom',
    label: 'זום',
    icon: Video,
    activeClass: 'bg-slate-900 text-white shadow-sm',
  },
  {
    value: 'frontal',
    label: 'פרונטלי',
    icon: Users,
    activeClass: 'bg-slate-500 text-white shadow-sm',
  },
  // The calendar named neither zoom nor a branch — the agent can set it.
  {
    value: 'unknown',
    label: 'לא ידוע',
    icon: HelpCircle,
    activeClass: 'bg-amber-500 text-white shadow-sm',
  },
]

/** Icon for a meeting type — 'unknown' must not borrow the frontal icon. */
export function typeIcon(type) {
  if (type === 'zoom') return Video
  if (type === 'frontal') return Users
  return HelpCircle
}

export default function MeetingRow({ meeting, onStatusChange, onTypeChange, saving }) {
  return (
    <div className="group flex flex-col gap-4 p-4 transition-colors duration-200 hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between">
      {/* Title + date */}
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
          <Calendar className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-800" title={meeting.title}>
            {meeting.title || '(ללא כותרת)'}
          </div>
          <div className="text-sm text-slate-500">{formatDateTime(meeting.meeting_date)}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-400">נוכחות</span>
          <ToggleGroup
            ariaLabel="נוכחות"
            value={meeting.status}
            options={ATTENDANCE_OPTIONS}
            onChange={(v) => onStatusChange(meeting, v)}
            disabled={saving}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-400">סוג פגישה</span>
          <ToggleGroup
            ariaLabel="סוג פגישה"
            value={meeting.type}
            options={TYPE_OPTIONS}
            onChange={(v) => onTypeChange(meeting, v)}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  )
}
