// Which month a deal starts EARNING in, and which side of the page it lands on.
//
// Two rules meet here and they are easy to confuse:
//   a deal is EARNING at ₪3,000 collected — not when it is fully charged;
//   only two deals a month may earn on ₪3,000–5,000, the two that collected
//   most, and the next one has to reach ₪5,000.
//
// Run: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { billingFor, monthKeyOf, splitForMonth } from './dealBilling.js'

const deal = (over = {}) => ({
  id: 'd1',
  amount: 19800,
  deal_date: '2026-08-14',
  kind: 'project',
  ...over,
})
const pay = (amount, paid_on) => ({ amount, paid_on })

const AUG = '2026-08'
const SEP = '2026-09'
/** Enough meetings that the 10-meeting gate is never what a test is measuring. */
const OK = 10

test('monthKeyOf matches how the page tracks the month (0-based)', () => {
  assert.equal(monthKeyOf(2026, 7), '2026-08')
  assert.equal(monthKeyOf(2026, 11), '2026-12')
})

// ── when a deal starts earning ───────────────────────────────────────────────

test('a project starts earning at ₪3,000, long before it is fully charged', () => {
  const b = billingFor(deal(), [pay(3000, '2026-08-20')])
  assert.equal(b.qualifiedOn, '2026-08-20')
  assert.equal(b.creditMonth, AUG)
  assert.equal(b.complete, false, 'still owes 16,800')
  assert.equal(b.remaining, 16800)
})

test('under ₪3,000 it is not earning at all', () => {
  const b = billingFor(deal(), [pay(1500, '2026-08-14')])
  assert.equal(b.qualifiedOn, null)
  assert.equal(b.creditMonth, null)
})

test('the charge that crosses ₪3,000 sets the month, not the one that settles it', () => {
  const b = billingFor(deal(), [pay(1500, '2026-08-14'), pay(1500, '2026-09-03'), pay(16800, '2026-10-01')])
  assert.equal(b.qualifiedOn, '2026-09-03', 'crossed 3,000 in September')
  assert.equal(b.creditMonth, SEP)
  assert.equal(b.completedOn, '2026-10-01', 'settled later, and that is a different date')
})

test('a single course earns from the day it is written, with no collection at all', () => {
  const b = billingFor(deal({ kind: 'course', amount: 1800 }), [])
  assert.equal(b.creditMonth, AUG)
  assert.equal(b.paid, 0)
})

test('payments are summed in DATE order, not the order they were typed', () => {
  const b = billingFor(deal(), [pay(2000, '2026-09-03'), pay(1500, '2026-08-14')])
  assert.equal(b.qualifiedOn, '2026-09-03', '1,500 then 2,000 crosses in September')
})

test('a refund can take a deal back below the floor', () => {
  const b = billingFor(deal(), [pay(3000, '2026-08-05'), pay(-3000, '2026-08-09')])
  assert.equal(b.paid, 0)
  // It crossed on the 5th; the refund does not rewrite that it once did.
  assert.equal(b.qualifiedOn, '2026-08-05')
})

// ── the two sides of the page ────────────────────────────────────────────────

test('THE REPORTED BUG: ₪3,000 on a ₪19,800 deal is EARNING, not "not yet charged"', () => {
  const deals = [deal({ id: 'a', amount: 19800 }), deal({ id: 'b', amount: 14800 })]
  const payments = { a: [pay(3000, '2026-08-06')], b: [pay(3000, '2026-08-26')] }
  const { earning, notEarning } = splitForMonth(deals, payments, AUG, OK)
  assert.deepEqual(earning.map((d) => d.id).sort(), ['a', 'b'])
  assert.equal(notEarning.length, 0)
})

test('only two deals a month may earn on ₪3,000–5,000; the third is told why', () => {
  const deals = [
    deal({ id: 'p1' }),
    deal({ id: 'p2' }),
    deal({ id: 'p3' }),
  ]
  const payments = {
    p1: [pay(4500, '2026-08-03')],
    p2: [pay(4000, '2026-08-04')],
    p3: [pay(3200, '2026-08-05')],
  }
  const { earning, notEarning } = splitForMonth(deals, payments, AUG, OK)
  assert.deepEqual(earning.map((d) => d.id), ['p1', 'p2'], 'the two that collected most')
  assert.deepEqual(notEarning.map((d) => d.id), ['p3'])
  assert.equal(notEarning[0].rejectReason, 'partial_allowance_used')
})

test('past the allowance, ₪5,000 earns where ₪3,200 did not', () => {
  const deals = [deal({ id: 'p1' }), deal({ id: 'p2' }), deal({ id: 'p3' })]
  const payments = {
    p1: [pay(4500, '2026-08-03')],
    p2: [pay(4000, '2026-08-04')],
    p3: [pay(5000, '2026-08-05')],
  }
  const { earning, notEarning } = splitForMonth(deals, payments, AUG, OK)
  assert.ok(earning.map((d) => d.id).includes('p3'), '5,000 always earns')
  assert.equal(notEarning.length, 0)
})

test('below the floor lands on the other side with the reason', () => {
  const { notEarning } = splitForMonth([deal()], { d1: [pay(1500, '2026-08-14')] }, AUG, OK)
  assert.equal(notEarning.length, 1)
  assert.equal(notEarning[0].rejectReason, 'below_minimum')
  assert.equal(notEarning[0].billing.remaining, 18300)
})

test('nothing recorded at all says so, rather than "too little"', () => {
  const d = { ...deal(), collected: null }
  const { notEarning } = splitForMonth([d], {}, AUG, OK)
  assert.equal(notEarning[0].rejectReason, 'missing_collection')
})

// ── crossing months ──────────────────────────────────────────────────────────

test('a deal that only starts earning next month is struck through in this one', () => {
  const payments = { d1: [pay(1500, '2026-08-14'), pay(1500, '2026-09-03')] }
  const aug = splitForMonth([deal()], payments, AUG, OK)
  assert.equal(aug.moved.length, 1, 'still visible in August')
  assert.equal(aug.moved[0].billing.creditMonth, SEP, 'and says where it went')
  assert.equal(aug.earning.length + aug.notEarning.length, 0)

  const sep = splitForMonth([deal()], payments, SEP, OK)
  assert.deepEqual(sep.earning.map((d) => d.id), ['d1'], 'September is credited')
})

test('a deal moved to another month does not use up this month allowance of two', () => {
  const deals = [
    deal({ id: 'p1' }),
    deal({ id: 'p2' }),
    deal({ id: 'gone' }),
    deal({ id: 'p3' }),
  ]
  const payments = {
    p1: [pay(4500, '2026-08-03')],
    p2: [pay(4000, '2026-08-04')],
    gone: [pay(3500, '2026-09-02')], // crosses the floor in September
    p3: [pay(3200, '2026-08-05')],
  }
  const { earning, notEarning, moved } = splitForMonth(deals, payments, AUG, OK)
  assert.deepEqual(moved.map((d) => d.id), ['gone'])
  // p3 is still third among August's own, so it is still short — but the point
  // is that 'gone' took no part in deciding that.
  assert.deepEqual(earning.map((d) => d.id), ['p1', 'p2'])
  assert.deepEqual(notEarning.map((d) => d.id), ['p3'])
})

test('an unrelated month is left out entirely', () => {
  const other = deal({ id: 'x', deal_date: '2026-07-04' })
  const { earning, notEarning, moved } = splitForMonth(
    [other],
    { x: [pay(9000, '2026-07-04')] },
    AUG,
    OK
  )
  assert.equal(earning.length + notEarning.length + moved.length, 0)
})

test('a deal missing from the payments map is unpaid, not a crash', () => {
  const { notEarning } = splitForMonth([deal()], {}, AUG, OK)
  assert.equal(notEarning.length, 1)
  assert.equal(notEarning[0].billing.paid, 0)
})

test('the allowance of two is EACH agent\u2019s own, not the whole office\u2019s', () => {
  // A manager sees everybody at once. Three ₪3,000–5,000 deals, but they belong
  // to two people: nobody has used more than two, so all three earn.
  const deals = [
    deal({ id: 'a1', agent_name: 'ודיע' }),
    deal({ id: 'a2', agent_name: 'ודיע' }),
    deal({ id: 'b1', agent_name: 'מרים' }),
  ]
  const payments = {
    a1: [pay(4500, '2026-08-03')],
    a2: [pay(4000, '2026-08-04')],
    b1: [pay(3200, '2026-08-05')],
  }
  const { earning, notEarning } = splitForMonth(deals, payments, AUG, OK)
  assert.deepEqual(earning.map((d) => d.id).sort(), ['a1', 'a2', 'b1'])
  assert.equal(notEarning.length, 0)
})

test('and one agent\u2019s third such deal is still held back', () => {
  const deals = [
    deal({ id: 'a1', agent_name: 'ודיע' }),
    deal({ id: 'a2', agent_name: 'ודיע' }),
    deal({ id: 'a3', agent_name: 'ודיע' }),
    deal({ id: 'b1', agent_name: 'מרים' }),
  ]
  const payments = {
    a1: [pay(4500, '2026-08-03')],
    a2: [pay(4000, '2026-08-04')],
    a3: [pay(3200, '2026-08-05')],
    b1: [pay(3100, '2026-08-06')],
  }
  const { earning, notEarning } = splitForMonth(deals, payments, AUG, OK)
  assert.deepEqual(earning.map((d) => d.id).sort(), ['a1', 'a2', 'b1'])
  assert.deepEqual(notEarning.map((d) => d.id), ['a3'])
  assert.equal(notEarning[0].rejectReason, 'partial_allowance_used')
})
