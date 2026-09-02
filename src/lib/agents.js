// The agents whose meetings live in the shared calendar feeds. An event is
// assigned to an agent if it contains ANY of that agent's aliases (in the
// title/description/location/attendees). Meetings are stored under the agent's
// canonical name (the AGENTS entry), regardless of which alias matched.
//
// THE ROSTER LIVES IN THE DATABASE (app_settings, key 'roster') so מלאכי can
// add, edit and remove people from the ניהול page. What follows is the BUILT-IN
// roster: the seed the database was filled from, and the fallback the app runs
// on if that fetch ever fails. It is deliberately a complete, working team
// rather than an empty list — a network blip should cost a refresh, not
// everyone's access.
//
// The exported bindings below are `let`, not `const`, and applyRoster() swaps
// them. ES module bindings are live, so every importer sees the roster the
// database returned without any of them changing a line. Rendered components do
// NOT re-render on the swap, which is why the roster is applied before React
// mounts (main.jsx) and an admin edit reloads the page.

/**
 * What a person can do. Each is INDEPENDENT and they stack — ויטלי is an agent
 * who is also a manager, and מלאכי is an agent who also runs the panel.
 *
 * This started as one role per person, which could not say that. The single
 * field is still read (see normaliseRoles) so a roster saved by the old code
 * keeps working.
 */
export const ROLES = {
  agent: {
    label: 'סוכן',
    hint: 'פגישות משלו, סיכום יום, משימות, פגישות אבודות',
  },
  manager: {
    label: 'מנהל',
    hint: 'רואה את הנתונים של כל הסוכנים',
  },
  admin: {
    label: 'מנהל מערכת',
    hint: 'גישה לעמוד הניהול הזה',
  },
}
export const ROLE_KEYS = Object.keys(ROLES)

export const BUILTIN_ROSTER = [
  // Canonical is the single-ו spelling; the double-ו is kept as an alias so a
  // meeting written either way still lands on him.
  { name: 'ודיע', aliases: ['וודיע', 'ודיע'], gender: 'm', arabic: 'وديع', roles: ['agent'], pin: '' },
  { name: 'מרים', aliases: ['מרים', 'מריים', 'מירים'], gender: 'f', arabic: 'مريم', roles: ['agent'], pin: '' },
  { name: 'עדי', aliases: ['עדי בן שטרית', 'עדי'], gender: 'f', arabic: 'عدي', roles: ['agent'], pin: '' },
  // He owns meetings like anyone else AND runs the ניהול page.
  { name: 'מלאכי אזערי', aliases: ['מלאכי אזערי', 'מלאכי'], gender: 'm', arabic: 'ملاخي', roles: ['agent', 'admin'], pin: '0272' },
  // An agent who also sees everyone's numbers.
  { name: 'ויטלי', aliases: ['ויטלי', 'ויטאלי'], gender: 'm', arabic: 'فيتالي', roles: ['agent', 'manager'], pin: '' },
  // FULL NAME ONLY, on purpose — the one agent here whose first name is not
  // his alone. "שליו" is also a CLIENT name in this data: three leads carry it,
  // one of them "שליו רביה אביב" on a meeting of מלאכי's. With the bare name as
  // an alias, any future client called שליו on a meeting written without a
  // "מתאם הפגישה:" line would be read as the agent and take the meeting.
  //
  // The cost is real and accepted: a meeting that says only "שליו" is NOT
  // matched to him. He writes the full name — his first booking through the bot
  // read "מתאם הפגישה: שליו חסידים" — so the cost is close to nothing, and a
  // stolen meeting is not.
  //
  // "שלו" is DELIBERATELY not an alias either. It is the Hebrew for "his" and
  // appears in almost every description ("החבר שלו", "הליד שלו").
  { name: 'שליו', aliases: ['שליו חסידים'], gender: 'm', arabic: 'شاليف', roles: ['agent'], pin: '' },
  // The company MANAGER, and ONLY that — he owns no meetings, so selecting him
  // shows the aggregate calendar instead of a personal one. No aliases, because
  // he is not a classification target.
  { name: 'איציק', aliases: [], gender: 'm', arabic: 'يتسحاق', roles: ['manager'], pin: '' },
]

/** The roster in force right now. Swapped by applyRoster(). */
let ROSTER = BUILTIN_ROSTER

/**
 * Whatever the stored entry says → a clean list of roles.
 *
 * The old shape was a single `role` string, and its meaning was not quite its
 * name: 'admin' described מלאכי, who has always owned meetings too. Reading it
 * as ['agent','admin'] is what keeps a roster written by the previous version
 * behaving the way it did.
 */
function normaliseRoles(entry) {
  const raw = Array.isArray(entry?.roles) ? entry.roles : entry?.role ? [entry.role] : []
  const set = new Set(raw.map((r) => String(r || '').trim()).filter((r) => r in ROLES))

  if (!Array.isArray(entry?.roles) && entry?.role === 'admin') set.add('agent')
  // Someone with no role at all is an agent — that is what a person added to
  // this list is, unless it says otherwise.
  if (set.size === 0) set.add('agent')
  return ROLE_KEYS.filter((k) => set.has(k))
}

// ── Everything below is derived from ROSTER ──────────────────────────────────

export let AGENTS = []
export let AGENT_ALIASES = {}
export let REAL_AGENTS = []
export let DEFAULT_AGENT = ''
export let ADMIN_AGENT = ''
export let MANAGER_AGENT = ''
let ROLES_BY_NAME = {}
let PIN_BY_NAME = {}
let AGENT_GENDER = {}
let ARABIC_NAME = {}

/**
 * Recompute the derived tables from ROSTER.
 *
 * ADMIN_AGENT and MANAGER_AGENT survive as single names because two screens
 * still need one: the welcome screen's manager card, and the fallback when a
 * roster names no admin at all. Every permission CHECK goes through the
 * predicates below instead, so a second manager is a roster edit, not a patch.
 */
function derive() {
  AGENTS = ROSTER.map((a) => a.name)
  ROLES_BY_NAME = Object.fromEntries(ROSTER.map((a) => [a.name, a.roles]))
  PIN_BY_NAME = Object.fromEntries(ROSTER.map((a) => [a.name, a.pin || '']))
  // Classification targets only — a manager-only person owns no meetings, and
  // a meeting filed on them shows in NOBODY's calendar (learned the hard way:
  // "מבצע הפגישה: איציק חסידים" swallowed a meeting whole). This map feeds the
  // calendar-feed classifier via syncService; sync-meetings applies the same
  // roles filter server-side. aliasesFor() still answers for managers via its
  // [name] fallback, which only ever READS meetings.
  AGENT_ALIASES = Object.fromEntries(
    ROSTER.filter((a) => a.roles.includes('agent')).map((a) => [
      a.name,
      Array.isArray(a.aliases) && a.aliases.length ? a.aliases : [a.name],
    ])
  )
  AGENT_GENDER = Object.fromEntries(ROSTER.map((a) => [a.name, a.gender === 'f' ? 'f' : 'm']))
  ARABIC_NAME = Object.fromEntries(ROSTER.filter((a) => a.arabic).map((a) => [a.name, a.arabic]))

  REAL_AGENTS = ROSTER.filter((a) => a.roles.includes('agent')).map((a) => a.name)
  // The welcome screen's crown belongs to a manager who is ONLY a manager;
  // an agent who also manages enters as themselves.
  MANAGER_AGENT =
    ROSTER.find((a) => a.roles.includes('manager') && !a.roles.includes('agent'))?.name || ''
  ADMIN_AGENT = ROSTER.find((a) => a.roles.includes('admin'))?.name || REAL_AGENTS[0] || AGENTS[0] || ''
  DEFAULT_AGENT = ADMIN_AGENT || REAL_AGENTS[0] || AGENTS[0] || ''
}
derive()

/**
 * Validate and install a roster loaded from the database.
 *
 * Returns false and changes nothing when the payload is unusable — an empty
 * roster, or one with nobody who owns meetings, would sign everyone out of an
 * app whose whole identity model is "pick your name from the list". The
 * built-in roster stays in force instead.
 */
export function applyRoster(list) {
  if (!Array.isArray(list) || list.length === 0) return false

  const clean = list
    .map((a) => ({
      name: String(a?.name || '').trim(),
      aliases: (Array.isArray(a?.aliases) ? a.aliases : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean),
      gender: a?.gender === 'f' ? 'f' : 'm',
      arabic: String(a?.arabic || '').trim(),
      roles: normaliseRoles(a),
      // Digits only, and only a real 4-digit code counts. Anything else is
      // "no PIN" — a half-typed one must not become a lock nobody can open.
      pin: /^\d{4}$/.test(String(a?.pin || '')) ? String(a.pin) : '',
    }))
    .filter((a) => a.name)

  if (clean.length === 0) return false
  if (!clean.some((a) => a.roles.includes('agent'))) return false

  ROSTER = clean
  derive()
  return true
}

/** The roster as stored — what the ניהול page edits. */
export function currentRoster() {
  return ROSTER.map((a) => ({ ...a, aliases: [...a.aliases], roles: [...a.roles] }))
}

/**
 * The code needed to enter this person's profile, or '' for none.
 *
 * It used to be two constants baked into the bundle — 0000 for the manager and
 * 0272 for the control panel — so "who needs a code" was a release, not a
 * setting. It is a property of the person now, and an empty one means the
 * profile opens straight away.
 */
export function pinFor(name) {
  return PIN_BY_NAME[name] || ''
}

/** Does entering this profile ask for anything? */
export const needsPin = (name) => pinFor(name).length === 4

/** Does this person hold this role? */
export function hasRole(name, role) {
  return (ROLES_BY_NAME[name] || []).includes(role)
}

/** The roles a person holds, in a stable order. */
export function rolesOf(name) {
  return ROLES_BY_NAME[name] || []
}

/** May open the ניהול page. */
export const isAdminAgent = (name) => hasRole(name, 'admin')

/** May see everyone's numbers — the manager pages and the all-agents reports. */
export const isManagerAgent = (name) => hasRole(name, 'manager')

/** Owns meetings: has a calendar, a day summary, tasks, a claim yard. */
export const isFieldAgent = (name) => hasRole(name, 'agent')

/**
 * Shows the AGGREGATE view instead of a personal one.
 *
 * This is the distinction that multi-role exists for. איציק manages and nothing
 * else, so his dashboard is everyone's meetings. ויטלי manages AND sells, so his
 * dashboard stays his own — the manager role adds pages to it rather than
 * replacing it. Reading "is a manager" as "has no meetings of their own" is
 * what would quietly empty his calendar.
 */
export const managerViewOnly = (name) => isManagerAgent(name) && !isFieldAgent(name)

// Words that mark an unassigned event as "not a lost meeting" — e.g. people who
// aren't agents. Whole-word matched. Such events are skipped entirely.
export const IGNORE_WORDS = ['רן']

/** Aliases to match for an agent (falls back to the name itself). */
export function aliasesFor(name) {
  return AGENT_ALIASES[name] || [name]
}

// Grammatical gender, used by the ספיץ to inflect the script: Hebrew has no
// neutral way to say "מדבר", so a script written for one gender reads wrong in
// half the team's mouths. 'f' = female, anything else = male.
/** 'f' or 'm' for an agent — male when unknown, which is the safer default
 *  for a name we have never seen (it is also what Hebrew falls back to). */
export function genderOf(name) {
  return AGENT_GENDER[name] === 'f' ? 'f' : 'm'
}

// How each agent's name is written in Arabic. Transliterated as pronounced, not
// translated — on an Arabic call the agent still says their own name. Without
// this the Arabic ספיץ reads "معك עדי", Hebrew letters mid-sentence.
/** The name an agent introduces themselves by on the phone — first name only,
 *  because "מדבר מלאכי אזערי" is not how anyone opens a call. Pass a language
 *  to get the name in that script. */
export function callingName(name, lang = 'he') {
  if (lang === 'ar' && ARABIC_NAME[name]) return ARABIC_NAME[name]
  return String(name || '').trim().split(/\s+/)[0] || ''
}
