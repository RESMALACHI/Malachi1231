// The follow-up sequence — what a client hears between booking a meeting and
// sitting down at it, and when.
//
// A flow is a list of STAGES. Each stage is one message plus the moment it
// goes out, and that moment is always expressed relative to something real:
// the booking, or the meeting itself. Nobody schedules "Tuesday 14:00" — they
// schedule "a day before", and the flow works for every client at once.
//
// NOTHING HERE SENDS ANYTHING YET. This module is the shape of the data and
// the words that describe it; the builder screen edits a flow in memory and the
// sending side is a later piece of work. Kept apart on purpose: the wording of
// these messages is worth arguing about on its own, before any of it is wired
// to a scheduler.
//
// Bodies use the same {שם} / {תאריך} / {שעה} / {סניף} / {כתובת} / {סוכן}
// placeholders as the personal templates, so one renderer serves both.

/** What a stage's timing is measured from. */
export const ANCHORS = [
  {
    key: 'booking',
    label: 'אחרי קביעת הפגישה',
    short: 'אחרי הקביעה',
    // Counted forward from the booking, so "0" is the natural default.
    direction: 'after',
    tone: 'green',
  },
  {
    key: 'before',
    label: 'לפני הפגישה',
    short: 'לפני הפגישה',
    direction: 'before',
    tone: 'amber',
  },
  {
    key: 'after',
    label: 'אחרי הפגישה',
    short: 'אחרי הפגישה',
    direction: 'after',
    tone: 'slate',
  },
]

export const anchorByKey = (key) => ANCHORS.find((a) => a.key === key) || ANCHORS[0]

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
 * The timing, in the words a person would actually use.
 *
 * Hebrew does not pluralise the way a naive `${n} ${unit}` does — "1 ימים" and
 * "2 שעות לפני" are both wrong — so the small numbers are spelled out. They
 * cover almost every stage anyone writes.
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

/** Just the offset and its direction: "שעה לפני". For places too tight for the noun. */
export function describeWhenShort(stage) {
  if (stage.anchor === 'booking') {
    return stage.offsetMin === 0 ? 'מיד' : `${describeOffset(stage.offsetMin)} אחרי`
  }
  return `${describeOffset(stage.offsetMin)} ${stage.anchor === 'before' ? 'לפני' : 'אחרי'}`
}

/** The full sentence for a stage's timing: "24 שעות לפני הפגישה". */
export function describeWhen(stage) {
  const anchor = anchorByKey(stage.anchor)
  if (stage.anchor === 'booking') {
    return stage.offsetMin === 0 ? 'מיד עם קביעת הפגישה' : `${describeOffset(stage.offsetMin)} אחרי הקביעה`
  }
  return `${describeOffset(stage.offsetMin)} ${anchor.short}`
}

/**
 * Stages in the order the CLIENT experiences them, which is not the order they
 * are stored in. "Before" counts down, so a bigger offset is earlier — 24 hours
 * before comes ahead of one hour before.
 */
const PHASE = { booking: 0, before: 1, after: 2 }
export function orderedStages(stages = []) {
  return [...stages].sort((a, b) => {
    const p = PHASE[a.anchor] - PHASE[b.anchor]
    if (p !== 0) return p
    return a.anchor === 'before' ? b.offsetMin - a.offsetMin : a.offsetMin - b.offsetMin
  })
}

let seq = 0
export const newStageId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`

export function blankStage() {
  return {
    id: newStageId(),
    anchor: 'before',
    offsetMin: 60,
    enabled: true,
    title: 'שלב חדש',
    body: '',
  }
}

/**
 * The starting sequence every agent gets, and the reason this screen exists.
 *
 * Three stages: the confirmation, the day-before message that does the real
 * work, and a short nudge on the day. An agent is meant to rewrite all of it —
 * this is a worked example of the shape, not a house script.
 */
export function defaultFlow() {
  return [
    {
      id: 'seed-confirm',
      anchor: 'booking',
      offsetMin: 0,
      enabled: true,
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
      title: 'שעה לפני — תזכורת קצרה',
      body: `{שם}, מזכיר שנפגשים בעוד שעה, ב־{שעה} 🙂
{כתובת}

יוצא לדרך? מוזמן לענות כאן ואני מחכה לך.`,
    },
  ]
}

/** Sample values for the preview — a flow is written by looking at it, not at tokens. */
export function sampleValues(agentName) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return {
    name: 'דני',
    date: d.toISOString().slice(0, 10),
    time: '16:00',
    branch: 'ramat-gan',
    agent: String(agentName || '').trim().split(/\s+/)[0] || 'הסוכן',
  }
}
