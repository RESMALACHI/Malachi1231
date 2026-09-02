import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronUp,
  ChevronDown,
  Megaphone,
  Mic,
  Pencil,
  RotateCcw,
  X,
  Flag,
  Lightbulb,
  User,
  Target,
  BookOpenCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isManagerAgent, isAdminAgent, callingName, genderOf } from '../lib/agents'
import { DEFAULT_SPEECH, LANGS, applyVars, parseSpeech } from '../lib/speechScript'
import { getSpeech, saveSpeech } from '../services/settingsService'

/**
 * ספיץ — the phone script as a stage.
 *
 * The one dark page in a white app, on purpose: this is a performance space,
 * not a form. The script is a vertical wheel — the line being said now sits in
 * a lit card at the centre, its neighbours receding above and below — and the
 * agent rolls through it with the wheel (or arrows, or a swipe) as the call
 * moves. Everything on screen is one of three things, and each looks different
 * on purpose:
 *
 *   the CARD   — words that come out of your mouth
 *   amber tip  — coaching, never spoken
 *   the dock   — objections, and what to answer
 *
 * The script is also personal: it speaks in the logged-in agent's name and
 * gender, and once the lead's name is typed in, it says that too — so עדי reads
 * "היי דני, מדברת עדי" and ודיע reads "היי דני, מדבר ודיע" off the same script.
 *
 * The wheel only ever moves ONE step per gesture. A call is sequential — a
 * script that scrolled like a web page would skip half the pitch on one flick.
 */

// How far a wheel gesture must travel to count as one click of the roller, and
// how long to ignore further deltas afterwards — trackpads emit streams of tiny
// deltas, and without the cooldown one swipe would fly through three steps.
const WHEEL_THRESHOLD = 60
const WHEEL_COOLDOWN_MS = 340
const SWIPE_THRESHOLD_PX = 42
const LANG_KEY = 'mt_speech_lang'

// Cairo carries Arabic; Heebo has no Arabic glyphs and the browser would fall
// back to something unstyled mid-page.
const AR_FONT = "'Cairo', 'Heebo', system-ui, sans-serif"

// A whisper of film grain over the stage. Without it the large flat gradient
// bands on a dark background; with it the whole thing reads as a surface.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")"

const T = {
  he: {
    title: 'ספיץ',
    say: 'אומרים',
    speaking: 'מדבר/ת',
    lead: 'שם הליד',
    male: 'לקוח',
    female: 'לקוחה',
    step: (a, b) => `שלב ${a}/${b}`,
    end: 'סיום',
    endLine: 'סיום השיחה',
    objections: 'התנגדויות צפויות',
    quote: (s) => `״${s}״`,
    answer: 'המענה שלך:',
    noAnswer: '— אין מענה כתוב להתנגדות הזו עדיין —',
    none: 'אין התנגדויות צפויות בשלב הזה — ממשיכים בביטחון',
    roll: 'גללו לשלב הבא',
    prev: 'שלב קודם',
    next: 'שלב הבא',
    clock: 'זמן מתחילת השיחה',
    doneTitle: 'עברת את כל השלבים',
    doneMeta: (n, t) => `${n} שלבים · ${t} דקות`,
    doneNote: 'עכשיו הרגע החשוב באמת: ‎.פגישה בקבוצה + תיעוד בבמבי — לפני השיחה הבאה.',
    restart: 'מתחילים שיחה חדשה',
    edit: 'עריכת הספיץ',
    editHint: '# שלב · > מטרה · שורה = משפט · - התנגדות | מענה · * טיפ',
    editVars: '{סוכן} {מדבר|מדברת} = אני · [לקוח] [אתה|את] = הליד',
    save: 'שמירה לכל הצוות',
    saving: 'שומר…',
    reset: 'שחזור ברירת מחדל',
    steps: (n) => `${n} שלבים`,
    errEmpty: 'הטקסט לא מכיל אף שלב. כל שלב מתחיל בשורה עם #',
    errSave: 'השמירה נכשלה — בדקו חיבור ונסו שוב',
  },
  ar: {
    title: 'السبيتش',
    say: 'بتقول',
    speaking: 'المتحدّث',
    lead: 'اسم الزبون',
    male: 'زبون',
    female: 'زبونة',
    step: (a, b) => `مرحلة ${a}/${b}`,
    end: 'النهاية',
    endLine: 'نهاية المكالمة',
    objections: 'اعتراضات متوقّعة',
    // Arabic quotation marks — the Hebrew gershayim used on the other side of
    // this file look like a typo inside an Arabic sentence.
    quote: (s) => `«${s}»`,
    answer: 'ردّك:',
    noAnswer: '— لسّا ما في ردّ مكتوب لهاد الاعتراض —',
    none: 'ما في اعتراضات متوقّعة بهاي المرحلة — كمّل بثقة',
    roll: 'دحرج للمرحلة الجاية',
    prev: 'المرحلة السابقة',
    next: 'المرحلة الجاية',
    clock: 'الوقت من بداية المكالمة',
    doneTitle: 'خلّصت كل المراحل',
    doneMeta: (n, t) => `${n} مراحل · ${t} دقيقة`,
    doneNote: 'هلق أهم إشي: ‎.פגישה بالمجموعة + توثيق ببمبي — قبل المكالمة الجاية.',
    restart: 'مكالمة جديدة',
    edit: 'تعديل السبيتش',
    editHint: '# مرحلة · > الهدف · سطر = جملة · - اعتراض | ردّ · * نصيحة',
    editVars: '{الوكيل} = أنا · [الزبون] [إنت|إنتي] = الزبون',
    save: 'حفظ للفريق كله',
    saving: 'عم يحفظ…',
    reset: 'استرجاع الأصلي',
    steps: (n) => `${n} مراحل`,
    errEmpty: 'النص ما فيه ولا مرحلة. كل مرحلة بتبلّش بسطر فيه #',
    errSave: 'الحفظ فشل — افحص الاتصال وجرّب كمان مرة',
  },
}

const fmtClock = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

/**
 * Whatever survives token substitution in [brackets] is a blank the agent fills
 * in live — the day, the hour, the branch, the words the lead just used. Marked
 * so the eye catches them mid-sentence instead of reading "[X]" aloud.
 */
function withBlanks(text) {
  return String(text)
    .split(/(\[[^\]\n]+\])/g)
    .map((part, i) =>
      /^\[.+\]$/.test(part) ? (
        <span
          key={i}
          className="mx-0.5 rounded-md bg-amber-300/15 px-1.5 py-0.5 text-amber-200 ring-1 ring-inset ring-amber-300/25"
        >
          {part.slice(1, -1)}
        </span>
      ) : (
        part
      )
    )
}

/**
 * One sentence on the roller.
 *
 * Items sit in NORMAL FLOW inside a stack that gets shifted so the active one
 * lands at the stage's centre. An earlier version placed each item at a fixed
 * offset and scaled it with a transform — which assumed every sentence was one
 * line tall. Real sentences wrap to three, so neighbours ran straight through
 * the active text and the stage looked like a pile.
 *
 * Distance therefore drives real type sizes (which the layout can measure), not
 * transforms (which it cannot), and neighbours are clamped to a line or two so
 * a long step can never crowd the one being read.
 */
function RollerItem({ off, step, isFinale, itemRef, t, onJump }) {
  const abs = Math.abs(off)
  const active = off === 0
  // Beyond two steps away an item is not context any more, just weight — kept
  // in the DOM (the stack measures against it) but given no height.
  if (abs > 2) return <div ref={itemRef} className="h-0 overflow-hidden" aria-hidden="true" />

  // Colour transitions only — deliberately NOT `transition-all`. That animated
  // font-size as well, so an item's height kept changing for half a second
  // after each step and the stack was centred against geometry that was still
  // growing: the reading line ended up hundreds of pixels off.
  const shell = `flex w-full flex-col items-center px-4 text-center transition-colors duration-500 ease-out motion-reduce:transition-none sm:px-10 ${
    active ? '' : 'cursor-pointer select-none'
  }`

  if (isFinale) {
    return (
      <div ref={itemRef} onClick={!active ? onJump : undefined} className={shell}>
        <div
          data-line
          className={`flex items-center gap-3 font-extrabold ${
            active ? 'text-3xl text-amber-300 sm:text-4xl' : 'text-base text-amber-300/40'
          }`}
        >
          <Flag className={active ? 'h-8 w-8' : 'h-4 w-4'} aria-hidden="true" />
          {t.endLine}
        </div>
      </div>
    )
  }

  if (!active) {
    return (
      <div ref={itemRef} onClick={onJump} className={shell}>
        <p
          data-line
          className={`whitespace-pre-line font-extrabold transition-colors duration-300 hover:text-slate-200/70 ${
            abs === 1
              ? 'line-clamp-2 max-w-xl text-[13px] leading-snug text-slate-300/45 sm:text-base'
              : 'line-clamp-1 max-w-md text-[11px] leading-snug text-slate-400/20 sm:text-xs'
          }`}
        >
          <span className="text-amber-300/50">{step.n} · </span>
          {step.text}
        </p>
      </div>
    )
  }

  return (
    <div ref={itemRef} className={shell}>
      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-amber-300">
        {step.n} · {step.stage}
      </span>

      {/* The step's one job. This is what turns a list of topics into a route:
          an agent who loses the thread reads the goal, not the sentence. */}
      {step.goal && (
        <span className="mb-4 mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-100/40">
          <Target className="h-3 w-3 shrink-0" aria-hidden="true" />
          {step.goal}
        </span>
      )}
      {!step.goal && <span className="mb-4" />}

      {/* The spoken line gets a lit card of its own. Everything else on the
          stage is guidance; this is the only thing to read out loud, and it
          should be impossible to confuse the two. */}
      <div
        data-line
        className="relative w-full max-w-3xl overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-b from-white/[0.10] via-white/[0.06] to-white/[0.02] px-6 py-6 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.95)] sm:px-10 sm:py-8"
      >
        <span
          className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-amber-300 via-amber-500 to-transparent"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -top-6 start-5 select-none text-[120px] font-black leading-none text-white/[0.045]"
          aria-hidden="true"
        >
          ”
        </span>
        <span className="mb-3 flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-[0.25em] text-amber-300/70">
          <Mic className="h-3 w-3" aria-hidden="true" />
          {t.say}
        </span>
        <p className="relative whitespace-pre-line text-xl font-extrabold leading-relaxed text-white sm:text-[27px] sm:leading-[1.5]">
          {withBlanks(step.text)}
        </p>
      </div>

      {step.tip && (
        <p className="mt-5 flex max-w-2xl items-start gap-2 text-[13px] font-semibold leading-relaxed text-amber-200/75">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{step.tip}</span>
        </p>
      )}
    </div>
  )
}

/** The objections dock for the current step. */
function ObjectionsDock({ step, openIdx, onToggle, t }) {
  if (!step || step.objections.length === 0) {
    return (
      <div className="px-5 pb-4 pt-3 text-center text-xs font-semibold text-slate-100/40">
        {t.none}
      </div>
    )
  }
  const open = openIdx != null ? step.objections[openIdx] : null
  return (
    <div className="px-4 pb-4 pt-3 sm:px-6">
      <p className="mb-2 text-center text-[10px] font-bold tracking-[0.3em] text-red-300/70">
        {t.objections}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {step.objections.map((o, i) => (
          <button
            key={i}
            onClick={() => onToggle(i)}
            className={`flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-bold transition-all duration-200 ${
              openIdx === i
                ? 'border-amber-300 bg-gradient-to-l from-amber-400 to-yellow-300 text-slate-900 shadow-lg shadow-amber-500/20'
                : 'border-white/15 bg-white/5 text-slate-100/80 hover:border-amber-300/50 hover:text-white'
            }`}
          >
            {/* The number doubles as the keyboard shortcut — otherwise nobody
                would ever discover that 1–9 open these. */}
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-black ${
                openIdx === i ? 'bg-slate-900/80 text-amber-300' : 'bg-white/10 text-slate-100/50'
              }`}
            >
              {i + 1}
            </span>
            <span className="truncate">{t.quote(o.q)}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="mx-auto mt-3 max-w-2xl animate-fade-up rounded-2xl bg-white p-4 text-right shadow-2xl">
          <p className="text-[11px] font-bold text-slate-400">{t.answer}</p>
          <p className="mt-1 text-[15px] font-semibold leading-relaxed text-slate-900">
            {open.a || t.noAnswer}
          </p>
        </div>
      )}
    </div>
  )
}

function Finale({ elapsed, stepsCount, onRestart, t }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-500 shadow-2xl shadow-amber-500/30">
        <Flag className="h-9 w-9 text-slate-900" aria-hidden="true" />
      </div>
      <div>
        <p className="text-3xl font-extrabold text-white">{t.doneTitle}</p>
        <p className="mt-2 text-sm font-semibold text-slate-100/60">
          {t.doneMeta(stepsCount, fmtClock(elapsed))}
        </p>
      </div>
      <p className="max-w-md text-sm font-semibold leading-relaxed text-amber-200/80">
        {t.doneNote}
      </p>
      <button
        onClick={onRestart}
        className="mt-2 flex items-center gap-2 rounded-2xl bg-gradient-to-l from-amber-500 to-yellow-400 px-6 py-3 text-sm font-extrabold text-slate-900 shadow-lg shadow-amber-500/25 transition hover:brightness-105 active:scale-95"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t.restart}
      </button>
    </div>
  )
}

/** Manager-only editor over the raw line format, one tab per language. */
function EditorModal({ initial, lang, onSave, onClose }) {
  const [drafts, setDrafts] = useState(initial)
  const [tab, setTab] = useState(lang)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const t = T[tab]

  const save = async () => {
    for (const l of LANGS) {
      if (parseSpeech(drafts[l.key]).length === 0) {
        setTab(l.key)
        setErr(T[l.key].errEmpty)
        return
      }
    }
    setBusy(true)
    try {
      await onSave(drafts)
      onClose()
    } catch {
      setErr(t.errSave)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
          <Pencil className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <span className="flex-1 text-sm font-extrabold text-slate-900">{t.edit}</span>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="סגירה">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-4 pt-2">
          {LANGS.map((l) => (
            <button
              key={l.key}
              onClick={() => setTab(l.key)}
              style={l.key === 'ar' ? { fontFamily: AR_FONT } : undefined}
              className={`rounded-t-lg px-4 py-2 text-sm font-bold transition ${
                tab === l.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="border-b border-slate-100 bg-amber-50 px-5 py-2 text-[11.5px] font-semibold leading-relaxed text-amber-800">
          <div>{t.editHint}</div>
          <div className="mt-0.5 text-amber-700/80">{t.editVars}</div>
        </div>
        <textarea
          value={drafts[tab]}
          onChange={(e) => setDrafts((d) => ({ ...d, [tab]: e.target.value }))}
          dir="rtl"
          spellCheck={false}
          style={tab === 'ar' ? { fontFamily: AR_FONT } : undefined}
          className="min-h-[45vh] flex-1 resize-none px-5 py-4 text-sm font-medium leading-7 text-slate-800 outline-none"
        />
        {err && <p className="px-5 pb-1 text-xs font-bold text-red-600">{err}</p>}
        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
          >
            {busy ? t.saving : t.save}
          </button>
          <button
            onClick={() => setDrafts((d) => ({ ...d, [tab]: DEFAULT_SPEECH[tab] }))}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100"
          >
            {t.reset}
          </button>
          <span className="ms-auto text-[11px] font-semibold text-slate-400">
            {t.steps(parseSpeech(drafts[tab]).length)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function SpeechPage() {
  const { selectedAgent } = useAuth()
  const canEdit = isManagerAgent(selectedAgent) || isAdminAgent(selectedAgent)

  // The agent's own choice, remembered per device: ודיע works Arabic-speaking
  // leads all day and should not re-pick the language on every call.
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY)
    return LANGS.some((l) => l.key === saved) ? saved : 'he'
  })
  const t = T[lang]
  const langMeta = LANGS.find((l) => l.key === lang) || LANGS[0]

  // Who the script speaks as. First name only — "מדבר מלאכי אזערי" is not how
  // anyone opens a call — and written in the script of the call, so the Arabic
  // ספיץ does not say "معك עדי" with Hebrew letters mid-sentence.
  const agentName = callingName(selectedAgent, lang)
  const agentGender = genderOf(selectedAgent)

  // Per-call, never persisted: this is one lead, and the next call is a
  // different person.
  const [leadName, setLeadName] = useState('')
  const [leadGender, setLeadGender] = useState('m')

  const [scripts, setScripts] = useState(DEFAULT_SPEECH)

  // Tokens are resolved BEFORE parsing: a gender pair carries a pipe, and the
  // objection format uses the pipe as its separator — substituting first means
  // the only pipe left when the parser runs is a real one.
  const steps = useMemo(
    () =>
      parseSpeech(
        applyVars(scripts[lang], {
          agentName,
          agentGender,
          leadName: leadName.trim(),
          leadGender,
          leadFallback: langMeta.leadFallback,
        })
      ),
    [scripts, lang, agentName, agentGender, leadName, leadGender, langMeta.leadFallback]
  )

  const [idx, setIdx] = useState(0) // steps.length === the finale
  const [openObj, setOpenObj] = useState(null)
  const [editing, setEditing] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const stageRef = useRef(null)
  const stackRef = useRef(null)
  const itemRefs = useRef([])
  const [shift, setShift] = useState(0)
  const wheelAcc = useRef(0)
  const wheelCooldownUntil = useRef(0)
  const touchStartY = useRef(null)
  const editingRef = useRef(false)
  editingRef.current = editing

  // The shared scripts, if the manager saved any. A language they never touched
  // keeps the built-in default — an unreachable server must not empty the stage.
  useEffect(() => {
    getSpeech()
      .then((saved) => setScripts((cur) => ({ ...cur, ...saved })))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(clock)
  }, [])

  const move = useCallback(
    (dir) => {
      setIdx((i) => Math.max(0, Math.min(steps.length, i + dir)))
      setOpenObj(null)
    },
    [steps.length]
  )

  const restart = useCallback(() => {
    setIdx(0)
    setOpenObj(null)
    setElapsed(0)
  }, [])

  const pickLang = (key) => {
    localStorage.setItem(LANG_KEY, key)
    setLang(key)
    restart()
  }

  // Centre the active item by measuring it. Runs in a layout effect so the
  // reading happens after the class swap (the active item is much taller) but
  // before paint — otherwise the stack would visibly jump into place.
  const centre = useCallback(() => {
    const el = itemRefs.current[idx]
    const stack = stackRef.current
    if (!el || !stack) return
    // Anchor on the SPOKEN CARD, not the whole item: the badge above and the
    // tip below would otherwise drag the reading line up and down between steps
    // depending on whether a step happens to carry a tip.
    //
    // Measured as a rectangle difference against the stack rather than with
    // offsetTop: the card's offsetParent is the stack (the item div is static),
    // so `item.offsetTop + card.offsetTop` counted the item's position twice
    // and the line slid further down with every step. Rects also survive the
    // in-flight transition — both are translated by the same amount, so their
    // difference is the untransformed layout distance.
    const target = el.querySelector('[data-line]') || el
    const a = target.getBoundingClientRect()
    const b = stack.getBoundingClientRect()
    setShift(a.top - b.top + a.height / 2)
  }, [idx])

  useLayoutEffect(() => {
    centre()
    // One more pass on the next frame. Anything that settles a beat after the
    // commit — a late web font (Arabic pulls Cairo the first time), a scrollbar
    // appearing — would otherwise leave the line slightly off.
    const id = requestAnimationFrame(centre)
    return () => cancelAnimationFrame(id)
  }, [centre, steps])

  useEffect(() => {
    window.addEventListener('resize', centre)
    document.fonts?.ready.then(centre).catch(() => {})

    // Anything that reflows the stack after the fact — a tip wrapping to a
    // second line, the objections dock growing a row and shrinking the stage —
    // re-centres itself. Safe against loops: an unchanged measurement sets the
    // same number and React skips the re-render.
    const ro = new ResizeObserver(centre)
    if (stackRef.current) ro.observe(stackRef.current)

    return () => {
      window.removeEventListener('resize', centre)
      ro.disconnect()
    }
  }, [centre])

  // ── The roller's input: wheel (one step per gesture), keys, touch ──────────
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault() // the stage owns the wheel — the page must not scroll
      const now = Date.now()
      if (now < wheelCooldownUntil.current) return
      wheelAcc.current += e.deltaY
      if (Math.abs(wheelAcc.current) >= WHEEL_THRESHOLD) {
        const dir = wheelAcc.current > 0 ? 1 : -1
        wheelAcc.current = 0
        wheelCooldownUntil.current = now + WHEEL_COOLDOWN_MS
        move(dir)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [move])

  useEffect(() => {
    const onKey = (e) => {
      if (editingRef.current) return
      // Typing the lead's name must not roll the script.
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault()
        move(1)
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        move(-1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        restart()
      } else if (/^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1
        setOpenObj((cur) => (cur === n ? null : n))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, restart])

  const onTouchStart = (e) => {
    touchStartY.current = e.touches[0]?.clientY ?? null
  }
  const onTouchEnd = (e) => {
    if (touchStartY.current == null) return
    const dy = touchStartY.current - (e.changedTouches[0]?.clientY ?? touchStartY.current)
    touchStartY.current = null
    if (Math.abs(dy) >= SWIPE_THRESHOLD_PX) move(dy > 0 ? 1 : -1)
  }

  const finale = idx === steps.length
  const current = finale ? null : steps[idx]
  const done = steps.length ? idx / steps.length : 0
  // The stage warms as the call approaches the close: cool blue at the opening,
  // gold by the booking. It is felt rather than read — but an agent glancing up
  // knows roughly where they are without parsing a number.
  const hue = Math.round(224 - (224 - 40) * done)

  return (
    <div className="mx-auto max-w-5xl">
      <div
        ref={stageRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={lang === 'ar' ? { fontFamily: AR_FONT } : undefined}
        className="relative flex h-[calc(100dvh-8.5rem)] min-h-[32rem] flex-col overflow-hidden overscroll-contain rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl sm:h-[calc(100dvh-7rem)]"
      >
        <div
          className="absolute inset-x-0 top-0 z-30 h-[3px] bg-gradient-to-l from-amber-600 via-yellow-300 to-amber-500"
          aria-hidden="true"
        />
        {/* Spotlight behind the card, warming with progress */}
        <div
          className="pointer-events-none absolute inset-0 transition-[background] duration-700 motion-reduce:transition-none"
          style={{
            background: `radial-gradient(65% 42% at 50% 48%, hsl(${hue} 92% 58% / 0.13), transparent 72%)`,
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
          aria-hidden="true"
        />

        {/* ── Header ── */}
        <div className="relative z-20 flex items-center gap-2 px-4 pb-1.5 pt-3.5 sm:gap-3 sm:px-6">
          <span className="flex items-center gap-2 text-sm font-extrabold text-white">
            <Megaphone className="h-4 w-4 text-amber-300" aria-hidden="true" />
            {t.title}
          </span>

          <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5">
            {LANGS.map((l) => (
              <button
                key={l.key}
                onClick={() => pickLang(l.key)}
                style={l.key === 'ar' ? { fontFamily: AR_FONT } : undefined}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  lang === l.key
                    ? 'bg-gradient-to-l from-amber-500 to-yellow-400 text-slate-900'
                    : 'text-slate-100/55 hover:text-white'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <span className="hidden text-[11px] font-bold text-slate-100/45 sm:inline">
            {finale ? t.end : t.step(idx + 1, steps.length)}
          </span>

          <span
            className="ms-auto rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-100/70"
            title={t.clock}
          >
            {fmtClock(elapsed)}
          </span>
          <Link
            to="/objections"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/25 bg-amber-300/10 px-2.5 py-2 text-[11px] font-extrabold text-amber-200 transition-[transform,background-color,border-color] duration-150 hover:border-amber-300/50 hover:bg-amber-300/15 active:scale-[0.97]"
            title={lang === 'ar' ? 'مكتبة الاعتراضات' : 'ספריית התנגדויות'}
          >
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">
              {lang === 'ar' ? 'مكتبة الاعتراضات' : 'ספריית התנגדויות'}
            </span>
          </Link>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-xl p-2 text-slate-100/60 transition hover:bg-white/10 hover:text-white"
              title={t.edit}
              aria-label={t.edit}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* ── Call setup: who is speaking, and to whom ── */}
        <div className="relative z-20 flex flex-wrap items-center gap-2 px-4 pb-2.5 sm:px-6">
          <span
            className="flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 py-1 pe-3 ps-1 text-[11.5px] font-bold text-amber-200"
            title={t.speaking}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-600 text-[10px] font-black text-slate-900">
              {agentName.slice(0, 1)}
            </span>
            {agentName}
          </span>

          <span className="text-[11px] font-bold text-slate-100/25">←</span>

          <label className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 transition focus-within:border-amber-300/60">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-100/40" aria-hidden="true" />
            <input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder={t.lead}
              aria-label={t.lead}
              className="w-24 bg-transparent text-[12.5px] font-bold text-white placeholder:font-semibold placeholder:text-slate-100/35 focus:outline-none sm:w-36"
            />
            {leadName && (
              <button
                onClick={() => setLeadName('')}
                className="shrink-0 text-slate-100/40 transition hover:text-white"
                aria-label="נקה"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </label>

          {/* The lead's gender inflects the script too: half the leads in this
              calendar are women, and "אתה מחפש" is wrong in their ear. */}
          <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5">
            {[
              { key: 'm', glyph: '♂', label: t.male },
              { key: 'f', glyph: '♀', label: t.female },
            ].map((g) => (
              <button
                key={g.key}
                onClick={() => setLeadGender(g.key)}
                title={g.label}
                aria-label={g.label}
                aria-pressed={leadGender === g.key}
                className={`rounded-full px-2.5 py-0.5 text-[13px] font-bold leading-5 transition ${
                  leadGender === g.key
                    ? 'bg-white/90 text-slate-900'
                    : 'text-slate-100/40 hover:text-white'
                }`}
              >
                {g.glyph}
              </button>
            ))}
          </div>
        </div>

        {/* Segmented progress — one block per stage, so the shape of the call
            is visible rather than just a percentage. */}
        <div className="relative z-20 mx-4 flex gap-1 sm:mx-6">
          {steps.map((s, i) => (
            <span
              key={i}
              title={`${s.n} · ${s.stage}`}
              className={`h-1 flex-1 rounded-full transition-all duration-500 motion-reduce:transition-none ${
                i < idx
                  ? 'bg-amber-500/70'
                  : i === idx
                    ? 'bg-gradient-to-l from-amber-400 to-yellow-200'
                    : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Stage rail — jump dots (desktop) */}
        <div className="absolute inset-y-0 end-3 z-20 hidden flex-col items-center justify-center gap-2 sm:flex">
          {steps.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setIdx(i)
                setOpenObj(null)
              }}
              title={`${s.n} · ${s.stage}`}
              aria-label={`${s.n} · ${s.stage}`}
              className={`rounded-full transition-all duration-300 motion-reduce:transition-none ${
                i === idx
                  ? 'h-6 w-2 bg-gradient-to-b from-amber-300 to-yellow-500'
                  : i < idx
                    ? 'h-2 w-2 bg-amber-400/50 hover:bg-amber-300'
                    : 'h-2 w-2 bg-white/15 hover:bg-white/40'
              }`}
            />
          ))}
        </div>

        {finale ? (
          <div className="relative z-10 flex-1">
            <Finale elapsed={elapsed} stepsCount={steps.length} onRestart={restart} t={t} />
          </div>
        ) : (
          <div className="relative z-10 flex-1 overflow-hidden">
            {/* The stack lives at the stage's midline and slides so the active
                card's own centre sits exactly there — measured, not assumed. */}
            <div
              ref={stackRef}
              className="absolute inset-x-0 top-1/2 flex flex-col items-center gap-7 transition-transform duration-500 ease-out motion-reduce:transition-none sm:gap-9"
              style={{ transform: `translateY(${-shift}px)` }}
            >
              {steps.map((s, i) => (
                <RollerItem
                  key={`${lang}-${i}`}
                  off={i - idx}
                  step={s}
                  t={t}
                  itemRef={(el) => (itemRefs.current[i] = el)}
                  onJump={() => {
                    setIdx(i)
                    setOpenObj(null)
                  }}
                />
              ))}
              <RollerItem
                off={steps.length - idx}
                isFinale
                t={t}
                itemRef={(el) => (itemRefs.current[steps.length] = el)}
                onJump={() => setIdx(steps.length)}
              />
            </div>
          </div>
        )}

        {!finale && (
          <div className="relative z-20 border-t border-white/5 bg-black/30 backdrop-blur-sm">
            <ObjectionsDock
              step={current}
              openIdx={openObj}
              onToggle={(i) => setOpenObj((cur) => (cur === i ? null : i))}
              t={t}
            />
            <div className="flex items-center justify-center gap-3 pb-3">
              <button
                onClick={() => move(-1)}
                disabled={idx === 0}
                className="rounded-full border border-white/15 p-2 text-slate-100/70 transition hover:border-amber-300/60 hover:text-white disabled:opacity-25"
                aria-label={t.prev}
              >
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-[10px] font-bold tracking-[0.25em] text-slate-100/40">
                {t.roll}
              </span>
              <button
                onClick={() => move(1)}
                className="rounded-full border border-white/15 p-2 text-slate-100/70 transition hover:border-amber-300/60 hover:text-white"
                aria-label={t.next}
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditorModal
          initial={scripts}
          lang={lang}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            await saveSpeech(next)
            setScripts(next)
            restart()
          }}
        />
      )}
    </div>
  )
}
