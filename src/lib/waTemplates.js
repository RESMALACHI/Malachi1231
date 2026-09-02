// WhatsApp message templates. Each agent sends from their OWN business WhatsApp,
// connected once via QR (Green API). `build(v)` produces the message text; the
// WhatsAppPage sends it automatically through the agent's whatsapp-agent instance.
//
// The same templates are reused from a meeting's detail view, where the values
// come from the calendar instead of a form (see meetingTemplateValues). One set
// of wording, so a client hears the same voice whichever screen it was sent from.

import { clientName } from './meetingTitle'

/**
 * The branches, with the map link the client actually gets.
 *
 * `match` has to survive how the calendar really looks. Only about half of the
 * frontal meetings carry a tidy location ("רמת גן", "צחר", "חיפה") — the rest
 * arrive as a street address ("תובל 30 רמת גן בניין בית אור", "שוהם 2 ראש
 * פינה"), as "רמת גן, ישראל", or with the location EMPTY and the branch named
 * only in the title. So each branch matches on every spelling seen in the data,
 * including its street and its town.
 */
export const BRANCHES = [
  {
    key: 'ramat-gan',
    label: 'רמת גן',
    address: 'תובל 30, רמת גן (בניין בית אור, מרכז הבורסה)',
    map: 'https://maps.app.goo.gl/9N7tgQ5exTDT1Jn6A',
    match: /רמת[- ]?גן|ר["״]ג|תובל\s*30|בית אור|הבורסה/u,
  },
  {
    key: 'haifa',
    label: 'חיפה',
    address: 'מעלה השחרור 7, חיפה',
    map: 'https://maps.app.goo.gl/1zPoH2wErNm1g6M28',
    match: /חיפה|מעלה השחרור/u,
  },
  {
    key: 'tzahar',
    label: 'צח"ר',
    address: 'א.ת צח"ר ראש פינה — ברקת 1',
    map: 'https://maps.app.goo.gl/JCPYq6C6xbhbWK7q6',
    match: /צח["״]?ר|צחר|ראש[- ]?פינה|ברקת\s*1|שוהם\s*2/u,
  },
]

export const branchByKey = (key) => BRANCHES.find((b) => b.key === key) || null

/**
 * Which branch a meeting is at — or null when it is a zoom, or when the
 * calendar simply does not say.
 *
 * Null is a real answer and must stay one: guessing a branch would send a
 * client to the wrong city, which is far worse than sending no link at all.
 */
export function detectBranch(meeting) {
  if (!meeting) return null
  if (meeting.type === 'zoom') return null

  const desc = String(meeting.description || '')

  // ORDER MATTERS, and it is not cosmetic.
  //
  // The ".פגישה" message names the venue on its "סוג:" line and the CALENDAR
  // the event lives in on "יומן:". Those two disagree routinely — a Haifa
  // meeting is filed in the Ramat Gan calendar — so reading the description as
  // one blob matched "רמת גן" and would have sent Haifa clients to the wrong
  // city. Measured on 176 real frontal meetings: 8 of them.
  //
  // So the type line wins, then the calendar's own location field, then the
  // title; and the "יומן:" line is stripped out entirely, because it says who
  // owns the event, never where it happens.
  const venue = desc.match(/^\s*סוג\s*[:：]\s*(.+)$/mu)?.[1] || ''
  const descNoCalendarLine = desc.replace(/^\s*יומן\s*[:：].*$/gmu, '')

  const pick = (text) => {
    const s = String(text || '')
    // A conferencing link means it is not a branch meeting, whatever the type
    // column happens to say.
    if (!s.trim() || /zoom\.us|meet\.google/i.test(s)) return null
    return BRANCHES.find((b) => b.match.test(s)) || null
  }

  return (
    pick(venue) || pick(meeting.location) || pick(meeting.title) || pick(descNoCalendarLine)
  )
}

/** The two lines a client needs to reach the branch. */
export function branchLines(branch) {
  return branch ? `\n📍 ${branch.address}\n${branch.map}` : ''
}

/** Normalise a phone to WhatsApp's international digits form (972…). */
export function toWaNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('972')) return d
  if (d.startsWith('0')) return '972' + d.slice(1)
  if (d.startsWith('00')) return d.slice(2)
  return d
}

/** Pretty date/time for the message body. */
export function prettyDate(v) {
  if (!v) return ''
  // v is "yyyy-mm-dd" from an <input type=date>
  const [y, m, d] = v.split('-')
  return d && m && y ? `${d}/${m}/${y}` : v
}
export function prettyTime(v) {
  return v || '' // "HH:MM" from <input type=time>
}

/**
 * The values `build()` expects, taken from a meeting row rather than a form.
 *
 * Only the client's FIRST name is used: the calendar title carries the agent,
 * the branch and status notes too, and opening a message with all of that would
 * read like a database row rather than a person.
 */
export function meetingTemplateValues(meeting) {
  const pad = (n) => String(n).padStart(2, '0')
  const d = meeting?.meeting_date ? new Date(meeting.meeting_date) : null
  const full = clientName(meeting?.title, meeting?.agent_name)
  const name = !full || full === '(ללא פרטים)' ? '' : full.split(/\s+/)[0]

  return {
    name,
    // Who is writing. First name only, for the same reason as the client's:
    // "זה מלאכי אזערי ממכללת R.E.S" is not how anyone opens a message.
    agent: String(meeting?.agent_name || '').trim().split(/\s+/)[0] || '',
    date: d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '',
    time: d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '',
    // '' when it is a zoom or the calendar never said — the picker then shows
    // "זום / לא רלוונטי" and no address is sent.
    branch: detectBranch(meeting)?.key || '',
  }
}

const SIGN = 'מכללת R.E.S'

/**
 * Templates. `fields` lists which inputs to show (phone is always required).
 * `build(v)` returns the message text from the filled values.
 */
export const WA_TEMPLATES = [
  {
    key: 'chairman',
    title: 'פגישה עם יצחק חסידים',
    hint: 'יו״ר האיגוד מגיע במיוחד',
    fields: ['name'],
    // The sender introduces THEMSELVES. `agent` is the signed-in agent, not a
    // fixed name: this text was written by מלאכי, and hardcoding him would have
    // every agent tell the client they are someone else.
    build: ({ name, agent }) =>
      `בוקר טוב ${name || ''} מה שלומך?\n` +
      `זה ${agent || ''} ממכללת R.E.S.\n\n` +
      `רציתי לעדכן אותך ששריינו עבורך פגישה אישית עם יצחק חסידים, ` +
      `יו"ר איגוד הנדל"ן והבעלים של קבוצת RES ומכללת RES.\n\n` +
      `יצחק כמעט שלא מקיים פגישות אישיות בגלל לוח הזמנים העמוס שלו, ` +
      `ולכן זו באמת הזדמנות מיוחדת להכיר אותו ולשמוע ממנו באופן אישי.\n\n` +
      `הוא מגיע במיוחד למשרדים, אז אני ממש מבקש לעשות השתדלות להגיע בזמן ולא לאחר.\n\n` +
      `בהמשך אתקשר אליך כדי לעזור עם החניה ולוודא שהכול מסודר לקראת ההגעה.\n\n` +
      `נתראה ובהצלחה😃`,
  },
  {
    key: 'followup',
    title: 'פולואפ אחרי פגישה',
    hint: 'המשך תהליך אחרי מפגש',
    fields: ['name'],
    build: ({ name }) =>
      `שלום ${name || ''}, היה נעים להיפגש! 🙏\n` +
      `רציתי לוודא שקיבלת את כל מה שצריך ולראות איך אפשר להתקדם.\n` +
      `מוזמן/ת לחזור אליי בכל שאלה.\n\n${SIGN}`,
  },
  {
    key: 'reschedule',
    title: 'תיאום מחדש',
    hint: 'ללקוח שלא הגיע',
    fields: ['name', 'date'],
    build: ({ name, date }) =>
      `היי ${name || ''}, חבל שלא הצלחנו להיפגש ב־${prettyDate(date)}.\n` +
      `נשמח למצוא מועד חדש שנוח לך — מתי מתאים?\n\n${SIGN}`,
  },
]
