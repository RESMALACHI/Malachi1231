import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Crown, MonitorPlay } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { MANAGER_AGENT, pinFor } from '../lib/agents'
import { LogoMark } from '../components/Logo'
import PatternBackground from '../components/PatternBackground'
import PinDialog from '../components/PinDialog'

// A distinct gradient per agent avatar (cycles if there are more agents).
const GRADIENTS = [
  'from-amber-400 to-yellow-600',
  'from-slate-600 to-slate-900',
  'from-indigo-400 to-indigo-600',
  'from-sky-400 to-sky-600',
  'from-rose-400 to-rose-600',
]

/** First letter of the first one/two name parts, e.g. "אור פלאח" → "אפ". */
function initials(name) {
  const parts = String(name).trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')) || '?'
}

export default function AgentSelectPage() {
  const { agents, confirmAgent, unlockAgent, isUnlocked } = useAuth()
  const [askPin, setAskPin] = useState(null) // the name being unlocked

  // A profile asks for a code only if the ניהול page gave it one, and only
  // until this device has answered it once. After that it opens straight away,
  // for good — including after switching to somebody else and back.
  const pick = (name) => {
    if (isUnlocked(name)) confirmAgent(name)
    else setAskPin(name)
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <PatternBackground />

      {/* Office wall-board — for the TV in the room, not for signing in. */}
      <Link
        to="/tv"
        className="glass absolute end-4 top-4 z-10 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
      >
        <MonitorPlay className="h-4 w-4 text-amber-600" aria-hidden="true" />
        מסך טלוויזיה
      </Link>

      {/* Header */}
      <div className="mb-9 flex flex-col items-center text-center animate-pop-in">
        <span className="animate-float">
          <LogoMark className="h-16 w-16" rounded="rounded-3xl" />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">
          ברוכים הבאים למכללת{' '}
          <span className="bg-gradient-to-l from-amber-600 via-amber-500 to-yellow-400 bg-clip-text text-transparent">
            R.E.S
          </span>
        </h1>
        <p className="mt-2 text-sm font-semibold tracking-[0.2em] text-amber-600/90">
          בחרו סוכן כדי להתחיל
        </p>
      </div>

      {/* Agent grid */}
      <div className="grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
        {agents.map((name, i) => {
          const isManager = name === MANAGER_AGENT
          const g = GRADIENTS[i % GRADIENTS.length]
          return (
            <button
              key={name}
              onClick={() => pick(name)}
              style={{ animationDelay: `${i * 70}ms` }}
              className={`group relative flex flex-col items-center gap-3 rounded-3xl p-6 text-center shadow-md transition-all duration-200 animate-fade-up hover:-translate-y-1.5 active:scale-95 ${
                isManager
                  ? 'border border-amber-300/70 bg-gradient-to-b from-white to-amber-50/60 shadow-amber-900/10 ring-1 ring-amber-200 hover:shadow-xl hover:shadow-amber-900/20'
                  : 'glass hover:shadow-xl hover:shadow-slate-900/10'
              }`}
            >
              {isManager && (
                <span className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-l from-amber-500 to-yellow-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                  <Crown className="h-3 w-3" aria-hidden="true" />
                  מנהל
                </span>
              )}
              <span
                className={`flex items-center justify-center rounded-full text-white shadow-lg transition-transform duration-300 group-hover:scale-110 ${
                  isManager
                    ? 'h-24 w-24 bg-gradient-to-br from-slate-800 to-black ring-4 ring-amber-300'
                    : `h-20 w-20 bg-gradient-to-br ${g} ring-4 ring-white/60`
                }`}
              >
                {isManager ? (
                  <Crown className="h-10 w-10 text-amber-300" aria-hidden="true" />
                ) : (
                  <span className="text-2xl font-extrabold">{initials(name)}</span>
                )}
              </span>
              <span
                className={`font-bold text-slate-900 ${isManager ? 'text-xl' : 'text-lg'}`}
              >
                {name}
              </span>
              {isManager ? (
                <span className="text-[11px] font-semibold tracking-wide text-amber-600">
                  מנהל החברה · תצוגת-על
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  כניסה
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-8 text-xs text-slate-400">
        ניתן להחליף סוכן בכל עת מהתפריט העליון
      </p>

      {askPin && (
        <PinDialog
          pin={pinFor(askPin)}
          title={askPin}
          onSuccess={() => {
            unlockAgent(askPin)
            confirmAgent(askPin)
            setAskPin(null)
          }}
          onCancel={() => setAskPin(null)}
        />
      )}
    </div>
  )
}
