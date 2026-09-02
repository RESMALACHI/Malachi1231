import { ChevronRight, ChevronLeft } from 'lucide-react'
import { HEBREW_MONTHS, yearOptions } from '../lib/dateUtils'

/**
 * Month + year picker. month is 0-based.
 * @param {func} onChange ({ year, month }) => void
 */
export default function MonthFilter({ year, month, onChange, disabled = false }) {
  const years = yearOptions()

  const step = (delta) => {
    let m = month + delta
    let y = year
    if (m < 0) {
      m = 11
      y -= 1
    } else if (m > 11) {
      m = 0
      y += 1
    }
    onChange({ year: y, month: m })
  }

  const selectClass =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60'

  return (
    <div className="inline-flex items-center gap-2">
      {/* In RTL, "previous month" sits on the right. */}
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={disabled}
        className="btn-ghost px-2"
        aria-label="חודש קודם"
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      <select
        value={month}
        onChange={(e) => onChange({ year, month: Number(e.target.value) })}
        disabled={disabled}
        className={selectClass}
        aria-label="חודש"
      >
        {HEBREW_MONTHS.map((label, idx) => (
          <option key={idx} value={idx}>
            {label}
          </option>
        ))}
      </select>

      <select
        value={year}
        onChange={(e) => onChange({ year: Number(e.target.value), month })}
        disabled={disabled}
        className={selectClass}
        aria-label="שנה"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => step(1)}
        disabled={disabled}
        className="btn-ghost px-2"
        aria-label="חודש הבא"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}
