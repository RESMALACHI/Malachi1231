import { Sparkles } from 'lucide-react'
import { CELEBRATIONS, MILESTONE_STEP } from './util'

/**
 * The card that lands in the middle when a milestone is hit.
 *
 * It carries the show's own colour and name, and — the part that does the
 * work — how many of the eight have been seen tonight and what the next one
 * costs. "עוד 3 פגישות ל🎆 זיקוקים" is a smaller, nearer thing to chase than
 * any monthly target.
 */
export default function MilestoneBanner({ n, show }) {
  const color = show?.color || '#fbbf24'
  const seen = Math.max(1, Math.round(n / MILESTONE_STEP))
  const next = CELEBRATIONS[seen % CELEBRATIONS.length]

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center px-6">
      <div
        className="tv-milestone flex flex-col items-center rounded-[2rem] border-2 bg-[#0a1327]/90 px-10 py-8 text-center backdrop-blur-2xl sm:rounded-[2.75rem] sm:px-20 sm:py-12"
        style={{ borderColor: `${color}99`, boxShadow: `0 0 180px -10px ${color}bf` }}
      >
        <span
          className="flex items-center gap-2 text-sm font-black tracking-[0.4em] sm:gap-3 sm:text-base sm:tracking-[0.45em]"
          style={{ color }}
        >
          <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          {show?.emoji} {show?.label || 'יעד חדש'}
          <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
        </span>

        <p
          className="mt-2 text-8xl font-black leading-none sm:mt-3 sm:text-9xl"
          style={{ color }}
        >
          {n}
        </p>
        <p className="mt-2 text-3xl font-black sm:mt-3 sm:text-5xl">פגישות היום! 🎯</p>

        <p className="mt-3 text-base font-bold text-slate-300 sm:mt-4 sm:text-xl">
          עוד {MILESTONE_STEP} פגישות ל{next.emoji} <span style={{ color: next.color }}>{next.label}</span>
        </p>
      </div>
    </div>
  )
}
