import { useMemo } from 'react'

// The eight full-screen shows, one per milestone (see util.js: every 3 meetings
// unlocks the next). All CSS — no canvas and no library — because this runs on
// the office's weakest machine, all day, behind a live board.
//
// Mount with a key that changes per firing so React remounts and the animations
// restart; the parent unmounts it when the celebration is over.
//
// Every effect keeps its particle count modest and its work on the compositor
// (transform + opacity only), so eight of them cost about what the original
// confetti did.

const rand = (a, b) => a + Math.random() * (b - a)
const times = (n, f) => Array.from({ length: n }, (_, i) => f(i))

/* ── 1. confetti — the original rain ─────────────────────────────────────── */
const CONFETTI_COLORS = ['#fbbf24', '#f7e08a', '#38bdf8', '#34d399', '#f472b6', '#ffffff', '#a78bfa']

function Confetti() {
  const bits = useMemo(
    () =>
      times(90, (i) => ({
        i,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.6 + Math.random() * 2.4,
        size: 7 + Math.random() * 9,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: Math.random() > 0.55,
        drift: (Math.random() - 0.5) * 24,
      })),
    []
  )
  return (
    <>
      {bits.map((b) => (
        <span
          key={b.i}
          className="tv-confetti absolute top-0 block"
          style={{
            left: `${b.left}vw`,
            width: b.size,
            height: b.round ? b.size : b.size * 0.45,
            background: b.color,
            borderRadius: b.round ? '9999px' : '2px',
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            marginInlineStart: `${b.drift}vw`,
            boxShadow: `0 0 8px ${b.color}66`,
          }}
        />
      ))}
    </>
  )
}

/* ── 2. fireworks — sparks thrown out of a few points ────────────────────── */
const FIREWORK_COLORS = ['#f472b6', '#fbbf24', '#38bdf8', '#a78bfa', '#34d399']

function Fireworks() {
  const bursts = useMemo(
    () =>
      times(5, (b) => {
        const color = FIREWORK_COLORS[b % FIREWORK_COLORS.length]
        return {
          b,
          x: rand(15, 85),
          y: rand(18, 60),
          delay: b * 0.42 + rand(0, 0.15),
          color,
          sparks: times(22, (s) => {
            const angle = (s / 22) * Math.PI * 2 + rand(-0.1, 0.1)
            const dist = rand(90, 210)
            return { s, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist }
          }),
        }
      }),
    []
  )
  return (
    <>
      {bursts.map((f) => (
        <span
          key={f.b}
          className="absolute block"
          style={{ left: `${f.x}vw`, top: `${f.y}vh` }}
        >
          {f.sparks.map((s) => (
            <span
              key={s.s}
              className="tv-spark absolute block h-[7px] w-[7px] rounded-full"
              style={{
                background: f.color,
                boxShadow: `0 0 12px ${f.color}`,
                '--dx': `${s.dx}px`,
                '--dy': `${s.dy}px`,
                animationDelay: `${f.delay}s`,
              }}
            />
          ))}
        </span>
      ))}
    </>
  )
}

/* ── 3. shockwave — rings punched out of the centre ──────────────────────── */
function Shockwave() {
  const rings = useMemo(() => times(6, (i) => ({ i, delay: i * 0.26 })), [])
  return (
    <>
      {rings.map((r) => (
        <span
          key={r.i}
          className="tv-shock absolute left-1/2 top-1/2 block rounded-full border-4"
          style={{
            width: '28vmin',
            height: '28vmin',
            marginLeft: '-14vmin',
            marginTop: '-14vmin',
            borderColor: r.i % 2 ? '#38bdf8' : '#fbbf24',
            boxShadow: `0 0 60px ${r.i % 2 ? '#38bdf8' : '#fbbf24'}55`,
            animationDelay: `${r.delay}s`,
          }}
        />
      ))}
    </>
  )
}

/* ── 4. starfall — stars streaking across on the diagonal ────────────────── */
function Starfall() {
  const stars = useMemo(
    () =>
      times(46, (i) => ({
        i,
        left: rand(-10, 100),
        delay: rand(0, 1.6),
        dur: rand(1.7, 3.1),
        size: rand(16, 40),
      })),
    []
  )
  return (
    <>
      {stars.map((s) => (
        <span
          key={s.i}
          className="tv-starfall absolute top-0 block select-none leading-none"
          style={{
            left: `${s.left}vw`,
            fontSize: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`,
            filter: 'drop-shadow(0 0 10px rgba(250,204,21,0.85))',
          }}
        >
          ⭐
        </span>
      ))}
    </>
  )
}

/* ── 5. bubbles — rising, translucent, calm ──────────────────────────────── */
function Bubbles() {
  const bubbles = useMemo(
    () =>
      times(38, (i) => ({
        i,
        left: rand(0, 100),
        delay: rand(0, 1.8),
        dur: rand(3.4, 6.2),
        size: rand(18, 74),
        hue: ['#34d399', '#38bdf8', '#a78bfa'][i % 3],
      })),
    []
  )
  return (
    <>
      {bubbles.map((b) => (
        <span
          key={b.i}
          className="tv-bubble absolute block rounded-full border-2"
          style={{
            left: `${b.left}vw`,
            width: b.size,
            height: b.size,
            borderColor: `${b.hue}aa`,
            background: `radial-gradient(circle at 32% 28%, ${b.hue}44, transparent 62%)`,
            boxShadow: `0 0 22px ${b.hue}55`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}
    </>
  )
}

/* ── 6. beams — light sweeping across the wall ───────────────────────────── */
function Beams() {
  const beams = useMemo(
    () =>
      times(9, (i) => ({
        i,
        top: rand(-10, 100),
        delay: rand(0, 1.1),
        dur: rand(1.3, 2.4),
        height: rand(5, 20),
        hue: ['#a78bfa', '#38bdf8', '#f472b6'][i % 3],
      })),
    []
  )
  return (
    <>
      {beams.map((b) => (
        <span
          key={b.i}
          className="tv-beam absolute block w-[46vw]"
          style={{
            top: `${b.top}vh`,
            height: b.height,
            background: `linear-gradient(90deg, transparent, ${b.hue}, transparent)`,
            filter: 'blur(2px)',
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          }}
        />
      ))}
    </>
  )
}

/* ── 7. coins — money falling, flipping as it goes ───────────────────────── */
function Coins() {
  const coins = useMemo(
    () =>
      times(44, (i) => ({
        i,
        left: rand(0, 100),
        delay: rand(0, 1.4),
        dur: rand(2.4, 4.2),
        size: rand(22, 46),
      })),
    []
  )
  return (
    <>
      {coins.map((c) => (
        <span
          key={c.i}
          className="tv-coin absolute top-0 block select-none leading-none"
          style={{
            left: `${c.left}vw`,
            fontSize: c.size,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
            filter: 'drop-shadow(0 0 9px rgba(252,211,77,0.8))',
          }}
        >
          🪙
        </span>
      ))}
    </>
  )
}

/* ── 8. burst — emoji thrown out of the middle ───────────────────────────── */
const BURST_EMOJI = ['🔥', '🎉', '💪', '🚀', '⚡', '💰', '🏆', '✨']

function Burst() {
  const bits = useMemo(
    () =>
      times(40, (i) => {
        const angle = (i / 40) * Math.PI * 2 + rand(-0.14, 0.14)
        const dist = rand(140, 420)
        return {
          i,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          delay: rand(0, 0.5),
          size: rand(22, 52),
          glyph: BURST_EMOJI[i % BURST_EMOJI.length],
        }
      }),
    []
  )
  return (
    <span className="absolute left-1/2 top-1/2 block">
      {bits.map((b) => (
        <span
          key={b.i}
          className="tv-burst absolute block select-none leading-none"
          style={{
            fontSize: b.size,
            '--dx': `${b.dx}px`,
            '--dy': `${b.dy}px`,
            animationDelay: `${b.delay}s`,
          }}
        >
          {b.glyph}
        </span>
      ))}
    </span>
  )
}

const SHOWS = {
  confetti: Confetti,
  fireworks: Fireworks,
  shockwave: Shockwave,
  starfall: Starfall,
  bubbles: Bubbles,
  beams: Beams,
  coins: Coins,
  burst: Burst,
}

/** Renders one show by key. Unknown keys fall back to confetti. */
export default function Celebration({ show = 'confetti' }) {
  const Show = SHOWS[show] || Confetti
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <Show />
    </div>
  )
}
