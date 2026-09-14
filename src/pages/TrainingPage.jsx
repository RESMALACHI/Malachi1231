import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { callingName, genderOf, isAdminAgent, isManagerAgent } from '../lib/agents'
import { DEFAULT_SPEECH, LANGS, applyVars, parseSpeech } from '../lib/speechScript'
import { sessionMetrics } from '../lib/simMetrics'
import { personaById } from '../lib/simPersonas'
import { canListen, isNatural, loadVoices, pickVoice, speak, stopSpeaking } from '../lib/simVoice'
import { useMediaQuery, useVisualViewport } from '../lib/useViewport'
import { getSpeech } from '../services/settingsService'
import { listSessions, saveSession, simGrade, updateSession } from '../services/trainingService'
import Lobby from '../components/training/Lobby'
import CallScreen from '../components/training/CallScreen'
import ResultScreen from '../components/training/ResultScreen'

/**
 * זירת אימון — practice booking calls against a virtual prospect.
 *
 * Completely free to run: the browser does the listening and the speaking, and
 * the prospect and the coach are the Groq free plan (see training-sim). Nothing
 * here touches a real lead; the only words stored are the agent's own and the
 * persona's.
 *
 * Same dark stage as ספיץ on purpose — it is the script's sparring partner, and
 * should feel like the same room.
 */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")"

export default function TrainingPage() {
  const { selectedAgent } = useAuth()
  const isManager = isManagerAgent(selectedAgent) || isAdminAgent(selectedAgent)

  const [phase, setPhase] = useState('lobby') // lobby | call | result
  const [persona, setPersona] = useState(null)
  const [opening, setOpening] = useState(null)
  const [callKey, setCallKey] = useState(0)
  const [session, setSession] = useState(null)
  const [grading, setGrading] = useState(false)
  const [sessions, setSessions] = useState([])
  const [team, setTeam] = useState(null)
  const [voices, setVoices] = useState([])
  const [scripts, setScripts] = useState(DEFAULT_SPEECH)
  // A grade can land after the agent has already started the next call; it
  // must not overwrite that one.
  const gradeToken = useRef(0)

  const refresh = useCallback(() => {
    listSessions(selectedAgent).then(setSessions).catch(() => {})
    if (isManager) listSessions(null, { days: 30, limit: 500 }).then(setTeam).catch(() => {})
  }, [selectedAgent, isManager])

  useEffect(() => {
    loadVoices().then(setVoices)
    getSpeech()
      .then((saved) => setScripts((cur) => ({ ...cur, ...saved })))
      .catch(() => {})
    refresh()
    return () => stopSpeaking()
  }, [refresh])

  const voiceInfo = useMemo(() => {
    const m = pickVoice(voices, 'he', 'm')
    const f = pickVoice(voices, 'he', 'f')
    return { listen: canListen(), natural: isNatural(m) || isNatural(f), anyVoice: !!(m || f) }
  }, [voices])

  const voiceFor = useCallback((p) => pickVoice(voices, p.lang, p.gender), [voices])

  const repFor = (p) => ({ name: callingName(selectedAgent, p.lang), gender: genderOf(selectedAgent) })

  /** The team's own objection answers — the coach grades against the script. */
  const objectionsFor = useCallback(
    (p) => {
      const meta = LANGS.find((l) => l.key === p.lang) || LANGS[0]
      const steps = parseSpeech(
        applyVars(scripts[p.lang] || DEFAULT_SPEECH[p.lang], {
          agentName: callingName(selectedAgent, p.lang),
          agentGender: genderOf(selectedAgent),
          leadName: '',
          leadGender: p.gender,
          leadFallback: meta.leadFallback,
        })
      )
      return steps.flatMap((s) => s.objections).filter((o) => o.a)
    },
    [scripts, selectedAgent]
  )

  // Called straight from the tap: iOS only lets a page start speaking inside a
  // user gesture, so the prospect's "הלו?" must begin here, not in an effect.
  const startCall = (p) => {
    stopSpeaking()
    gradeToken.current += 1
    const prom = speak(p.opening, { voice: voiceFor(p), lang: p.lang, rate: p.voice?.rate, pitch: p.voice?.pitch })
    setPersona(p)
    setOpening(prom)
    setSession(null)
    setGrading(false)
    setCallKey((k) => k + 1)
    setPhase('call')
  }

  const grade = useCallback(
    async (s, p, id) => {
      const token = gradeToken.current
      setGrading(true)
      try {
        const g = await simGrade({
          persona: p,
          rep: repFor(p),
          transcript: s.transcript,
          outcome: s.outcome,
          metrics: s.feedback.metrics,
          objections: objectionsFor(p),
        })
        const feedback = {
          metrics: s.feedback.metrics,
          verdict: g.verdict,
          strengths: g.strengths,
          fixes: g.fixes,
          practice: g.practice,
          foundHidden: g.foundHidden,
        }
        // Saved even if the agent has moved on — the grade belongs to that call.
        if (id) await updateSession(id, { score: g.score, feedback }).catch(() => {})
        refresh()
        if (token === gradeToken.current) setSession((cur) => ({ ...(cur || s), id, score: g.score, feedback }))
      } catch {
        /* the result screen offers "לקבל ציון" */
      } finally {
        if (token === gradeToken.current) setGrading(false)
      }
    },
    [objectionsFor, refresh, selectedAgent]
  )

  const onFinish = useCallback(
    async ({ transcript, outcome, duration }) => {
      if (outcome === 'abandoned') {
        setPhase('lobby')
        return
      }
      const p = persona
      const metrics = sessionMetrics(transcript)
      const s = { transcript, outcome, duration, score: null, feedback: { metrics } }
      setSession(s)
      setPhase('result')

      // Kept before it is graded: a call whose grade fails still happened.
      let id = null
      try {
        const row = await saveSession({
          agent_name: selectedAgent,
          persona: p.id,
          lang: p.lang,
          outcome,
          transcript: transcript.map(({ role, text, trust, gain, measured }) => ({ role, text, trust, gain, measured })),
          feedback: { metrics },
          duration_s: duration,
        })
        id = row.id
        setSession((cur) => (cur ? { ...cur, id } : cur))
      } catch {
        /* graded anyway; just not in the history */
      }
      grade(s, p, id)
    },
    [persona, selectedAgent, grade]
  )

  const openSaved = (row) => {
    const p = personaById(row.persona)
    if (!p) return
    gradeToken.current += 1
    setPersona(p)
    setSession({
      id: row.id,
      transcript: row.transcript || [],
      outcome: row.outcome,
      duration: row.duration_s,
      score: row.score,
      feedback: row.feedback || { metrics: sessionMetrics(row.transcript || []) },
    })
    setGrading(false)
    setPhase('result')
  }

  const hue = phase === 'lobby' || !persona ? 40 : persona.hue

  // On a phone the call takes the whole screen, like a real call does. Inside
  // the app's frame it lost ~4rem to the header and search row and scrolled
  // twice — page and stage — with the mic button parked below the fold. The
  // lobby and results, which are reading, flow with the page instead of
  // scrolling inside a box.
  const phone = useMediaQuery('(max-width: 639px)')
  const vp = useVisualViewport()
  const fullscreen = phone && phase === 'call'

  useEffect(() => {
    if (!fullscreen) return
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = prev
    }
  }, [fullscreen])

  return (
    <div className="mx-auto max-w-5xl">
      <div
        className={
          fullscreen
            ? 'fixed inset-x-0 z-[70] flex flex-col overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-black'
            : 'relative flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl sm:h-[calc(100dvh-7rem)] sm:min-h-[34rem]'
        }
        // Follows the keyboard: typing mode must keep the input above the keys.
        style={fullscreen ? { top: vp.top, height: vp.height || '100dvh' } : undefined}
      >
        <div
          className="absolute inset-x-0 top-0 z-30 h-[3px] bg-gradient-to-l from-amber-600 via-yellow-300 to-amber-500"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 transition-[background] duration-700 motion-reduce:transition-none"
          style={{ background: `radial-gradient(70% 45% at 50% ${phase === 'call' ? '22%' : '0%'}, hsl(${hue} 92% 58% / 0.14), transparent 72%)` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
          aria-hidden="true"
        />

        <div className="relative z-10 min-h-0 flex-1">
          {phase === 'lobby' && (
            <Lobby
              agentName={selectedAgent}
              sessions={sessions}
              team={team}
              voiceInfo={voiceInfo}
              onStart={startCall}
              onOpen={openSaved}
            />
          )}
          {phase === 'call' && persona && (
            <CallScreen
              key={callKey}
              // Short screen = keyboard open (or a small phone): the prospect
              // shrinks into the top bar so the conversation keeps its room.
              compact={phone && vp.height < 600}
              phone={phone}
              persona={persona}
              rep={repFor(persona)}
              voice={voiceFor(persona)}
              opening={opening}
              onFinish={onFinish}
            />
          )}
          {phase === 'result' && persona && session && (
            <ResultScreen
              persona={persona}
              session={session}
              grading={grading}
              onRegrade={session.transcript?.some((l) => l.role === 'rep') ? () => grade(session, persona, session.id) : null}
              onAgain={() => startCall(persona)}
              onLobby={() => {
                gradeToken.current += 1
                setPhase('lobby')
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
