import { useMemo } from 'react'
import { CalendarPlus, Handshake, Wallet, Video, Users, Flame } from 'lucide-react'
import AnimatedNumber from '../AnimatedNumber'
import { LogoMark } from '../Logo'
import { mergeFeed } from '../../services/tvService'
import { relativeHe, hhmm, shekels, agentColor, initials, displayName } from './util'

/**
 * The "היום" / "השבוע" board: the latest win shown large, a feed of the
 * window's bookings + deals, and running counts.
 */
export default function BoardView({ board, scope, celebrating, flash, pace }) {
  const feed = useMemo(() => mergeFeed(board), [board])
  const hero = feed[0] || null
  const isWeek = scope === 'week'
  const windowWord = isWeek ? 'השבוע' : 'היום'

  const hot = pace && pace.avgPerDay > 0 && board.counts.meetings > pace.avgPerDay

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(340px,1fr)_1.5fr]">
      {/* feed */}
      <section className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-black">רצף העדכונים</h2>
          <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-400">
            {isWeek ? 'מתחילת השבוע' : 'היום'}
          </span>
        </div>
        <div className="mt-4 flex-1 space-y-2.5 overflow-hidden">
          {feed.length === 0 ? (
            <p className="pt-10 text-center text-sm text-slate-400">
              עוד לא נקבעו פגישות {windowWord} — {isWeek ? 'שבוע חדש מתחיל' : 'הבוקר רק מתחיל'} ☕
            </p>
          ) : (
            feed.slice(0, 7).map((item, i) => {
              const c = agentColor(item.agent)
              const isNew = flash?.has(item.key)
              return (
                <div
                  key={item.key}
                  style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
                  className={`flex tv-rise items-center gap-3 rounded-2xl border p-3 transition ${
                    isNew ? 'border-amber-300/40 bg-amber-400/10' : 'border-white/5 bg-white/[0.03]'
                  }`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-[#0a1327]"
                    style={{ background: c }}
                  >
                    {initials(item.agent)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-300">
                      {item.kind === 'deal' ? 'עסקה נסגרה 🎉' : 'נקבעה פגישה חדשה'}
                    </p>
                    <p className="truncate text-base font-black">{displayName(item)}</p>
                    <p className="truncate text-xs text-slate-400">
                      {item.agent || '—'}
                      {item.kind === 'meeting' && item.when ? ` · ${hhmm(item.when)}` : ''}
                      {item.kind === 'deal' && item.amount ? ` · ${shekels(item.amount)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                    {relativeHe(item.at)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* hero + stats */}
      <section className="flex min-h-0 flex-col gap-5">
        <div
          key={(hero ? hero.key : 'empty') + (celebrating ? '-c' : '')}
          className={`relative flex flex-1 flex-col justify-center overflow-hidden rounded-[2rem] border p-8 backdrop-blur-xl transition-all duration-500 sm:p-12 ${
            celebrating
              ? 'animate-pop border-amber-300/60 bg-amber-400/[0.08] shadow-[0_0_120px_-20px_rgba(251,191,36,0.55)]'
              : 'border-white/10 bg-white/[0.04]'
          }`}
        >
          {celebrating && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/50 tv-ring" />
          )}

          {hero ? (
            <>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-black tracking-wide text-amber-200">
                  {celebrating ? 'הרגע נכנס!' : `העדכון האחרון · ${windowWord}`}
                </span>
                {hero.kind === 'meeting' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                    {hero.type === 'zoom' ? (
                      <Video className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Users className="h-4 w-4" aria-hidden="true" />
                    )}
                    {hero.type === 'zoom' ? 'זום' : 'פרונטלי'}
                  </span>
                )}
              </div>

              <p className="mt-8 text-xl font-bold text-slate-300 sm:text-2xl xl:text-3xl">
                {hero.kind === 'deal' ? 'עסקה נסגרה 🎉' : 'נקבעה פגישה חדשה'}
              </p>
              <p className="mt-2 line-clamp-2 text-6xl font-black leading-[0.98] tracking-tight sm:text-7xl xl:text-8xl 2xl:text-9xl">
                {displayName(hero)}
              </p>

              <div className="mt-8 flex items-center gap-4">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black text-[#0a1327] xl:h-16 xl:w-16"
                  style={{ background: agentColor(hero.agent) }}
                >
                  {initials(hero.agent)}
                </span>
                <span className="text-2xl font-bold text-slate-300 sm:text-3xl xl:text-4xl">
                  {hero.agent || '—'}
                  {hero.kind === 'meeting' && hero.when && (
                    <span className="text-amber-300"> · {hhmm(hero.when)}</span>
                  )}
                  {hero.kind === 'deal' && hero.amount > 0 && (
                    <span className="text-emerald-300"> · {shekels(hero.amount)}</span>
                  )}
                </span>
              </div>

              <div className="pointer-events-none absolute -left-10 -top-10 opacity-[0.07]">
                <CalendarPlus className="h-56 w-56" aria-hidden="true" strokeWidth={1} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-center">
              <span className="animate-float">
                <LogoMark className="h-20 w-20" rounded="rounded-3xl" />
              </span>
              <p className="mt-6 text-2xl font-black">מוכנים ל{isWeek ? 'שבוע' : 'יום'} חדש</p>
              <p className="mt-2 text-sm text-slate-400">
                כל פגישה שתיקבע תופיע כאן ברגע שהיא נכנסת
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatTile
            icon={CalendarPlus}
            label={`פגישות ${windowWord}`}
            value={<AnimatedNumber value={board.counts.meetings} />}
            accent="#fbbf24"
            foot={
              !isWeek && pace && pace.avgPerDay > 0 ? (
                <span className={`flex items-center gap-1 ${hot ? 'text-amber-300' : 'text-slate-400'}`}>
                  {hot && <Flame className="h-3 w-3" aria-hidden="true" />}
                  ממוצע {pace.avgPerDay}/יום
                </span>
              ) : null
            }
          />
          <StatTile
            icon={Handshake}
            label={`עסקאות ${windowWord}`}
            value={<AnimatedNumber value={board.counts.deals} />}
            accent="#34d399"
          />
          <StatTile
            icon={Wallet}
            label={`מחזור ${windowWord}`}
            value={
              <AnimatedNumber
                value={board.counts.revenue}
                format={(n) => `₪${n.toLocaleString('en-US')}`}
              />
            }
            valueClass="text-3xl sm:text-4xl"
            accent="#38bdf8"
          />
        </div>
      </section>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, accent, valueClass = 'text-4xl sm:text-5xl', foot }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <span
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl"
        style={{ background: accent, opacity: 0.18 }}
      />
      <span className="flex items-center gap-2 text-xs font-bold text-slate-400">
        <Icon className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
        {label}
      </span>
      <p className={`mt-2 font-black tabular-nums ${valueClass}`}>{value}</p>
      {foot && <p className="mt-1 text-[11px] font-bold">{foot}</p>}
    </div>
  )
}
