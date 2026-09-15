import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, rowsToContacts } from './contactImport.js'

test('CSV with a BOM, quotes and a comma inside a cell', () => {
  const rows = parseCsv('﻿שם,טלפון,אימייל\r\n"כהן, דני",0501234567,d@x.co\r\nתמר לוי,0523456789,\r\n')
  assert.deepEqual(rows, [
    ['שם', 'טלפון', 'אימייל'],
    ['כהן, דני', '0501234567', 'd@x.co'],
    ['תמר לוי', '0523456789', ''],
  ])
})

test('semicolon files (Hebrew Excel on some machines) are read too', () => {
  assert.deepEqual(parseCsv('שם;טלפון\nדני;050'), [['שם', 'טלפון'], ['דני', '050']])
})

test('columns are found by header, in any order — iForms export', () => {
  const rows = [
    ['יוצר', 'אימייל', 'טלפון', 'שם'],
    ['מכללת R.E.S', 'tamar@x.co', '0548434133', 'תמר גולדרינגר'],
    ['מכללת R.E.S', '', '0503910936', 'תמר לוי'],
    ['', '', '', ''],
  ]
  assert.deepEqual(rowsToContacts(rows), [
    { name: 'תמר גולדרינגר', phone: '0548434133', email: 'tamar@x.co', createdBy: 'מכללת R.E.S' },
    { name: 'תמר לוי', phone: '0503910936', email: '', createdBy: 'מכללת R.E.S' },
  ])
})

test('no name column is a clear error, not a silent empty import', () => {
  assert.throws(() => rowsToContacts([['טלפון'], ['050']]), /עמודת "שם"/)
})

test('the history export dropped here says where it belongs', () => {
  const head = ['לקוח', 'טופס', 'סטטוס', 'מייל', 'טלפון', 'יוזם', 'נוצר בתאריך', 'נחתם בתאריך']
  assert.throws(() => rowsToContacts([head, ['דני', '', 'נחתם']]), /היסטוריית טפסים/)
})
