// Making a calendar title readable.
//
// Titles are free text people typed by hand and carry four things mashed
// together: boilerplate ("פגישה פרונטלית"), the client's name, the agent's name
// and a status note ("-אישר", "-בוטל", "ללא מענה"). Rendering that raw gives a
// wall of near-identical strings where the only part anyone cares about — the
// client — sits in the middle.
//
// Mirrors supabase/functions/wa-webhook/agenda.ts, which does the same job for
// the WhatsApp ".היום" command. Keep the two in step.

import { aliasesFor } from './agents'

// Hebrew-aware word boundary, so "עדי" never matches inside "סעדי".
const WORDCHAR = 'A-Za-z0-9\\u05D0-\\u05EA'
const word = (src) => new RegExp(`(?<![${WORDCHAR}])(?:${src})(?![${WORDCHAR}])`, 'u')
const wordG = (src) => new RegExp(`(?<![${WORDCHAR}])(?:${src})(?![${WORDCHAR}])`, 'gu')
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const CONFIRMED = word('אישר|אישרה|אישרו|מאשר|מאשרת|מאשרים')
const CANCELLED = word('בוטל|בוטלה|מבוטל|מבוטלת')
const NO_ANSWER = /ללא מענה|לא ענה|אין מענה|לא עונה/u

/**
 * What the calendar TITLE says about the client's intent, ignoring any outcome
 * that was later recorded: 'confirmed' | 'cancelled' | 'no_answer' | 'none'.
 *
 * Separate from meetingState because the no-show model needs to read the title's
 * signal on meetings that already have an outcome — that is exactly the pairing
 * it learns from.
 */
export function titleSignal(rawTitle) {
  const raw = String(rawTitle || '')
  if (CANCELLED.test(raw)) return 'cancelled'
  if (CONFIRMED.test(raw)) return 'confirmed'
  if (NO_ANSWER.test(raw)) return 'no_answer'
  return 'none'
}

/**
 * The state of a meeting, for a badge.
 *
 * A recorded outcome always beats a note in the title. "אישר" means the client
 * confirmed they would come — NOT that they attended; the two are deliberately
 * kept apart so attendance figures stay honest.
 */
export function meetingState(m) {
  if (m?.status === 'attended') return 'attended'
  if (m?.status === 'no_show') return 'no_show'
  return titleSignal(m?.title)
}

export const STATE_BADGE = {
  attended: { label: 'הגיע', cls: 'bg-green-100 text-green-700' },
  no_show: { label: 'לא הגיע', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'בוטל', cls: 'bg-red-100 text-red-700' },
  confirmed: { label: 'אישר', cls: 'bg-green-50 text-green-700' },
  no_answer: { label: 'ללא מענה', cls: 'bg-amber-100 text-amber-700' },
  none: null,
}

/**
 * Roughly the client's name: the title with the boilerplate, the agent and the
 * status notes taken out.
 *
 * Deliberately conservative — leftover noise is better than eating a real name,
 * so anything unrecognised is kept.
 */
export function clientName(rawTitle, agent) {
  let t = String(rawTitle || '').replace(/\s+/g, ' ').trim()

  t = t.replace(/^פגיש(?:ה|ת)\s*/u, '')
  t = t.replace(wordG('ייעוץ|יעוץ|זום|פרונטלית|פרונטלי|יועצת|יועץ|עם|מקבל|מקבלת'), ' ')

  if (agent) {
    // Every spelling of the agent, not just the canonical one: old calendar
    // titles still say "וודיע" while the canonical name is now "ודיע", and a
    // whole-word match on the canonical form leaves the old one glued to the
    // client's name.
    const forms = new Set([agent, ...aliasesFor(agent)])
    for (const form of forms) {
      if (!form) continue
      t = t.replace(wordG(escapeRegex(form)), ' ')
      const first = String(form).split(' ')[0]
      if (first && first.length >= 3) t = t.replace(wordG(escapeRegex(first)), ' ')
    }
  }

  t = t.replace(
    wordG('אישר|אישרה|אישרו|מאשר|מאשרת|מאשרים|בוטל|בוטלה|מבוטל|מבוטלת|הגעה'),
    ' '
  )
  t = t.replace(/ללא מענה|לא ענה|אין מענה|לא עונה/gu, ' ')
  t = t.replace(wordG('פעמיים|פעמים|הרבה'), ' ')
  t = t.replace(wordG('צחר|צח["״]ר|רמת גן|ר["״]ג|חיפה'), ' ')

  // The phone number is not part of the name. It's surfaced on its own (see
  // clientPhone), and leaving it here made every short label read
  // "דני כהן 0501234567" — the digits crowding out the thing being labelled.
  t = t.replace(/\d[\d\-– ]{7,14}\d/g, ' ')

  t = t
    .replace(/[-–—·|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.!:]+|[\s,.!:]+$/g, '')
    .trim()

  return t || '(ללא פרטים)'
}

/**
 * The client's phone number, as typed into the calendar — or null.
 *
 * Agents write it inconsistently ("0501234567", "050-1234567", and often with
 * the leading zero dropped: "508908066"), so digits are pulled out and
 * normalised to a single 10-digit form. This is what identifies a client across
 * meetings — far more reliable than a name that gets spelled three ways.
 *
 * Anything that isn't an Israeli mobile is ignored, which importantly skips the
 * international-format numbers left behind by WhatsApp @mentions (972…).
 */
export function clientPhone(m) {
  const src = `${m?.title || ''} ${m?.description || ''}`
  for (const raw of src.match(/\d[\d\-– ]{7,14}\d/g) || []) {
    const d = raw.replace(/\D/g, '')
    if (d.length === 10 && d.startsWith('05')) return d
    if (d.length === 9 && d.startsWith('5')) return `0${d}`
  }
  return null
}
