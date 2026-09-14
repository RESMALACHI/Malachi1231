import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, PhoneOff, Keyboard, SendHorizontal, Loader2, RotateCw, AudioLines } from 'lucide-react'
import { measureLine, penaltyFor, clampTrust } from '../../lib/simMetrics'
import { canListen, createListener, speak, stopSpeaking } from '../../lib/simVoice'
import { simTurn } from '../../services/trainingService'
import { PersonaAvatar, AR_FONT, fmtClock } from './parts'

// A booking call that has not booked in 8 minutes has become a different call.
const MAX_SECONDS = 8 * 60
const MAX_REP_LINES = 30

const STATUS = {
  speaking: 'מדבר/ת…',
  yours: 'תורך',
  listening: 'מקשיב לך…',
  thinking: 'חושב/ת…',
  waiting: 'רגע…',
}

/**
 * The live call. Turn-based on purpose: tap, speak, tap — an open office is too
 * loud for a mic that decides on its own when you have finished, and a
 * half-heard sentence sent early would be graded as what you "said".
 */
export default function CallScreen({ persona, rep, voice, opening, onFinish, phone = false, compact = false }) {
  const ar = persona.lang === 'ar'
  const [transcript, setTranscript] = useState(() => [
    { role: 'prospect', text: persona.opening, trust: persona.startTrust },
  ])
  const [status, setStatus] = useState('speaking')
  const [interim, setInterim] = useState('')
  const [mode, setMode] = useState(() => (canListen() ? 'voice' : 'text'))
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState(null) // { text, retry? }
  const [elapsed, setElapsed] = useState(0)

  const listenerRef = useRef(null)
  // Read inside async flows that outlive a render: a line the prospect is
  // still saying can be cut off by the agent, and the old closure must not
  // then flip the call back to "your turn" over a live mic.
  const statusRef = useRef(status)
  statusRef.current = status
  const elapsedRef = useRef(0)
  const transcriptRef = useRef(transcript)
  transcriptRef.current = transcript
  const endedRef = useRef(false)
  const scrollRef = useRef(null)
  const retryTimer = useRef(null)

  const say = useCallback(
    (text) => speak(text, { voice, lang: persona.lang, rate: persona.voice?.rate, pitch: persona.voice?.pitch }),
    [voice, persona]
  )

  const finish = useCallback(
    (outcome) => {
      if (endedRef.current) return
      endedRef.current = true
      clearTimeout(retryTimer.current)
      listenerRef.current?.abort()
      stopSpeaking()
      onFinish({ transcript: transcriptRef.current, outcome, duration: elapsedRef.current })
    },
    [onFinish]
  )

  // The opening line was started inside the "start" tap (see TrainingPage) —
  // iOS only lets a page speak from a gesture. Here we only wait for it.
  useEffect(() => {
    let alive = true
    Promise.resolve(opening).finally(() => {
      if (alive && !endedRef.current && statusRef.current === 'speaking') setStatus('yours')
    })
    return () => {
      alive = false
    }
  }, [opening])

  useEffect(() => {
    const id = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (elapsed >= MAX_SECONDS) finish('ended')
  }, [elapsed, finish])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript, interim])

  useEffect(
    () => () => {
      clearTimeout(retryTimer.current)
      listenerRef.current?.abort()
      stopSpeaking()
    },
    []
  )

  /** Ask the prospect for their next line, given the transcript as it stands. */
  const askProspect = useCallback(
    async (lines) => {
      setStatus('thinking')
      setNotice(null)
      try {
        const r = await simTurn({ persona, rep, transcript: lines })
        if (endedRef.current) return
        const next = [...lines, { role: 'prospect', text: r.say, trust: r.trust, gain: r.gain }]
        setTranscript(next)
        transcriptRef.current = next
        setStatus('speaking')
        await say(r.say)
        if (endedRef.current) return
        if (r.state === 'booked' || r.state === 'hung_up') finish(r.state)
        else if (statusRef.current === 'speaking') setStatus('yours')
      } catch (e) {
        if (endedRef.current) return
        if (e.code === 'rate_limited') {
          // The free plan's per-minute ceiling. It clears in seconds, so wait
          // it out for the agent rather than making them press anything.
          const wait = Math.min(60, Number(e.retryAfter) || 15)
          setStatus('waiting')
          setNotice({ text: `הצוות ניצל את המכסה החינמית לדקה — ממשיכים בעוד ${wait} שניות` })
          retryTimer.current = setTimeout(() => askProspect(lines), wait * 1000)
        } else {
          setStatus('waiting')
          setNotice({ text: 'הלקוח לא ענה — בעיית תקשורת עם השרת', retry: () => askProspect(lines) })
        }
      }
    },
    [persona, rep, say, finish]
  )

  const sendLine = useCallback(
    (raw) => {
      const text = String(raw || '').trim()
      if (!text || endedRef.current) return
      const lines = transcriptRef.current
      const lastTrust = [...lines].reverse().find((l) => l.role === 'prospect')?.trust ?? persona.startTrust
      const measured = measureLine(text)
      const next = [
        ...lines,
        { role: 'rep', text, measured, trustNow: clampTrust(lastTrust + penaltyFor(measured)) },
      ]
      setTranscript(next)
      transcriptRef.current = next
      setDraft('')
      if (next.filter((l) => l.role === 'rep').length >= MAX_REP_LINES) {
        finish('ended')
        return
      }
      askProspect(next)
    },
    [askProspect, finish, persona.startTrust]
  )

  // ── The mic ────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (endedRef.current || status === 'thinking' || status === 'waiting' || status === 'listening') return
    // Talking over the prospect is allowed — it is a phone call — and cuts them off.
    stopSpeaking()
    const l = createListener({
      lang: persona.lang,
      onInterim: setInterim,
      onError: (err) => {
        setStatus('yours')
        setInterim('')
        setNotice({
          text:
            err === 'not-allowed' || err === 'service-not-allowed'
              ? 'אין הרשאה למיקרופון — אשרו אותה בדפדפן, או עברו להקלדה'
              : 'זיהוי הדיבור נכשל — נסו שוב או עברו להקלדה',
        })
      },
    })
    if (!l) return
    listenerRef.current = l
    setInterim('')
    setNotice(null)
    setStatus('listening')
    try {
      l.start()
    } catch {
      setStatus('yours')
    }
  }, [persona.lang, status])

  const stopListening = useCallback(async () => {
    const l = listenerRef.current
    if (!l || status !== 'listening') return
    listenerRef.current = null
    setStatus('thinking')
    const said = await l.stop()
    setInterim('')
    if (said) sendLine(said)
    else {
      setStatus('yours')
      setNotice({ text: 'לא נקלט דיבור — דברו קרוב יותר למיקרופון' })
    }
  }, [sendLine, status])

  const toggleMic = () => (status === 'listening' ? stopListening() : startListening())

  // Space held = talking, on a desktop with a headset — the fastest way to run a call.
  useEffect(() => {
    if (mode !== 'voice') return
    const typing = (e) => ['INPUT', 'TEXTAREA'].includes(e.target.tagName)
    const down = (e) => {
      if (e.code !== 'Space' || e.repeat || typing(e)) return
      e.preventDefault()
      startListening()
    }
    const up = (e) => {
      if (e.code !== 'Space' || typing(e)) return
      e.preventDefault()
      stopListening()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [mode, startListening, stopListening])

  // The prospect's latest line is shown large, as the thing to answer; the
  // transcript below is everything else, so nothing appears twice.
  const lastProspectIdx = transcript.map((l) => l.role).lastIndexOf('prospect')
  const lastProspect = transcript[lastProspectIdx]
  const history = transcript.filter((_, i) => i !== lastProspectIdx)
  const repLines = transcript.filter((l) => l.role === 'rep').length
  const busy = status === 'thinking' || status === 'waiting'
  const left = MAX_SECONDS - elapsed

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Call bar ── */}
      {/* Full screen on a phone, so the bar clears the notch / status bar. */}
      <div className="relative z-20 flex items-center gap-3 px-4 pb-2 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-6">
        <span className="flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-extrabold text-emerald-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden="true" />
          בשיחה
        </span>
        <span className="text-[11px] font-bold tabular-nums text-slate-100/60">{fmtClock(elapsed)}</span>
        {left <= 60 && (
          <span className="text-[11px] font-bold text-rose-300">נשארה דקה</span>
        )}
        <button
          onClick={() => finish(repLines ? 'ended' : 'abandoned')}
          className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-gradient-to-l from-rose-600 to-red-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg shadow-red-900/40 transition hover:brightness-110 active:scale-95"
        >
          <PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />
          ניתוק
        </button>
      </div>

      {/* ── The prospect ── */}
      <div
        className={`relative z-10 flex flex-col items-center px-4 text-center ${compact ? 'pb-2 pt-0' : 'pb-3 pt-1 sm:pt-2'}`}
      >
        {/* Compact (a short screen — usually the keyboard is up): face, name and
            state on one row, so the words being answered keep their room. */}
        <div className={compact ? 'flex items-center gap-2.5' : 'flex flex-col items-center'}>
          <PersonaAvatar persona={persona} size={compact ? 38 : phone ? 76 : 92} speaking={status === 'speaking'} />
          <div className={compact ? 'text-start' : ''}>
            <p
              className={`font-extrabold text-white ${compact ? 'text-sm' : 'mt-2.5 text-lg sm:mt-3'}`}
              style={ar ? { fontFamily: AR_FONT } : undefined}
            >
              {persona.name}
              <span className="ms-2 text-xs font-bold text-slate-100/45">
                {persona.age} · <span style={ar ? { fontFamily: AR_FONT } : undefined}>{persona.city}</span>
              </span>
            </p>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide ${compact ? '' : 'mt-1'} ${
                status === 'yours' ? 'text-amber-300' : status === 'listening' ? 'text-rose-300' : 'text-slate-100/50'
              }`}
            >
              {status === 'thinking' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              {status === 'speaking' && <AudioLines className="h-3 w-3" aria-hidden="true" />}
              {status === 'yours' ? 'תורך לדבר' : `${persona.name} ${STATUS[status] || ''}`}
            </span>
          </div>
        </div>

        {/* The line just said, large — the thing to answer. */}
        {lastProspect && (
          <p
            key={transcript.length}
            dir="rtl"
            className={`max-w-2xl animate-fade-up font-extrabold leading-relaxed text-white ${
              compact ? 'mt-2 text-base' : 'mt-3 text-lg sm:text-2xl'
            }`}
            style={ar ? { fontFamily: AR_FONT } : undefined}
          >
            ״{lastProspect.text}״
          </p>
        )}
      </div>

      {/* ── Transcript ── */}
      <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:px-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {history.length > 0 && (
            <p className="mb-1 text-center text-[10px] font-bold tracking-wide text-slate-100/30">התמליל</p>
          )}
          {history.map((l, i) =>
            l.role === 'rep' ? (
              <div key={i} className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-ss-md bg-gradient-to-l from-amber-400/90 to-yellow-300/90 px-3.5 py-2 text-[13.5px] font-semibold leading-relaxed text-slate-900 shadow">
                  {l.text}
                </p>
              </div>
            ) : (
              <div key={i} className="flex justify-end">
                <p
                  className="max-w-[85%] rounded-2xl rounded-se-md border border-white/10 bg-white/[0.07] px-3.5 py-2 text-[13.5px] font-semibold leading-relaxed text-slate-100/90"
                  style={ar ? { fontFamily: AR_FONT } : undefined}
                >
                  {l.text}
                </p>
              </div>
            )
          )}
          {status === 'listening' && (
            <div className="flex justify-start">
              <p className="max-w-[85%] rounded-2xl rounded-ss-md border border-dashed border-amber-300/50 px-3.5 py-2 text-[13.5px] font-semibold leading-relaxed text-amber-100/80">
                {interim || 'מקשיב…'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Dock ── */}
      <div className="relative z-20 border-t border-white/5 bg-black/30 px-4 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm">
        {notice && (
          <div className="mx-auto mb-2.5 flex max-w-xl items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-center text-[12px] font-bold text-amber-100">
            <span>{notice.text}</span>
            {notice.retry && (
              <button
                onClick={notice.retry}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-300 px-2 py-0.5 text-[11px] font-extrabold text-slate-900"
              >
                <RotateCw className="h-3 w-3" aria-hidden="true" />
                שוב
              </button>
            )}
          </div>
        )}

        {mode === 'voice' ? (
          <div className="flex items-center justify-center gap-5">
            <span className="w-10" />
            <button
              onClick={toggleMic}
              disabled={busy}
              aria-label={status === 'listening' ? 'סיימתי לדבר' : 'לחצו ודברו'}
              className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full shadow-2xl transition active:scale-95 disabled:opacity-40 ${
                status === 'listening'
                  ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-red-900/50'
                  : 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 shadow-amber-600/30 hover:brightness-105'
              }`}
            >
              {status === 'listening' && (
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-rose-500/50" aria-hidden="true" />
              )}
              {status === 'listening' ? (
                <Square className="relative h-7 w-7 fill-white text-white" aria-hidden="true" />
              ) : status === 'thinking' ? (
                <Loader2 className="h-8 w-8 animate-spin text-slate-900" aria-hidden="true" />
              ) : (
                <Mic className="h-8 w-8 text-slate-900" aria-hidden="true" />
              )}
            </button>
            <button
              onClick={() => setMode('text')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-slate-100/60 transition hover:border-amber-300/50 hover:text-white"
              aria-label="מעבר להקלדה"
              title="מעבר להקלדה"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!busy) sendLine(draft)
            }}
            className="mx-auto flex max-w-2xl items-center gap-2"
          >
            {canListen() && (
              <button
                type="button"
                onClick={() => setMode('voice')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-100/60 transition hover:border-amber-300/50 hover:text-white"
                aria-label="מעבר לדיבור"
                title="מעבר לדיבור"
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Explicit rather than relying on implicit form submission,
                // which some embedded browsers skip. Not mid-IME composition.
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (!busy) sendLine(draft)
                }
              }}
              placeholder={busy ? `${persona.name} ${STATUS[status]}` : 'מה אומרים ללקוח?'}
              autoFocus
              dir="rtl"
              // 16px on a phone: iOS zooms the whole page into any input smaller than that.
              className="h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-4 text-base font-semibold sm:text-sm text-white placeholder:text-slate-100/35 focus:border-amber-300/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-slate-900 shadow-lg transition active:scale-95 disabled:opacity-40"
              aria-label="שליחה"
            >
              {status === 'thinking' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4 -scale-x-100" />
              )}
            </button>
          </form>
        )}
        <p className="mt-2 text-center text-[10.5px] font-semibold text-slate-100/35">
          {mode === 'voice'
            ? status === 'listening'
              ? 'לחצו שוב כשסיימתם את המשפט'
              : phone
                ? 'לחצו ודברו'
                : 'לחצו ודברו · במחשב: החזיקו רווח'
            : 'Enter לשליחה'}
        </p>
      </div>
    </div>
  )
}
