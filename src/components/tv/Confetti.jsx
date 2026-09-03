import { useMemo } from 'react'

// A one-shot confetti burst — pure CSS, no canvas, no library. Mount it (with a
// changing `fire` key so React remounts) and it rains ~90 pieces down the whole
// screen once, then the parent unmounts it.

const COLORS = ['#fbbf24', '#f7e08a', '#38bdf8', '#34d399', '#f472b6', '#ffffff', '#a78bfa']

export default function Confetti({ pieces = 90 }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.9
        const dur = 2.6 + Math.random() * 2.4
        const size = 7 + Math.random() * 9
        const color = COLORS[i % COLORS.length]
        const round = Math.random() > 0.55
        const drift = (Math.random() - 0.5) * 24 // vw
        return { left, delay, dur, size, color, round, drift, i }
      }),
    [pieces]
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
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
            // a lateral drift on top of the fall
            marginInlineStart: `${b.drift}vw`,
            boxShadow: `0 0 8px ${b.color}66`,
          }}
        />
      ))}
    </div>
  )
}
