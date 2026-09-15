// Contacts from a spreadsheet — above all, iForms' own "ייצוא לאקסל", so the
// office's 3,000 contacts come across in one go.
//
// Columns are found by their HEADER, not their position: iForms, Excel and
// hand-made sheets order them differently, and the header words are reliable
// (שם / טלפון / אימייל / יוצר, or their English forms).

const HEADERS = {
  name: /^(שם|שם מלא|שם הלקוח|איש קשר|name|full ?name)$/i,
  phone: /(טלפון|נייד|פלאפון|סלולרי|phone|mobile|cell)/i,
  email: /(מייל|אימייל|דוא"?ל|e-?mail)/i,
  createdBy: /(יוצר|נוצר ע|created ?by|owner)/i,
}

/** Parse CSV text: quoted cells, doubled quotes, CR/LF, and , ; or tab. */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] || ''
  const delim = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''))
}

/**
 * Rows (first one = headers) → [{ name, phone, email, createdBy }].
 * Throws with a Hebrew message when there is no name column to go on.
 */
export function rowsToContacts(rows) {
  if (!rows.length) return []
  const head = rows[0].map((h) => String(h ?? '').trim())
  const col = {}
  for (const [key, re] of Object.entries(HEADERS)) {
    const i = head.findIndex((h) => re.test(h))
    if (i !== -1) col[key] = i
  }
  if (col.name === undefined) throw new Error('לא נמצאה עמודת "שם" בקובץ')
  const cell = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim())
  return rows
    .slice(1)
    .map((r) => ({ name: cell(r, 'name'), phone: cell(r, 'phone'), email: cell(r, 'email'), createdBy: cell(r, 'createdBy') }))
    .filter((c) => c.name)
}
