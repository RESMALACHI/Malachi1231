import { Sparkles } from 'lucide-react'

/** The big "🎯 20 פגישות היום!" card that lands in the middle of the screen. */
export default function MilestoneBanner({ n }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center px-6">
      <div className="tv-milestone flex flex-col items-center rounded-[2rem] border-2 border-amber-300/60 bg-[#0a1327]/90 px-12 py-9 text-center shadow-[0_0_180px_-10px_rgba(251,191,36,0.75)] backdrop-blur-2xl sm:rounded-[2.75rem] sm:px-24 sm:py-14">
        <span className="flex items-center gap-2 text-sm font-black tracking-[0.4em] text-amber-400 sm:gap-3 sm:text-base sm:tracking-[0.45em]">
          <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          יעד חדש
          <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
        </span>
        <p className="mt-3 text-8xl font-black leading-none text-amber-300 sm:mt-4 sm:text-9xl">{n}</p>
        <p className="mt-3 text-3xl font-black sm:mt-4 sm:text-5xl">פגישות היום! 🎯</p>
        <p className="mt-2 text-base font-bold text-slate-300 sm:mt-3 sm:text-lg">כל הכבוד לצוות — ממשיכים 🚀</p>
      </div>
    </div>
  )
}
