// When a deal was actually charged, and therefore which month it belongs to.
//
// A deal used to carry one `collected` number with no date attached. That could
// not express the ordinary case: 1,500 charged when the deal was signed and the
// rest settled the following month. Moving deal_date to the later month erased
// the first month's record entirely; leaving it put the money in the wrong one.
//
// So charges are rows now (deal_payments), each with its own date, and this
// module answers the question the deals page asks:
//
//   In which month did this deal start EARNING — and is that the month I am
//   looking at?
//
// Earning, not "fully charged". Those are different and the difference is the
// whole point: a 19,800 deal with 3,000 collected still owes 16,800 and is
// already earning. The rules for that live in dealsBonus.js and are not
// duplicated here — this module decides WHICH MONTH a deal belongs to and then
// hands the month to calcDealBonus to decide who earns.
//
// The bonus rules themselves are untouched. deals.collected is still what they
// read, and the app keeps it as the cached sum of these rows.

import { QUALIFY_PARTIAL, calcDealBonus } from './dealsBonus.js'

const num = (v) => Number(v || 0)

/**
 * The collection at which a deal can START counting towards the bonus.
 *
 * A project needs ₪3,000 — below that it never counts, and between 3,000 and
 * 5,000 it counts only twice a month (calcDealBonus enforces that part, since
 * it depends on the other deals in the month).
 *
 * A single course earns only once it is collected in FULL, so its floor is its
 * own price — and the month it is credited to is the month it was paid off.
 */
export function qualifyingFloor(deal) {
  return deal?.kind === 'course' ? num(deal?.amount) : QUALIFY_PARTIAL
}

/** 'YYYY-MM' from a date or ISO string. The month is the unit everything here works in. */
export function monthKey(value) {
  const s = String(value || '')
  return s.length >= 7 ? s.slice(0, 7) : ''
}

/** 'YYYY-MM' for a year + 0-based month, matching how the page tracks the view. */
export const monthKeyOf = (year, month) =>
  `${year}-${String(month + 1).padStart(2, '0')}`

/**
 * What has been charged on one deal.
 *
 * `completedOn` is the date of the payment that first brought the running total
 * up to the deal's price — the moment it became fully charged. Everything about
 * which month gets the credit hangs off that one date, so payments are summed
 * in date order rather than the order they were typed in.
 */
export function billingFor(deal, payments = []) {
  const amount = num(deal?.amount)
  const rows = [...payments].sort((a, b) =>
    String(a.paid_on).localeCompare(String(b.paid_on))
  )

  const floor = qualifyingFloor(deal)
  let paid = 0
  let completedOn = null
  // The charge that takes a project over ₪3,000, or a course over its own price.
  // THIS is the date that decides which month is credited.
  let qualifiedOn = floor <= 0 ? deal?.deal_date || null : null

  for (const p of rows) {
    paid += num(p.amount)
    if (qualifiedOn === null && paid >= floor) qualifiedOn = p.paid_on
    if (completedOn === null && amount > 0 && paid >= amount) completedOn = p.paid_on
  }

  return {
    paid,
    remaining: Math.max(0, amount - paid),
    complete: amount > 0 && paid >= amount,
    completedOn,
    qualifiedOn,
    dealMonth: monthKey(deal?.deal_date),
    creditMonth: qualifiedOn ? monthKey(qualifiedOn) : null,
    payments: rows,
  }
}

/** Why a deal is not earning, in the words that say what to do about it. */
export const REJECT_REASON = {
  missing_collection: 'לא נרשמה גבייה',
  below_minimum: 'נגבה פחות מ־3,000 ₪',
  partial_allowance_used:
    'כבר נוצלו החודש 2 עסקאות בטווח 3,000–5,000 ₪ — כדי שזו תזכה צריך לגבות מעל 5,000 ₪',
  course_not_collected: 'קורס בודד מזכה רק בגבייה מלאה',
  above_course_max: 'קורס בודד מזכה עד 6,000 ₪ בלבד',
}

/**
 * The month's deals, split the way the bonus actually sees them.
 *
 * The split is NOT "fully charged or not" — that was the first attempt and it
 * was wrong. A ₪19,800 deal with ₪3,000 collected is still owed ₪16,800 and it
 * IS earning, because ₪3,000 clears the floor. So the decision is handed to
 * calcDealBonus, which owns the real rules including the one no simple test can
 * reproduce: only two deals a month may qualify on ₪3,000–5,000, and they are
 * the two that collected most. The third has to reach ₪5,000.
 *
 *   earning    — counts towards this month's bonus.
 *   notEarning — does not, and carries the reason why.
 *   moved      — signed this month but only started counting in a later one.
 *                Kept visible here, struck through, so the month keeps its
 *                record instead of the deal silently vanishing from it.
 */
export function splitForMonth(deals, paymentsByDeal, viewMonth, attendedMeetings) {
  const mine = []
  const moved = []

  for (const d of deals) {
    const billing = billingFor(d, paymentsByDeal[d.id] || [])
    const row = { ...d, billing }
    if (billing.creditMonth === viewMonth) mine.push(row)
    else if (billing.dealMonth === viewMonth && billing.creditMonth) moved.push(row)
    else if (billing.dealMonth === viewMonth) mine.push(row)
  }

  // Only the deals this month is credited for take part, so a deal that moved
  // to another month cannot use up this month's allowance of two.
  //
  // collected is handed over as the SUM OF THE CHARGES rather than the cached
  // column, so the split can never disagree with the rows it is showing. An
  // empty history stays null, because "nothing recorded yet" and "recorded as
  // zero" are different answers and calcDealBonus reports them differently.
  // PER AGENT. The allowance of two is each agent's own, so a manager looking
  // at everybody must not have one agent's deals crowd out another's.
  const earns = new Set()
  const why = new Map()
  const byAgent = new Map()
  for (const d of mine) {
    const k = d.agent_name || ''
    if (!byAgent.has(k)) byAgent.set(k, [])
    byAgent.get(k).push(d)
  }
  for (const rows of byAgent.values()) {
    const bonus = calcDealBonus(
      rows.map((d) => ({
        ...d,
        collected: d.billing.payments.length ? d.billing.paid : null,
      })),
      attendedMeetings
    )
    for (const d of bonus.qualified) earns.add(d.id)
    for (const c of bonus.courseLines) {
      if (c.eligible) earns.add(c.deal.id)
      else why.set(c.deal.id, c.reason)
    }
    for (const r of bonus.rejected) why.set(r.deal.id, r.reason)
  }

  const earning = []
  const notEarning = []
  for (const row of mine) {
    if (earns.has(row.id)) earning.push(row)
    else notEarning.push({ ...row, rejectReason: why.get(row.id) || null })
  }
  return { earning, notEarning, moved }
}

const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/** 'ספטמבר 2026' from 'YYYY-MM' — for saying which month got the credit. */
export function monthName(key) {
  const [y, m] = String(key || '').split('-')
  const i = Number(m) - 1
  return i >= 0 && i < 12 ? `${HE_MONTHS[i]} ${y}` : key || ''
}
