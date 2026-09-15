// Form history from iForms' "ייצוא לאקסל" (היסטוריית טפסים).
//
// Its columns: לקוח, טופס, סטטוס, מייל, טלפון, יוזם, נוצר בתאריך, נחתם בתאריך.
// Two quirks of the real export, both handled here:
//   - "טופס" is filled only for SIGNED forms; waiting ones and drafts leave it
//     empty.
//   - "לקוח" is sometimes a number (an ID typed as the name) — kept as text.

const HEADERS = {
  name: /^(לקוח|איש קשר|שם|שם מלא)$/,
  template: /^(טופס|שם הטופס|סוג)$/,
  status: /^סטטוס$/,
  email: /(מייל|אימייל|דוא"?ל)/,
  phone: /(טלפון|נייד)/,
  initiator: /^(יוזם|שולח|נשלח ע)/,
  created: /^(נוצר|תאריך יצירה)/,
  signed: /^נחתם/,
}

/** iForms' wording → this app's statuses. */
export function mapStatus(raw) {
  const s = String(raw || '').trim()
  if (/נחתם/.test(s)) return 'signed'
  if (/טיוטה/.test(s)) return 'imported_draft'
  if (/בוטל/.test(s)) return 'cancelled'
  return 'imported_waiting' // ממתין לחתימה, נשלח, נפתח…
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * A date cell as YYYY-MM-DD, whatever shape the spreadsheet left it in:
 * "15-09-2026" (iForms), 15/09/2026, 15.9.26, 2026-09-15, a Date object, or an
 * Excel serial number.
 */
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${pad(m[2])}-${pad(m[1])}`
  }
  return null
}

/** Who a row is about: the phone when there is one, else the name. */
export const identOf = (phone, name) => {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('972')) d = `0${d.slice(3)}`
  return d || `n:${String(name || '').trim()}`
}

/**
 * What an import should do, given what is already here — so the same export,
 * or next week's, can be imported again without doubling anything.
 *
 * Rows are grouped by person + creation day, then COUNTED per status (and per
 * form, for signed ones): only the difference is added. A form that was waiting
 * at the last import and is signed in this one UPGRADES the waiting row rather
 * than leaving a stale "waiting" beside a new "signed". Counting, not matching,
 * because iForms really does list two identical drafts for one person on one
 * day, and both are real.
 *
 * `existing`: [{ id, ident, created, status, template }] (source 'iforms').
 * Returns { inserts: [fileRow], upgrades: [{ id, row }], unchanged }.
 */
export function planHistoryImport(fileRows, existing) {
  const groups = new Map()
  const group = (key) => {
    if (!groups.has(key)) groups.set(key, { file: [], have: [] })
    return groups.get(key)
  }
  for (const r of fileRows) group(`${identOf(r.phone, r.name)}|${r.created}`).file.push(r)
  for (const e of existing) group(`${e.ident}|${e.created}`).have.push(e)

  const inserts = []
  const upgrades = []
  let unchanged = 0
  const kindOf = (x) => (x.status === 'signed' ? `signed|${x.template || ''}` : x.status)

  for (const { file, have } of groups.values()) {
    const haveBy = new Map()
    for (const e of have) haveBy.set(kindOf(e), [...(haveBy.get(kindOf(e)) || []), e])
    const fileBy = new Map()
    for (const r of file) fileBy.set(kindOf(r), [...(fileBy.get(kindOf(r)) || []), r])

    // Existing open rows that the file no longer lists as open — the ones that
    // may have been signed since.
    const spare = []
    for (const [kind, rows] of haveBy) {
      if (kind.startsWith('signed')) continue
      const stillOpen = (fileBy.get(kind) || []).length
      spare.push(...rows.slice(stillOpen))
    }

    for (const [kind, rows] of fileBy) {
      const already = (haveBy.get(kind) || []).length
      unchanged += Math.min(already, rows.length)
      for (const row of rows.slice(already)) {
        if (row.status === 'signed' && spare.length) upgrades.push({ id: spare.shift().id, row })
        else inserts.push(row)
      }
    }
  }
  return { inserts, upgrades, unchanged }
}

/** Rows (first = headers) → [{ name, template, status, email, phone, initiator, created, signed }]. */
export function rowsToHistory(rows) {
  if (!rows.length) return []
  const head = rows[0].map((h) => String(h ?? '').trim())
  const col = {}
  for (const [key, re] of Object.entries(HEADERS)) {
    const i = head.findIndex((h) => re.test(h))
    if (i !== -1) col[key] = i
  }
  if (col.name === undefined || col.status === undefined) {
    throw new Error('זה לא נראה כמו ייצוא היסטוריית טפסים — חסרות העמודות "לקוח" ו"סטטוס"')
  }
  const cell = (r, k) => (col[k] === undefined ? '' : r[col[k]])
  const text = (r, k) => String(cell(r, k) ?? '').trim()
  return rows
    .slice(1)
    .map((r) => {
      const status = mapStatus(text(r, 'status'))
      return {
        name: text(r, 'name'),
        template: text(r, 'template'),
        status,
        email: text(r, 'email'),
        phone: text(r, 'phone'),
        initiator: text(r, 'initiator'),
        created: parseDate(cell(r, 'created')),
        signed: status === 'signed' ? parseDate(cell(r, 'signed')) : null,
      }
    })
    .filter((r) => r.name && r.created)
}
