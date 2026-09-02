// Meeting-bonus rules (RES bonus table). This is real pay — every rule here is
// literal from the table, not inferred:
//
//   • Only meetings the client ACTUALLY attended count.
//   • A zoom meeting counts as 1/5 of a meeting.
//   • Under 10 counted meetings → no bonus at all.
//   • The tier's rate applies retroactively from the FIRST meeting:
//     25 counted at the 70₪ tier = 25 × 70 = 1,750₪ (not just the 25th on).
//   • Between tiers you stay on the lower one: 12 counted → the 10 tier (50₪).
//
// Deliberately NOT here: deals/collection bonuses and the hourly base — those
// are separate lines in the table (and the deals bonus is an either/or choice
// with this one).

/** ₪ per counted meeting, by how many counted meetings were reached. */
export const BONUS_TIERS = [
  { min: 75, rate: 170 },
  { min: 70, rate: 160 },
  { min: 65, rate: 150 },
  { min: 60, rate: 140 },
  { min: 55, rate: 130 },
  { min: 50, rate: 120 },
  { min: 45, rate: 110 },
  { min: 40, rate: 100 },
  { min: 35, rate: 90 },
  { min: 30, rate: 80 },
  { min: 25, rate: 70 },
  { min: 15, rate: 60 },
  { min: 10, rate: 50 },
]

export const ZOOM_WEIGHT = 1 / 5 // 5 zoom meetings = 1 meeting
export const MIN_MEETINGS = 10 // bonus is conditional on 10+ a month

/**
 * @param {{frontal:number, zoom:number, unknown:number}} attended — attended only
 * @returns {{counted, tier, rate, total, next, toNext, nextGain}}
 */
export function calcMeetingBonus({ frontal = 0, zoom = 0, unknown = 0 } = {}) {
  // 'unknown' has no zoom evidence in the calendar, so it counts as a full
  // meeting like a frontal one. Surfaced in the UI so it can be corrected.
  const counted = frontal + unknown + zoom * ZOOM_WEIGHT
  const tier = BONUS_TIERS.find((t) => counted >= t.min) || null
  const rate = tier ? tier.rate : 0
  const total = tier ? Math.round(counted * rate) : 0

  // The next tier up — what it takes to get there, and what it's worth.
  const next = [...BONUS_TIERS].reverse().find((t) => t.min > counted) || null
  const toNext = next ? Math.ceil((next.min - counted) * 10) / 10 : 0
  const nextGain = next ? Math.round(next.min * next.rate) - total : 0

  return { counted, tier, rate, total, next, toNext, nextGain }
}

/** "1,750 ₪" */
export const formatIls = (n) => `${Math.round(n).toLocaleString('he-IL')} ₪`
