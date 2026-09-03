import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  CalendarPlus,
  Handshake,
  Wallet,
  Radio,
  Video,
  Users,
} from 'lucide-react'
import { LogoMark } from '../components/Logo'
import AnimatedNumber from '../components/AnimatedNumber'
import { getTvBoard, mergeFeed } from '../services/tvService'
import { clientName } from '../lib/meetingTitle'
import { initAudio, playChime } from '../lib/chime'

// How often the board re-reads the database. Short enough that a booking feels
// live on the wall, long enough that a dozen idle office tabs cost nothing.
const POLL_MS = 20_000
// How long the "just happened" glow stays on the hero after a new win lands.
const CELEBRATE_MS = 7_000

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** "הרגע" · "לפני 6 דק׳" · "לפני 3 שע׳" — how long ago, in the office's words. */
function relativeHe(iso) {
  if (!iso) return ''
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 45) return 'הרגע'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `לפני ${mins} דק׳`
  const hrs = Math.round(mins / 60)
  return `לפני ${hrs} שע׳`
}

/** "14:30" from an ISO datetime, Israel-local. */
function hhmm(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso)
    )
  } catch {
    return ''
  }
}

/** "₪12,400" */
const shekels = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('en-US')}`

// A bright, high-contrast hue per agent for the dark board. Stable per name.
const HUES = ['#fbbf24', '#38bdf8', '#f472b6', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#f87171']
function agentColor(name) {
  const s = String(name || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')) || '?'
}

/** The display name for a feed row / the hero. Meetings carry a messy title. */
function displayName(item) {
  if (item.kind === 'deal') return String(item.who || '').trim() || 'לקוח'
  const cleaned = clientName(item.who, item.agent)
  return cleaned && cleaned !== '(ללא פרטים)' ? cleaned : String(item.who || 'פגישה חדשה')
}

/* ── screen ──────────────────────────────────────────────────────────────── */

export default function TVPage() {
  const navigate = useNavigate()

  const [board, setBoard] = useState({ booked: [], deals: [], counts: { meetings: 0, deals: 0, revenue: 0 } })
  const [status, setStatus] = useState('loading') // loading | ok | error
  const [soundOn, setSoundOn] = useState(false)
  const [fs, setFs] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [celebrateAt, setCelebrateAt] = useState(0)
  const [flash, setFlash] = useState(() => new Set())

  const seenRef = useRef(null) // Set<string> of feed keys already shown
  const soundRef = useRef(false)
  soundRef.current = soundOn

  const feed = useMemo(() => mergeFeed(board), [board])
  const hero = feed[0] || null
  const celebrating = Date.now() - celebrateAt < CELEBRATE_MS

  /* poll the board, and notice anything new since last time */
  const load = useCallback(async () => {
    try {
      const data = await getTvBoard()
      setBoard(data)
      setStatus('ok')

      const keys = mergeFeed(data).map((x) => x.key)
      if (seenRef.current == null) {
        // First load: seed silently — the whole day's history isn't "news".
        seenRef.current = new Set(keys)
        return
      }
      const fresh = keys.filter((k) => !seenRef.current.has(k))
      for (const k of keys) seenRef.current.add(k)
      if (fresh.length) {
        setFlash(new Set(fresh))
        setCelebrateAt(Date.now())
        const top = mergeFeed(data).find((x) => fresh.includes(x.key))
        if (soundRef.current) playChime(top?.kind === 'deal' ? 'deal' : 'meeting')
      }
    } catch {
      setStatus((s) => (s === 'ok' ? 'ok' : 'error')) // keep showing stale data if we had some
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  /* the wall clock */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  /* clear the row-flash once the celebration is over */
  useEffect(() => {
    if (!flash.size) return
    const id = setTimeout(() => setFlash(new Set()), CELEBRATE_MS)
    return () => clearTimeout(id)
  }, [flash])

  /* keep the TV awake, and follow the real fullscreen state */
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

  const todayLabel = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
  const clock = new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)

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
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="pointer-events-none absolute -right-40 top-1/4 h-[36rem] w-[36rem] rounded-full bg-amber-500/10 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -left-40 bottom-0 h-[34rem] w-[34rem] rounded-full bg-sky-500/10 blur-3xl animate-blob [animation-delay:6s]" />

      {/* signature brand hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] bg-gradient-to-l from-amber-600 via-yellow-300 to-amber-500" />

      {/* celebration flash — a quick gold wash, gone in under two seconds */}
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

      {/* ── header ── */}
      <header className="relative z-20 flex items-center justify-between gap-4 px-6 pt-6 sm:px-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            title="יציאה"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={toggleFs}
            title={fs ? 'יציאה ממסך מלא' : 'מסך מלא'}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white active:scale-95"
          >
            {fs ? <Minimize2 className="h-5 w-5" aria-hidden="true" /> : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            onClick={toggleSound}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition active:scale-95 ${
              soundOn
                ? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {soundOn ? <Volume2 className="h-5 w-5" aria-hidden="true" /> : <VolumeX className="h-5 w-5" aria-hidden="true" />}
            {soundOn ? 'צלילים פעילים' : 'הפעל צלילים'}
          </button>
        </div>

        <div className="flex flex-col items-center text-center">
          <span className="text-xs font-black tracking-[0.5em] text-amber-400">RES LIVE</span>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl xl:text-4xl">
            חוגגים הצלחות בזמן אמת
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-slate-300 sm:flex">
            <Radio className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            מעודכן מהיומן
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          </span>
          <LogoMark className="h-11 w-11" rounded="rounded-2xl" />
        </div>
      </header>

      {/* ── body ── */}
      <main className="relative z-20 grid min-h-0 flex-1 grid-cols-1 gap-5 px-6 pb-3 pt-6 sm:px-10 lg:grid-cols-[minmax(340px,1fr)_1.5fr]">
        {/* feed */}
        <section className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-black">רצף העדכונים</h2>
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-400">
              {todayLabel}
            </span>
          </div>
          <div className="mt-4 flex-1 space-y-2.5 overflow-hidden">
            {feed.length === 0 ? (
              <p className="pt-10 text-center text-sm text-slate-400">
                עוד לא נקבעו פגישות היום — הבוקר רק מתחיל ☕
              </p>
            ) : (
              feed.slice(0, 7).map((item, i) => {
                const c = agentColor(item.agent)
                const isNew = flash.has(item.key)
                return (
                  <div
                    key={item.key}
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    className={`flex animate-fade-up items-center gap-3 rounded-2xl border p-3 transition ${
                      isNew
                        ? 'border-amber-300/40 bg-amber-400/10'
                        : 'border-white/5 bg-white/[0.03]'
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-[#0a1327]"
                      style={{ background: c }}
                    >
                      {initials(item.agent)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-300">
                        {item.kind === 'deal' ? 'עסקה נסגרה 🎉' : 'נקבעה פגישה חדשה'}
                      </p>
                      <p className="truncate text-base font-black">{displayName(item)}</p>
                      <p className="truncate text-xs text-slate-400">
                        {item.agent || '—'}
                        {item.kind === 'meeting' && item.when ? ` · ${hhmm(item.when)}` : ''}
                        {item.kind === 'deal' && item.amount ? ` · ${shekels(item.amount)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                      {relativeHe(item.at)}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* hero + stats */}
        <section className="flex min-h-0 flex-col gap-5">
          <div
            key={hero ? hero.key + (celebrating ? '-c' : '') : 'empty'}
            className={`relative flex flex-1 flex-col justify-center overflow-hidden rounded-[2rem] border p-8 backdrop-blur-xl transition-all duration-500 sm:p-12 ${
              celebrating
                ? 'animate-pop border-amber-300/60 bg-amber-400/[0.08] shadow-[0_0_120px_-20px_rgba(251,191,36,0.55)]'
                : 'border-white/10 bg-white/[0.04]'
            }`}
          >
            {celebrating && (
              <span
                key={celebrateAt}
                className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300/50 tv-ring"
              />
            )}

            {hero ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-black tracking-wide text-amber-200">
                    {celebrating ? 'הרגע נכנס!' : 'העדכון האחרון'}
                  </span>
                  {hero.kind === 'meeting' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                      {hero.type === 'zoom' ? (
                        <Video className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Users className="h-4 w-4" aria-hidden="true" />
                      )}
                      {hero.type === 'zoom' ? 'זום' : 'פרונטלי'}
                    </span>
                  )}
                </div>

                <p className="mt-6 text-lg font-bold text-slate-300 sm:text-2xl">
                  {hero.kind === 'deal' ? 'עסקה נסגרה 🎉' : 'נקבעה פגישה חדשה'}
                </p>
                <p className="mt-1 text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl xl:text-7xl 2xl:text-8xl">
                  {displayName(hero)}
                </p>
                <p className="mt-4 text-xl font-bold text-slate-300 sm:text-2xl">
                  {hero.agent || '—'}
                  {hero.kind === 'meeting' && hero.when && (
                    <span className="text-amber-300"> · {hhmm(hero.when)}</span>
                  )}
                  {hero.kind === 'deal' && hero.amount > 0 && (
                    <span className="text-emerald-300"> · {shekels(hero.amount)}</span>
                  )}
                </p>

                <div className="pointer-events-none absolute -left-6 -top-6 opacity-10 sm:opacity-20">
                  <CalendarPlus className="h-40 w-40" aria-hidden="true" strokeWidth={1.25} />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center text-center">
                <span className="animate-float">
                  <LogoMark className="h-20 w-20" rounded="rounded-3xl" />
                </span>
                <p className="mt-6 text-2xl font-black">מוכנים ליום חדש</p>
                <p className="mt-2 text-sm text-slate-400">
                  כל פגישה שתיקבע היום תופיע כאן ברגע שהיא נכנסת
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatTile
              icon={CalendarPlus}
              label="פגישות היום"
              value={<AnimatedNumber value={board.counts.meetings} />}
              accent="#fbbf24"
            />
            <StatTile
              icon={Handshake}
              label="עסקאות היום"
              value={<AnimatedNumber value={board.counts.deals} />}
              accent="#34d399"
            />
            <StatTile
              icon={Wallet}
              label="מחזור היום"
              value={
                <AnimatedNumber
                  value={board.counts.revenue}
                  format={(n) => `₪${n.toLocaleString('en-US')}`}
                />
              }
              valueClass="text-3xl sm:text-4xl"
              accent="#38bdf8"
            />
          </div>
        </section>
      </main>

      {/* ── footer ── */}
      <footer className="relative z-20 flex items-center justify-between px-6 pb-6 text-xs font-bold text-slate-400 sm:px-10">
        <span>כל הצלחה נספרת</span>
        <span className="text-3xl font-black tabular-nums tracking-widest text-white sm:text-4xl">
          {clock}
        </span>
        <span className="flex items-center gap-2">
          מתעדכן בזמן אמת
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      </footer>

      {status === 'error' && feed.length === 0 && (
        <div className="absolute inset-x-0 bottom-16 z-30 text-center text-xs text-rose-300">
          לא הצלחנו לטעון נתונים — מנסה שוב…
        </div>
      )}
    </div>
  )
}

function StatTile({ icon: Icon, label, value, accent, valueClass = 'text-4xl sm:text-5xl' }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <span
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl"
        style={{ background: accent, opacity: 0.18 }}
      />
      <span className="flex items-center gap-2 text-xs font-bold text-slate-400">
        <Icon className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
        {label}
      </span>
      <p className={`mt-2 font-black tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}
