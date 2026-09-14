import { useEffect, useState } from 'react'

/** Live `matchMedia` — re-renders when the query flips (rotation, resize). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

const readViewport = () => {
  const v = typeof window !== 'undefined' ? window.visualViewport : null
  return v
    ? { height: Math.round(v.height), top: Math.round(v.offsetTop) }
    : { height: typeof window !== 'undefined' ? window.innerHeight : 0, top: 0 }
}

/**
 * The part of the screen actually visible — which on a phone shrinks when the
 * keyboard opens. `100dvh` does not follow the keyboard on iOS, so a full-screen
 * layout sized by it keeps its bottom (the input!) hidden behind the keys.
 */
export function useVisualViewport() {
  const [vp, setVp] = useState(readViewport)
  useEffect(() => {
    const v = window.visualViewport
    const on = () => setVp(readViewport())
    v?.addEventListener('resize', on)
    v?.addEventListener('scroll', on)
    window.addEventListener('resize', on)
    return () => {
      v?.removeEventListener('resize', on)
      v?.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  return vp
}
