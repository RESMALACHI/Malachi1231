import { Trophy, CalendarPlus, Handshake } from 'lucide-react'
import AnimatedNumber from '../AnimatedNumber'
import { agentColor, initials, shekels } from './util'

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * "המובילים" — this week's agents ranked by meetings booked, with a bar that
 * fills in on entry. The leader gets the gold treatment.
 */
export default function LeadersView({ rows = [], totals }) {
  const top = rows.slice(0, 5)
  const max = Math.max(1, ...top.map((r) => r.meetings))

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl sm:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-2xl font-black sm:text-3xl">
          <Trophy className="h-7 w-7 text-amber-400" aria-hidden="true" />
          המובילים · השבוע
        </h2>
        {totals && (
          <div className="flex items-center gap-5 text-sm font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <CalendarPlus className="h-4 w-4 text-amber-400" aria-hidden="true" />
              {totals.meetings} פגישות
            </span>
            <span className="flex items-center gap-1.5">
              <Handshake className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              {totals.deals} עסקאות · {shekels(totals.revenue)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-1 flex-col justify-center gap-3">
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
                className={`tv-rise relative flex items-center gap-4 overflow-hidden rounded-2xl border px-5 ${
                  first
                    ? 'border-amber-300/50 bg-amber-400/[0.09] py-6 shadow-[0_0_70px_-24px_rgba(251,191,36,0.6)]'
                    : 'border-white/8 bg-white/[0.03] py-4'
                }`}
              >
                {first && (
                  <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-white/10 tv-sheen" />
                )}

                <span className={`w-10 shrink-0 text-center font-black ${first ? 'text-3xl' : 'text-xl text-slate-400'}`}>
                  {MEDALS[i] || i + 1}
                </span>

                <span
                  className={`flex shrink-0 items-center justify-center rounded-2xl font-black text-[#0a1327] ${
                    first ? 'h-16 w-16 text-2xl' : 'h-12 w-12 text-lg'
                  }`}
                  style={{ background: c }}
                >
                  {initials(r.name)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`truncate font-black ${first ? 'text-3xl' : 'text-xl'}`}>{r.name}</p>
                  {/* the bar */}
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="tv-bar h-full rounded-full"
                      style={{ width: pctW, background: c, animationDelay: `${i * 90 + 120}ms` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-slate-400">
                    {r.deals > 0
                      ? `${r.deals} עסקאות · ${shekels(r.revenue)}`
                      : 'טרם נסגרה עסקה השבוע'}
                  </p>
                </div>

                <div className="shrink-0 text-left">
                  <p className={`font-black tabular-nums ${first ? 'text-6xl' : 'text-4xl'}`}>
                    <AnimatedNumber value={r.meetings} />
                  </p>
                  <p className="text-[11px] font-bold text-slate-400">פגישות</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
