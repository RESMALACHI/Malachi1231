// Small shared pieces of זירת אימון. The stage is always dark (like ספיץ), so
// colours here are white/amber at opacities — never text-slate-400..700, which
// the light theme overrides to near-black.

import { PhoneOff, CalendarCheck2, CircleSlash } from 'lucide-react'
import { LEVELS, initialsOf } from '../../lib/simPersonas'

export const AR_FONT = "'Cairo', 'Heebo', system-ui, sans-serif"

/** The prospect's face: a lit gradient disc, with rings while they speak. */
export function PersonaAvatar({ persona, size = 56, speaking = false, className = '' }) {
  const h = persona.hue
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {speaking && (
        <>
          <span
            className="absolute inset-0 animate-pulse-ring rounded-full"
            style={{ background: `hsl(${h} 90% 60% / 0.55)` }}
            aria-hidden="true"
          />
          <span
            className="absolute inset-0 animate-pulse-ring rounded-full [animation-delay:.55s]"
            style={{ background: `hsl(${h} 90% 60% / 0.35)` }}
            aria-hidden="true"
          />
        </>
      )}
      <span
        className="relative flex h-full w-full items-center justify-center rounded-full font-black text-white shadow-lg ring-1 ring-white/20"
        style={{
          background: `radial-gradient(120% 120% at 30% 20%, hsl(${h} 95% 70%), hsl(${h + 25} 80% 42%) 60%, hsl(${h + 40} 70% 22%))`,
          fontSize: size * 0.34,
          fontFamily: persona.lang === 'ar' ? AR_FONT : undefined,
          boxShadow: `0 10px 30px -10px hsl(${h} 90% 55% / 0.6)`,
        }}
      >
        {initialsOf(persona)}
      </span>
    </span>
  )
}

export function LevelChip({ level }) {
  const l = LEVELS[level] || LEVELS[2]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10.5px] font-bold text-slate-100/75">
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-2.5 w-1 rounded-full ${i <= level ? `bg-gradient-to-t ${l.tone}` : 'bg-white/15'}`}
          />
        ))}
      </span>
      {l.label}
    </span>
  )
}

const OUTCOMES = {
  booked: { label: 'נקבעה פגישה', icon: CalendarCheck2, cls: 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200' },
  hung_up: { label: 'הלקוח ניתק', icon: PhoneOff, cls: 'border-rose-400/30 bg-rose-400/15 text-rose-200' },
  ended: { label: 'לא נקבעה פגישה', icon: CircleSlash, cls: 'border-white/15 bg-white/5 text-slate-100/70' },
}

export function OutcomeBadge({ outcome, small = false }) {
  const o = OUTCOMES[outcome] || OUTCOMES.ended
  const Icon = o.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold ${o.cls} ${
        small ? 'px-2 py-0.5 text-[10.5px]' : 'px-3 py-1 text-xs'
      }`}
    >
      <Icon className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {o.label}
    </span>
  )
}

export const scoreHue = (s) => (s >= 80 ? 150 : s >= 60 ? 45 : s >= 40 ? 28 : 350)

/** The score, as a ring that fills. */
export function ScoreRing({ score, size = 132 }) {
  const r = 52
  const c = 2 * Math.PI * r
  const known = typeof score === 'number'
  const pct = known ? Math.max(0, Math.min(100, score)) / 100 : 0
  const h = known ? scoreHue(score) : 220
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={`hsl(${h} 85% 58%)`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)', filter: `drop-shadow(0 0 8px hsl(${h} 90% 55% / .45))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black tabular-nums text-white">{known ? score : '—'}</span>
        <span className="text-[10px] font-bold tracking-[0.2em] text-slate-100/45">מתוך 100</span>
      </div>
    </div>
  )
}

/**
 * Trust over the call — the prospect's temperature after each of their lines.
 * The biggest fall and rise are marked, because "where did I lose him" is the
 * question every agent has after a failed call.
 */
export function TrustChart({ transcript, best, worst, bookAt, onPick }) {
  const pts = []
  transcript.forEach((t, i) => {
    if (t.role === 'prospect' && typeof t.trust === 'number') pts.push({ i, v: t.trust })
  })
  if (pts.length < 2) return null

  const W = 600
  const H = 150
  // Time runs RIGHT to LEFT, like the page: the call starts where a Hebrew
  // reader starts reading. The scale sits on the right for the same reason.
  const pad = { l: 14, r: 26, t: 14, b: 22 }
  const x = (k) => W - pad.r - (k / (pts.length - 1)) * (W - pad.l - pad.r)
  const y = (v) => pad.t + (1 - v / 10) * (H - pad.t - pad.b)
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  // Text inside an RTL page's SVG would otherwise be laid out right-to-left
  // from its anchor and land on the wrong side of the point.
  const svgDir = { direction: 'ltr' }

  // A turning point is stored as the AGENT line's index; its effect shows on
  // the prospect line right after it.
  const markAt = (tp) => {
    if (!tp) return null
    const k = pts.findIndex((p) => p.i > tp.index)
    return k > 0 ? { k, tp } : null
  }
  const up = markAt(best)
  const down = markAt(worst)

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={svgDir} className="h-auto w-full min-w-[320px]" role="img" aria-label="אמון הלקוח לאורך השיחה">
        <defs>
          <linearGradient id="trustFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(251 191 36)" stopOpacity=".35" />
            <stop offset="100%" stopColor="rgb(251 191 36)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.07)" />
            <text x={W - pad.r + 8} y={y(v) + 3.5} textAnchor="start" fontSize="10" fill="rgba(241,245,249,.4)">
              {v}
            </text>
          </g>
        ))}
        {bookAt ? (
          <g>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(bookAt)}
              y2={y(bookAt)}
              stroke="rgb(52 211 153)"
              strokeOpacity=".45"
              strokeDasharray="4 5"
            />
            <text x={pad.l} y={y(bookAt) - 5} textAnchor="start" fontSize="10" fill="rgb(110 231 183)" fillOpacity=".8">
              מוכן להיפגש
            </text>
          </g>
        ) : null}
        <path d={area} fill="url(#trustFill)" />
        <path d={line} fill="none" stroke="rgb(252 211 77)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, k) => (
          <circle key={p.i} cx={x(k)} cy={y(p.v)} r="3.5" fill="#0f172a" stroke="rgb(252 211 77)" strokeWidth="2" />
        ))}
        {[up && { ...up, tone: 'rgb(52 211 153)', label: 'כאן נפתח' }, down && { ...down, tone: 'rgb(251 113 133)', label: 'כאן איבדת' }]
          .filter(Boolean)
          .map((m) => (
            <g key={m.label} className="cursor-pointer" onClick={() => onPick?.(m.tp.index)}>
              <circle cx={x(m.k)} cy={y(pts[m.k].v)} r="7" fill={m.tone} fillOpacity=".25" stroke={m.tone} strokeWidth="2" />
              <text x={x(m.k)} y={Math.max(11, y(pts[m.k].v) - 12)} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={m.tone}>
                {m.label}
              </text>
            </g>
          ))}
      </svg>
    </div>
  )
}

export const fmtClock = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
