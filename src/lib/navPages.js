// Pages the admin can show/hide from the app's navigation via the control panel.
// `key` matches the value used in the sidebar + the stored "hidden" list.
export const CONTROLLABLE_PAGES = [
  { key: 'day-summary', label: 'סיכום יום' },
  { key: 'speech', label: 'ספיץ (תסריט שיחה)' },
  { key: 'objections', label: 'ספריית התנגדויות' },
  { key: 'agents-daily', label: 'נתונים יומיים (מנהל)' },
  { key: 'info', label: 'מידע שימושי' },
  { key: 'clients', label: 'לקוחות' },
  { key: 'whatsapp', label: 'ווצאפ' },
  { key: 'today', label: 'היום שלי' },
  { key: 'leads', label: 'לידים' },
  { key: 'claim-yard', label: 'פגישות אבודות' },
  { key: 'tasks', label: 'משימות' },
  { key: 'reports', label: 'דוחות' },
  { key: 'assistant', label: 'עוזר AI (מנהלים)' },
]

// The code that opens the ניהול page is no longer a constant: it is the admin's
// own PIN, set per person in that page (see pinFor in lib/agents.js).
