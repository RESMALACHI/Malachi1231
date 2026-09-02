// Deal-bonus rules (RES bonus table). This is real pay, so every rule below is
// literal from the table or from how the team described it — nothing inferred.
//
//   • A deal qualifies on its GVIYA (what was collected), not the sale price.
//       collected ≥ 5,000            → qualifies
//       3,000 ≤ collected < 5,000    → qualifies, but only 2 such deals a month
//       collected < 3,000            → never qualifies
//     A deal that later collects more qualifies then; nothing is retroactive
//     here, the month is simply recalculated.
//
//   • Single courses (תיווך and the like — not a project) are their own line:
//     a flat 2% of the deal, for deals up to ₪6,000. They do not feed the
//     percentage table.
//
//   • The percentage table is keyed on the SALE total of qualifying projects.
//     Collection decides whether a project qualifies; once it does, its full
//     sale price enters the bracket calculation.
//
//   • The collection bonus is a separate, additional payment, unlocked only
//     once the month's sales reach ₪100,000: 60% collected → ₪1,000,
//     70% → ₪1,500, 80% → ₪2,000.
//
//   • Every bonus is conditional on at least 10 meetings in the month.
//
//   • A month pays EITHER the deal bonus or the meeting bonus — never both.
//     calcDealBonus only computes this side; the choice is made in the UI.

/** Sale total of qualifying projects → commission rate. Highest bracket reached wins. */
export const SALES_BRACKETS = [
  { min: 220000, rate: 0.045 },
  { min: 160000, rate: 0.04 },
  { min: 110000, rate: 0.03 },
  { min: 80000, rate: 0.025 },
  { min: 50000, rate: 0.02 },
]

/** Collected ÷ sold → flat bonus. Only above COLLECTION_BONUS_MIN_SALES. */
export const COLLECTION_BRACKETS = [
  { min: 0.8, amount: 2000 },
  { min: 0.7, amount: 1500 },
  { min: 0.6, amount: 1000 },
]

export const QUALIFY_FULL = 5000 // collected at or above this always qualifies
export const QUALIFY_PARTIAL = 3000 // between this and QUALIFY_FULL: limited
export const PARTIAL_ALLOWANCE = 2 // …to this many deals a month
export const COURSE_RATE = 0.02 // single course commission
export const COURSE_MAX = 6000 // …on deals up to this
export const COLLECTION_BONUS_MIN_SALES = 100000
export const MIN_MEETINGS = 10

const num = (v) => Number(v || 0)

/**
 * How far along a deal's collection is: 'paid' | 'partial' | 'unpaid' | 'unknown'.
 *
 * A single course is measured against ITS OWN price, not against the ₪3,000
 * floor — a ₪1,150 course can never reach ₪3,000, so charging it in full is
 * full collection. Projects keep the shekel threshold, which is the same number
 * the bonus qualifies on, so the colour and the pay can never disagree.
 *
 * 'unknown' (nothing recorded) is deliberately distinct from 'unpaid' (recorded
 * as zero): they mean different things and only one of them is bad news.
 */
export function collectionState(deal) {
  const { collected, amount, kind } = deal || {}
  if (collected === null || collected === undefined || collected === '') return 'unknown'

  const got = num(collected)
  if (got <= 0) return 'unpaid'

  if (kind === 'course') {
    return got >= num(amount) ? 'paid' : 'partial'
  }
  return got >= QUALIFY_PARTIAL ? 'paid' : 'partial'
}

/**
 * Work out the month's deal bonus.
 *
 * @param {Array} deals   rows with { amount, collected, kind, client_name }
 * @param {number} attendedMeetings  counted meetings that month (the 10 gate)
 */
export function calcDealBonus(deals = [], attendedMeetings = 0) {
  const projects = deals.filter((d) => (d.kind || 'project') === 'project')
  const courses = deals.filter((d) => d.kind === 'course')

  // ── Which projects count ──
  // Sorted by collection, descending: when only two part-collected deals may
  // count, the agent should get the two worth most.
  const missingCollection = []
  const ranked = [...projects].sort((a, b) => num(b.collected) - num(a.collected))

  let partialUsed = 0
  const qualified = []
  const rejected = []

  for (const d of ranked) {
    if (d.collected === null || d.collected === undefined) {
      missingCollection.push(d)
      rejected.push({ deal: d, reason: 'missing_collection' })
      continue
    }
    const collected = num(d.collected)
    if (collected >= QUALIFY_FULL) {
      qualified.push(d)
    } else if (collected >= QUALIFY_PARTIAL && partialUsed < PARTIAL_ALLOWANCE) {
      partialUsed++
      qualified.push(d)
    } else if (collected >= QUALIFY_PARTIAL) {
      rejected.push({ deal: d, reason: 'partial_allowance_used' })
    } else {
      rejected.push({ deal: d, reason: 'below_minimum' })
    }
  }

  // ── The percentage table ──
  const qualifiedSales = qualified.reduce((s, d) => s + num(d.amount), 0)
  const bracket = SALES_BRACKETS.find((b) => qualifiedSales >= b.min) || null
  const salesBonus = bracket ? qualifiedSales * bracket.rate : 0

  // ── Single courses: their own 2% line ──
  const courseLines = courses.map((d) => ({
    deal: d,
    eligible: num(d.amount) <= COURSE_MAX,
    bonus: num(d.amount) <= COURSE_MAX ? num(d.amount) * COURSE_RATE : 0,
  }))
  const coursesBonus = courseLines.reduce((s, c) => s + c.bonus, 0)

  // ── Collection bonus ──
  // Measured across every project of the month, not only the qualifying ones:
  // it rewards how much of what you sold you actually brought in.
  const allSales = projects.reduce((s, d) => s + num(d.amount), 0)
  const allCollected = projects.reduce((s, d) => s + num(d.collected), 0)
  const collectionRate = allSales > 0 ? allCollected / allSales : 0
  const collectionUnlocked = allSales >= COLLECTION_BONUS_MIN_SALES
  const collectionBracket = collectionUnlocked
    ? COLLECTION_BRACKETS.find((b) => collectionRate >= b.min) || null
    : null
  const collectionBonus = collectionBracket ? collectionBracket.amount : 0

  // ── The 10-meeting gate ──
  const meetingsOk = attendedMeetings >= MIN_MEETINGS
  const gross = salesBonus + coursesBonus + collectionBonus
  const total = meetingsOk ? gross : 0

  // What the next step up is worth — the same carrot the meeting bonus shows.
  const nextBracket = [...SALES_BRACKETS].reverse().find((b) => b.min > qualifiedSales) || null
  const nextGain = nextBracket ? nextBracket.min * nextBracket.rate - salesBonus : 0

  return {
    qualified,
    rejected,
    missingCollection,
    qualifiedSales,
    bracket,
    salesBonus,
    courseLines,
    coursesBonus,
    allSales,
    allCollected,
    collectionRate,
    collectionUnlocked,
    collectionBracket,
    collectionBonus,
    meetingsOk,
    attendedMeetings,
    gross,
    total,
    nextBracket,
    nextGain,
    toNextSales: nextBracket ? nextBracket.min - qualifiedSales : 0,
    toCollectionUnlock: Math.max(0, COLLECTION_BONUS_MIN_SALES - allSales),
  }
}
