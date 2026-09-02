// Builds the ".היום" / ".מחר" agenda message for the WhatsApp group.
//
// Read-only: it never creates, edits or deletes anything. Meetings are grouped
// by type (זום / פרונטלי) and listed in time order inside each group.
//
// Calendar titles are free text people typed by hand, e.g.
//   "פגישת זום שושן- יועצת עדי -אישרה"
//   "פגישת ייעוץ ודיע - תיימור אסעד -צחר-מאשר"
// so the client's name has to be dug out of the boilerplate, the agent's own
// name and the status notes. Whatever survives is shown as-is — over-stripping
// would eat real client names, which is worse than a little leftover noise.

const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const RULE = '━━━━━━━━━━━━━'
const TZ = 'Asia/Jerusalem'

// Hebrew-aware word boundary — the same rule the calendar classifier uses, so
// "עדי" never matches inside "סעדי".
const WORDCHAR = 'A-Za-z0-9\\u05D0-\\u05EA'
/** Non-global matcher — safe for .test() (a /g regex is stateful and would lie). */
function word(src: string): RegExp {
  return new RegExp(`(?<![${WORDCHAR}])(?:${src})(?![${WORDCHAR}])`, 'u')
}
/** Global matcher — for .replace() only. */
function wordG(src: string): RegExp {
  return new RegExp(`(?<![${WORDCHAR}])(?:${src})(?![${WORDCHAR}])`, 'gu')
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Notes agents type into the title. These are the only reliable signals there.
const CONFIRMED = word('אישר|אישרה|אישרו|מאשר|מאשרת|מאשרים')
const CANCELLED = word('בוטל|בוטלה|מבוטל|מבוטלת')
const NO_ANSWER = /ללא מענה|לא ענה|אין מענה|לא עונה/u
// Calendar blocks ("לא לקבוע לאיציק", "תפוס איציק") — holds, not meetings.
const BLOCK = /לא לקבוע|תפוס/u

export interface AgendaRow {
  title: string | null
  meeting_date: string
  type: string | null
  agent_name: string | null
  status: string | null
  location: string | null
}

// ── Israel-local calendar helpers ──

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

/** The UTC instant of local midnight in Israel on the given calendar date. */
function ilMidnightUtc(y: number, mo: number, d: number): Date {
  const guess = Date.UTC(y, mo - 1, d)
  return new Date(guess - tzOffsetMs(TZ, new Date(guess)))
}

/**
 * The Israel-local calendar date `offsetDays` from today. Pure date arithmetic,
 * so it stays correct across the DST switch (when a day isn't 24h long).
 */
export function ilDate(offsetDays: number, now = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, mo, d] = f.format(now).split('-').map(Number)
  const t = new Date(Date.UTC(y, mo - 1, d))
  t.setUTCDate(t.getUTCDate() + offsetDays)
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    dow: t.getUTCDay(),
  }
}

/** The [start, end) UTC window covering that Israel-local day. */
export function ilDayWindow(offsetDays: number, now = new Date()) {
  const a = ilDate(offsetDays, now)
  const b = ilDate(offsetDays + 1, now)
  return { start: ilMidnightUtc(a.y, a.mo, a.d), end: ilMidnightUtc(b.y, b.mo, b.d), date: a }
}

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

// ── Formatting ──

/** Strip boilerplate, the agent's own name and status notes off a title. */
function clientName(raw: string | null, agent: string | null): string {
  let t = String(raw || '').replace(/\s+/g, ' ').trim()

  t = t.replace(/^פגיש(?:ה|ת)\s*/u, '')
  t = t.replace(wordG('ייעוץ|יעוץ|זום|פרונטלית|פרונטלי|יועצת|יועץ|עם|מקבל|מקבלת'), ' ')

  // The agent is shown in its own column — drop it from the name.
  if (agent) {
    t = t.replace(wordG(escapeRegex(agent)), ' ')
    const first = agent.split(' ')[0]
    if (first && first.length >= 3) t = t.replace(wordG(escapeRegex(first)), ' ')
  }

  // Status notes are rendered as a badge instead.
  t = t.replace(wordG('אישר|אישרה|אישרו|מאשר|מאשרת|מאשרים|בוטל|בוטלה|מבוטל|מבוטלת|הגעה'), ' ')
  t = t.replace(/ללא מענה|לא ענה|אין מענה|לא עונה/gu, ' ')
  // The counters people append to those notes ("ללא מענה פעמיים") would
  // otherwise stick to the name and read like a surname.
  t = t.replace(wordG('פעמיים|פעמים|הרבה'), ' ')
  // Branch names live in the location column.
  t = t.replace(wordG('צחר|צח["״]ר|רמת גן|ר["״]ג|חיפה'), ' ')

  t = t
    .replace(/[-–—·|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.!:]+|[\s,.!:]+$/g, '')
    .trim()

  if (!t) return '(ללא פרטים)'
  return t.length > 38 ? `${t.slice(0, 37)}…` : t
}

type State = 'attended' | 'no_show' | 'cancelled' | 'confirmed' | 'no_answer' | 'none'

/**
 * One state per meeting. A recorded outcome always wins over a note someone
 * typed into the title — the badge and the footer counters both read from
 * here, so they can never disagree.
 */
function meetingState(m: AgendaRow): State {
  if (m.status === 'attended') return 'attended'
  if (m.status === 'no_show') return 'no_show'
  const raw = m.title || ''
  if (CANCELLED.test(raw)) return 'cancelled'
  if (CONFIRMED.test(raw)) return 'confirmed'
  if (NO_ANSWER.test(raw)) return 'no_answer'
  return 'none'
}

const BADGE: Record<State, string> = {
  attended: ' ✔️ _הגיע_',
  no_show: ' ✖️ _לא הגיע_',
  cancelled: ' ❌ _בוטל_',
  confirmed: ' ✅ _אישר_',
  no_answer: ' ⚠️ _ללא מענה_',
  none: '',
}

function meetingLine(m: AgendaRow, showLocation: boolean): string {
  const time = timeFmt.format(new Date(m.meeting_date))
  const parts = [`*${time}*`, clientName(m.title, m.agent_name)]
  parts.push(m.agent_name ? `_${m.agent_name}_` : '❗ _לא משויך_')
  if (showLocation && m.location) parts.push(`📍 ${m.location}`)
  return `🕐 ${parts.join(' · ')}${BADGE[meetingState(m)]}`
}

const SECTIONS: { key: string; icon: string; label: string; location: boolean }[] = [
  { key: 'zoom', icon: '🎥', label: 'זום', location: false },
  { key: 'frontal', icon: '🏢', label: 'פרונטלי', location: true },
  { key: 'other', icon: '📋', label: 'ללא סוג', location: true },
]

/**
 * Render the agenda. Pure — takes rows already sorted by meeting_date ascending,
 * so every section keeps chronological order.
 */
export function formatAgenda(
  rows: AgendaRow[],
  offsetDays: number,
  date: { y: number; mo: number; d: number; dow: number }
): string {
  const dayWord = offsetDays === 0 ? 'היום' : 'מחר'
  const dd = String(date.d).padStart(2, '0')
  const mm = String(date.mo).padStart(2, '0')
  const header =
    `📅 *פגישות ${dayWord}*\n` +
    `יום ${HE_WEEKDAYS[date.dow]} · ${dd}/${mm}/${date.y}\n` +
    RULE

  const real = rows.filter((m) => !BLOCK.test(m.title || ''))
  if (real.length === 0) return `${header}\n\n🌴 אין פגישות ${dayWord}.`

  const groups: Record<string, AgendaRow[]> = { zoom: [], frontal: [], other: [] }
  for (const m of real) {
    const k = m.type === 'zoom' ? 'zoom' : m.type === 'frontal' ? 'frontal' : 'other'
    groups[k].push(m)
  }

  const blocks: string[] = []
  for (const s of SECTIONS) {
    const list = groups[s.key]
    if (list.length === 0) continue
    const lines = list.map((m) => meetingLine(m, s.location)).join('\n')
    blocks.push(`${s.icon} *${s.label}* · ${list.length}\n\n${lines}`)
  }

  // Counted from the SAME state the badges render, so the footer can never
  // claim a cancellation that no line shows. Cancelled meetings still appear
  // (so nobody drives to one) but don't count towards the day's workload.
  const states = real.map(meetingState)
  const cancelled = states.filter((s) => s === 'cancelled').length
  const confirmed = states.filter((s) => s === 'confirmed').length
  const active = real.length - cancelled

  const footerBits = [`📊 *סה"כ ${active} ${active === 1 ? 'פגישה' : 'פגישות'}*`]
  if (confirmed > 0) footerBits.push(`✅ ${confirmed} אישרו`)
  if (cancelled > 0) footerBits.push(`❌ ${cancelled} בוטלו`)

  return `${header}\n\n${blocks.join(`\n\n${RULE}\n\n`)}\n\n${RULE}\n${footerBits.join(' · ')}`
}

/** Load the day's meetings and render them. */
export async function buildAgenda(admin: any, offsetDays: number): Promise<string> {
  const { start, end, date } = ilDayWindow(offsetDays)

  const { data, error } = await admin
    .from('meetings')
    .select('title, meeting_date, type, agent_name, status, location')
    .gte('meeting_date', start.toISOString())
    .lt('meeting_date', end.toISOString())
    .order('meeting_date', { ascending: true })

  if (error) {
    console.error('[agenda]', error.message)
    return '⚠️ לא הצלחתי לטעון את הפגישות. נסו שוב בעוד רגע.'
  }
  return formatAgenda((data || []) as AgendaRow[], offsetDays, date)
}
