// Measuring the agent's side of a practice call (זירת אימון).
//
// Two jobs, both deliberately done in code rather than by the model:
//
//   1. The penalty each line costs the prospect's trust. A model asked "was that
//      a monologue?" said no to a 38-word pitch that ended in "אתה חייב לבוא" —
//      it saw the word פגישה and called it a question. Counting words does not
//      have opinions. So the measurable faults (a speech, pressure) are charged
//      here, and the model only adds what needs judgement (did it land).
//   2. The numbers on the result screen — talk share, questions, meeting asks.
//      A score the agent can argue with is a score the agent ignores; these
//      they can check against the transcript themselves.
//
// Hebrew and Arabic are both covered: ודיע's calls are Arabic, and a monologue
// is a monologue in either language.

// JS `\b` treats Hebrew and Arabic letters as non-word characters, so it cannot
// mark word edges here. These lookarounds do: a match must not touch a letter of
// either script, or a Latin letter, on either side.
const L = 'A-Za-z֐-׿؀-ۿ'
const word = (alts, prefix = '') =>
  new RegExp(`(?<![${L}])${prefix}(?:${alts})(?![${L}])`, 'u')

// A line that opens with a question word, or an open invitation to talk
// ("ספר לי"), asks even without a question mark — speech-to-text rarely
// writes one.
const QUESTION_OPENER = word(
  'מה|איך|למה|מתי|איפה|כמה|האם|מי|איזה|איזו|אילו|תספר|תספרי|ספר|ספרי|' +
    'شو|كيف|ليش|ليه|وين|إيمتى|امتى|قديش|مين|هل|خبرني|خبريني|احكيلي'
)

const PRESSURE = word(
  'חייב|חייבת|חייבים|רק היום|הזדמנות אחרונה|אל תפספס|אל תפספסי|אין מה לחשוב|' +
    'תחליט עכשיו|תחליטי עכשיו|לازم|فرصة أخيرة|بس اليوم|ما تضيّع'
)

const MEETING = word(
  'פגישה|פגישת|להיפגש|ניפגש|נפגש|שיחת ייעוץ|ייעוץ|זום|סניף|לקבוע|נקבע|' +
    'جلسة|لقاء|نلتقي|زوم|فرع|موعد',
  // Up to two prefix letters: "ובפגישה" is ו + ב + פגישה.
  '[ובלהשמ]{0,2}'
)

// A concrete slot: a weekday named as a day, tomorrow, or a clock time.
// "שני" alone is also "two/second", so a weekday only counts after יום / ב.
const SLOT_RE = new RegExp(
  [
    `(?:יום|ב)\\s?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי)(?![${L}])`,
    `(?<![${L}])[ול]?(?:מחרתיים|מחר)(?![${L}])`,
    `(?:الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|بكرا|بكرة|بعد بكرا)`,
    `\\d{1,2}:\\d{2}`,
    `(?:בשעה|ב-?|الساعة)\\s?\\d{1,2}(?!\\d)`,
  ].join('|'),
  'gu'
)
const OR_RE = word('או|أو|ولا|يا')

export const MONOLOGUE_WORDS = 30
export const LONG_WORDS = 45

const wordsIn = (text) => String(text || '').trim().split(/\s+/).filter(Boolean)

/** What one line of the agent's did, measured. */
export function measureLine(text) {
  const t = String(text || '').trim()
  const words = wordsIn(t).length
  const asked = /[?؟]/.test(t) || QUESTION_OPENER.test(t)
  const slots = new Set((t.match(SLOT_RE) || []).map((s) => s.replace(/\s+/g, '')))
  const pressure = t.match(PRESSURE)?.[0] || null

  return {
    words,
    asked,
    // A speech with no question in it hands the other side nothing to do but
    // wait — the fault the script warns about most ("לא לדקלם הכול").
    monologue: words > MONOLOGUE_WORDS && !asked,
    // Even with a question at the end, 45 words is a pitch.
    long: words > LONG_WORDS,
    pressure,
    meetingAsk: MEETING.test(t),
    twoOptions: slots.size >= 2 && OR_RE.test(t),
  }
}

/** Trust points a line costs before the prospect has even judged it. */
export function penaltyFor(m) {
  let p = 0
  if (m.monologue) p -= 2
  else if (m.long) p -= 1
  if (m.pressure) p -= 1
  return p
}

export const clampTrust = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)))

/**
 * The whole call, summed up for the result screen.
 * `transcript` is [{ role: 'rep' | 'prospect', text, trust? }].
 */
export function sessionMetrics(transcript = []) {
  const rep = transcript.filter((t) => t.role === 'rep')
  const pro = transcript.filter((t) => t.role === 'prospect')
  const repWords = rep.reduce((s, t) => s + wordsIn(t.text).length, 0)
  const proWords = pro.reduce((s, t) => s + wordsIn(t.text).length, 0)
  const measured = rep.map((t) => measureLine(t.text))

  return {
    turns: rep.length,
    // Share of the words spoken that were the agent's. A booking call should
    // sit well under half: the prospect talking is the point of the call.
    repShare: repWords + proWords ? Math.round((repWords / (repWords + proWords)) * 100) : 0,
    questions: measured.filter((m) => m.asked).length,
    meetingAsks: measured.filter((m) => m.meetingAsk).length,
    twoOptions: measured.some((m) => m.twoOptions),
    monologues: measured.filter((m) => m.monologue).length,
    pressures: measured.filter((m) => m.pressure).length,
    longest: measured.reduce((mx, m) => Math.max(mx, m.words), 0),
  }
}

/**
 * Where the call turned: the agent line after which trust rose most, and the
 * one after which it fell most. Returned as transcript indexes of the AGENT's
 * line — that is the thing they said, and the thing to look at.
 */
export function turningPoints(transcript = []) {
  let prev = null
  let best = null
  let worst = null
  for (let i = 0; i < transcript.length; i++) {
    const t = transcript[i]
    if (t.role !== 'prospect' || typeof t.trust !== 'number') continue
    if (prev !== null) {
      const delta = t.trust - prev
      let repIdx = i - 1
      while (repIdx >= 0 && transcript[repIdx].role !== 'rep') repIdx--
      if (repIdx >= 0) {
        if (delta > 0 && (!best || delta > best.delta)) best = { index: repIdx, delta }
        if (delta < 0 && (!worst || delta < worst.delta)) worst = { index: repIdx, delta }
      }
    }
    prev = t.trust
  }
  return { best, worst }
}
