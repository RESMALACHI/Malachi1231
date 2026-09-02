// RES college logo — recreated as a crisp, scalable SVG.
//
// The mark: ascending bars (growth / a building) inside an open ring, split
// silver (left) and gold (right), with the tallest gold bar breaking through
// the ring as a flame/leaf tip. Rendered on the app's signature black tile.

import { useId } from 'react'

export function LogoMark({ className = 'h-9 w-9', rounded = 'rounded-xl' }) {
  // Strip colons from React's useId so the ids are safe inside url(#...).
  const uid = `res${useId().replace(/:/g, '')}`
  const silver = `${uid}-silver`
  const gold = `${uid}-gold`
  const ring = `${uid}-ring`

  return (
    <span
      className={`relative flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black shadow-md shadow-black/40 ${rounded} ${className}`}
    >
      <svg viewBox="0 0 100 100" className="h-[78%] w-[78%]" aria-hidden="true">
        <defs>
          <linearGradient id={silver} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f4f4f5" />
            <stop offset="45%" stopColor="#c4c4c8" />
            <stop offset="100%" stopColor="#7d7d83" />
          </linearGradient>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7e08a" />
            <stop offset="45%" stopColor="#d9b34a" />
            <stop offset="100%" stopColor="#9c731d" />
          </linearGradient>
          <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d8d8dc" />
            <stop offset="55%" stopColor="#8a8a90" />
            <stop offset="100%" stopColor="#d9b34a" />
          </linearGradient>
        </defs>

        {/* Open ring — gap at the top-right where the gold tip breaks through. */}
        <path
          d="M64 16 A38 38 0 1 1 60 15.6"
          fill="none"
          stroke={`url(#${ring})`}
          strokeWidth="6.5"
          strokeLinecap="round"
        />

        {/* Silver bars (left) */}
        <rect x="34" y="58" width="8.5" height="20" rx="2.5" fill={`url(#${silver})`} />
        <rect x="45" y="46" width="8.5" height="32" rx="2.5" fill={`url(#${silver})`} />

        {/* Gold bars (right) — tallest ends in a flame/leaf tip past the ring. */}
        <rect x="56" y="40" width="8.5" height="38" rx="2.5" fill={`url(#${gold})`} />
        <path
          d="M67 78 V30 Q67 16 74 8 Q76 24 75.5 40 V78 Z"
          fill={`url(#${gold})`}
        />
      </svg>
    </span>
  )
}

/** Full lockup: the mark beside the "מכללת R.E.S" wordmark + tagline. */
export function Logo({ markClassName = 'h-11 w-11', stacked = false }) {
  return (
    <div
      className={`flex items-center gap-3 ${stacked ? 'flex-col text-center' : ''}`}
    >
      <LogoMark className={markClassName} rounded="rounded-2xl" />
      <div className={stacked ? 'mt-1' : ''}>
        <div className="text-lg font-extrabold leading-none tracking-tight text-slate-900">
          מכללת{' '}
          <span className="bg-gradient-to-l from-amber-600 via-amber-500 to-yellow-400 bg-clip-text text-transparent">
            R.E.S
          </span>
        </div>
        <div className="mt-1 text-[11px] font-semibold tracking-[0.15em] text-amber-600/90">
          למידה · עשייה · הגשמה
        </div>
      </div>
    </div>
  )
}

export default Logo
