// The daily booking target and the streak it feeds.

/** What a day is expected to produce when nobody has set a number yet. */
export const DEFAULT_DAILY_GOAL = 4

const pad = (n) => String(n).padStart(2, '0')

/** "2026-09-03" for a Date, in local time. */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Sun–Thu. Friday and Saturday are not counted, and never break a streak. */
export const isWorkingDay = (d) => d.getDay() !== 5 && d.getDay() !== 6

/**
 * Consecutive working days that hit the goal, counting back from today.
 *
 * Today only counts once it has actually met the goal — a streak must not
 * collapse at 09:00 simply because the day has barely started. Fridays and
 * Saturdays are skipped over rather than treated as misses.
 */
export function computeStreak(byDay, goal) {
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if ((byDay[dayKey(cursor)] || 0) < goal) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  for (let guard = 0; guard < 200; guard++) {
    if (!isWorkingDay(cursor)) {
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    if ((byDay[dayKey(cursor)] || 0) < goal) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/**
 * The last `count` working days, newest last — the little bar strip under the
 * ring. Each entry is { key, label, booked, hit }.
 */
export function recentWorkingDays(byDay, goal, count = 7) {
  const names = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
  const out = []
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  for (let guard = 0; guard < 60 && out.length < count; guard++) {
    if (isWorkingDay(cursor)) {
      const key = dayKey(cursor)
      const booked = byDay[key] || 0
      out.push({ key, label: names[cursor.getDay()], booked, hit: booked >= goal })
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return out.reverse()
}
