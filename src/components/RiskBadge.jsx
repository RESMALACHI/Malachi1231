import { AlertTriangle, ShieldCheck } from 'lucide-react'

/**
 * The no-show flag on an upcoming meeting.
 *
 * Only two states are ever drawn: a meeting the office's own history says is at
 * REAL risk, and one it says is a safe bet. Everything in between shows nothing
 * — a badge on every row is wallpaper, and the whole point is that the amber
 * ones are the calls to make this morning.
 *
 * @param {{ risk: {level, reasons}|null, showReasons?: boolean }} props
 */
export default function RiskBadge({ risk, showReasons = false }) {
  if (!risk || risk.level === 'normal') return null

  const high = risk.level === 'high'
  const Icon = high ? AlertTriangle : ShieldCheck
  const text = high ? 'סיכון לאי-הגעה' : 'צפוי להגיע'
  const reasons = risk.reasons?.length ? risk.reasons.join(' · ') : ''

  if (!showReasons) {
    return (
      <span
        title={reasons ? `${text} — ${reasons}` : text}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          high ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
        }`}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {high ? 'סיכון' : 'אישר'}
      </span>
    )
  }

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border p-3 ${
        high ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${high ? 'text-amber-600' : 'text-green-600'}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className={`text-sm font-bold ${high ? 'text-amber-900' : 'text-green-900'}`}>{text}</p>
        {reasons && (
          <p className={`mt-0.5 text-xs ${high ? 'text-amber-700' : 'text-green-700'}`}>
            {reasons}
          </p>
        )}
        <p className="mt-1 text-[11px] text-slate-500">
          מבוסס על ההיסטוריה של המשרד, לא על הערכה כללית
        </p>
      </div>
    </div>
  )
}
