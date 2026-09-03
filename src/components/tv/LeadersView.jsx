import { Trophy, CalendarPlus, Handshake } from 'lucide-react'
import AnimatedNumber from '../AnimatedNumber'
import { agentColor, initials, shekels } from './util'

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * "המובילים" — this week's agents ranked by meetings booked, with a bar that
 * fills in on entry. The leader gets the gold treatment. Tuned to fit five rows
 * on a 768-tall screen.
 */
export default function LeadersView({ rows = [], totals }) {
  const top = rows.slice(0, 5)
  const max = Math.max(1, ...top.map((r) => r.meetings))

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl sm:rounded-[2rem] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-xl font-black sm:gap-3 sm:text-3xl">
          <Trophy className="h-6 w-6 text-amber-400 sm:h-7 sm:w-7" aria-hidden="true" />
          המובילים · השבוע
        </h2>
        {totals && (
          <div className="flex items-center gap-4 text-xs font-bold text-slate-300 sm:text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarPlus className="h-4 w-4 text-amber-400" aria-hidden="true" />
              {totals.meetings} פגישות
            </span>
            <span className="flex items-center gap-1.5">
              <Handshake className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              {totals.deals} · {shekels(totals.revenue)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center gap-2 sm:mt-5 sm:gap-3">
        {top.length === 0 ? (
          <p className="text-center text-sm text-slate-400">אין נתונים לשבוע הזה עדיין</p>
        ) : (
          top.map((r, i) => {
            const c = agentColor(r.name)
            const first = i === 0
            const pctW = `${Math.round((r.meetings / max) * 100)}%`
            return (
              <div
                key={r.name}
                style={{ animationDelay: `${i * 90}ms` }}
                className={`tv-rise relative flex items-center gap-3 overflow-hidden rounded-2xl border px-3 sm:gap-4 sm:px-5 ${
                  first
                    ? 'border-amber-300/50 bg-amber-400/[0.09] py-3 shadow-[0_0_60px_-24px_rgba(251,191,36,0.6)] sm:py-5'
                    : 'border-white/8 bg-white/[0.03] py-2.5 sm:py-4'
                }`}
              >
                {first && (
                  <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/10 tv-sheen" />
                )}

                <span
                  className={`w-8 shrink-0 text-center font-black sm:w-10 ${
                    first ? 'text-2xl sm:text-3xl' : 'text-lg text-slate-400 sm:text-xl'
                  }`}
                >
                  {MEDALS[i] || i + 1}
                </span>

                <span
                  className={`flex shrink-0 items-center justify-center rounded-xl font-black text-[#0a1327] sm:rounded-2xl ${
                    first ? 'h-12 w-12 text-lg sm:h-16 sm:w-16 sm:text-2xl' : 'h-10 w-10 text-sm sm:h-12 sm:w-12 sm:text-lg'
                  }`}
                  style={{ background: c }}
                >
                  {initials(r.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`truncate font-black ${first ? 'text-xl sm:text-3xl' : 'text-base sm:text-xl'}`}>
                    {r.name}
                  </p>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/5 sm:h-2.5">
                    <div
                      className="tv-bar h-full rounded-full"
                      style={{ width: pctW, background: c, animationDelay: `${i * 90 + 120}ms` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">
                    {r.deals > 0 ? `${r.deals} עסקאות · ${shekels(r.revenue)}` : 'טרם נסגרה עסקה השבוע'}
                  </p>
                </div>

                <div className="shrink-0 text-left">
                  <p className={`font-black tabular-nums ${first ? 'text-4xl sm:text-6xl' : 'text-2xl sm:text-4xl'}`}>
                    <AnimatedNumber value={r.meetings} />
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 sm:text-[11px]">פגישות</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
