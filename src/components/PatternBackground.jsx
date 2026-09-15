// Calm, elegant app background:
//  • a soft light gradient base (slate → white → faint gold),
//  • a few large, soft gradient "glows" in the R.E.S gold/slate palette,
//  • a very faint dot grid for subtle texture.
// Everything is low-opacity and behind the content — interesting, never noisy.
//
// The glows are radial gradients and they stand still. They used to be
// blurred circles (a CSS `blur` filter half a screen wide) floating forever —
// the browser re-blurred them every frame, and the frosted headers above had to
// re-blur that again on every scroll. On the office's weaker machines it was
// the reason the whole app felt heavy. Same look, none of the cost.

const DOT = '#cbd5e1' // slate-300
const DOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="2" cy="2" r="1.1" fill="${DOT}"/></svg>`
const dotPattern = `url("data:image/svg+xml,${encodeURIComponent(DOT_SVG)}")`

const glow = (rgba) => ({ backgroundImage: `radial-gradient(circle at center, ${rgba} 0%, transparent 70%)` })

export default function PatternBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Soft gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-amber-50/50 dark:from-[#0a1322] dark:via-[#0c1626] dark:to-[#101b30]" />

      {/* Faint dot grid — gentle texture, not a busy doodle */}
      <div
        className="absolute inset-0 opacity-25 dark:opacity-[0.07]"
        style={{ backgroundImage: dotPattern, backgroundSize: '26px 26px' }}
      />

      {/* Large soft glows in the brand palette (gold + slate) */}
      <div className="absolute -right-40 -top-40 h-[36rem] w-[36rem] dark:opacity-40" style={glow('rgba(252, 211, 77, 0.22)')} />
      <div className="absolute -left-48 top-1/3 h-[42rem] w-[42rem] dark:opacity-30" style={glow('rgba(203, 213, 225, 0.35)')} />
      <div className="absolute -bottom-48 right-1/4 h-[38rem] w-[38rem] dark:opacity-30" style={glow('rgba(253, 230, 138, 0.28)')} />

      {/* Whisper-soft vignette to keep edges from feeling flat */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent dark:from-transparent" />
    </div>
  )
}
