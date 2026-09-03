import { useMemo } from 'react'
import { CalendarPlus, Handshake, Wallet, Video, Users, Flame } from 'lucide-react'
import AnimatedNumber from '../AnimatedNumber'
import { LogoMark } from '../Logo'
import { mergeFeed } from '../../services/tvService'
import { relativeHe, hhmm, shekels, agentColor, initials, displayName } from './util'

/**
 * The "היום" / "השבוע" board — stacked so it holds up on any screen shape
 * (16:9 wall TVs and 4:3 1024×768 alike): the latest win large, then the three
 * counts, then a horizontal ticker of the window's recent wins.
 */
export default function BoardView({ board, scope, celebrating, flash, pace }) {
  const feed = useMemo(() => mergeFeed(board), [board])
  const hero = feed[0] || null
  const isWeek = scope === 'week'
  const windowWord = isWeek ? 'השבוע' : 'היום'
  const hot = pace && pace.avgPerDay > 0 && board.counts.meetings > pace.avgPerDay

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
      {/* ── hero ── */}
      <div
        key={(hero ? hero.key : 'empty') + (celebrating ? '-c' : '')}
        className={`relative flex min-h-0 flex-1 items-center gap-8 overflow-hidden rounded-[1.5rem] border p-5 backdrop-blur-xl transition-all duration-500 sm:rounded-[2rem] sm:p-9 ${
          celebrating
            ? 'animate-pop border-amber-300/60 bg-amber-400/[0.08] shadow-[0_0_120px_-20px_rgba(251,191,36,0.55)]'
            : 'border-white/10 bg-white/[0.04]'
        }`}
      >
        {celebrating && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/50 tv-ring" />
        )}

        {hero ? (
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-black tracking-wide text-amber-200 sm:text-xs">
                {celebrating ? 'הרגע נכנס!' : `העדכון האחרון · ${windowWord}`}
              </span>
              {hero.kind === 'meeting' && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 sm:text-xs">
                  {hero.type === 'zoom' ? (
                    <Video className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Users className="h-4 w-4" aria-hidden="true" />
                  )}
                  {hero.type === 'zoom' ? 'זום' : 'פרונטלי'}
                </span>
              )}
            </div>

            <p className="mt-2 shrink-0 text-sm font-bold text-slate-300 sm:mt-4 sm:text-base xl:mt-6 xl:text-2xl">
              {hero.kind === 'deal' ? 'עסקה נסגרה 🎉' : 'נקבעה פגישה חדשה'}
            </p>
            <p className="mt-1 line-clamp-2 shrink-0 text-4xl font-black leading-[1] tracking-tight sm:mt-2 md:text-5xl xl:text-7xl 2xl:text-8xl">
              {displayName(hero)}
            </p>

            <div className="mt-3 flex shrink-0 items-center gap-3 sm:mt-5 sm:gap-4 xl:mt-7">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-black text-[#0a1327] sm:h-12 sm:w-12 sm:rounded-2xl sm:text-lg xl:h-14 xl:w-14 xl:text-xl"
                style={{ background: agentColor(hero.agent) }}
              >
                {initials(hero.agent)}
              </span>
              <span className="text-lg font-bold text-slate-300 sm:text-xl xl:text-3xl">
                {hero.agent || '—'}
                {hero.kind === 'meeting' && hero.when && (
                  <span className="text-amber-300"> · {hhmm(hero.when)}</span>
                )}
                {hero.kind === 'deal' && hero.amount > 0 && (
                  <span className="text-emerald-300"> · {shekels(hero.amount)}</span>
                )}
              </span>
            </div>

            <div className="pointer-events-none absolute -left-10 -top-10 opacity-[0.06] xl:hidden">
              <CalendarPlus className="h-40 w-40 sm:h-52 sm:w-52" aria-hidden="true" strokeWidth={1} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="animate-float">
              <LogoMark className="h-16 w-16 sm:h-20 sm:w-20" rounded="rounded-3xl" />
            </span>
            <p className="mt-5 text-xl font-black sm:text-2xl">מוכנים ל{isWeek ? 'שבוע' : 'יום'} חדש</p>
            <p className="mt-2 text-sm text-slate-400">כל פגישה שתיקבע תופיע כאן ברגע שהיא נכנסת</p>
          </div>
        )}

        {/* big monogram fills the open (left) side on a wide screen */}
        {hero && hero.agent && (
          <span
            className="hidden shrink-0 items-center justify-center rounded-[2rem] font-black text-[#0a1327] shadow-2xl xl:flex xl:h-48 xl:w-48 xl:text-7xl 2xl:h-60 2xl:w-60 2xl:text-8xl"
            style={{ background: agentColor(hero.agent) }}
            aria-hidden="true"
          >
            {initials(hero.agent)}
          </span>
        )}
      </div>

      {/* ── the three counts ── */}
      <div className="grid shrink-0 grid-cols-3 gap-3 sm:gap-4">
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
          valueClass="text-2xl sm:text-4xl"
          accent="#38bdf8"
        />
      </div>

      {/* ── recent-wins ticker ── */}
      <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.035] p-3 backdrop-blur-xl sm:p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-black sm:text-base">רצף העדכונים</h2>
          <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-400">
            {isWeek ? 'מתחילת השבוע' : 'היום'}
          </span>
        </div>
        {feed.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">
            עוד לא נקבעו פגישות {windowWord} — {isWeek ? 'שבוע חדש מתחיל' : 'הבוקר רק מתחיל'} ☕
          </p>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {feed.slice(0, 8).map((item, i) => {
              const c = agentColor(item.agent)
              const isNew = flash?.has(item.key)
              return (
                <div
                  key={item.key}
                  style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}
                  className={`tv-rise flex min-w-[13.5rem] max-w-[13.5rem] shrink-0 items-center gap-2.5 rounded-xl border p-2.5 ${
                    isNew ? 'border-amber-300/40 bg-amber-400/10' : 'border-white/5 bg-white/[0.03]'
                  }`}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black text-[#0a1327]"
                    style={{ background: c }}
                  >
                    {initials(item.agent)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-slate-300">
                      {item.kind === 'deal' ? 'עסקה 🎉' : 'פגישה חדשה'}
                      <span className="text-slate-400"> · {relativeHe(item.at)}</span>
                    </p>
                    <p className="truncate text-sm font-black">{displayName(item)}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {item.agent || '—'}
                      {item.kind === 'meeting' && item.when ? ` · ${hhmm(item.when)}` : ''}
                      {item.kind === 'deal' && item.amount ? ` · ${shekels(item.amount)}` : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, accent, valueClass = 'text-3xl sm:text-5xl', foot }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl sm:rounded-3xl sm:p-5">
      <span
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl"
        style={{ background: accent, opacity: 0.18 }}
      />
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 sm:gap-2 sm:text-xs">
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: accent }} aria-hidden="true" />
        {label}
      </span>
      <p className={`mt-1 font-black tabular-nums sm:mt-2 ${valueClass}`}>{value}</p>
      {foot && <p className="mt-0.5 text-[10px] font-bold sm:text-[11px]">{foot}</p>}
    </div>
  )
}
