import { useEffect, useRef, useState } from 'react'

/**
 * Counts up to `value` whenever it changes (easeOutCubic).
 * `format` optionally maps the running integer to a display string
 * (e.g. thousands separators) — the default just prints it.
 */
export default function AnimatedNumber({
  value = 0,
  duration = 900,
  suffix = '',
  format = (n) => n,
}) {
  const [display, setDisplay] = useState(Number(value) || 0)
  const fromRef = useRef(Number(value) || 0)
  const rafRef = useRef()

  useEffect(() => {
    const from = fromRef.current
    const to = Number(value) || 0
    if (from === to) {
      setDisplay(to)
      fromRef.current = to
      return
    }
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return (
    <>
      {format(display)}
      {suffix}
    </>
  )
}
