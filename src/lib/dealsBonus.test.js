// Tests for the deal-bonus math. This file is real pay: a wrong number here is
// a wrong number on someone's payslip, and the rules are subtle enough that
// reading the code is not the same as knowing what it does.
//
// Run: npm test
//
// dealsBonus.js is pure and imports nothing, so this needs no build step and no
// test framework beyond the one already inside node.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcDealBonus,
  collectionState,
  COLLECTION_BONUS_MIN_SALES,
  MIN_MEETINGS,
} from './dealsBonus.js'

const project = (amount, collected) => ({ kind: 'project', amount, collected })
const course = (amount, collected) => ({ kind: 'course', amount, collected })
/** Enough meetings that the 10-meeting gate is never what a test is measuring. */
const OK = MIN_MEETINGS

test('a project qualifies on what it collected, not what it sold', () => {
  const b = calcDealBonus([project(100000, 5000)], OK)
  assert.equal(b.qualified.length, 1)
  assert.equal(b.qualifiedSales, 100000) // …but its full sale price sets the bracket

  const under = calcDealBonus([project(100000, 2999)], OK)
  assert.equal(under.qualified.length, 0)
  assert.equal(under.rejected[0].reason, 'below_minimum')
})

test('only two part-collected deals a month, and they are the biggest two', () => {
  const b = calcDealBonus(
    [project(10000, 3000), project(20000, 4000), project(30000, 3500)],
    OK
  )
  assert.equal(b.qualified.length, 2)
  assert.deepEqual(
    b.qualified.map((d) => d.collected).sort((x, y) => y - x),
    [4000, 3500]
  )
  assert.equal(b.rejected[0].reason, 'partial_allowance_used')
})

test('a deal with no collection recorded is held back, not rejected outright', () => {
  const b = calcDealBonus([project(50000, null)], OK)
  assert.equal(b.missingCollection.length, 1)
  assert.equal(b.qualified.length, 0)
})

test('the sales bracket pays the highest rate reached', () => {
  assert.equal(calcDealBonus([project(49999, 9000)], OK).salesBonus, 0) // below the table
  assert.equal(calcDealBonus([project(50000, 9000)], OK).salesBonus, 50000 * 0.02)
  assert.equal(calcDealBonus([project(220000, 9000)], OK).salesBonus, 220000 * 0.045)
})

test('single courses are a flat 2%, and only up to ₪6,000', () => {
  assert.equal(calcDealBonus([course(6000, 6000)], OK).coursesBonus, 120)
  assert.equal(calcDealBonus([course(6001, 6001)], OK).coursesBonus, 0)
})

test('a single course earns nothing until it is collected in full', () => {
  assert.equal(calcDealBonus([course(1800, 1800)], OK).coursesBonus, 36, 'paid in full')
  assert.equal(calcDealBonus([course(1800, 1799)], OK).coursesBonus, 0, 'one shekel short')
  assert.equal(calcDealBonus([course(1800, 0)], OK).coursesBonus, 0)
  assert.equal(calcDealBonus([course(1800, null)], OK).coursesBonus, 0, 'nothing recorded')
})

test('a part-paid course is out of the collection base AND its numerator', () => {
  // 90,000 of qualifying projects, plus a 1,800 course that is half paid. The
  // course must not appear on either side, or the rate would be wrong.
  const b = calcDealBonus([project(90000, 90000), course(1800, 900)], OK)
  assert.equal(b.collectionBase, 90000)
  assert.equal(b.collectionCollected, 90000)
})

// ── The collection bonus ────────────────────────────────────────────────────
// collected ÷ (qualifying projects + single courses) × 100.

test('the collection base is qualifying projects plus single courses', () => {
  const b = calcDealBonus(
    [
      project(60000, 50000), // qualifies
      project(40000, 2000), // does not — out of BOTH sides of the fraction
      course(5000, 5000),
    ],
    OK
  )
  assert.equal(b.collectionBase, 65000) // 60,000 + 5,000
  assert.equal(b.collectionCollected, 55000) // 50,000 + 5,000
  assert.equal(b.collectionRate.toFixed(4), (55000 / 65000).toFixed(4))
})

test('a deal that failed to qualify cannot inflate the rate', () => {
  // The unqualified project collected 2,900 — real money, but it belongs to a
  // deal that is not being measured, so it must not appear on top.
  const b = calcDealBonus([project(100000, 60000), project(50000, 2900)], OK)
  assert.equal(b.collectionCollected, 60000)
  assert.equal(b.collectionBase, 100000)
})

test('the rate can never exceed 100%', () => {
  const b = calcDealBonus([project(100000, 100000), course(5000, 5000)], OK)
  assert.equal(b.collectionRate, 1)
})

test('the ₪100,000 unlock is measured on that same base', () => {
  // 90,000 of qualifying projects + 10,000 of courses reaches it exactly…
  const at = calcDealBonus([project(90000, 90000), course(10000, 10000)], OK)
  assert.equal(at.collectionBase, COLLECTION_BONUS_MIN_SALES)
  assert.equal(at.collectionUnlocked, true)
  assert.equal(at.collectionBonus, 2000) // 100% collected

  // …while a big non-qualifying project no longer helps to open it.
  const below = calcDealBonus([project(90000, 90000), project(50000, 100)], OK)
  assert.equal(below.collectionBase, 90000)
  assert.equal(below.collectionUnlocked, false)
  assert.equal(below.collectionBonus, 0)
  assert.equal(below.toCollectionUnlock, 10000)
})

test('the collection brackets pay the highest one reached', () => {
  const rate = (collected) =>
    calcDealBonus([project(200000, collected)], OK).collectionBonus
  assert.equal(rate(119999), 0) // 59.99%
  assert.equal(rate(120000), 1000) // 60%
  assert.equal(rate(140000), 1500) // 70%
  assert.equal(rate(160000), 2000) // 80%
})

test('an empty month divides by nothing rather than producing NaN', () => {
  const b = calcDealBonus([], OK)
  assert.equal(b.collectionRate, 0)
  assert.equal(b.total, 0)
})

// ── The gate ────────────────────────────────────────────────────────────────

test('under ten meetings the month pays nothing, but still shows what it was worth', () => {
  const deals = [project(200000, 160000)]
  const b = calcDealBonus(deals, MIN_MEETINGS - 1)
  assert.equal(b.meetingsOk, false)
  assert.equal(b.total, 0)
  assert.ok(b.gross > 0)
  assert.equal(calcDealBonus(deals, MIN_MEETINGS).total, b.gross)
})

// ── The colour on the row, which must never disagree with the pay ──────────

test('a course is measured against its own price, a project against ₪3,000', () => {
  assert.equal(collectionState(course(1150, 1150)), 'paid')
  assert.equal(collectionState(course(1150, 900)), 'partial')
  assert.equal(collectionState(project(50000, 3000)), 'paid')
  assert.equal(collectionState(project(50000, 2999)), 'partial')
  assert.equal(collectionState(project(50000, 0)), 'unpaid')
  assert.equal(collectionState(project(50000, null)), 'unknown')
})
