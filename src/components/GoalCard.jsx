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
    <span className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center">
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
          <Check className="h-7 w-7 text-green-600" aria-hidden="true" />
        ) : (
          <>
            <span className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</span>
            <span className="mt-0.5 text-[11px] font-bold text-slate-400">מתוך {goal}</span>
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
    <div className="card flex flex-wrap items-center gap-4 p-4 sm:gap-5">
      <Ring value={today} goal={goal} done={done} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <Target className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          היעד היומי שלך
        </p>
        <p className="mt-1 text-lg font-extrabold text-slate-900">
          {done
            ? 'עמדת ביעד היום 🎉'
            : left === 1
              ? 'עוד קביעה אחת ליעד'
              : `עוד ${left} קביעות ליעד`}
        </p>
        {streak > 0 && (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {streak === 1 ? 'יום אחד ברצף' : `${streak} ימים ברצף`}
          </p>
        )}
      </div>

      {/* the working week, newest on the left (RTL reading order) */}
      <div className="flex shrink-0 items-end gap-1.5">
        {days.map((d) => (
          <span key={d.key} className="flex w-6 flex-col items-center gap-1" title={`${d.booked} קביעות`}>
            <span className="flex h-12 w-full items-end overflow-hidden rounded-md bg-slate-100">
              <span
                className={`w-full rounded-md transition-[height] duration-700 ${
                  d.hit ? 'bg-green-500' : d.booked > 0 ? 'bg-amber-400' : 'bg-slate-200'
                }`}
                style={{ height: `${Math.max(6, Math.round((d.booked / maxBar) * 100))}%` }}
              />
            </span>
            <span className="text-[10px] font-bold text-slate-400">{d.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
