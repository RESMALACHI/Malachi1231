// Reading Google's real daily request ceiling out of its own refusal.
//
// There is no quota-inspection endpoint for an API key, so the only authoritative
// source for the number is the 429 itself: a RESOURCE_EXHAUSTED reply carries a
// QuotaFailure detail whose violations name the metric and its exact quotaValue.
//
// Isolated in its own module because it runs exactly once — at the worst possible
// moment — and therefore has to be testable without waiting for a real outage.

export interface QuotaViolation {
  quotaMetric?: string
  quotaId?: string
  quotaValue?: string | number
  quotaDimensions?: Record<string, string>
}

/**
 * The per-DAY request limit from a Gemini error body, or null.
 *
 * Per-minute violations are ignored on purpose: they throttle, they don't cap
 * the day, and treating one as the daily ceiling would understate capacity by
 * two orders of magnitude.
 */
export function parseDailyLimit(err: any): number | null {
  const details = err?.error?.details
  if (!Array.isArray(details)) return null

  for (const detail of details) {
    const violations = detail?.violations
    if (!Array.isArray(violations)) continue

    for (const v of violations as QuotaViolation[]) {
      const haystack = `${v?.quotaId || ''} ${v?.quotaMetric || ''}`
      if (!/per_?day/i.test(haystack)) continue
      const value = Number(v?.quotaValue)
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return null
}
