import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Wallet, X, TrendingUp, AlertTriangle, Video, Users, HelpCircle } from 'lucide-react'
import { calcMeetingBonus, formatIls, MIN_MEETINGS, ZOOM_WEIGHT } from '../lib/bonus'
import { useModalLock } from '../lib/useModalLock'

/** Count only what the client actually attended — that's what the table pays on. */
function attendedBreakdown(meetings) {
  const a = meetings.filter((m) => m.status === 'attended')
  return {
    frontal: a.filter((m) => m.type === 'frontal').length,
    zoom: a.filter((m) => m.type === 'zoom').length,
    unknown: a.filter((m) => m.type === 'unknown').length,
  }
}

/** Trim a weighted count for display: 11.2 → "11.2", 8.0 → "8". */
const num = (n) => Number(n.toFixed(1)).toLocaleString('he-IL')

/**
 * One line of the breakdown. Values sit in their own cells rather than inside a
 * sentence — an inline "÷5 = 3.2" gets reordered into nonsense by RTL bidi.
 */
function Line({ icon: Icon, label, count, counted, muted }) {
  return (
    <div className="flex items-center gap-2 py-2.5">
      <span className="flex flex-1 items-center gap-2 text-sm text-slate-600">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
        {label}
      </span>
      <span className="w-16 text-center text-sm tabular-nums text-slate-500">{count}</span>
      <span
        className={`w-16 text-center text-sm font-bold tabular-nums ${
          muted ? 'text-slate-400' : 'text-slate-900'
        }`}
      >
        {counted}
      </span>
    </div>
  )
}

function DetailsModal({ b, parts, monthLabel, onClose }) {
  useModalLock(true, onClose)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-2xl animate-slide-up sm:rounded-2xl sm:animate-scale-in"
      >
        {/* Total */}
        <div className="relative rounded-t-3xl bg-gradient-to-br from-amber-500 to-yellow-400 p-5 text-slate-900 sm:rounded-t-2xl">
          <button
            onClick={onClose}
            className="absolute end-3 top-3 rounded-lg p-1.5 transition hover:bg-black/10"
            aria-label="סגירה"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="text-xs font-bold opacity-80">בונוס פגישות · {monthLabel}</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{formatIls(b.total)}</p>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {/* ── Step 1: how the meetings were counted ── */}
          <div>
            <p className="mb-1 text-xs font-bold text-slate-400">הפגישות שהגיעו</p>
            <div className="rounded-xl border border-slate-200">
              {/* column headers */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                <span className="flex-1" />
                <span className="w-16 text-center text-[10px] font-bold text-slate-400">
                  פגישות
                </span>
                <span className="w-16 text-center text-[10px] font-bold text-slate-400">
                  נספרות
                </span>
              </div>
              <div className="divide-y divide-slate-100 px-3">
                <Line icon={Users} label="פרונטלי" count={parts.frontal} counted={parts.frontal} />
                <Line
                  icon={Video}
                  label="זום"
                  count={parts.zoom}
                  counted={num(parts.zoom * ZOOM_WEIGHT)}
                />
                {parts.unknown > 0 && (
                  <Line
                    icon={HelpCircle}
                    label="לא ידוע"
                    count={parts.unknown}
                    counted={parts.unknown}
                  />
                )}
              </div>
              <div className="flex items-center gap-2 border-t-2 border-slate-900 px-3 py-2.5">
                <span className="flex-1 text-sm font-bold text-slate-900">סה״כ נספרות</span>
                <span className="w-16" />
                <span className="w-16 text-center text-lg font-extrabold tabular-nums text-slate-900">
                  {num(b.counted)}
                </span>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-slate-400">
              כל 5 פגישות זום נחשבות לפגישה אחת.
              {parts.unknown > 0 && ' פגישות ללא סיווג נספרות כפרונטלי.'}
            </p>
          </div>

          {/* ── Step 2: the payslip ── */}
          <div>
            <p className="mb-1 text-xs font-bold text-slate-400">החישוב</p>
            {b.tier ? (
              <div className="flex flex-col rounded-xl border border-slate-200 px-3">
                <div className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-slate-600">פגישות נספרות</span>
                  <span className="font-bold tabular-nums text-slate-900">{num(b.counted)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 py-2.5 text-sm">
                  <span className="text-slate-600">
                    תעריף לפגישה
                    {/* "10+" would bidi-flip to "+10" — spell it out instead. */}
                    <span className="me-1.5 text-xs text-slate-400">
                      (מדרגת {b.tier.min} ומעלה)
                    </span>
                  </span>
                  <span className="font-bold tabular-nums text-slate-900">{b.rate} ₪</span>
                </div>
                <div className="flex items-center justify-between border-t-2 border-slate-900 py-3">
                  <span className="text-sm font-bold text-slate-900">סה״כ בונוס</span>
                  <span className="text-xl font-extrabold tabular-nums text-amber-600">
                    {formatIls(b.total)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  הבונוס מתחיל מ-{MIN_MEETINGS} פגישות בחודש. חסרות עוד{' '}
                  <b>{num(MIN_MEETINGS - b.counted)}</b> פגישות.
                </span>
              </div>
            )}
          </div>

          {/* ── The carrot ── */}
          {b.next && b.nextGain > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                עוד <b>{num(b.toNext)}</b> פגישות — והתעריף עולה ל-<b>{b.next.rate} ₪</b> לפגישה.
                <br />
                שווה לך <b className="text-green-700">{formatIls(b.nextGain)}</b> נוספים.
              </span>
            </div>
          )}

          {parts.unknown > 0 && (
            <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
              ⚠️ {parts.unknown} פגישות שהגיעו ללא סיווג נספרו כפרונטלי. סווג אותן לזום/פרונטלי
              כדי שהחישוב יהיה מדויק.
            </p>
          )}

          <p className="border-t border-slate-100 pt-3 text-center text-[11px] leading-relaxed text-slate-400">
            בונוס פגישות בלבד, לפי פגישות שסומנו "הגיע" בחודש זה.
            <br />
            אינו כולל בונוס עסקאות/גבייה, שכר שעתי או תגמולים נוספים.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Big gold "what did I earn" button — the month's meeting bonus, live. */
export default function BonusCard({ meetings, monthLabel }) {
  const [open, setOpen] = useState(false)
  const parts = useMemo(() => attendedBreakdown(meetings), [meetings])
  const b = useMemo(() => calcMeetingBonus(parts), [parts])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-l from-amber-500 via-amber-400 to-yellow-300 p-5 text-right shadow-lg shadow-amber-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/40 active:scale-[0.99]"
      >
        <span
          className="pointer-events-none absolute -end-8 -top-10 h-32 w-32 rounded-full bg-white/25 blur-2xl"
          aria-hidden="true"
        />
        <span className="relative flex items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900/90 text-amber-300 shadow-md transition-transform duration-200 group-hover:scale-105">
              <Wallet className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="flex flex-col text-start">
              <span className="text-sm font-bold text-slate-900/70">
                שכר פגישות · {monthLabel}
              </span>
              <span className="text-3xl font-extrabold tabular-nums leading-tight text-slate-900">
                {formatIls(b.total)}
              </span>
            </span>
          </span>
          <span className="hidden shrink-0 rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-bold text-white sm:block">
            לפירוט החישוב
          </span>
        </span>
      </button>

      {open && (
        <DetailsModal b={b} parts={parts} monthLabel={monthLabel} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
