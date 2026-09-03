// How likely is this meeting to end in an empty chair?
//
// The model is built from THIS office's own settled meetings — nothing here is a
// guess about how sales works in general. For every factor we can read off a
// meeting before it happens, we measure the no-show rate that factor actually
// had, and only use it once there are enough meetings behind it to mean
// something. A factor with thin data is skipped, not estimated.
//
// The output is deliberately a bucket plus its reasons, not a precise
// percentage: the useful action is "ring these two clients this morning", and a
// number like 47.3% would claim an accuracy this has no right to.

import { supabase } from '../lib/supabaseClient'
import { titleSignal } from '../lib/meetingTitle'

/** A factor value needs at least this many settled meetings to be used. */
const MIN_SAMPLES = 25
/** How far back the model looks. */
const MONTHS_BACK = 6
/** The model is rebuilt at most this often — it moves on the scale of weeks. */
const MODEL_TTL_MS = 30 * 60_000

const DAY_MS = 86_400_000

/* ── the factors we can read before a meeting happens ─────────────────────── */

/** How far in advance it was booked. Long horizons are where people forget. */
function leadTimeBucket(m) {
  if (!m.event_created_at || !m.meeting_date) return null
  const days = (new Date(m.meeting_date) - new Date(m.event_created_at)) / DAY_MS
  if (days < 0) return null
  if (days < 1) return 'same-day'
  if (days < 3) return '1-2d'
  if (days < 8) return '3-7d'
  if (days < 15) return '8-14d'
  return '15d+'
}

function hourBucket(m) {
  const h = new Date(m.meeting_date).getHours()
  if (Number.isNaN(h)) return null
  if (h < 12) return 'morning'
  if (h < 16) return 'midday'
  if (h < 19) return 'afternoon'
  return 'evening'
}

const weekdayOf = (m) => {
  const d = new Date(m.meeting_date).getDay()
  return Number.isNaN(d) ? null : String(d)
}

const typeOf = (m) => m.type || 'unknown'

/** "אישר" / "ללא מענה" in the title — what the coordinator already learned. */
const signalOf = (m) => titleSignal(m.title)

/**
 * Each factor: a name for the reason line, and how to read it off a meeting.
 * Order matters only for which reason is shown first when two tie.
 */
const FACTORS = [
  {
    key: 'signal',
    of: signalOf,
    label: (v) =>
      ({
        confirmed: 'הלקוח אישר הגעה',
        no_answer: 'לא היה מענה בתיאום',
        cancelled: 'סומנה כבוטלה בכותרת',
        none: 'טרם אושרה מול הלקוח',
      })[v] || null,
  },
  {
    key: 'lead',
    of: leadTimeBucket,
    label: (v) =>
      ({
        'same-day': 'נקבעה לאותו יום',
        '1-2d': 'נקבעה יום-יומיים מראש',
        '3-7d': 'נקבעה שבוע מראש',
        '8-14d': 'נקבעה שבועיים מראש',
        '15d+': 'נקבעה מעל שבועיים מראש',
      })[v] || null,
  },
  { key: 'type', of: typeOf, label: (v) => (v === 'zoom' ? 'פגישת זום' : v === 'frontal' ? 'פגישה פרונטלית' : null) },
  {
    key: 'hour',
    of: hourBucket,
    label: (v) =>
      ({ morning: 'שעת בוקר', midday: 'שעת צהריים', afternoon: 'אחר הצהריים', evening: 'שעת ערב' })[v] ||
      null,
  },
  {
    key: 'weekday',
    of: weekdayOf,
    label: (v) => {
      const names = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']
      return names[Number(v)] ? `${names[Number(v)]}` : null
    },
  },
]

/* ── building the model ───────────────────────────────────────────────────── */

let cached = null // { at, model }

/**
 * The no-show rate of every factor value, measured on settled meetings.
 * Returns null when there is not enough settled history to say anything —
 * the UI then shows no badge at all rather than a made-up one.
 */
export async function getNoShowModel({ force = false } = {}) {
  if (!force && cached && Date.now() - cached.at < MODEL_TTL_MS) return cached.model

  const since = new Date()
  since.setMonth(since.getMonth() - MONTHS_BACK)

  const { data, error } = await supabase
    .from('meetings')
    .select('title, meeting_date, event_created_at, type, status')
    .in('status', ['attended', 'no_show'])
    .gte('meeting_date', since.toISOString())
    .limit(4000)

  if (error) throw error

  const rows = data || []
  const settled = rows.length
  const noShows = rows.filter((r) => r.status === 'no_show').length
  // Under a couple of hundred settled meetings the buckets are noise.
  if (settled < 150) {
    cached = { at: Date.now(), model: null }
    return null
  }

  const base = noShows / settled
  const factors = {}

  for (const f of FACTORS) {
    const tally = new Map()
    for (const r of rows) {
      const v = f.of(r)
      if (v == null) continue
      const t = tally.get(v) || { n: 0, no: 0 }
      t.n += 1
      if (r.status === 'no_show') t.no += 1
      tally.set(v, t)
    }
    factors[f.key] = Object.fromEntries(
      [...tally.entries()]
        .filter(([, t]) => {
          if (t.n < MIN_SAMPLES) return false
          // Keep a value only if its no-show rate is genuinely apart from the
          // office's base — both by a visible margin and beyond sampling noise.
          // A factor whose buckets all sit at the base rate carries no signal;
          // letting it through only drags every score back to the middle.
          const rate = t.no / t.n
          const se = Math.sqrt((base * (1 - base)) / t.n)
          return Math.abs(rate - base) >= Math.max(0.07, 1.5 * se)
        })
        .map(([v, t]) => [v, { rate: t.no / t.n, n: t.n }])
    )
  }

  const model = { base, settled, factors, builtAt: Date.now() }
  cached = { at: Date.now(), model }
  return model
}

/* ── scoring one meeting ──────────────────────────────────────────────────── */

/**
 * @returns {{level:'good'|'ok'|'watch'|'high', rate:number, ratio:number, reasons:string[]}|null}
 *   null only when there is no model, or nothing about this meeting is readable.
 */
export function scoreMeeting(model, meeting) {
  if (!model || !meeting) return null

  const hits = []
  for (const f of FACTORS) {
    const v = f.of(meeting)
    if (v == null) continue
    const stat = model.factors[f.key]?.[v]
    if (!stat) continue
    hits.push({ key: f.key, value: v, ...stat, label: f.label(v) })
  }
  if (hits.length === 0) return null

  // Combine the factors as independent likelihood ratios on the ODDS of a
  // no-show, starting from the office's base rate. A factor sitting near the
  // base contributes a ratio near 1 and barely moves the result; "הלקוח אישר"
  // (25% against a ~57% base) and "ללא מענה" (89%) move it hard. An averaging
  // scheme instead let the flat, ever-present factors pull every score back to
  // the base and nothing ever crossed the line. The exponent tempers the
  // double-counting you get when the factors aren't perfectly independent.
  const clamp = (p) => Math.min(0.97, Math.max(0.03, p))
  const baseOdds = model.base / (1 - model.base)
  const DAMP = 0.8
  let odds = baseOdds
  for (const h of hits) {
    const p = clamp(h.rate)
    const lr = p / (1 - p) / baseOdds
    odds *= lr ** DAMP
  }
  const rate = odds / (1 + odds)
  const ratio = rate / model.base

  // Four bands, all measured against the office's OWN norm — every upcoming
  // meeting gets a read, not just the outliers:
  //   good  — a safe bet (clearly better than our average)
  //   ok    — ordinary for us
  //   watch — worse than our average, worth a confirmation call
  //   high  — much worse; the calls to make first
  const level =
    ratio >= 1.45 ? 'high' : ratio >= 1.15 ? 'watch' : ratio <= 0.75 ? 'good' : 'ok'

  // The reasons are the factors pulling hardest in the direction we landed.
  // "ok" is by definition unremarkable — it carries no reason line.
  let reasons = []
  if (level !== 'ok') {
    const up = level === 'watch' || level === 'high'
    reasons = hits
      .filter((h) => h.label && (up ? h.rate > model.base : h.rate < model.base))
      .sort((a, b) => Math.abs(b.rate - model.base) - Math.abs(a.rate - model.base))
      .slice(0, 2)
      .map((h) => h.label)
  }

  return { level, rate, ratio, reasons }
}

/** Only meetings still ahead of us are worth flagging. */
export const isUpcoming = (m) =>
  m?.status === 'pending' && new Date(m.meeting_date).getTime() > Date.now()
