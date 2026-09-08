import { useEffect, useState } from 'react'
import { Flame, Target, Check } from 'lucide-react'
import { getBookingsByDay } from '../services/meetingsService'
import { getGoals } from '../services/settingsService'
import {
  DEFAULT_DAILY_GOAL,
  computeStreak,
  dayKey,
  recentWorkingDays,
} from '../lib/goals'

/** The progress ring. Stroke-dash on a circle — no chart library for one arc. */
function Ring({ value, goal, done }) {
  const R = 34
  const C = 2 * Math.PI * R
  const pct = Math.min(1, goal > 0 ? value / goal : 0)

  return (
    <span className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center sm:h-[88px] sm:w-[88px]">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke={done ? '#16a34a' : '#f59e0b'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        {done ? (
          <Check className="h-6 w-6 text-green-600 sm:h-7 sm:w-7" aria-hidden="true" />
        ) : (
          <>
            <span className="text-xl font-extrabold tabular-nums text-slate-900 sm:text-2xl">
              {value}
            </span>
            <span className="mt-0.5 text-[10px] font-bold text-slate-400 sm:text-[11px]">
              מתוך {goal}
            </span>
          </>
        )}
      </span>
    </span>
  )
}

/**
 * The agent's day against their target: how many meetings they have booked
 * today, the streak of days that hit it, and the last working week as bars.
 *
 * Counts BOOKINGS (event_created_at), not meetings held — the goal is about the
 * work of setting appointments, which is the part the agent controls today.
 */
export default function GoalCard({ agentName }) {
  const [state, setState] = useState(null) // { goal, today, streak, days }

  useEffect(() => {
    let alive = true
    if (!agentName) return undefined

    Promise.all([getBookingsByDay(agentName), getGoals().catch(() => ({ dailyBookings: null }))])
      .then(([byDay, goals]) => {
        if (!alive) return
        const goal = goals.dailyBookings || DEFAULT_DAILY_GOAL
        setState({
          goal,
          today: byDay[dayKey()] || 0,
          streak: computeStreak(byDay, goal),
          days: recentWorkingDays(byDay, goal),
        })
      })
      .catch(() => alive && setState(null))

    return () => {
      alive = false
    }
  }, [agentName])

  if (!state) return null

  const { goal, today, streak, days } = state
  const done = today >= goal
  const left = goal - today
  const maxBar = Math.max(goal, ...days.map((d) => d.booked), 1)

  return (
    // Two rows on a phone — ring + words, then the week across the full width.
    // As one wrapping row it fell apart at ~375px: the bars are wider than the
    // space left beside the ring, so they wrapped onto a line of their own and
    // squeezed the sentence to a two-line column on the way.
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 items-center gap-3.5 sm:flex-1 sm:gap-4">
        <Ring value={today} goal={goal} done={done} />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Target className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            היעד היומי שלך
          </p>
          <p className="mt-0.5 text-base font-extrabold leading-tight text-slate-900 sm:mt-1 sm:text-lg">
            {done
              ? 'עמדת ביעד היום 🎉'
              : left === 1
                ? 'עוד קביעה אחת ליעד'
                : `עוד ${left} קביעות ליעד`}
          </p>
          {streak > 0 && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 sm:text-xs">
              <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {streak === 1 ? 'יום אחד ברצף' : `${streak} ימים ברצף`}
            </p>
          )}
        </div>
      </div>

      {/* The working week, newest on the left (RTL reading order). Bars share
          the width on a phone; beside the text they keep their own size. */}
      <div className="flex items-end gap-1.5 border-t border-slate-100 pt-3 sm:shrink-0 sm:border-0 sm:pt-0">
        {days.map((d) => (
          <span
            key={d.key}
            className="flex flex-1 flex-col items-center gap-1 sm:w-6 sm:flex-none"
            title={`${d.booked} קביעות`}
          >
            <span className="flex h-10 w-full items-end overflow-hidden rounded-md bg-slate-100 sm:h-12">
              <span
                className={`w-full rounded-t-md transition-[height] duration-700 ${
                  d.hit ? 'bg-green-500' : d.booked > 0 ? 'bg-amber-400' : 'bg-slate-200'
                }`}
                style={{ height: `${Math.max(6, Math.round((d.booked / maxBar) * 100))}%` }}
              />
            </span>
            <span className="text-[10px] font-bold leading-none text-slate-400">{d.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
