/**
 * The app's loading mark — the three bars of the R.E.S logo, rising in turn.
 *
 * It replaced the opening splash animation. The splash cost every user 2.35
 * seconds on every new tab whether or not anything was actually loading; this
 * shows the same motif, but only while there is real work to wait for.
 *
 * Laid out as a ROW at exactly the old spinner's size, because `<Spinner />`
 * with no label is rendered INSIDE buttons ("שמור", "אישור") — a taller or
 * stacked mark would stretch those buttons every time they went busy.
 *
 * Keyframes live in index.css under "Loading mark".
 */

/** Bar heights ascend like the logo; the tallest is the gold one. */
const SIZES = {
  sm: { w: 3, h: [9, 13, 16], gap: 2.5, text: 'text-xs' },
  md: { w: 3.5, h: [11, 16, 20], gap: 3, text: 'text-sm' },
  lg: { w: 5, h: [18, 26, 32], gap: 4.5, text: 'text-base' },
}

const BAR = ['#cbd5e1', '#94a3b8', '#f59e0b']

export default function Loader({ label = '', size = 'md', className = '' }) {
  const s = SIZES[size] || SIZES.md

  return (
    <div
      className={`flex items-center justify-center gap-3 text-slate-500 ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* dir=ltr so the bars always ascend the way the printed mark does,
          instead of mirroring with the rest of the RTL layout. */}
      <span
        dir="ltr"
        className="flex shrink-0 items-end"
        style={{ gap: s.gap, height: s.h[2] }}
        aria-hidden="true"
      >
        {s.h.map((h, i) => (
          <span
            key={i}
            className="res-bar rounded-full"
            style={{
              width: s.w,
              height: h,
              background: BAR[i],
              animationDelay: `${i * 130}ms`,
            }}
          />
        ))}
      </span>
      {label && <span className={`font-medium ${s.text}`}>{label}</span>}
    </div>
  )
}
