// The deal takeover.
//
// A booked meeting is a good day; a closed deal is the reason the office exists.
// So this is the one thing on the board that stops everything else: the rotation
// freezes, the screen goes gold, and the number counts up in the middle where
// the whole floor can read it.
//
// Built from the shows that already exist (coins, burst, shockwave) layered
// together rather than a ninth effect — same compositor-only discipline, and
// three cheap layers at once look considerably more expensive than one.
//
// Mount with a key that changes per deal so React remounts and every animation
// restarts from the top; the parent unmounts it when the moment is over.

import { useEffect, useRef, useState } from 'react'
import Celebration from './Celebration'
import { agentColor, initials, shekels } from './util'

/**
 * Counts to `target` over `ms`, easing out.
 *
 * The point of the whole screen is the money, and a number that simply appears
 * is read once and forgotten. One that climbs is watched — which buys the few
 * seconds it takes the room to look up.
 */
function useCountUp(target, ms) {
  const [value, setValue] = useState(0)
  const raf = useRef(0)
  const land = useRef(0)

  useEffect(() => {
    const to = Number(target) || 0
    // Respect a viewer who has asked for less motion: land on the number.
    const still =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still || to === 0) {
      setValue(to)
      return undefined
    }

    let start = 0
    const step = (t) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / ms)
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)

    // The number MUST end up right, and requestAnimationFrame does not promise
    // that: it stops being called whenever the page isn't painting, and the
    // easing is so flat near the end that stalling looks like an answer rather
    // than a freeze. Caught in preview settling on ₪19,560 for a ₪19,800 deal.
    // A timer keeps running when frames do not, so it lands the real figure.
    land.current = setTimeout(() => setValue(to), ms + 400)

    return () => {
      cancelAnimationFrame(raf.current)
      clearTimeout(land.current)
    }
  }, [target, ms])

  return value
}

/**
 * Re-fires the particle layers every `ms` for as long as this is mounted.
 *
 * Every show in Celebration.jsx runs once and stops — they were written for a
 * 6-second milestone. Over a song three times that length the screen would go
 * still after five seconds and stay still, which is the opposite of the point.
 * Changing the key remounts the layer and restarts it from the top.
 */
function useWave(ms) {
  const [wave, setWave] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setWave((w) => w + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return wave
}

export default function DealCelebration({ deal }) {
  const amount = Number(deal?.amount) || 0
  const shown = useCountUp(amount, 2600)
  const color = agentColor(deal?.agent)
  // A coin wave lasts about 5.6s, so a new one every 4s overlaps into a
  // continuous rain. The centre effects are punctuation and come round slower.
  const coinWave = useWave(4000)
  const burstWave = useWave(7000)

  return (
    <>
      {/* Three shows at once. Order matters only for looks: the rings sit
          behind the falling coins, the burst throws over both. */}
      <Celebration key={`s${burstWave}`} show="shockwave" />
      <Celebration key={`c${coinWave}`} show="coins" />
      <Celebration key={`b${burstWave}`} show="burst" />

      {/* The gold wash. Sits under the card, over everything else. */}
      <div
        className="tv-deal-glow pointer-events-none fixed inset-0 z-[85]"
        style={{
          background:
            'radial-gradient(1200px 700px at 50% 45%, rgba(251,191,36,0.30), transparent 70%), linear-gradient(to top, rgba(180,120,10,0.30), transparent 55%)',
        }}
      />

      <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center px-6">
        <div
          className="tv-deal-card flex max-w-[92vw] flex-col items-center rounded-[2rem] border-2 bg-[#0a1327]/92 px-10 py-9 text-center backdrop-blur-2xl sm:rounded-[3rem] sm:px-24 sm:py-14"
          style={{
            borderColor: 'rgba(251,191,36,0.65)',
            boxShadow: '0 0 220px -10px rgba(251,191,36,0.85)',
          }}
        >
          <span className="text-base font-black tracking-[0.4em] text-amber-200 sm:text-3xl sm:tracking-[0.5em]">
            🎉 עסקה נסגרה 🎉
          </span>

          {/* The money. Everything else on this card is context for it. */}
          <p
            className="tv-deal-shine mt-3 bg-clip-text text-7xl font-black leading-none text-transparent tabular-nums sm:mt-5 sm:text-[10rem]"
            style={{
              backgroundImage:
                'linear-gradient(100deg, #fde68a 10%, #fff8e1 30%, #f59e0b 50%, #fde68a 70%)',
            }}
          >
            {shekels(shown)}
          </p>

          <p className="mt-4 max-w-full break-words text-3xl font-black leading-tight text-white sm:mt-6 sm:text-6xl">
            {deal?.who || 'לקוח'}
          </p>

          {/* Whose it is — the name the floor turns to look at. */}
          <span className="mt-5 flex items-center gap-3 sm:mt-8 sm:gap-5">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black text-slate-900 sm:h-20 sm:w-20 sm:rounded-3xl sm:text-4xl"
              style={{ background: color }}
            >
              {initials(deal?.agent)}
            </span>
            <span className="text-3xl font-black sm:text-6xl" style={{ color }}>
              {deal?.agent || '—'}
            </span>
          </span>
        </div>
      </div>
    </>
  )
}
