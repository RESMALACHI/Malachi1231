// The manager's funnel — one call to the database function that computes it.
//
// The same `company_funnel` the AI assistant reads, so a number on the screen
// and the same number in the chat can never disagree.

import { supabase } from '../lib/supabaseClient'

const pad = (n) => String(n).padStart(2, '0')

/** First and last day of a month, as plain yyyy-mm-dd (never a UTC timestamp —
 *  converting local midnight would shift the boundary by a day). */
export function monthBounds(year, month) {
  const last = new Date(year, month + 1, 0).getDate()
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` }
}

export async function getFunnel(year, month) {
  const { from, to } = monthBounds(year, month)
  const { data, error } = await supabase.rpc('company_funnel', { from_date: from, to_date: to })
  if (error) throw error
  return data
}

/** Two months at once — the current one and the one before, for comparison. */
export async function getFunnelWithPrevious(year, month) {
  const prevYear = month === 0 ? year - 1 : year
  const prevMonth = month === 0 ? 11 : month - 1
  const [current, previous] = await Promise.all([
    getFunnel(year, month),
    getFunnel(prevYear, prevMonth),
  ])
  return { current, previous }
}

export const rate = (part, whole) => (whole > 0 ? (part / whole) * 100 : null)

/** "43.2%" · null stays "—" rather than becoming a misleading 0%. */
export function pct(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const r = Math.round(value * 10 ** digits) / 10 ** digits
  return `${Number.isInteger(r) ? r : r.toFixed(digits)}%`
}

export const shekels = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('en-US')}`

/**
 * The stages, in the order a person moves through them, with the conversion
 * INTO each one.
 *
 * Leads are NOT in this chain. They arrive from the lead webhooks while calls
 * come from the day summaries — two separate doors into the same building, not
 * one after the other. Threading them in series produced a "129% conversion"
 * from leads to meetings, which is not a statistic, it is a bug wearing one.
 *
 * Attendance is measured only against meetings that have already happened
 * (attended + no_show). Counting the ones still in the future as "did not
 * arrive" would show a collapsing business every time the month is young.
 */
export function stages(f) {
  const t = f?.totals || {}
  const settled = (t.attended || 0) + (t.no_show || 0)

  return [
    { key: 'calls', label: 'שיחות שדווחו', value: t.calls || 0, note: 'מסיכומי היום' },
    {
      key: 'long_calls',
      label: 'שיחות מעל 4 דק׳',
      value: t.long_calls || 0,
      of: t.calls || 0,
      note: 'שיחה שהפכה לשיחת עומק',
    },
    {
      key: 'booked',
      label: 'פגישות שנקבעו',
      value: t.booked || 0,
      of: t.long_calls || 0,
      // More meetings than long calls does not mean a conversion above 100%; it
      // means the day summaries behind the calls are missing days. Saying which
      // it is beats printing a number nobody can act on.
      unreliable: (t.booked || 0) > (t.long_calls || 0),
      unreliableNote: 'נקבעו יותר פגישות מכמות השיחות הארוכות שדווחו — כלומר חסרים דיווחי סיכום יום',
    },
    {
      key: 'attended',
      label: 'הגיעו לפגישה',
      value: t.attended || 0,
      of: settled,
      ofLabel: 'מהפגישות שכבר עבר זמנן',
      note: settled < (t.booked || 0) ? `${(t.booked || 0) - settled} טרם סומנו` : '',
    },
    { key: 'deals', label: 'עסקאות שנסגרו', value: t.deals || 0, of: t.attended || 0 },
  ]
}

/** Leads are a separate intake channel, shown beside the funnel, not inside it. */
export function leadIntake(f) {
  const t = f?.totals || {}
  return { leads: t.leads || 0, bySource: f?.by_source || [] }
}

/**
 * What the numbers say to do about them.
 *
 * Deliberately few and thresholded, not one line per metric: a screen of
 * twenty "insights" is read as decoration and acted on by nobody. Each one
 * names the number it came from so it can be argued with.
 */
export function insights(cur, prev) {
  const out = []
  const t = cur?.totals || {}
  const p = prev?.totals || {}
  const settled = (t.attended || 0) + (t.no_show || 0)
  const pSettled = (p.attended || 0) + (p.no_show || 0)

  const show = rate(t.attended || 0, settled)
  const pShow = rate(p.attended || 0, pSettled)
  if (show !== null && settled >= 10) {
    if (show < 50) {
      out.push({
        tone: 'bad',
        title: 'יותר ממחצית הפגישות לא מתקיימות',
        body: `${t.no_show} מתוך ${settled} פגישות שכבר עבר זמנן נגמרו באי-הגעה (${pct(show)}). זה השלב הכי יקר במשפך — כל פגישה כזו עלתה שיחות, תיאום ויום עבודה. כדאי לבדוק תזכורת יום לפני ושיחת אישור בבוקר.`,
      })
    } else if (show >= 70) {
      out.push({
        tone: 'good',
        title: 'אחוז ההגעה גבוה — לשמר',
        body: `${pct(show)} מהפגישות שכבר עבר זמנן התקיימו בפועל. מה שנעשה בתיאום ובאישורים עובד.`,
      })
    }
    if (pShow !== null && pSettled >= 10 && show - pShow <= -10) {
      out.push({
        tone: 'bad',
        title: 'ההגעה ירדה מול החודש שעבר',
        body: `מ-${pct(pShow)} ל-${pct(show)}. שווה להשוות מה השתנה בתסריט התיאום או בתזכורות.`,
      })
    }
  }

  const close = rate(t.deals || 0, t.attended || 0)
  if (close !== null && (t.attended || 0) >= 10) {
    if (close < 15) {
      out.push({
        tone: 'bad',
        title: 'מעט סגירות ממי שכן הגיע',
        body: `${t.deals} עסקאות מתוך ${t.attended} פגישות שהתקיימו (${pct(close)}). הבעיה כאן היא בחדר, לא בטלפון — שווה לשבת על הפגישות שלא נסגרו.`,
      })
    } else if (close >= 30) {
      out.push({
        tone: 'good',
        title: 'סגירה חזקה בפגישות',
        body: `${pct(close)} ממי שהגיע סגר. כדאי להזרים יותר פגישות לאותו צוות.`,
      })
    }
  }

  const coll = rate(Number(t.collected || 0), Number(t.revenue || 0))
  if (coll !== null && (t.deals || 0) > 0 && coll < 60) {
    out.push({
      tone: 'warn',
      title: 'הגבייה מפגרת אחרי המכירות',
      body: `נמכר ${shekels(t.revenue)} ונגבה ${shekels(t.collected)} (${pct(coll)}). ההפרש הוא ${shekels(Number(t.revenue || 0) - Number(t.collected || 0))} שכבר נחתמו וטרם נכנסו.`,
    })
  }

  // A stage with no data at all is a measurement gap, not a performance
  // problem — and saying so stops it being read as one.
  if ((t.leads || 0) === 0) {
    out.push({
      tone: 'info',
      title: 'אין לידים נכנסים במדידה',
      body: 'אף ליד לא נכנס דרך מקורות הלידים החודש, אז אי אפשר לחשב המרה משיחה לפגישה על בסיס מקור. חיבור דף הנחיתה לוובהוק בעמוד הניהול יסגור את החלק הזה במשפך.',
    })
  }
  if ((t.calls || 0) === 0) {
    out.push({
      tone: 'info',
      title: 'לא דווחו שיחות',
      body: 'ראש המשפך מגיע מסיכומי היום שהסוכנים ממלאים. בלי דיווח אין דרך לדעת כמה שיחות עמדו מאחורי הפגישות.',
    })
  }

  const rev = Number(t.revenue || 0)
  const pRev = Number(p.revenue || 0)
  if (pRev > 0 && rev > 0) {
    const change = ((rev - pRev) / pRev) * 100
    if (Math.abs(change) >= 20) {
      out.push({
        tone: change > 0 ? 'good' : 'bad',
        title: change > 0 ? 'המכירות עלו מול החודש שעבר' : 'המכירות ירדו מול החודש שעבר',
        body: `${shekels(pRev)} → ${shekels(rev)} (${change > 0 ? '+' : ''}${Math.round(change)}%).`,
      })
    }
  }

  return out
}

/**
 * Per-agent rows with their rates worked out, strongest first.
 *
 * Sorted by deals then by attendance: the table is read to answer "who is
 * carrying the month", and revenue alone rewards one lucky large sale.
 */
export function agentRows(f) {
  return (f?.by_agent || [])
    .map((a) => {
      const settled = (a.attended || 0) + (a.no_show || 0)
      return {
        ...a,
        revenue: Number(a.revenue || 0),
        collected: Number(a.collected || 0),
        settled,
        showRate: rate(a.attended || 0, settled),
        closeRate: rate(a.deals || 0, a.attended || 0),
        bookRate: rate(a.booked || 0, a.long_calls || 0),
      }
    })
    .sort((x, y) => y.deals - x.deals || (y.showRate ?? -1) - (x.showRate ?? -1))
}
