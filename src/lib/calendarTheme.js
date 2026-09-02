// One visual language for every calendar surface — day, week, month, manager.
//
// Before this file each view invented its own: the month grid had a black
// header bar and pale ringed chips, the week grid had a white header and
// pastel blocks with coloured rails. Same meeting, three different looks. Every
// calendar view now imports from here, so a change lands everywhere at once.
//
// The measurements are Google Calendar's own (a 1px #dadce0 column rule, a
// lighter #e8eaed hour rule, 4px chips, 12px labels), because that is the
// calendar everyone here already reads all day. The COLOURS are ours: green
// arrived, red did not, yellow still open.

/** Grid lines. The column rule is deliberately darker than the hour rule —
 *  reading a calendar means reading down one day. These are Google's values. */
// CSS variables, not literals: these land as INLINE styles all over the
// calendar views, and inline styles are the one place the night theme's class
// remaps can't reach. The values live in index.css, once per theme.
export const LINE = {
  column: 'var(--cal-line-column, #dadce0)',
  hour: 'var(--cal-line-hour, #e8eaed)',
  frame: 'var(--cal-line-column, #dadce0)',
}

/** Google's live time marker: a red hairline with a dot at the leading edge. */
export const NOW_RED = '#ea4335'

/** Simple, solid meeting blocks — colour communicates the attendance state. */
export const STATUS_TONE = {
  attended: {
    fill: 'var(--tone-attended-fill, #d1fae5)',
    edge: 'var(--tone-attended-edge, #6ee7b7)',
    ink: 'var(--tone-attended-ink, #065f46)',
  },
  no_show: {
    fill: 'var(--tone-noshow-fill, #ffe4e6)',
    edge: 'var(--tone-noshow-edge, #fda4af)',
    ink: 'var(--tone-noshow-ink, #9f1239)',
  },
  // Grey, not yellow: "not updated yet" is the absence of an outcome, and it is
  // by far the most common state — a wall of yellow read as a warning.
  pending: {
    fill: 'var(--tone-pending-fill, #f1f5f9)',
    edge: 'var(--tone-pending-edge, #cbd5e1)',
    ink: 'var(--tone-pending-ink, #334155)',
  },
}

/** A flat style shared by every calendar meeting block. */
export function solidChip(tone, { radius = 10 } = {}) {
  return {
    background: tone.fill,
    color: tone.ink,
    border: `1px solid ${tone.edge}`,
    borderRadius: radius,
    boxShadow: 'none',
  }
}

/** The three states the app records, collapsed from a meeting row. */
export function statusKey(m) {
  if (m?.status === 'attended') return 'attended'
  if (m?.status === 'no_show') return 'no_show'
  return 'pending'
}

export function toneFor(m) {
  return STATUS_TONE[statusKey(m)]
}

/** Agent hues — the leaderboard dots, reused wherever agents are told apart. */
export const AGENT_HUE = {
  'ודיע': '#0ea5e9',
  'מרים': '#f43f5e',
  'עדי': '#6366f1',
  'מלאכי אזערי': '#f59e0b',
}
export const AGENT_HUE_FALLBACK = '#94a3b8'

export const hueFor = (name) => AGENT_HUE[name] || AGENT_HUE_FALLBACK

/**
 * Weekday strip above a grid — quiet, identical in every view.
 *
 * The colour is set INLINE rather than with a `text-slate-*` class on purpose:
 * index.css force-darkens those classes to near-black app-wide (`!important`,
 * so the patterned background stays readable), which would repaint the calendar
 * chrome and make every header shout. Not carrying those class names is what
 * keeps these labels the quiet grey a calendar needs.
 */
export const HEAD_LABEL = 'text-[11px] font-semibold tracking-wide'
/** Google's own chrome grey, for weekday labels and hour numbers. */
export const CHROME_GREY = 'var(--cal-chrome, #70757a)'

/** Today's date, in a filled circle. Google's is blue; ours is the app's ink. */
export function todayCircle(size = 'md') {
  const box = size === 'lg' ? 'h-10 w-10 text-[20px]' : 'h-7 w-7 text-[13px]'
  return `flex items-center justify-center rounded-full font-bold tabular-nums ${box}`
}

/** A meeting chip, shared by the month grid and the day/week blocks. */
export const CHIP_BASE =
  'overflow-hidden text-right leading-snug transition duration-150 hover:brightness-[1.06]'

/**
 * The frosted pane every calendar sits on.
 *
 * This is the ONE blurred layer in the whole grid. It samples the page's
 * gradient and drifting glows, which is what gives the chips above it something
 * to be translucent against — without it, "glass" over flat white is just
 * washed-out colour. `saturate` keeps the gold from going grey through the blur.
 */
export const SURFACE =
  'rounded-2xl border border-white/70 shadow-xl shadow-slate-900/10 backdrop-blur-2xl'
export const SURFACE_BG = 'var(--cal-surface, rgba(255, 255, 255, 0.62))'
