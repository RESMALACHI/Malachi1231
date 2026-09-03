import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Radio,
  Sun,
  CalendarRange,
  Trophy,
} from 'lucide-react'
import { LogoMark } from '../components/Logo'
import BoardView from '../components/tv/BoardView'
import LeadersView from '../components/tv/LeadersView'
import Confetti from '../components/tv/Confetti'
import MilestoneBanner from '../components/tv/MilestoneBanner'
import { getTvBoards, getDailyPace, mergeFeed, leaderboardFrom, EMPTY_BOARD } from '../services/tvService'
import { milestoneCrossed } from '../components/tv/util'
import { initAudio, playChime } from '../lib/chime'

const POLL_MS = 20_000 // how often the board re-reads the database
const PACE_MS = 5 * 60_000 // the 14-day average barely moves — refresh it lazily
const ROTATE_MS = 26_000 // seconds each mode holds the screen
const CELEBRATE_MS = 7_000 // the "just happened" glow on the hero
const MILESTONE_MS = 6_500 // the full-screen milestone celebration

const MODES = [
  { key: 'today', label: 'היום', icon: Sun },
  { key: 'week', label: 'השבוע', icon: CalendarRange },
  { key: 'leaders', label: 'המובילים', icon: Trophy },
]

export default function TVPage() {
  const navigate = useNavigate()

  const [boards, setBoards] = useState({ today: EMPTY_BOARD, week: EMPTY_BOARD })
  const [pace, setPace] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ok | error

  const [soundOn, setSoundOn] = useState(false)
  const [fs, setFs] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const [modeIdx, setModeIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  const [celebrateAt, setCelebrateAt] = useState(0)
  const [flash, setFlash] = useState(() => new Set())
  const [milestone, setMilestone] = useState(null) // { n, at }

  const seenRef = useRef(null) // Set<string> of today's feed keys already shown
  const countRef = useRef(null) // last-seen today meeting count, for milestones
  const soundRef = useRef(false)
  soundRef.current = soundOn

  const mode = MODES[modeIdx].key
  const celebrating = Date.now() - celebrateAt < CELEBRATE_MS
  const showMilestone = milestone && Date.now() - milestone.at < MILESTONE_MS

  const leaders = useMemo(() => leaderboardFrom(boards.week), [boards.week])

  /* ── poll ── */
  const load = useCallback(async () => {
    try {
      const data = await getTvBoards()
      setBoards(data)
      setStatus('ok')

      // New wins today → celebrate (independent of which mode is on screen).
      const keys = mergeFeed(data.today).map((x) => x.key)
      if (seenRef.current == null) {
        seenRef.current = new Set(keys)
      } else {
        const fresh = keys.filter((k) => !seenRef.current.has(k))
        for (const k of keys) seenRef.current.add(k)
        if (fresh.length) {
          setFlash(new Set(fresh))
          setCelebrateAt(Date.now())
          const top = mergeFeed(data.today).find((x) => fresh.includes(x.key))
          if (soundRef.current) playChime(top?.kind === 'deal' ? 'deal' : 'meeting')
        }
      }

      // Milestone on today's meeting count.
      const n = data.today.counts.meetings
      if (countRef.current == null) {
        countRef.current = n
      } else if (n > countRef.current) {
        const hit = milestoneCrossed(countRef.current, n)
        countRef.current = n
        if (hit) {
          setMilestone({ n: hit, at: Date.now() })
          if (soundRef.current) playChime('deal')
        }
      } else {
        countRef.current = n
      }
    } catch {
      setStatus((s) => (s === 'ok' ? 'ok' : 'error'))
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const run = () => getDailyPace().then(setPace).catch(() => {})
    run()
    const id = setInterval(run, PACE_MS)
    return () => clearInterval(id)
  }, [])

  /* ── mode rotation — a fresh timer per mode, auto or manual ── */
  useEffect(() => {
    if (paused) return
    const id = setTimeout(() => setModeIdx((i) => (i + 1) % MODES.length), ROTATE_MS)
    return () => clearTimeout(id)
  }, [paused, modeIdx])

  /* ── the wall clock ── */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  /* ── clear the row-flash once the celebration is over ── */
  useEffect(() => {
    if (!flash.size) return
    const id = setTimeout(() => setFlash(new Set()), CELEBRATE_MS)
    return () => clearTimeout(id)
  }, [flash])

  /* ── keep the TV awake, follow the real fullscreen state ── */
  useEffect(() => {
    let lock = null
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request('screen')
      } catch {
        /* not supported / denied — the board still works */
      }
    }
    acquire()
    const onVis = () => document.visibilityState === 'visible' && acquire()
    const onFs = () => setFs(Boolean(document.fullscreenElement))
    document.addEventListener('visibilitychange', onVis)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      document.removeEventListener('fullscreenchange', onFs)
      lock?.release?.().catch(() => {})
    }
  }, [])

  const toggleSound = () => {
    if (!soundOn) {
      const ok = initAudio()
      setSoundOn(ok)
      if (ok) playChime('meeting')
    } else {
      setSoundOn(false)
    }
  }
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const clock = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(now)

  return (
    <div
      dir="rtl"
      className="tv-screen fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#0a1327] font-sans text-white"
    >
      {/* ── ambient background ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 700px at 78% -10%, rgba(251,191,36,0.14), transparent 60%),' +
            'radial-gradient(1000px 800px at 10% 110%, rgba(56,132,255,0.16), transparent 60%),' +
            'linear-gradient(160deg, #0b1630 0%, #0a1327 45%, #080f20 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute -inset-1/4 tv-aurora opacity-40"
        style={{
          background:
            'conic-gradient(from 120deg at 50% 50%, transparent, rgba(251,191,36,0.10), transparent 40%, rgba(56,189,248,0.10), transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="pointer-events-none absolute -right-40 top-1/4 h-[36rem] w-[36rem] rounded-full bg-amber-500/10 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -left-40 bottom-0 h-[34rem] w-[34rem] rounded-full bg-sky-500/10 blur-3xl animate-blob [animation-delay:6s]" />

      {/* brand hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] bg-gradient-to-l from-amber-600 via-yellow-300 to-amber-500" />

      {/* celebration flash + milestone */}
      {celebrating && (
        <div
          key={celebrateAt}
          className="tv-flash pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'radial-gradient(1100px 620px at 32% 44%, rgba(251,191,36,0.22), transparent 72%)',
          }}
        />
      )}
      {showMilestone && (
        <>
          <Confetti key={`c-${milestone.at}`} />
          <MilestoneBanner key={`b-${milestone.at}`} n={milestone.n} />
        </>
      )}

      {/* ── header ── */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 pt-3 sm:px-10 sm:pt-6">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <TVBtn onClick={() => navigate('/')} title="יציאה">
            <X className="h-5 w-5" aria-hidden="true" />
          </TVBtn>
          <TVBtn onClick={toggleFs} title={fs ? 'יציאה ממסך מלא' : 'מסך מלא'}>
            {fs ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
          </TVBtn>
          <TVBtn onClick={() => setPaused((p) => !p)} title={paused ? 'המשך סבב' : 'עצור סבב'} active={paused}>
            {paused ? <Play className="h-5 w-5" aria-hidden="true" /> : <Pause className="h-5 w-5" aria-hidden="true" />}
          </TVBtn>
          <button
            onClick={toggleSound}
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm font-bold transition active:scale-95 sm:rounded-2xl sm:px-4 sm:py-2.5 ${
              soundOn
                ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {soundOn ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}
            <span className="hidden sm:inline">{soundOn ? 'צלילים פעילים' : 'הפעל צלילים'}</span>
          </button>
        </div>

        <div className="flex min-w-0 flex-col items-center text-center">
          <span className="text-[10px] font-black tracking-[0.35em] text-amber-400 sm:text-xs sm:tracking-[0.5em]">
            RES LIVE
          </span>
          <h1 className="mt-0.5 truncate text-lg font-black tracking-tight sm:mt-1 sm:text-3xl xl:text-4xl">
            חוגגים הצלחות בזמן אמת
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-slate-300 xl:flex">
            <Radio className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            מעודכן מהיומן
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          </span>
          <LogoMark className="h-9 w-9 sm:h-11 sm:w-11" rounded="rounded-2xl" />
        </div>
      </header>

      {/* ── mode tabs + rotation timer ── */}
      <div className="relative z-20 mt-2 flex flex-col items-center gap-1.5 px-4 sm:mt-4 sm:gap-2 sm:px-10">
        <div className="flex gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1 sm:gap-2 sm:rounded-2xl sm:p-1.5">
          {MODES.map((m, i) => {
            const Icon = m.icon
            const on = i === modeIdx
            return (
              <button
                key={m.key}
                onClick={() => setModeIdx(i)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm ${
                  on
                    ? 'bg-gradient-to-l from-amber-500 to-yellow-400 text-slate-900 shadow-lg shadow-amber-500/25'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {m.label}
              </button>
            )
          })}
        </div>
        <div className="h-0.5 w-32 overflow-hidden rounded-full bg-white/10 sm:w-40">
          <div
            key={`${modeIdx}-${paused}`}
            className="tv-progress h-full rounded-full bg-amber-400/70"
            style={{ animationDuration: `${ROTATE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
          />
        </div>
      </div>

      {/* ── the rotating view ── */}
      <main className="relative z-20 flex min-h-0 flex-1 flex-col px-4 pb-2 pt-3 sm:px-10 sm:pb-3 sm:pt-5">
        <div key={mode} className="tv-rise flex min-h-0 flex-1 flex-col">
          {mode === 'today' && (
            <BoardView board={boards.today} scope="today" celebrating={celebrating} flash={flash} pace={pace} />
          )}
          {mode === 'week' && (
            <BoardView board={boards.week} scope="week" celebrating={celebrating} flash={flash} />
          )}
          {mode === 'leaders' && (
            <LeadersView rows={leaders} totals={boards.week.counts} />
          )}
        </div>
      </main>

      {/* ── footer ── */}
      <footer className="relative z-20 flex items-center justify-between px-4 pb-3 text-[11px] font-bold text-slate-400 sm:px-10 sm:pb-5 sm:text-xs">
        <span className="hidden sm:inline">כל הצלחה נספרת</span>
        <span className="w-24 sm:hidden" />
        <span className="text-2xl font-black tabular-nums tracking-widest text-white sm:text-4xl">
          {clock}
        </span>
        <span className="flex items-center gap-2">
          מתעדכן בזמן אמת
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      </footer>

      {status === 'error' && boards.today.counts.meetings === 0 && (
        <div className="absolute inset-x-0 bottom-16 z-30 text-center text-xs text-rose-300">
          לא הצלחנו לטעון נתונים — מנסה שוב…
        </div>
      )}
    </div>
  )
}

function TVBtn({ onClick, title, active, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl ${
        active
          ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
