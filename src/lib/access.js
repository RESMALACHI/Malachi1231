// Who may see what — the pages in the menu and the actions inside them.
//
// Set in ניהול → עמודים והרשאות, stored with the menu settings (app_settings
// key 'nav', field `access`), and read on every device by SettingsContext.
// Every item has a default that is exactly how the app behaved before this
// existed, so nothing changes until the admin changes it.
//
// Two rules hold whatever is saved:
//   • a system admin passes everything except "hidden" — nobody can lock the
//     admin out of the app they administer;
//   • ניהול itself is not here at all: it is the admin's page, always.
//
// Like every role in this app, this decides what the SCREEN offers (see the
// auth model in CLAUDE.md): it is not a database permission.

export const LEVELS = [
  { key: 'everyone', label: 'כולם' },
  { key: 'managers', label: 'מנהלים ומנהלי מערכת' },
  { key: 'admins', label: 'מנהלי מערכת בלבד' },
  { key: 'people', label: 'אנשים מסוימים' },
  { key: 'nobody', label: 'מוסתר מכולם' },
]
const LEVEL_KEYS = LEVELS.map((l) => l.key)

/** The pages of the menu. `key` is the one the old "hidden" list used. */
export const PAGE_ITEMS = [
  { key: 'today', label: 'היום שלי', def: 'everyone' },
  { key: 'speech', label: 'ספיץ (תסריט שיחה)', def: 'everyone' },
  { key: 'leads', label: 'לידים', def: 'everyone' },
  { key: 'claim-yard', label: 'פגישות אבודות', def: 'everyone' },
  { key: 'tasks', label: 'משימות', def: 'everyone' },
  { key: 'day-summary', label: 'סיכום יום', def: 'everyone' },
  { key: 'agents-daily', label: 'דוח יומי של כל הסוכנים', def: 'managers' },
  { key: 'reports', label: 'דוחות', def: 'everyone' },
  { key: 'training', label: 'זירת אימון', def: 'everyone' },
  { key: 'objections', label: 'ספריית התנגדויות', def: 'everyone' },
  { key: 'assistant', label: 'עוזר AI', def: 'everyone' },
  { key: 'info', label: 'מידע שימושי', def: 'everyone' },
  // Key kept from the old "לקוחות" page, so a choice made about it still holds.
  { key: 'clients', label: 'טפסים', def: 'everyone' },
  { key: 'whatsapp', label: 'ווצאפ', def: 'everyone' },
]

/** Actions inside pages. Hiding is for pages; an action is someone's or not. */
export const ACTION_ITEMS = [
  { key: 'forms.templates', page: 'טפסים', label: 'ניהול טפסים — העלאה ועריכה של הטפסים עצמם', def: 'admins' },
  { key: 'forms.cancel', page: 'טפסים', label: 'ביטול ומחיקה של טפסים שנשלחו', def: 'admins' },
  { key: 'forms.contacts', page: 'טפסים', label: 'עריכה ומחיקה של אנשי קשר', def: 'admins' },
  { key: 'forms.transfer', page: 'טפסים', label: 'ייבוא וייצוא לאקסל', def: 'admins' },
  { key: 'whatsapp.ads', page: 'ווצאפ', label: 'הלשונית "פרסומות"', def: 'admins' },
]

const ITEMS = Object.fromEntries([...PAGE_ITEMS, ...ACTION_ITEMS].map((i) => [i.key, i]))
export const isAction = (key) => ACTION_ITEMS.some((a) => a.key === key)

/**
 * The rule in force for one item: what was saved, else the old "hidden" list
 * (pages switched off before this existed), else the item's default. An item
 * nobody knows about is for admins — the safe way to be wrong.
 */
export function ruleFor(key, access = {}, hiddenPages = []) {
  const saved = access?.[key]
  if (saved && LEVEL_KEYS.includes(saved.level) && !(saved.level === 'nobody' && isAction(key))) {
    return { level: saved.level, people: Array.isArray(saved.people) ? saved.people : [] }
  }
  if (!isAction(key) && hiddenPages.includes(key)) return { level: 'nobody', people: [] }
  return { level: ITEMS[key]?.def || 'admins', people: [] }
}

/** Does this person pass this rule? */
export function decide(rule, { name, isAdmin = false, isManager = false }) {
  if (rule.level === 'nobody') return false
  if (isAdmin) return true
  if (rule.level === 'everyone') return true
  if (rule.level === 'managers') return isManager
  if (rule.level === 'people') return rule.people.includes(name)
  return false
}

/** The pages switched off for everyone — still written, for anything reading the old list. */
export const hiddenFrom = (access = {}) =>
  PAGE_ITEMS.filter((p) => access?.[p.key]?.level === 'nobody').map((p) => p.key)
