import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  newField,
  clampField,
  prefillValues,
  isValidIsraeliId,
  valueError,
  blockingFields,
  displayValue,
  readingOrder,
} from './formFields.js'

test('Israeli ID check digit', () => {
  assert.equal(isValidIsraeliId('000000018'), true)
  assert.equal(isValidIsraeliId('18'), true) // padded like the card
  assert.equal(isValidIsraeliId('123456782'), true)
  assert.equal(isValidIsraeliId('123456789'), false)
  assert.equal(isValidIsraeliId(''), false)
  assert.equal(isValidIsraeliId('1234567890'), false)
})

test('a new field starts on the page, centred on the click', () => {
  const f = newField('text', 0, 0.99, 0.5)
  assert.ok(f.x + f.w <= 1)
  assert.equal(f.page, 0)
  assert.equal(f.filler, 'client')
  assert.equal(f.required, true)
  assert.equal(newField('checkbox', 0, 0.5, 0.5).required, false)
})

test('a dragged field is kept inside its page', () => {
  const f = clampField({ x: 0.95, y: -0.2, w: 0.2, h: 0.05 })
  assert.equal(f.x, 0.8)
  assert.equal(f.y, 0)
})

test('prefill takes the contact, the agent and today', () => {
  const fields = [
    { id: 'a', prefill: 'contact_name' },
    { id: 'b', prefill: 'contact_phone' },
    { id: 'c', prefill: 'today' },
    { id: 'd', prefill: 'agent_name' },
    { id: 'e', prefill: '' },
  ]
  const v = prefillValues(fields, { contact: { name: 'דני', phone: '0501234567' }, agent: 'עדי', today: '2026-09-15' })
  assert.deepEqual(v, { a: 'דני', b: '0501234567', c: '2026-09-15', d: 'עדי' })
})

test('values are checked by type', () => {
  assert.equal(valueError({ type: 'email' }, 'a@b.co'), null)
  assert.equal(valueError({ type: 'email' }, 'a@b'), 'כתובת מייל לא תקינה')
  assert.equal(valueError({ type: 'phone' }, '050-123-4567'), null)
  assert.equal(valueError({ type: 'phone' }, '12345'), 'מספר טלפון לא תקין')
  assert.equal(valueError({ type: 'idNumber' }, '123456782'), null)
  assert.equal(valueError({ type: 'number' }, '₪16,800'), null)
  assert.equal(valueError({ type: 'text', required: true }, ''), 'שדה חובה')
  assert.equal(valueError({ type: 'text', required: false }, ''), null)
  assert.equal(valueError({ type: 'checkbox', required: true }, false), 'שדה חובה')
})

test('what blocks sending is the sender\'s part; signing needs everything', () => {
  const fields = [
    { id: 's', type: 'number', filler: 'sender', required: true },
    { id: 'c', type: 'text', filler: 'client', required: true },
  ]
  assert.deepEqual(blockingFields(fields, {}, 'sender').map((f) => f.id), ['s'])
  assert.deepEqual(blockingFields(fields, { s: '100' }).map((f) => f.id), ['c'])
  assert.equal(blockingFields(fields, { s: '100', c: 'x' }).length, 0)
})

test('display formats dates, amounts and ticks', () => {
  assert.equal(displayValue({ type: 'date' }, '2026-09-15'), '15/09/2026')
  assert.equal(displayValue({ type: 'number' }, '16800'), '16,800')
  assert.equal(displayValue({ type: 'checkbox' }, true), '✓')
  assert.equal(displayValue({ type: 'text' }, ''), '')
})

test('reading order: page, then top to bottom, then right to left', () => {
  const f = (id, page, x, y) => ({ id, page, x, y, w: 0.1 })
  const order = readingOrder([f('p2', 1, 0.5, 0.1), f('left', 0, 0.1, 0.2), f('right', 0, 0.7, 0.2), f('top', 0, 0.4, 0.05)])
  assert.deepEqual(order.map((x) => x.id), ['top', 'right', 'left', 'p2'])
})
