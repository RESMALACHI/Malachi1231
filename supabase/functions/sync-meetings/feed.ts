// iCal fetching + parsing + agent classification for sync-meetings.
// Extracted VERBATIM from calendar-feed/index.ts — the two must classify
// events identically, or the server sync and a manual client sync would
// disagree about which agent owns a meeting.

/** Unfold RFC-5545 folded lines (continuation lines start with space/tab). */
function unfold(text: string): string[] {
  const raw = text.split(/\r?\n/)
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

interface PropLine {
  name: string
  params: Record<string, string>
  value: string
}

function parseLine(line: string): PropLine | null {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const segs = left.split(';')
  const name = segs[0].toUpperCase()
  const params: Record<string, string> = {}
  for (let i = 1; i < segs.length; i++) {
    const eq = segs[i].indexOf('=')
    if (eq !== -1) params[segs[i].slice(0, eq).toUpperCase()] = segs[i].slice(eq + 1)
  }
  return { name, params, value }
}

function unescapeText(t: string): string {
  return t
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour === 24 ? 0 : map.hour,
    map.minute,
    map.second
  )
  return asUTC - date.getTime()
}

/** Convert a wall-clock time in `tz` to the corresponding UTC Date. */
function wallTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const offset = tzOffsetMs(tz, new Date(guess))
  return new Date(guess - offset)
}

const DEFAULT_TZ = 'Asia/Jerusalem'

/** Parse an iCal date/date-time value into a UTC Date. */
function parseIcsDate(value: string, params: Record<string, string>): Date | null {
  const v = value.trim()
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, hh, mi, ss, z] = m
  const Y = +y, Mo = +mo, D = +d
  if (hh === undefined) {
    return wallTimeToUtc(Y, Mo, D, 0, 0, 0, DEFAULT_TZ)
  }
  const H = +hh, Mi = +mi, S = +ss
  if (z === 'Z') return new Date(Date.UTC(Y, Mo - 1, D, H, Mi, S))
  const tz = params.TZID || DEFAULT_TZ
  return wallTimeToUtc(Y, Mo, D, H, Mi, S, tz)
}

interface RawEvent {
  uid: string
  summary: string
  description: string
  location: string
  organizer: string
  attendees: string[]
  start: Date | null
  allDay: boolean
  rrule: Record<string, string> | null
  exdates: number[]
  created: Date | null
}

function parseEvents(ics: string): RawEvent[] {
  const lines = unfold(ics)
  const events: RawEvent[] = []
  let cur: RawEvent | null = null

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = {
        uid: '',
        summary: '',
        description: '',
        location: '',
        organizer: '',
        attendees: [],
        start: null,
        allDay: false,
        rrule: null,
        exdates: [],
        created: null,
      }
      continue
    }
    if (line.startsWith('END:VEVENT')) {
      if (cur) events.push(cur)
      cur = null
      continue
    }
    if (!cur) continue

    const p = parseLine(line)
    if (!p) continue

    switch (p.name) {
      case 'UID':
        cur.uid = p.value.trim()
        break
      case 'SUMMARY':
        cur.summary = unescapeText(p.value)
        break
      case 'DESCRIPTION':
        cur.description = unescapeText(p.value)
        break
      case 'LOCATION':
        cur.location = unescapeText(p.value)
        break
      case 'ORGANIZER':
        cur.organizer = `${p.params.CN || ''} ${p.value.replace(/^mailto:/i, '')}`.trim()
        break
      case 'ATTENDEE':
        cur.attendees.push(
          `${p.params.CN || ''} ${p.value.replace(/^mailto:/i, '')}`.trim()
        )
        break
      case 'CREATED':
        cur.created = parseIcsDate(p.value, p.params)
        break
      case 'DTSTART':
        cur.start = parseIcsDate(p.value, p.params)
        cur.allDay = p.params.VALUE === 'DATE' || /^\d{8}$/.test(p.value.trim())
        break
      case 'RRULE': {
        const rule: Record<string, string> = {}
        for (const part of p.value.split(';')) {
          const eq = part.indexOf('=')
          if (eq !== -1) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
        }
        cur.rrule = rule
        break
      }
      case 'EXDATE': {
        for (const piece of p.value.split(',')) {
          const dt = parseIcsDate(piece, p.params)
          if (dt) cur.exdates.push(dt.getTime())
        }
        break
      }
    }
  }
  return events
}

// ---------- recurrence expansion (best-effort) ----------

const INV_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function advance(d: Date, freq: string, interval: number): Date {
  const n = new Date(d)
  if (freq === 'DAILY') n.setUTCDate(n.getUTCDate() + interval)
  else if (freq === 'WEEKLY') n.setUTCDate(n.getUTCDate() + 7 * interval)
  else if (freq === 'MONTHLY') n.setUTCMonth(n.getUTCMonth() + interval)
  else if (freq === 'YEARLY') n.setUTCFullYear(n.getUTCFullYear() + interval)
  else n.setUTCDate(n.getUTCDate() + interval)
  return n
}

function weekStartUTC(d: Date): Date {
  const n = new Date(d)
  n.setUTCDate(n.getUTCDate() - n.getUTCDay())
  n.setUTCHours(0, 0, 0, 0)
  return n
}

/** Expand a recurring event's start into concrete starts inside [winStart, winEnd]. */
function expandStarts(
  start: Date,
  rule: Record<string, string>,
  exdates: number[],
  winStart: Date,
  winEnd: Date
): Date[] {
  const freq = (rule.FREQ || '').toUpperCase()
  if (!freq) return []
  const interval = Math.max(1, +(rule.INTERVAL || '1'))
  const count = rule.COUNT ? +rule.COUNT : Infinity
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL, {}) : null
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((s) => s.trim().toUpperCase()) : null
  const ex = new Set(exdates)
  const out: Date[] = []
  const MAX = 1500
  let emitted = 0
  let iter = 0

  if (freq === 'WEEKLY' && byday) {
    const baseWeek = weekStartUTC(start)
    let d = new Date(start)
    while (d <= winEnd && emitted < count && iter < MAX) {
      iter++
      if (until && d > until) break
      const weeksSince = Math.floor(
        (weekStartUTC(d).getTime() - baseWeek.getTime()) / (7 * 86400000)
      )
      if (
        weeksSince % interval === 0 &&
        byday.includes(INV_DAY[d.getUTCDay()]) &&
        d >= start
      ) {
        if (!ex.has(d.getTime())) {
          if (d >= winStart && d <= winEnd) out.push(new Date(d))
          emitted++
        }
      }
      d = new Date(d.getTime() + 86400000)
    }
    return out
  }

  let cursor = new Date(start)
  while (cursor <= winEnd && emitted < count && iter < MAX) {
    iter++
    if (until && cursor > until) break
    if (!ex.has(cursor.getTime())) {
      if (cursor >= winStart && cursor <= winEnd) out.push(new Date(cursor))
      emitted++
    }
    cursor = advance(cursor, freq, interval)
  }
  return out
}

// ---------- normalisation ----------

function detectType(
  summary: string,
  description: string,
  location: string
): 'zoom' | 'frontal' | 'unknown' {
  const h = [summary, description, location].filter(Boolean).join(' ').toLowerCase()
  if (/zoom|זום/.test(h)) return 'zoom'
  if (/פרונטלי|רמת גן|צח["״]?ר|חיפה/.test(h)) return 'frontal'
  return 'unknown'
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const WORDCHAR = 'A-Za-z0-9\\u05D0-\\u05EA'

/** Build a whole-word matcher for a needle (which may contain spaces). */
function wholeWordMatcher(needle: string): RegExp {
  return new RegExp(`(?<![${WORDCHAR}])${escapeRegex(needle)}(?![${WORDCHAR}])`, 'u')
}

/**
 * All searchable text of a fragment, normalised + lowercased.
 *
 * Tags become a SPACE, never nothing. Half these descriptions are pasted out of
 * a rich-text editor, so "מרים</p><p>ודיע" is two names — dropping the tag
 * outright would glue them into one word that matches neither.
 */
function flatten(...parts: unknown[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** All searchable text of an event, normalised + lowercased. */
function buildHay(ev: RawEvent): string {
  return flatten(ev.summary, ev.description, ev.location, ev.organizer, ...ev.attendees)
}

function matchesAny(ev: RawEvent, matchers: RegExp[]): boolean {
  if (matchers.length === 0) return false
  const hay = buildHay(ev)
  return matchers.some((re) => re.test(hay))
}

export interface AgentMatcher {
  name: string
  matchers: RegExp[]
}

const normWord = (s: unknown) => String(s).trim().replace(/\s+/g, ' ').toLowerCase()

/** The alias table as matchers. Exported so tests drive the real thing. */
export function buildMatchers(aliases: Record<string, string[]>): AgentMatcher[] {
  return Object.entries(aliases).map(([name, list]) => ({
    name,
    matchers: (Array.isArray(list) ? list : []).map(normWord).filter(Boolean).map(wholeWordMatcher),
  }))
}

// ── Whose meeting is it ──────────────────────────────────────────────────────
//
// TWO PEOPLE ARE NAMED ON NEARLY EVERY MEETING, and they are not
// interchangeable:
//
//   מתאם / מנהל(ת) הפגישה   booked it. This is the person it belongs to.
//   מבצע / יועץ(ת) הפגישה   sits with the client. Never credited for it.
//
// The old rule ignored that completely: it searched the whole event for any
// agent's name and returned the first one found IN THE ORDER THE ALIAS TABLE
// HAPPENED TO BE WRITTEN. So a meeting מרים booked and ודיע ran was filed under
// ודיע — not because anything in the event said so, but because 'ודיע' is
// written above 'מרים' in that object. מרים is written last, so she lost every
// meeting she shared with anyone, every time, silently. Attendance drives pay,
// which makes a silent wrong owner the most expensive bug in this file.
//
// So: find every name, ask what word introduces it, and let the roles decide.

// ONLY EXPLICIT LABELS COUNT. Both of these fire on a written role marker
// standing immediately before a name — "מתאם הפגישה: מרים", "מנהלת פגישה :
// מרים" — and on nothing else.
//
// Descriptive words were tried and taken back out. "פגישת ייעוץ ודיע" reads
// like it marks ודיע as the performer, and usually does, but the notes also
// say "מרים תבצע את הפגישה" and "בזום עם מרים" — where the same reasoning
// picks the performer and calls them the owner. A rule that is right about a
// convention and wrong about a sentence is not worth the meetings it moves.

/** "the name after me BOOKED this". "מנלת" is a typo the calendars contain. */
const COORD_MARK = /(?:מתאמ?ת?|מתאם|מנהלת?|מנלת)\s*(?:ה?פגיש\S*)?\s*[:\-–]?\s*$/u
/** "the name after me RAN this" — the bot's own field, never a hand-typed word. */
const PERF_MARK = /(?:מבצעת?)\s*(?:ה?פגיש\S*)?\s*[:\-–]?\s*$/u

type Role = 'coordinator' | 'performer' | 'plain'

interface Mention {
  agent: string
  at: number
  role: Role
  inTitle: boolean
}

/** What introduces a name, judged from the words immediately before it. */
function roleOf(before: string): Role {
  if (COORD_MARK.test(before)) return 'coordinator'
  if (PERF_MARK.test(before)) return 'performer'
  return 'plain'
}

/** Every place an agent is named in one piece of text, with its role. */
function mentionsIn(text: string, agents: AgentMatcher[], inTitle: boolean): Mention[] {
  const found: Mention[] = []
  for (const a of agents) {
    for (const re of a.matchers) {
      const scan = new RegExp(re.source, 'gu')
      let m: RegExpExecArray | null
      while ((m = scan.exec(text)) !== null) {
        // Long enough to hold "מנהלת פגישה : ", short enough that a label two
        // clauses back cannot reach forward and mislabel an unrelated name.
        const before = text.slice(Math.max(0, m.index - 24), m.index)
        found.push({ agent: a.name, at: m.index, role: roleOf(before), inTitle })
        if (m.index === scan.lastIndex) scan.lastIndex++
      }
    }
  }
  return found
}

/** Title first, then earliest — "פגישת זום - <לקוח> - <מתאם>" puts the owner
 *  in the title, so a name there outranks one buried in the notes. */
const firstOf = (ms: Mention[]) =>
  ms.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || a.at - b.at)[0].agent

/**
 * The agent a meeting belongs to, or null if nobody is named at all.
 *
 * Three tiers, and the order between them is the whole fix.
 */
export function classifyAgent(ev: RawEvent, agents: AgentMatcher[]): string | null {
  const title = flatten(ev.summary)
  const rest = flatten(ev.description, ev.location, ev.organizer, ...ev.attendees)
  const all = [...mentionsIn(title, agents, true), ...mentionsIn(rest, agents, false)]
  if (all.length === 0) return null

  // 1. Somebody is labelled as having BOOKED it. Nothing outweighs that — this
  //    is the tier the whole bug lived in, and it now runs before the others
  //    instead of never running at all.
  const booked = all.filter((m) => m.role === 'coordinator')
  if (booked.length) return firstOf(booked)

  // 2. No label anywhere. Then an unlabelled name beats one that is explicitly
  //    only the performer: "מבצע הפגישה: ודיע" next to a plain "מרים" is מרים's.
  const plain = all.filter((m) => m.role === 'plain')
  if (plain.length) return firstOf(plain)

  // 3. The מבצע is the ONLY agent on the whole event. Credit them —
  //    deliberately, and only here. Hundreds of the צח"ר meetings name one
  //    person and no coordinator at all, and emptying those into the Claim Yard
  //    would invent a problem to solve a different one. Tier 1 guarantees a
  //    named מתאם always wins; this tier only says one named person beats none.
  return firstOf(all)
}

/** The calendar's display name (X-WR-CALNAME) from an .ics document. */
function extractCalName(ics: string): string {
  for (const line of unfold(ics)) {
    if (line.toUpperCase().startsWith('X-WR-CALNAME')) {
      const p = parseLine(line)
      if (p?.value) return p.value.trim()
    }
  }
  return ''
}

/** Fallback source label: the account email embedded in the iCal URL. */
function emailFromIcalUrl(url: string): string {
  const m = url.match(/\/ical\/([^/]+)\//)
  if (!m) return 'יומן'
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

export interface NormEvent {
  google_event_id: string
  title: string
  meeting_date: string
  type: 'zoom' | 'frontal' | 'unknown'
  description: string
  location: string
  source: string
  agent_name: string | null
  event_created_at: string | null
}

/**
 * Fetch every feed, parse, classify per agent, expand recurrences — the
 * classify-all mode of calendar-feed, as a callable. `failed` lists feeds that
 * did not answer; when non-empty the event set is PARTIAL and the caller must
 * not treat "missing" as "deleted".
 */
export async function fetchWindowEvents(
  feeds: string[],
  timeMin: Date,
  timeMax: Date,
  agentAliases: Record<string, string[]>,
  ignoreWords: string[]
): Promise<{ events: NormEvent[]; failed: string[] }> {
  const agentMatchers = buildMatchers(agentAliases)
  const ignoreMatchers = ignoreWords.map(normWord).filter(Boolean).map(wholeWordMatcher)

  const byId = new Map<string, NormEvent>()
  const failed: string[] = []

  for (const url of feeds) {
    let ics: string
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      if (!res.ok) {
        console.warn(`[sync-meetings] feed fetch failed (${res.status}): ${url}`)
        failed.push(emailFromIcalUrl(url))
        continue
      }
      ics = await res.text()
    } catch (e) {
      console.warn(`[sync-meetings] feed error: ${String(e)}`)
      failed.push(emailFromIcalUrl(url))
      continue
    }

    const source = extractCalName(ics) || emailFromIcalUrl(url)

    for (const ev of parseEvents(ics)) {
      if (!ev.start) continue
      if (ev.allDay) continue

      const agentName = classifyAgent(ev, agentMatchers) // null ⇒ unassigned
      if (agentName === null && matchesAny(ev, ignoreMatchers)) continue

      const starts: Date[] = ev.rrule
        ? expandStarts(ev.start, ev.rrule, ev.exdates, timeMin, timeMax)
        : ev.start >= timeMin && ev.start < timeMax
          ? [ev.start]
          : []

      for (const s of starts) {
        const isRecurring = !!ev.rrule
        const id = isRecurring ? `${ev.uid}::${s.toISOString()}` : ev.uid
        byId.set(id, {
          google_event_id: id,
          title: ev.summary || '(ללא כותרת)',
          meeting_date: s.toISOString(),
          type: detectType(ev.summary, ev.description, ev.location),
          description: ev.description,
          location: ev.location,
          source,
          agent_name: agentName,
          event_created_at: ev.created ? ev.created.toISOString() : null,
        })
      }
    }
  }

  return { events: [...byId.values()], failed }
}
