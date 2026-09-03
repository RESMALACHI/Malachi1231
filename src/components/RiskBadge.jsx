import { ShieldCheck, AlertTriangle } from 'lucide-react'

/**
 * The no-show read on an upcoming meeting.
 *
 * Every upcoming meeting the model can score gets one of four states, so the
 * agent has a signal on the whole day rather than on a couple of rows:
 *   good  — צפוי להגיע   (a safe bet by the office's own history)
 *   ok    — רגיל         (ordinary for us)
 *   watch — כדאי לוודא    (worse than our average — a confirmation call)
 *   high  — סיכון גבוה    (much worse — call these first)
 *
 * @param {{ risk: {level, reasons}|null, showReasons?: boolean }} props
 */
const STYLES = {
  good: {
    short: 'צפוי להגיע',
    long: 'צפוי להגיע',
    pill: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
    box: 'border-green-200 bg-green-50',
    fg: 'text-green-800',
    sub: 'text-green-700',
    Icon: ShieldCheck,
    iconFg: 'text-green-600',
  },
  ok: {
    short: 'רגיל',
    long: 'סיכוי הגעה רגיל',
    pill: 'bg-slate-100 text-slate-500',
    dot: 'bg-slate-400',
    box: 'border-slate-200 bg-slate-50',
    fg: 'text-slate-700',
    sub: 'text-slate-500',
    Icon: null,
    iconFg: '',
  },
  watch: {
    short: 'כדאי לוודא',
    long: 'כדאי לוודא הגעה',
    pill: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    box: 'border-amber-200 bg-amber-50',
    fg: 'text-amber-900',
    sub: 'text-amber-700',
    Icon: AlertTriangle,
    iconFg: 'text-amber-600',
  },
  high: {
    short: 'סיכון גבוה',
    long: 'סיכון גבוה לאי-הגעה',
    pill: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    box: 'border-red-200 bg-red-50',
    fg: 'text-red-900',
    sub: 'text-red-700',
    Icon: AlertTriangle,
    iconFg: 'text-red-600',
  },
}

export default function RiskBadge({ risk, showReasons = false }) {
  const s = risk && STYLES[risk.level]
  if (!s) return null

  const reasons = risk.reasons?.length ? risk.reasons.join(' · ') : ''

  if (!showReasons) {
    return (
      <span
        title={reasons ? `${s.long} — ${reasons}` : s.long}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${s.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
        {s.short}
      </span>
    )
  }

  const { Icon } = s
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${s.box}`}>
      {Icon ? (
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconFg}`} aria-hidden="true" />
      ) : (
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p className={`text-sm font-bold ${s.fg}`}>{s.long}</p>
        {reasons && <p className={`mt-0.5 text-xs ${s.sub}`}>{reasons}</p>}
        <p className="mt-1 text-[11px] text-slate-500">
          מבוסס על ההיסטוריה של המשרד, לא על הערכה כללית
        </p>
      </div>
    </div>
  )
}
