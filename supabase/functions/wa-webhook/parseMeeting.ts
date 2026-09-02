// Parses a WhatsApp ".פגישה" message into a structured meeting, or explains
// exactly what's missing. Pure and dependency-free so it can be unit-tested on
// its own before a single real calendar event is ever created.

export const TRIGGER = '.פגישה'

// Agent aliases — MUST mirror src/lib/agents.js so a bot-created meeting is
// attributed to the same canonical name the calendar classifier would use.
export const AGENT_ALIASES: Record<string, string[]> = {
  'מלאכי אזערי': ['מלאכי אזערי', 'מלאכי'],
  'ודיע': ['וודיע', 'ודיע'],
  'עדי': ['עדי בן שטרית', 'עדי'],
  'מרים': ['מרים', 'מריים', 'מירים'],
  'ויטלי': ['ויטלי', 'ויטאלי'],
  'שליו': ['שליו חסידים'],
}

const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/**
 * Build the Google Calendar event this parsed meeting becomes. The title mirrors
 * the format the calendars already use so the EXISTING classifier assigns it to
 * the מתאם, detects zoom/frontal, and everything flows into the app untouched.
 *
 *   title       "פגישת זום - <שם> - <מתאם>"  /  "פגישה פרונטלית ברמת גן - <שם> - <מתאם>"
 *   description  phone, coordinator, performer, then the free-text notes
 */
export function toCalendarEvent(m: ParsedMeeting) {
  // Title keeps the format the existing classifier reads, so "זום"/"פרונטלי" in
  // it still round-trips to the right type. No branch name in the title.
  const title =
    m.type === 'zoom'
      ? `פגישת זום - ${m.name} - ${m.coordinator}`
      : `פגישה פרונטלית - ${m.name} - ${m.coordinator}`

  // Description = the whole original message (minus ".פגישה"). Falls back to a
  // reconstructed summary only if the raw text somehow wasn't captured.
  const description =
    m.fullMessage ||
    [
      m.phone,
      `מתאם הפגישה: ${m.coordinator}`,
      m.performerRaw ? `מבצע הפגישה: ${m.performerRaw}` : null,
      m.notes ? `\n${m.notes}` : null,
    ]
      .filter(Boolean)
      .join('\n')

  // Which Google account owns it — taken from the explicit "יומן:" field.
  return { title, description, calendar: m.calendar }
}

/** "סוג:" value → meeting type (drives the bonus). */
function parseType(v: string): 'zoom' | 'frontal' | null {
  const n = clean(v).toLowerCase()
  if (/זום|zoom/.test(n)) return 'zoom'
  if (/פרונטל/.test(n)) return 'frontal'
  return null
}

/** "יומן:" value → which Google calendar. Accepts צחר / צח״ר / רמת גן variants. */
function parseCalendar(v: string): 'zahar' | 'ramatgan' | null {
  const n = clean(v)
  if (/צחר|צח["״]ר/.test(n)) return 'zahar'
  if (/רמת[\s-]?גן/.test(n)) return 'ramatgan'
  return null
}

export interface ParsedMeeting {
  ok: boolean
  errors: string[]
  // From the explicit "סוג:" field — drives the bonus (zoom counts as 1/5).
  type: 'zoom' | 'frontal' | null
  typeRaw: string | null
  // From the explicit "יומן:" field — which Google calendar the event goes to.
  calendar: 'zahar' | 'ramatgan' | null
  calendarRaw: string | null
  name: string | null
  phone: string | null // 05XXXXXXXX
  date: string | null // YYYY-MM-DD
  time: string | null // HH:MM
  weekdayText: string | null // the "יום X" the writer typed, if any
  notes: string | null
  // The מתאם (coordinator) BOOKED the meeting and earns the bonus if it shows.
  // Free text: a known agent is canonicalised (so the app attributes + credits
  // them); any other name is kept verbatim (the meeting then syncs in unassigned).
  coordinator: string | null // canonical agent name, or the free text as written
  coordinatorRaw: string | null
  // The מבצע (performer) is whoever sits with the client — often איציק. Kept as
  // information only: it doesn't affect the bonus and can be anyone.
  performerRaw: string | null
  // The original message verbatim, minus the ".פגישה" trigger — used as the
  // calendar event's description so nothing the writer typed is lost.
  fullMessage: string | null
}

/**
 * WhatsApp injects bidi control characters (U+200E..U+200F, U+2066..U+2069)
 * around mixed-direction text — they're invisible but wreck exact matching.
 */
function clean(s: string): string {
  return s.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim()
}

/** Map a written name to its canonical agent, or null if it's nobody we know. */
function toAgent(raw: string): string | null {
  const n = clean(raw).toLowerCase().replace(/\s+/g, ' ')
  for (const [canonical, aliases] of Object.entries(AGENT_ALIASES)) {
    if (aliases.some((a) => n === a.toLowerCase())) return canonical
  }
  // Looser fallback: the alias appears as a whole word inside the value.
  for (const [canonical, aliases] of Object.entries(AGENT_ALIASES)) {
    if (aliases.some((a) => n.includes(a.toLowerCase()))) return canonical
  }
  return null
}

/** First Israeli mobile number in a line → 05XXXXXXXX, else null. */
function grabPhone(s: string): string | null {
  const digits = clean(s).replace(/[^\d]/g, '')
  const m = digits.match(/0?5\d{8}/)
  if (!m) return null
  let d = m[0]
  if (d.length === 9) d = '0' + d // "5XXXXXXXX" → "05XXXXXXXX"
  return d
}

/** "16:00" / "16.00" / "16" → "HH:MM", else null. */
function grabTime(s: string): string | null {
  const m = clean(s).match(/(\d{1,2})[:.](\d{2})/)
  if (m) {
    const h = +m[1]
    const mi = +m[2]
    if (h < 24 && mi < 60) return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
  }
  return null
}

/**
 * "יום רביעי 22/07/26" / "22/07" → { date: YYYY-MM-DD, weekdayText }.
 * When no year is written, the CURRENT year is used (a team decision) — "16/07"
 * means 16 July this year, whether it's already passed or not.
 */
function grabDate(
  s: string,
  today: Date
): { date: string | null; weekdayText: string | null } {
  const c = clean(s)
  // Accept the weekday with or without the "יום" prefix ("יום חמישי" or "חמישי").
  const wdMatch = c.match(/(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/)
  const weekdayText = wdMatch ? wdMatch[1] : null

  const dm = c.match(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/)
  if (!dm) return { date: null, weekdayText }

  const day = +dm[1]
  const mon = +dm[2]
  if (day < 1 || day > 31 || mon < 1 || mon > 12) return { date: null, weekdayText }

  // A written year wins; otherwise use the current year as-is (no roll-forward).
  let year = today.getFullYear()
  if (dm[3]) {
    year = +dm[3]
    if (year < 100) year += 2000
  }

  const d = new Date(year, mon - 1, day)
  // Reject impossible dates (e.g. 31/02 rolling into March).
  if (d.getMonth() !== mon - 1 || d.getDate() !== day) return { date: null, weekdayText }

  const iso = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { date: iso, weekdayText }
}

/**
 * Parse a whole ".פגישה" message. `today` is injected (not read from a clock)
 * so the same input always parses the same way in tests.
 */
export function parseMeeting(message: string, today = new Date()): ParsedMeeting {
  const res: ParsedMeeting = {
    ok: false, errors: [], type: null, typeRaw: null, calendar: null,
    calendarRaw: null, name: null, phone: null, date: null,
    time: null, weekdayText: null, notes: null,
    coordinator: null, coordinatorRaw: null, performerRaw: null, fullMessage: null,
  }

  const rawLines = clean(message).split(/\r?\n/).map(clean)

  // The whole message minus the ".פגישה" trigger, kept verbatim for the event
  // description. Preserves the writer's own line breaks and blank lines.
  res.fullMessage =
    rawLines
      .map((l, i) =>
        i === 0 && l.startsWith(TRIGGER) ? l.slice(TRIGGER.length).trim() : l
      )
      .join('\n')
      .trim() || null
  // Drop the trigger and blank lines.
  const lines = rawLines
    .filter((l, i) => !(i === 0 && l.startsWith(TRIGGER)))
    .map((l) => (l.startsWith(TRIGGER) ? l.slice(TRIGGER.length).trim() : l))
    .filter((l) => l.length > 0)

  const noteLines: string[] = []

  for (const line of lines) {
    // Allow an empty value (for example "סוג:"). The previous + quantifier
    // treated that line as a note and later rejected an otherwise valid meeting.
    const labelled = line.match(/^([א-ת'"״\s]+?)\s*[:：]\s*(.*)$/)
    const label = labelled ? clean(labelled[1]) : ''
    const value = labelled ? clean(labelled[2]) : ''

    if (labelled) {
      // Type + calendar now come from explicit fields, not guessed from text.
      if (/סוג/.test(label)) { res.typeRaw = value; res.type = parseType(value); continue }
      if (/יומן/.test(label)) { res.calendarRaw = value; res.calendar = parseCalendar(value); continue }
      if (/שם/.test(label)) { res.name = value; continue }
      if (/טלפון|נייד|פלאפו|מספר/.test(label)) { res.phone = grabPhone(value); continue }
      if (/תאריך/.test(label)) {
        const d = grabDate(value, today)
        res.date = d.date; res.weekdayText = d.weekdayText; continue
      }
      if (/שעה/.test(label)) { res.time = grabTime(value); continue }
      // מבצע: kept as text only — can be anyone (often איציק), no bonus effect.
      if (/מבצע/.test(label)) { res.performerRaw = value; continue }
      // מתאם: the bonus owner. A known agent is canonicalised so the app credits
      // them; any other name is accepted as-is (free text).
      if (/מתאם/.test(label)) { res.coordinatorRaw = value; res.coordinator = toAgent(value) || clean(value); continue }
      // A labelled line we don't recognise still belongs in the notes.
      noteLines.push(line)
      continue
    }

    // Bare lines: a lone phone number, otherwise free-text notes.
    if (!res.phone) {
      const p = grabPhone(line)
      if (p && line.replace(/\D/g, '').length <= 11) { res.phone = p; continue }
    }
    noteLines.push(line)
  }

  res.notes = noteLines.join('\n').trim() || null

  // The weekday may sit on its own line, and may be written without the "יום"
  // prefix (just "חמישי"). Explicit "יום X" is accepted anywhere; a BARE weekday
  // only as its own whole line, so a name or note that merely contains the word
  // is never mistaken for the meeting's day.
  if (!res.weekdayText) {
    const explicit = clean(message).match(/יום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/)
    if (explicit) {
      res.weekdayText = explicit[1]
    } else {
      for (const line of lines) {
        const m = clean(line).match(/^(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/)
        if (m) { res.weekdayText = m[1]; break }
      }
    }
  }

  // ── Validation — say precisely what's missing or wrong. ──
  // "סוג:" — required and must be zoom or frontal.
  if (!res.type) {
    res.errors.push(
      res.typeRaw
        ? `לא זוהה "סוג: ${res.typeRaw}" — כתבו זום או פרונטלי`
        : 'חסר "סוג" (זום / פרונטלי)'
    )
  }
  // "יומן:" — required and must be zahar or ramat-gan.
  if (!res.calendar) {
    res.errors.push(
      res.calendarRaw
        ? `לא זוהה "יומן: ${res.calendarRaw}" — כתבו צחר או רמת גן`
        : 'חסר "יומן" (צחר / רמת גן)'
    )
  }
  if (!res.name) res.errors.push('חסר שם הלקוח')
  if (!res.phone) res.errors.push('חסר מספר טלפון תקין')
  if (!res.date) res.errors.push('חסר תאריך תקין')
  if (!res.time) res.errors.push('חסרה שעה')
  // The מתאם is required (there must be someone to credit) but can be any text:
  // a known agent is credited in the app, any other name just won't auto-attribute
  // (the meeting syncs in as unassigned). The מבצע is informational, never checked.
  if (!res.coordinator) res.errors.push('חסר "מתאם הפגישה"')

  // Cross-check: the written weekday must match the parsed date. A mismatch
  // means a typo somewhere — better to ask than to book the wrong day.
  if (res.date && res.weekdayText) {
    const actual = HE_WEEKDAYS[new Date(res.date + 'T00:00:00').getDay()]
    if (actual !== res.weekdayText) {
      // Show the date the way people write it, not the ISO form.
      const [yy, mm, dd] = res.date.split('-')
      res.errors.push(
        `היום בשבוע לא תואם לתאריך: כתבת "יום ${res.weekdayText}" אבל ${dd}/${mm}/${yy} הוא יום ${actual}`
      )
    }
  }

  res.ok = res.errors.length === 0
  return res
}
