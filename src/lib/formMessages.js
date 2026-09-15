// The words טפסים sends clients — set in טפסים → עיצוב הודעות, stored in
// app_settings 'form_messages'. The emails are rendered on the server
// (supabase/functions/form-mail/templates.ts, which holds their defaults); the
// WhatsApp texts are built here, because WhatsApp opens on the agent's device.

export const WA_DEFAULTS = {
  wa_link: 'שלום {שם},\nמצורף לחתימה: {טופס} — מכללת R.E.S.\nלמילוי וחתימה דיגיטלית:\n{קישור}',
  wa_reminder: 'שלום {שם},\nרק מזכירים — {טופס} עדיין ממתין לחתימתך.\nלמילוי וחתימה:\n{קישור}',
}

/** The braces a message can use. `only` limits one to some messages. */
export const PLACEHOLDERS = [
  { key: 'שם', label: 'שם פרטי' },
  { key: 'שם מלא', label: 'שם מלא' },
  { key: 'טופס', label: 'שם הטופס' },
  { key: 'נציג', label: 'הנציג ששלח' },
  { key: 'תאריך', label: 'תאריך החתימה', only: ['copy'] },
  { key: 'קישור', label: 'הקישור לחתימה', only: ['wa_link', 'wa_reminder'] },
]

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || ''

/** Fill {שם}, {טופס}… — an unknown brace stays as it was written. */
export function fillText(text, { name, templateName, initiator, link = '', date = '' } = {}) {
  const values = {
    'שם': firstName(name),
    'שם מלא': String(name || '').trim(),
    'טופס': String(templateName || '').trim(),
    'נציג': String(initiator || '').trim(),
    'תאריך': date,
    'קישור': link,
  }
  return String(text || '').replace(/\{([^{}]{1,20})\}/g, (all, key) => (key in values ? values[key] : all))
}

/**
 * The WhatsApp message for a form: the office's text, or the default. The link
 * is never lost — a text without {קישור} gets it on a line of its own at the end.
 */
export function waText(kind, settings, vars) {
  const own = typeof settings?.[kind] === 'string' ? settings[kind].trim() : ''
  const tpl = own || WA_DEFAULTS[kind] || WA_DEFAULTS.wa_link
  const out = fillText(tpl, vars)
  return tpl.includes('{קישור}') ? out : `${out}\n${vars?.link || ''}`.trim()
}
