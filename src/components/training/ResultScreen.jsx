import { useRef, useState } from 'react'
import {
  RotateCcw,
  Users,
  Check,
  Sparkles,
  Loader2,
  ChevronDown,
  EyeOff,
  Target,
  MessageSquareQuote,
} from 'lucide-react'
import { sessionMetrics, turningPoints } from '../../lib/simMetrics'
import { PersonaAvatar, ScoreRing, TrustChart, OutcomeBadge, AR_FONT, fmtClock } from './parts'

function Tile({ label, value, good, hint }) {
  const tone =
    good === true ? 'text-emerald-300' : good === false ? 'text-rose-300' : 'text-white'
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
      <p className={`text-2xl font-black tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-bold text-slate-100/60">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] font-semibold text-slate-100/35">{hint}</p>}
    </div>
  )
}

/**
 * After the call. Ordered by what an agent can act on: the number, WHERE it
 * turned, the lines to change with what to say instead, and one sentence to
 * practise. The full transcript is last and folded — it is evidence, not the
 * lesson.
 */
export default function ResultScreen({ persona, session, grading, onRegrade, onAgain, onLobby }) {
  const { transcript, outcome, duration } = session
  const fb = session.feedback || null
  const m = fb?.metrics || sessionMetrics(transcript)
  const tp = turningPoints(transcript)
  const [openTranscript, setOpenTranscript] = useState(false)
  const [flash, setFlash] = useState(null)
  const lineRefs = useRef({})
  const ar = persona.lang === 'ar'
  const arStyle = ar ? { fontFamily: AR_FONT } : undefined

  const jumpTo = (index) => {
    setOpenTranscript(true)
    setFlash(index)
    setTimeout(() => lineRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    setTimeout(() => setFlash(null), 2400)
  }

  return (
    // One scroll on a phone (the page's), an inner one on a desktop — see Lobby.
    <div className="sm:h-full sm:overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-4">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center gap-3">
          <PersonaAvatar persona={persona} size={44} />
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-white">
              השיחה עם <span style={arStyle}>{persona.name}</span>
            </p>
            <p className="text-[11px] font-bold text-slate-100/45">
              {fmtClock(duration || 0)} דקות · {m.turns} משפטים שלך
            </p>
          </div>
          <span className="ms-auto">
            <OutcomeBadge outcome={outcome} />
          </span>
        </div>

        {/* ── Score ── */}
        <div className="mt-5 flex flex-col items-center gap-5 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 sm:flex-row sm:items-center sm:p-6">
          {grading ? (
            <div className="flex h-[132px] w-[132px] shrink-0 flex-col items-center justify-center gap-2 rounded-full border border-white/10">
              <Loader2 className="h-7 w-7 animate-spin text-amber-300" aria-hidden="true" />
              <span className="text-[10.5px] font-bold text-slate-100/50">המאמן קורא…</span>
            </div>
          ) : (
            <ScoreRing score={session.score} />
          )}
          <div className="min-w-0 flex-1 text-center sm:text-start">
            {grading ? (
              <p className="text-base font-extrabold text-white/80">מנתח את השיחה מול התסריט של המכללה…</p>
            ) : fb?.verdict ? (
              <p className="text-base font-extrabold leading-relaxed text-white sm:text-lg">{fb.verdict}</p>
            ) : (
              <div>
                <p className="text-base font-extrabold text-white/80">הציון לא הגיע הפעם</p>
                <p className="mt-1 text-xs font-semibold text-slate-100/50">
                  המכסה החינמית של המאמן אולי התמלאה לרגע. המדדים למטה נמדדו בכל זאת.
                </p>
                {onRegrade && (
                  <button
                    onClick={onRegrade}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-300 px-3 py-1.5 text-xs font-extrabold text-slate-900"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    לקבל ציון
                  </button>
                )}
              </div>
            )}
            {fb?.verdict && !grading && (
              <p
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  fb.foundHidden ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/5 text-slate-100/60'
                }`}
              >
                {fb.foundHidden ? <Check className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {fb.foundHidden ? 'מצאת את הדאגה האמיתית' : 'הדאגה האמיתית נשארה מוסתרת'}
              </p>
            )}
          </div>
        </div>

        {/* ── What was really going on ── */}
        <div className="mt-3 rounded-2xl border border-violet-300/15 bg-violet-400/[0.07] px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-wide text-violet-200/80">
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            מה {persona.gender === 'f' ? 'היא' : 'הוא'} לא אמר{persona.gender === 'f' ? 'ה' : ''}
          </p>
          <p className="mt-1 text-[13.5px] font-semibold leading-relaxed text-violet-50/90">{persona.reveal}</p>
        </div>

        {/* ── Numbers the agent can check themselves ── */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="דיברת מתוך השיחה" value={`${m.repShare}%`} good={m.repShare <= 50} hint="היעד: פחות מחצי" />
          <Tile label="שאלות ששאלת" value={m.questions} good={m.questions >= 3} />
          <Tile label="הזמנות לפגישה" value={m.meetingAsks} good={m.meetingAsks >= 1} />
          <Tile label="שתי אפשרויות מועד" value={m.twoOptions ? '✓' : '✗'} good={m.twoOptions} />
        </div>

        {/* ── Trust ── */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-3 pb-2 pt-3">
          <p className="px-1 text-[10.5px] font-extrabold tracking-wide text-amber-300/80">
            האמון של {persona.name} לאורך השיחה
          </p>
          <TrustChart transcript={transcript} best={tp.best} worst={tp.worst} bookAt={persona.bookAt} onPick={jumpTo} />
        </div>

        {/* ── Fixes ── */}
        {fb?.fixes?.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-wide text-rose-200/80">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              מה לשנות
            </p>
            <div className="space-y-2.5">
              {fb.fixes.map((f, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                  <button
                    onClick={() => jumpTo(f.line)}
                    className="block w-full px-4 pt-3 text-start"
                    title="להראות בתמליל"
                  >
                    <p className="text-[10.5px] font-bold text-slate-100/40">אמרת:</p>
                    <p className="mt-0.5 text-[13.5px] font-semibold leading-relaxed text-slate-100/75 line-through decoration-rose-400/50 decoration-2">
                      {transcript[f.line]?.text}
                    </p>
                    {f.why && <p className="mt-1.5 text-[12px] font-semibold text-rose-200/80">{f.why}</p>}
                  </button>
                  <div className="mt-3 border-t border-amber-300/15 bg-gradient-to-l from-amber-400/15 to-transparent px-4 py-3">
                    <p className="text-[10.5px] font-extrabold text-amber-300">עדיף:</p>
                    <p className="mt-0.5 text-[14.5px] font-bold leading-relaxed text-white" style={arStyle}>
                      {f.better}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Strengths ── */}
        {fb?.strengths?.length > 0 && (
          <div className="mt-5 space-y-1.5">
            <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-wide text-emerald-200/80">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              מה עבד
            </p>
            {fb.strengths.map((s, i) => (
              <p key={i} className="flex items-start gap-2 text-[13.5px] font-semibold leading-relaxed text-slate-100/85">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
                {s}
              </p>
            ))}
          </div>
        )}

        {/* ── One thing to practise ── */}
        {fb?.practice && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-gradient-to-l from-amber-400 to-yellow-300 px-4 py-3.5 text-slate-900 shadow-lg shadow-amber-500/20">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[10.5px] font-black tracking-wide text-slate-900/60">לתרגל לפני השיחה הבאה</p>
              <p className="mt-0.5 text-[14.5px] font-extrabold leading-relaxed">{fb.practice}</p>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        {/* Full-width, thumb-sized buttons on a phone; a centred pair above it. */}
        <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap sm:justify-center">
          <button
            onClick={onAgain}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-amber-500 to-yellow-400 px-5 py-3 text-sm font-extrabold text-slate-900 shadow-lg shadow-amber-500/25 transition hover:brightness-105 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {/* One flex item — as two, the button's gap was added to the space. */}
            <span>
              שוב מול <span style={arStyle}>{persona.name}</span>
            </span>
          </button>
          <button
            onClick={onLobby}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-white/10 active:scale-95"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            לקוח אחר
          </button>
        </div>

        {/* ── Transcript ── */}
        <div className="mt-6 rounded-2xl border border-white/10">
          <button
            onClick={() => setOpenTranscript((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-3 text-start text-xs font-extrabold text-slate-100/70"
          >
            <MessageSquareQuote className="h-4 w-4" aria-hidden="true" />
            התמליל המלא
            <ChevronDown className={`ms-auto h-4 w-4 transition ${openTranscript ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {openTranscript && (
            <div className="space-y-2 border-t border-white/5 px-3 py-3">
              {transcript.map((l, i) => {
                const prev = transcript.slice(0, i).reverse().find((x) => x.role === 'prospect')
                const delta = l.role === 'prospect' && prev && typeof l.trust === 'number' ? l.trust - prev.trust : null
                return (
                  <div
                    key={i}
                    ref={(el) => (lineRefs.current[i] = el)}
                    className={`flex ${l.role === 'rep' ? 'justify-start' : 'justify-end'} rounded-xl transition ${
                      flash === i ? 'bg-amber-300/15 ring-1 ring-amber-300/40' : ''
                    }`}
                  >
                    <div className="max-w-[88%]">
                      <p
                        className={`rounded-2xl px-3 py-2 text-[13px] font-semibold leading-relaxed ${
                          l.role === 'rep'
                            ? 'rounded-ss-md bg-amber-300/90 text-slate-900'
                            : 'rounded-se-md border border-white/10 bg-white/[0.06] text-slate-100/90'
                        }`}
                        style={l.role === 'prospect' ? arStyle : undefined}
                      >
                        {l.text}
                      </p>
                      {l.role === 'rep' && l.measured && (l.measured.monologue || l.measured.pressure) && (
                        <p className="mt-0.5 flex gap-2 px-1 text-[10px] font-bold text-rose-300/80">
                          {l.measured.monologue && <span>נאום · {l.measured.words} מילים</span>}
                          {l.measured.pressure && <span>לחץ: ״{l.measured.pressure}״</span>}
                        </p>
                      )}
                      {delta !== null && delta !== 0 && (
                        <p className={`mt-0.5 px-1 text-end text-[10px] font-black ${delta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          אמון {delta > 0 ? `+${delta}` : delta} → {l.trust}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
