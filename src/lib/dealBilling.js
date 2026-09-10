// When a deal was actually charged, and therefore which month it belongs to.
//
// A deal used to carry one `collected` number with no date attached. That could
// not express the ordinary case: 1,500 charged when the deal was signed and the
// rest settled the following month. Moving deal_date to the later month erased
// the first month's record entirely; leaving it put the money in the wrong one.
//
// So charges are rows now (deal_payments), each with its own date, and this
// module answers the two questions the deals page asks:
//
//   Is this deal fully charged?
//   If so, in which month did that happen — and is that the month I am looking at?
//
// NOTE: this is about BILLING, not pay. The bonus rules in dealsBonus.js are
// untouched and still read deals.collected, which the app keeps as the cached
// sum of these rows.

const num = (v) => Number(v || 0)

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

  let paid = 0
  let completedOn = null
  for (const p of rows) {
    paid += num(p.amount)
    if (completedOn === null && amount > 0 && paid >= amount) completedOn = p.paid_on
  }

  return {
    paid,
    remaining: Math.max(0, amount - paid),
    complete: amount > 0 && paid >= amount,
    completedOn,
    dealMonth: monthKey(deal?.deal_date),
    creditMonth: completedOn ? monthKey(completedOn) : null,
    payments: rows,
  }
}

/**
 * Where one deal belongs in the month currently on screen.
 *
 *   'billed'   — fully charged, and that happened in THIS month. If it was
 *                signed in an earlier month, `creditedFrom` says which.
 *   'unbilled' — signed this month, still not fully charged. This is the only
 *                section that offers "add a charge".
 *   'moved'    — signed this month but settled in a later one. It stays visible
 *                here, struck through, so the month keeps its record instead of
 *                the deal silently vanishing from it.
 *   'none'     — nothing to do with this month.
 */
export function placeInMonth(deal, payments, viewMonth) {
  const b = billingFor(deal, payments)
  const own = b.dealMonth === viewMonth

  if (b.complete && b.creditMonth === viewMonth) {
    return { ...b, section: 'billed', creditedFrom: own ? null : b.dealMonth }
  }
  if (own && b.complete) return { ...b, section: 'moved' }
  if (own) return { ...b, section: 'unbilled' }
  return { ...b, section: 'none' }
}

/**
 * Split a month's deals into the two sections the page shows, plus the struck
 * ones. Order is preserved from the input, which arrives newest-first.
 */
export function splitByBilling(deals, paymentsByDeal, viewMonth) {
  const billed = []
  const unbilled = []
  const moved = []
  for (const d of deals) {
    const p = placeInMonth(d, paymentsByDeal[d.id] || [], viewMonth)
    const row = { ...d, billing: p }
    if (p.section === 'billed') billed.push(row)
    else if (p.section === 'unbilled') unbilled.push(row)
    else if (p.section === 'moved') moved.push(row)
  }
  return { billed, unbilled, moved }
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
