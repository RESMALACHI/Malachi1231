import { Sparkles } from 'lucide-react'

/** The big "🎯 20 פגישות היום!" card that lands in the middle of the screen. */
export default function MilestoneBanner({ n }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center px-6">
      <div className="tv-milestone flex flex-col items-center rounded-[2.75rem] border-2 border-amber-300/60 bg-[#0a1327]/90 px-14 py-12 text-center shadow-[0_0_180px_-10px_rgba(251,191,36,0.75)] backdrop-blur-2xl sm:px-24 sm:py-16">
        <span className="flex items-center gap-3 text-base font-black tracking-[0.45em] text-amber-400">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
          יעד חדש
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-9xl font-black leading-none text-amber-300 sm:text-[11rem]">{n}</p>
        <p className="mt-4 text-4xl font-black sm:text-5xl">פגישות היום! 🎯</p>
        <p className="mt-3 text-lg font-bold text-slate-300">כל הכבוד לצוות — ממשיכים 🚀</p>
      </div>
    </div>
  )
}
