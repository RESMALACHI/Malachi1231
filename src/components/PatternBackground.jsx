// Calm, elegant app background:
//  • a soft light gradient base (slate → white → faint gold),
//  • a few large, blurred gradient "glows" in the R.E.S gold/slate palette,
//  • a very faint dot grid for subtle texture.
// Everything is low-opacity and behind the content — interesting, never noisy.

const DOT = '#cbd5e1' // slate-300
const DOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="2" cy="2" r="1.1" fill="${DOT}"/></svg>`
const dotPattern = `url("data:image/svg+xml,${encodeURIComponent(DOT_SVG)}")`

export default function PatternBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* Soft gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-amber-50/50 dark:from-[#0a1322] dark:via-[#0c1626] dark:to-[#101b30]" />

      {/* Faint dot grid — gentle texture, not a busy doodle */}
      <div
        className="absolute inset-0 opacity-25 dark:opacity-[0.07]"
        style={{ backgroundImage: dotPattern, backgroundSize: '26px 26px' }}
      />

      {/* Large blurred glows in the brand palette (gold + slate) */}
      <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-amber-300/20 blur-3xl animate-float dark:bg-amber-500/10" />
      <div
        className="absolute -left-40 top-1/3 h-[34rem] w-[34rem] rounded-full bg-slate-300/25 blur-3xl animate-float dark:bg-indigo-900/25"
        style={{ animationDelay: '1.5s' }}
      />
      <div
        className="absolute -bottom-40 right-1/4 h-[30rem] w-[30rem] rounded-full bg-amber-200/25 blur-3xl animate-float"
        style={{ animationDelay: '3s' }}
      />

      {/* Whisper-soft vignette to keep edges from feeling flat */}
      <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-transparent" />
    </div>
  )
}
