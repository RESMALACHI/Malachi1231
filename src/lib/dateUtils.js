// Date helpers — all Hebrew (he-IL) formatting lives here.

const heMonthFmt = new Intl.DateTimeFormat('he-IL', { month: 'long' })

/** Hebrew month names, index 0 = ינואר. */
export const HEBREW_MONTHS = Array.from({ length: 12 }, (_, m) =>
  heMonthFmt.format(new Date(2020, m, 1))
)

/** { year, month } for the current month. month is 0-based (0 = January). */
export function currentMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

/**
 * ISO timeMin/timeMax bounding a given month — used both for the Google
 * Calendar query and for filtering meetings in Supabase.
 * Range is [first day 00:00, first day of next month 00:00).
 */
export function monthRange(year, month) {
  const start = new Date(year, month, 1, 0, 0, 0, 0)
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0)
  return { timeMin: start.toISOString(), timeMax: end.toISOString() }
}

/** "יוני 2026" style label for a year/month. */
export function monthLabel(year, month) {
  return `${HEBREW_MONTHS[month]} ${year}`
}

/**
 * Working days (Sun–Thu, the Israeli work week) that have actually happened in a
 * month — the whole month for a past month, up to today for the current one.
 *
 * The honest denominator for a "meetings per day" average: dividing by 30 would
 * show every agent at two-thirds their real rate, and dividing the current
 * month by its full length would make a slow start look like a slow month.
 * Fridays and Saturdays are excluded because almost nothing is booked on them.
 */
export function workingDaysElapsedInMonth(year, month) {
  const now = new Date()
  const isCurrent = now.getFullYear() === year && now.getMonth() === month
  const lastDay = isCurrent ? now.getDate() : new Date(year, month + 1, 0).getDate()

  let count = 0
  for (let d = 1; d <= lastDay; d++) {
    const weekday = new Date(year, month, d).getDay() // 0=Sun … 6=Sat
    if (weekday !== 5 && weekday !== 6) count++
  }
  return Math.max(1, count)
}

/** Midnight-to-midnight ISO bounds for one calendar day (local time). */
export function dayRange(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return { timeMin: start.toISOString(), timeMax: end.toISOString() }
}

/** The Sunday that starts the Israeli week containing `d`. */
export function weekStart(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  s.setDate(s.getDate() - s.getDay())
  return s
}

/** The 7 days of the week containing `d`, Sunday first. */
export function weekDays(d) {
  const s = weekStart(d)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(s)
    day.setDate(s.getDate() + i)
    return day
  })
}

/** ISO bounds for the whole week containing `d`. May span two months. */
export function weekRange(d) {
  const s = weekStart(d)
  const e = new Date(s)
  e.setDate(s.getDate() + 7)
  return { timeMin: s.toISOString(), timeMax: e.toISOString() }
}

/** "5–11 ביולי 2026" — a week label that also reads across a month boundary. */
export function weekLabel(d) {
  const days = weekDays(d)
  const a = days[0]
  const b = days[6]
  const sameMonth = a.getMonth() === b.getMonth()
  return sameMonth
    ? `${a.getDate()}–${b.getDate()} ב${HEBREW_MONTHS[a.getMonth()]} ${a.getFullYear()}`
    : `${a.getDate()} ב${HEBREW_MONTHS[a.getMonth()]} – ${b.getDate()} ב${HEBREW_MONTHS[b.getMonth()]}`
}

/** Short Hebrew date+time, e.g. "18 ביוני 2026, 14:30". */
export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** Day + weekday only, e.g. "יום ה׳, 18 ביוני". */
export function formatDay(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(d)
}

/** A list of selectable years centred on the current year. */
export function yearOptions(spanBefore = 2, spanAfter = 1) {
  const thisYear = new Date().getFullYear()
  const years = []
  for (let y = thisYear - spanBefore; y <= thisYear + spanAfter; y++) years.push(y)
  return years
}

// ── Calendar helpers ────────────────────────────────────────────────────────
// The Israeli week starts on Sunday. Index 0 = ראשון … 6 = שבת.
export const WEEKDAYS_FULL = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
]
export const WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת']

/** "14:30" style time. */
export function formatTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** "יום חמישי, 18 ביוני 2026" style full date (used as a panel title). */
export function formatFullDay(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** True when two dates fall on the same calendar day (local time). */
export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Build the grid of day cells for a month view. Always returns full weeks
 * (multiples of 7), padding with leading/trailing days from adjacent months.
 * month is 0-based.
 */
export function buildMonthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7
  const today = new Date()

  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1
    const date = new Date(year, month, dayNum)
    cells.push({
      date,
      day: date.getDate(),
      inMonth: dayNum >= 1 && dayNum <= daysInMonth,
      isToday: isSameDay(date, today),
      weekday: date.getDay(),
    })
  }
  return cells
}
