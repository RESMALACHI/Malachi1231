// Which month a deal's charge belongs to.
//
// The case this exists for, in the office's own words: a deal charged 1,500 in
// one month and settled in full the next. Neither month may lose its record.
//
// Run: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { billingFor, monthKeyOf, placeInMonth, splitByBilling } from './dealBilling.js'

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

test('monthKeyOf matches how the page tracks the month (0-based)', () => {
  assert.equal(monthKeyOf(2026, 7), '2026-08')
  assert.equal(monthKeyOf(2026, 11), '2026-12')
})

test('nothing charged yet', () => {
  const b = billingFor(deal(), [])
  assert.equal(b.paid, 0)
  assert.equal(b.remaining, 19800)
  assert.equal(b.complete, false)
  assert.equal(b.creditMonth, null)
})

test('the completing payment is what sets the credit month', () => {
  const b = billingFor(deal(), [pay(1500, '2026-08-14'), pay(18300, '2026-09-03')])
  assert.equal(b.paid, 19800)
  assert.equal(b.complete, true)
  assert.equal(b.completedOn, '2026-09-03', 'the payment that crossed the price')
  assert.equal(b.creditMonth, SEP)
})

test('payments are summed in DATE order, not the order they were typed', () => {
  // The September charge entered first, the August one remembered afterwards.
  const b = billingFor(deal(), [pay(18300, '2026-09-03'), pay(1500, '2026-08-14')])
  assert.equal(b.completedOn, '2026-09-03', 'still September that completed it')
})

// ── The office's case, month by month ────────────────────────────────────────

test('the part-charged month keeps the deal, struck through', () => {
  const p = placeInMonth(deal(), [pay(1500, '2026-08-14'), pay(18300, '2026-09-03')], AUG)
  assert.equal(p.section, 'moved', 'stays visible in August rather than vanishing')
  assert.equal(p.creditMonth, SEP, 'and says where it went')
  assert.equal(p.paid, 19800)
})

test('the settling month gets the credit, and says where it came from', () => {
  const p = placeInMonth(deal(), [pay(1500, '2026-08-14'), pay(18300, '2026-09-03')], SEP)
  assert.equal(p.section, 'billed')
  assert.equal(p.creditedFrom, AUG)
})

test('settled in its own month: billed there, and credited from nowhere', () => {
  const p = placeInMonth(deal(), [pay(19800, '2026-08-20')], AUG)
  assert.equal(p.section, 'billed')
  assert.equal(p.creditedFrom, null)
})

test('still short: it sits in its own month as unbilled', () => {
  const p = placeInMonth(deal(), [pay(1500, '2026-08-14')], AUG)
  assert.equal(p.section, 'unbilled')
  assert.equal(p.remaining, 18300)
})

test('an unpaid deal from another month does not appear in this one', () => {
  assert.equal(placeInMonth(deal(), [pay(1500, '2026-08-14')], SEP).section, 'none')
})

test('several part payments, all inside one month', () => {
  const p = placeInMonth(
    deal(),
    [pay(5000, '2026-08-02'), pay(5000, '2026-08-11'), pay(9800, '2026-08-28')],
    AUG
  )
  assert.equal(p.section, 'billed')
  assert.equal(p.completedOn, '2026-08-28')
})

test('overpaying still completes on the payment that crossed the price', () => {
  const b = billingFor(deal(), [pay(25000, '2026-08-05')])
  assert.equal(b.complete, true)
  assert.equal(b.remaining, 0, 'never negative')
  assert.equal(b.completedOn, '2026-08-05')
})

test('a refund can take a deal back below its price', () => {
  const b = billingFor(deal(), [pay(19800, '2026-08-05'), pay(-19800, '2026-08-09')])
  assert.equal(b.paid, 0)
  assert.equal(b.complete, false, 'no longer fully charged')
})

test('a deal with no price is never "fully charged"', () => {
  const b = billingFor(deal({ amount: 0 }), [pay(500, '2026-08-05')])
  assert.equal(b.complete, false)
})

// ── The page's three lists ───────────────────────────────────────────────────

test('splitByBilling puts each deal in exactly one list', () => {
  const deals = [
    deal({ id: 'settled-here' }),
    deal({ id: 'short' }),
    deal({ id: 'settled-later' }),
    deal({ id: 'other-month', deal_date: '2026-07-04' }),
  ]
  const payments = {
    'settled-here': [pay(19800, '2026-08-20')],
    short: [pay(1500, '2026-08-14')],
    'settled-later': [pay(1500, '2026-08-14'), pay(18300, '2026-09-03')],
    'other-month': [pay(1000, '2026-07-04')],
  }
  const { billed, unbilled, moved } = splitByBilling(deals, payments, AUG)
  assert.deepEqual(billed.map((d) => d.id), ['settled-here'])
  assert.deepEqual(unbilled.map((d) => d.id), ['short'])
  assert.deepEqual(moved.map((d) => d.id), ['settled-later'])
})

test('a deal missing from the payments map is simply unpaid, not a crash', () => {
  const { unbilled } = splitByBilling([deal()], {}, AUG)
  assert.equal(unbilled.length, 1)
  assert.equal(unbilled[0].billing.paid, 0)
})
