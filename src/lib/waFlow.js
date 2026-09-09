// Follow-up sequences — what someone hears from us, and when.
//
// There are two of them and they are genuinely different animals:
//
//   'meeting' — a client who already has a meeting booked. Timing hangs off the
//               meeting itself ("a day before"), so one flow serves everyone.
//   'lead'    — someone who just left their details on an ad. Timing hangs off
//               the moment the details arrived, and the flow's whole purpose is
//               to stop: it runs until a human actually reaches them.
//
// A stage is one step plus the moment it happens. Steps are not all messages —
// a lead sequence that only sends texts and never tells anyone to pick up the
// phone is a way of not calling people back politely — so a stage is either a
// message to them or a task for the agent.
//
// NOTHING HERE SENDS ANYTHING YET. This module is the shape of the data and the
// words that describe it; the builder edits a flow in memory and the sending
// side is a later piece of work. Kept apart on purpose: the wording is worth
// arguing about before any of it is wired to a scheduler.

/* ── Where a stage's timing hangs from ──────────────────────────────── */

export const MEETING_ANCHORS = [
  { key: 'booking', label: 'אחרי קביעת הפגישה', short: 'אחרי הקביעה', tone: 'green' },
  { key: 'before', label: 'לפני הפגישה', short: 'לפני הפגישה', tone: 'amber' },
  { key: 'after', label: 'אחרי הפגישה', short: 'אחרי הפגישה', tone: 'slate' },
]

export const LEAD_ANCHORS = [
  { key: 'arrival', label: 'מרגע שהשאיר פרטים', short: 'אחרי הפנייה', tone: 'green' },
  { key: 'no_answer', label: 'אחרי ניסיון שלא נענה', short: 'אחרי ניסיון שלא נענה', tone: 'amber' },
]

export const anchorsFor = (kind) => (kind === 'lead' ? LEAD_ANCHORS : MEETING_ANCHORS)
export const anchorByKey = (key, kind) =>
  anchorsFor(kind).find((a) => a.key === key) || anchorsFor(kind)[0]

/** Counted backwards from the thing it hangs off, rather than forwards. */
const COUNTS_DOWN = new Set(['before'])

/* ── What a stage actually does ─────────────────────────────────────── */

export const STAGE_KINDS = [
  { key: 'message', label: 'הודעה ללקוח' },
  { key: 'task', label: 'משימה לסוכן' },
]

/* ── Time ───────────────────────────────────────────────────────────── */

export const UNITS = [
  { key: 'min', label: 'דקות', minutes: 1 },
  { key: 'hour', label: 'שעות', minutes: 60 },
  { key: 'day', label: 'ימים', minutes: 60 * 24 },
]

/** Minutes → the largest whole unit that fits, so 1440 reads as "יום" not "1440 דקות". */
export function splitOffset(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  if (m === 0) return { amount: 0, unit: 'min' }
  if (m % (60 * 24) === 0) return { amount: m / (60 * 24), unit: 'day' }
  if (m % 60 === 0) return { amount: m / 60, unit: 'hour' }
  return { amount: m, unit: 'min' }
}

export function toMinutes(amount, unit) {
  const u = UNITS.find((x) => x.key === unit) || UNITS[0]
  return Math.max(0, Math.round(Number(amount) || 0)) * u.minutes
}

/**
 * The timing, in the words a person would use.
 *
 * Hebrew does not pluralise the way a naive `${n} ${unit}` does — "1 ימים" and
 * "2 שעות" are both wrong — so the small numbers are spelled out. They cover
 * almost every stage anyone writes.
 */
const SPOKEN = {
  min: [null, 'דקה', 'שתי דקות'],
  hour: [null, 'שעה', 'שעתיים'],
  day: [null, 'יום', 'יומיים'],
}
const PLURAL = { min: 'דקות', hour: 'שעות', day: 'ימים' }

export function describeOffset(minutes) {
  const { amount, unit } = splitOffset(minutes)
  if (amount === 0) return 'מיד'
  return SPOKEN[unit][amount] || `${amount} ${PLURAL[unit]}`
}

/** The full sentence: "24 שעות לפני הפגישה", "מיד עם הפנייה". */
export function describeWhen(stage, kind) {
  const anchor = anchorByKey(stage.anchor, kind)
  if (stage.offsetMin === 0) {
    return stage.anchor === 'booking'
      ? 'מיד עם קביעת הפגישה'
      : stage.anchor === 'arrival'
        ? 'מיד עם הפנייה'
        : `מיד ${anchor.short}`
  }
  return `${describeOffset(stage.offsetMin)} ${anchor.short}`
}

/** Just the offset and its direction: "שעה לפני". For places too tight for the noun. */
export function describeWhenShort(stage) {
  if (stage.offsetMin === 0) return 'מיד'
  return `${describeOffset(stage.offsetMin)} ${COUNTS_DOWN.has(stage.anchor) ? 'לפני' : 'אחרי'}`
}

/**
 * Stages in the order they are LIVED, which is not the order they are stored.
 * "Before" counts down, so a bigger offset is earlier — 24 hours before comes
 * ahead of one hour before.
 */
const PHASE = { booking: 0, before: 1, after: 2, arrival: 0, no_answer: 1 }
export function orderedStages(stages = []) {
  return [...stages].sort((a, b) => {
    const p = (PHASE[a.anchor] ?? 0) - (PHASE[b.anchor] ?? 0)
    if (p !== 0) return p
    return COUNTS_DOWN.has(a.anchor) ? b.offsetMin - a.offsetMin : a.offsetMin - b.offsetMin
  })
}

/* ── Making stages ──────────────────────────────────────────────────── */

let seq = 0
export const newStageId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`

export function blankStage(kind) {
  return {
    id: newStageId(),
    anchor: kind === 'lead' ? 'arrival' : 'before',
    offsetMin: 60,
    enabled: true,
    type: 'message',
    title: 'שלב חדש',
    body: '',
  }
}

/* ── When a lead sequence must shut up ──────────────────────────────── */

/**
 * The single most important setting on the lead flow.
 *
 * A sequence that keeps chasing someone an agent already spoke to is worse than
 * no sequence: it tells the person nobody here is talking to each other. So the
 * flow always has an exit, and it is stated at the top of the screen rather
 * than buried per-stage.
 */
export const STOP_CONDITIONS = [
  { key: 'contacted', label: 'ברגע שהסוכן סימן שדיבר איתו' },
  { key: 'meeting', label: 'ברגע שנקבעה לו פגישה' },
  { key: 'replied', label: 'ברגע שהוא ענה בווצאפ' },
  { key: 'never', label: 'לא נעצר — כל השלבים תמיד נשלחים' },
]

/* ── Placeholders ───────────────────────────────────────────────────── */

/** A lead has no date, time or branch yet — that is the entire point of it. */
export const LEAD_PLACEHOLDERS = [
  { token: '{שם}', label: 'שם הליד' },
  { token: '{מקור}', label: 'מקור הפנייה' },
  { token: '{סוכן}', label: 'השם שלך' },
]

export function renderLead(body, v = {}) {
  return String(body || '')
    .replaceAll('{שם}', String(v.name || '').trim())
    .replaceAll('{מקור}', String(v.source || '').trim())
    .replaceAll('{סוכן}', String(v.agent || '').trim())
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ── The starting sequences ─────────────────────────────────────────── */

/**
 * Both defaults are a worked example of the shape, not a house script. An agent
 * is meant to rewrite all of it.
 */
export function defaultMeetingFlow() {
  return [
    {
      id: 'seed-confirm',
      anchor: 'booking',
      offsetMin: 0,
      enabled: true,
      type: 'message',
      title: 'אישור הפגישה',
      body: `היי {שם}, נעים מאוד 🙂
זה {סוכן} ממכללת R.E.S.

קבעתי לך פגישה ל־{תאריך} בשעה {שעה}.
{כתובת}

אני כאן לכל שאלה עד אז. נתראה!`,
    },
    {
      id: 'seed-day-before',
      anchor: 'before',
      offsetMin: 60 * 24,
      enabled: true,
      type: 'message',
      title: 'יום לפני — למה זו פגישה מיוחדת',
      body: `{שם}, רציתי לעדכן אותך במשהו 👇

שריינתי עבורך פגישה אישית עם יצחק חסידים, יו"ר איגוד הנדל"ן והבעלים של קבוצת RES ומכללת RES.

יצחק כמעט שלא מקיים פגישות אישיות בגלל לוח הזמנים העמוס שלו, ולכן זו באמת הזדמנות מיוחדת להכיר אותו ולשמוע ממנו באופן אישי.

הוא מגיע במיוחד למשרדים, אז אני ממש מבקש לעשות השתדלות להגיע בזמן ולא לאחר. ואם משהו משתנה — עדכן אותי מראש, כדי שאוכל להעביר את המקום למישהו אחר.

נפגשים מחר ב־{שעה}.
{כתובת}

נתראה ובהצלחה 😃
{סוכן}`,
    },
    {
      id: 'seed-hour-before',
      anchor: 'before',
      offsetMin: 60,
      enabled: true,
      type: 'message',
      title: 'שעה לפני — תזכורת קצרה',
      body: `{שם}, מזכיר שנפגשים בעוד שעה, ב־{שעה} 🙂
{כתובת}

יוצא לדרך? מוזמן לענות כאן ואני מחכה לך.`,
    },
  ]
}

/**
 * The advertising flow: from "left their details" to somebody actually calling.
 *
 * The first two stages are the ones that matter and they are two minutes apart:
 * an instant reply so the person knows they reached a real company, and a task
 * so a human picks up the phone while the ad is still on their screen.
 * Everything after that is the polite version of not giving up.
 */
export function defaultLeadFlow() {
  return [
    {
      id: 'lead-ack',
      anchor: 'arrival',
      offsetMin: 0,
      enabled: true,
      type: 'message',
      title: 'אישור מיידי',
      body: `היי {שם}, קיבלנו את הפרטים שהשארת 🙏
זו מכללת R.E.S — לימודי נדל"ן.

נציג שלנו יחזור אליך בדקות הקרובות.
אם נוח לך יותר בווצאפ, פשוט תענה כאן ונמשיך מכאן.`,
    },
    {
      id: 'lead-call-now',
      anchor: 'arrival',
      offsetMin: 2,
      enabled: true,
      type: 'task',
      title: 'להתקשר עכשיו',
      body: `ליד חם מ־{מקור} — להתקשר ל{שם} עכשיו, בזמן שהמודעה עוד פתוחה אצלו.`,
    },
    {
      id: 'lead-second-try',
      anchor: 'no_answer',
      offsetMin: 60 * 3,
      enabled: true,
      type: 'message',
      title: 'לא ענה — הודעה ראשונה',
      body: `{שם}, ניסיתי להשיג אותך ולא הצלחתי 🙂
זה {סוכן} ממכללת R.E.S, בעקבות הפרטים שהשארת.

מתי נוח לך שאחזור אליך? אפשר גם פשוט לענות כאן.`,
    },
    {
      id: 'lead-day-after',
      anchor: 'no_answer',
      offsetMin: 60 * 24,
      enabled: true,
      type: 'task',
      title: 'ניסיון שני בטלפון',
      body: `{שם} עדיין לא נענה. ניסיון נוסף — רצוי בשעה אחרת מזו של אתמול.`,
    },
    {
      id: 'lead-last',
      anchor: 'no_answer',
      offsetMin: 60 * 24 * 3,
      enabled: true,
      type: 'message',
      title: 'הודעת סיום',
      body: `{שם}, לא הצלחתי לתפוס אותך ואני לא רוצה להציק 🙂

אם זה עדיין מעניין אותך — תענה כאן ואחזור אליך מיד.
בהצלחה בכל מקרה,
{סוכן}`,
    },
  ]
}

/** Sample values for the preview — a flow is written by looking at it. */
export function sampleValues(agentName) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return {
    name: 'דני',
    date: d.toISOString().slice(0, 10),
    time: '16:00',
    branch: 'ramat-gan',
    source: 'פייסבוק — קמפיין נדל״ן',
    agent: String(agentName || '').trim().split(/\s+/)[0] || 'הסוכן',
  }
}
