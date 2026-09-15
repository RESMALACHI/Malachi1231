// The boxes of a form (טפסים) — what they are, who fills them, how a value is
// checked and shown. Pure: the template editor, the agent's filler, the
// client's signing page and the edge function's checks all agree through here.
//
// A field's position is RELATIVE to its page (x, y, w, h in 0..1), so the same
// template draws correctly on a phone, a monitor and the original PDF.

export const FIELD_TYPES = {
  text: { label: 'טקסט', render: 'text' },
  textarea: { label: 'טקסט ארוך', render: 'text' },
  number: { label: 'מספר / סכום', render: 'text' },
  date: { label: 'תאריך', render: 'text' },
  phone: { label: 'טלפון', render: 'text' },
  email: { label: 'מייל', render: 'text' },
  idNumber: { label: 'תעודת זהות', render: 'text' },
  checkbox: { label: 'תיבת סימון', render: 'check' },
  signature: { label: 'חתימה', render: 'image' },
  attachment: { label: 'צירוף קובץ', render: 'none' },
}

/** Who fills a box: the agent before sending, or the client when signing. */
export const FILLERS = {
  client: 'הלקוח',
  sender: 'הנציג (לפני שליחה)',
}

/** Values the system can put in for you. */
export const PREFILLS = {
  '': 'ללא',
  contact_name: 'שם איש הקשר',
  contact_phone: 'טלפון איש הקשר',
  contact_email: 'מייל איש הקשר',
  today: 'תאריך היום',
  agent_name: 'שם הנציג',
}

// Starting sizes as a fraction of an A4 page — roughly one line of text, a
// square box for a tick, room for a real signature.
const DEFAULT_SIZE = {
  text: [0.28, 0.026],
  textarea: [0.6, 0.08],
  number: [0.16, 0.026],
  date: [0.16, 0.026],
  phone: [0.2, 0.026],
  email: [0.3, 0.026],
  idNumber: [0.18, 0.026],
  checkbox: [0.022, 0.016],
  signature: [0.24, 0.06],
  attachment: [0.24, 0.04],
}

let seq = 0
const newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function newField(type, page, x, y) {
  const [w, h] = DEFAULT_SIZE[type] || DEFAULT_SIZE.text
  return {
    id: newId(),
    type,
    page,
    x: clamp01(x - w / 2, 1 - w),
    y: clamp01(y - h / 2, 1 - h),
    w,
    h,
    label: FIELD_TYPES[type]?.label || '',
    filler: 'client',
    required: type !== 'checkbox' && type !== 'attachment',
    prefill: '',
  }
}

const clamp01 = (v, max = 1) => Math.max(0, Math.min(max, v))

/** Keep a moved or resized box on its page. */
export function clampField(f) {
  const w = Math.max(0.01, Math.min(1, f.w))
  const h = Math.max(0.008, Math.min(1, f.h))
  return { ...f, w, h, x: clamp01(f.x, 1 - w), y: clamp01(f.y, 1 - h) }
}

// ── Values ────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0')
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Pre-filled values for a new request, from the contact and the sender. */
export function prefillValues(fields, { contact = {}, agent = '', today = todayISO() } = {}) {
  const out = {}
  for (const f of fields) {
    const v = {
      contact_name: contact.name,
      contact_phone: contact.phone,
      contact_email: contact.email,
      today,
      agent_name: agent,
    }[f.prefill]
    if (v) out[f.id] = v
  }
  return out
}

/**
 * Israeli ID check digit — the same Luhn-style test the Population Registry
 * uses. Shorter numbers are left-padded with zeros, as on the card.
 */
export function isValidIsraeliId(raw) {
  const s = String(raw || '').replace(/\D/g, '')
  if (!s || s.length > 9) return false
  const id = s.padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = Number(id[i]) * ((i % 2) + 1)
    if (d > 9) d -= 9
    sum += d
  }
  return sum % 10 === 0
}

export const isEmpty = (v) => v === undefined || v === null || v === '' || v === false

/** A problem with one value, in Hebrew — or null when it is fine. */
export function valueError(field, value) {
  if (isEmpty(value)) return field.required ? 'שדה חובה' : null
  const s = String(value).trim()
  switch (field.type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? null : 'כתובת מייל לא תקינה'
    case 'phone':
      return /^0\d{8,9}$/.test(s.replace(/[\s-]/g, '')) ? null : 'מספר טלפון לא תקין'
    case 'idNumber':
      return isValidIsraeliId(s) ? null : 'מספר תעודת זהות לא תקין'
    case 'number':
      return /^-?[\d,]+(\.\d+)?$/.test(s.replace(/[₪\s]/g, '')) ? null : 'יש להזין מספר'
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? null : 'תאריך לא תקין'
    default:
      return null
  }
}

/**
 * The fields still in the way of sending (`filler: 'sender'`) or signing (all).
 * Signing needs EVERYTHING required — the agent's boxes too, since a form can be
 * signed on the agent's own device with nothing sent at all.
 */
export function blockingFields(fields, values, filler = null) {
  return fields.filter((f) => {
    if (filler && f.filler !== filler) return false
    return valueError(f, values[f.id]) !== null
  })
}

/** How a value reads inside its box. */
export function displayValue(field, value) {
  if (isEmpty(value)) return ''
  if (field.type === 'date') {
    const [y, m, d] = String(value).split('-')
    return d && m && y ? `${d}/${m}/${y}` : String(value)
  }
  if (field.type === 'checkbox') return value ? '✓' : ''
  if (field.type === 'number') {
    const n = Number(String(value).replace(/[,₪\s]/g, ''))
    return Number.isFinite(n) ? n.toLocaleString('en-US') : String(value)
  }
  return String(value)
}

/** Fields in reading order: page by page, top to bottom, right to left. */
export function readingOrder(fields) {
  return [...fields].sort(
    (a, b) => a.page - b.page || Math.round((a.y - b.y) * 200) || b.x + b.w - (a.x + a.w)
  )
}
