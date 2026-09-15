import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapStatus, parseDate, planHistoryImport, rowsToHistory } from './historyImport.js'

// Shaped exactly like iForms' export, including its quirks: no form name on
// waiting rows and drafts, and a number where the client's name should be.
const EXPORT = [
  ['לקוח', 'טופס', 'סטטוס', 'מייל', 'טלפון', 'יוזם', 'נוצר בתאריך', 'נחתם בתאריך'],
  [212598049, null, 'טיוטה שלא נשלחה', 'a@b.co', '0587092473', 'מכללת R.E.S', '15-09-2026', null],
  ['מתן חניה', null, 'ממתין לחתימה', 'm@b.co', '0507888881', 'מכללת R.E.S', '15-09-2026', null],
  ['זין מסאלחה', 'הסכם התקשרות תקנון קורס נדלן בערבית', 'נחתם', '', '0508112377', 'מכללת R.E.S', '14-09-2026', '14-09-2026'],
  ['', null, 'נחתם', '', '', '', '14-09-2026', null],
]

test('iForms statuses map to the app\'s', () => {
  assert.equal(mapStatus('נחתם'), 'signed')
  assert.equal(mapStatus('ממתין לחתימה'), 'imported_waiting')
  assert.equal(mapStatus('טיוטה שלא נשלחה'), 'imported_draft')
  assert.equal(mapStatus('בוטל'), 'cancelled')
})

test('dates in every shape a spreadsheet leaves them', () => {
  assert.equal(parseDate('15-09-2026'), '2026-09-15')
  assert.equal(parseDate('5/9/2026'), '2026-09-05')
  assert.equal(parseDate('15.09.26'), '2026-09-15')
  assert.equal(parseDate('2026-09-15'), '2026-09-15')
  assert.equal(parseDate(new Date(Date.UTC(2026, 8, 15))), '2026-09-15')
  assert.equal(parseDate(46280), '2026-09-15') // Excel serial
  assert.equal(parseDate(null), null)
})

test('the real export: all its rows, quirks included', () => {
  const rows = rowsToHistory(EXPORT)
  assert.equal(rows.length, 3) // the nameless row is dropped
  assert.deepEqual(rows[0], {
    name: '212598049',
    template: '',
    status: 'imported_draft',
    email: 'a@b.co',
    phone: '0587092473',
    initiator: 'מכללת R.E.S',
    created: '2026-09-15',
    signed: null,
  })
  assert.equal(rows[2].status, 'signed')
  assert.equal(rows[2].template, 'הסכם התקשרות תקנון קורס נדלן בערבית')
  assert.equal(rows[2].signed, '2026-09-14')
})

const row = (status, template = '', created = '2026-09-15', phone = '0501234567') => ({
  name: 'דני',
  phone,
  status,
  template,
  created,
})
const have = (id, status, template = '', created = '2026-09-15') => ({ id, ident: '0501234567', created, status, template })

test('first import adds everything — two identical drafts stay two', () => {
  const p = planHistoryImport([row('imported_draft'), row('imported_draft'), row('imported_waiting')], [])
  assert.equal(p.inserts.length, 3)
  assert.equal(p.upgrades.length, 0)
})

test('the same file again changes nothing', () => {
  const file = [row('imported_draft'), row('imported_draft'), row('signed', 'הסכם')]
  const existing = [have('a', 'imported_draft'), have('b', 'imported_draft'), have('c', 'signed', 'הסכם')]
  const p = planHistoryImport(file, existing)
  assert.deepEqual([p.inserts.length, p.upgrades.length, p.unchanged], [0, 0, 3])
})

test('a form waiting last time and signed now is upgraded, not duplicated', () => {
  const p = planHistoryImport([row('signed', 'הסכם')], [have('w1', 'imported_waiting')])
  assert.deepEqual(p.upgrades, [{ id: 'w1', row: row('signed', 'הסכם') }])
  assert.equal(p.inserts.length, 0)
})

test('a waiting row still waiting is not consumed by an unrelated signed form', () => {
  const file = [row('imported_waiting'), row('signed', 'הסכם')]
  const p = planHistoryImport(file, [have('w1', 'imported_waiting')])
  assert.equal(p.upgrades.length, 0)
  assert.equal(p.inserts.length, 1)
  assert.equal(p.inserts[0].status, 'signed')
})

test('different people or days never mix', () => {
  const p = planHistoryImport([row('signed', 'הסכם', '2026-09-16')], [have('w1', 'imported_waiting')])
  assert.equal(p.upgrades.length, 0)
  assert.equal(p.inserts.length, 1)
})

test('a contacts file is refused with a clear message', () => {
  assert.throws(() => rowsToHistory([['שם', 'טלפון'], ['דני', '050']]), /היסטוריית טפסים/)
})
