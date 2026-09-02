import { useMemo, useState } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'

const shekels = (n) => `₪${Math.round(n).toLocaleString('en-US')}`

/**
 * "מה אם" — the funnel with sliders on it.
 *
 * Both columns run through the SAME model (deals = booked × show × close), so
 * the comparison is honest: it never claims the baseline column IS the month's
 * exact bookkeeping, it shows what moving one dial does while the others hold
 * still. The point of the screen is the delta, and the delta is exact.
 */
export default function WhatIfSimulator({ funnel }) {
  const base = useMemo(() => {
    const t = funnel?.totals || {}
    const settled = (t.attended || 0) + (t.no_show || 0)
    const deals = t.deals || 0
    return {
      booked: t.booked || 0,
      show: settled > 0 ? Math.round(((t.attended || 0) / settled) * 100) : 45,
      close: (t.attended || 0) > 0 ? Math.round((deals / t.attended) * 100) : 20,
      avg: deals > 0 ? Math.round(Number(t.revenue || 0) / deals) : 15000,
    }
  }, [funnel])

  const [sim, setSim] = useState(null)
  const s = sim || base

  const model = (v) => {
    const deals = v.booked * (v.show / 100) * (v.close / 100)
    return { deals, revenue: deals * v.avg }
  }
  const baseOut = model(base)
  const simOut = model(s)
  const delta = simOut.revenue - baseOut.revenue

  const set = (key, value) => setSim({ ...s, [key]: Number(value) })

  const SLIDERS = [
    { key: 'booked', label: 'פגישות שנקבעו בחודש', min: 0, max: Math.max(40, base.booked * 2), step: 5, fmt: (v) => v },
    { key: 'show', label: 'אחוז הגעה', min: 10, max: 90, step: 1, fmt: (v) => `${v}%` },
    { key: 'close', label: 'אחוז סגירה (ממי שהגיע)', min: 5, max: 60, step: 1, fmt: (v) => `${v}%` },
    { key: 'avg', label: 'עסקה ממוצעת', min: 1000, max: Math.max(30000, base.avg * 2), step: 500, fmt: shekels },
  ]

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-extrabold text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-amber-500" aria-hidden="true" />
          סימולטור "מה אם"
        </h3>
        {sim && (
          <button onClick={() => setSim(null)} className="btn-ghost gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            חזרה למספרים של החודש
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        גרור מחוון וראה מה זה שווה. נקודת הפתיחה — הנתונים האמיתיים של החודש.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_260px]">
        {/* Dials */}
        <div className="space-y-4">
          {SLIDERS.map((sl) => {
            const changed = s[sl.key] !== base[sl.key]
            return (
              <div key={sl.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">{sl.label}</span>
                  <span className="text-sm font-extrabold tabular-nums text-slate-900">
                    {sl.fmt(s[sl.key])}
                    {changed && (
                      <span className="ms-1.5 text-[11px] font-semibold text-slate-400">
                        (החודש: {sl.fmt(base[sl.key])})
                      </span>
                    )}
                  </span>
                </div>
                <input
                  type="range"
                  min={sl.min}
                  max={sl.max}
                  step={sl.step}
                  value={s[sl.key]}
                  onChange={(e) => set(sl.key, e.target.value)}
                  dir="ltr"
                  className="w-full accent-amber-500"
                  aria-label={sl.label}
                />
              </div>
            )
          })}
        </div>

        {/* The answer */}
        <div className="flex flex-col justify-center gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/40">
          <div>
            <p className="text-[11px] font-semibold text-slate-500">עסקאות בחודש</p>
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">
              {simOut.deals.toFixed(1)}
              <span className="ms-1.5 text-sm font-semibold text-slate-400">
                במקום {baseOut.deals.toFixed(1)}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500">הכנסה חודשית</p>
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">
              {shekels(simOut.revenue)}
            </p>
          </div>
          <div
            className={`rounded-xl px-3 py-2.5 text-center ${
              delta > 0
                ? 'bg-green-100 text-green-800'
                : delta < 0
                  ? 'bg-red-100 text-red-700'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            <p className="text-lg font-extrabold tabular-nums">
              {delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${shekels(Math.abs(delta))}`}
            </p>
            <p className="text-[11px] font-semibold opacity-80">
              {delta === 0 ? 'שנה מחוון כדי לראות הבדל' : `לחודש · ${delta > 0 ? '+' : '−'}${shekels(Math.abs(delta) * 12)} לשנה`}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
