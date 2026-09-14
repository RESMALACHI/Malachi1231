// דוח יומי — one day of the office, per agent and in total.
//
// Pure on purpose: the page, the WhatsApp text and the tests all read the same
// numbers, so the message a manager forwards can never say something the
// screen does not.
//
// Each figure comes from where it is actually true:
//   booked    meetings CREATED in the calendar that day (event_created_at) —
//             the act of booking, same as the TV's "today"
//   held      meetings that took place that day (meeting_date), by mark
//   deals     deals DATED that day (deal_date) — the date the deals page and
//             the TV's month both credit by
//   collected charges that landed that day (deal_payments.paid_on)
//   calls, follow-ups, hours, notes — the day summary the agent filed

const n = (v) => Number(v) || 0

/** "עסקה אחת" / "3 עסקאות" — Hebrew does not say "1 עסקאות". */
export const count = (k, one, many) => (k === 1 ? one : `${k} ${many}`)

/**
 * Build the report from the day's raw rows.
 *
 * `now` separates a meeting nobody marked from one that has not happened yet:
 * on the report for today, a 17:00 meeting read at noon is "later today", not
 * "unmarked". The first draft counted them together and read "12 meetings not
 * marked" at midday, most of them still in the future.
 */
export function buildDailyReport({
  agents = [],
  booked = [],
  held = [],
  deals = [],
  payments = [],
  summaries = [],
  paceAvg = null,
  now = Date.now(),
  inProgress = false,
}) {
  const past = (m) => !m.meeting_date || new Date(m.meeting_date).getTime() <= now
  // Everyone on the roster, plus anyone the data names who is not on it — a
  // meeting or a deal must never vanish from the day because of the roster.
  const names = [...agents]
  for (const r of [...booked, ...held, ...deals, ...payments, ...summaries]) {
    if (r.agent_name && !names.includes(r.agent_name)) names.push(r.agent_name)
  }
  const summaryOf = new Map(summaries.map((s) => [s.agent_name, s]))

  const rows = names.map((name) => {
    const b = booked.filter((m) => m.agent_name === name)
    const h = held.filter((m) => m.agent_name === name)
    const d = deals.filter((x) => x.agent_name === name)
    const p = payments.filter((x) => x.agent_name === name)
    const s = summaryOf.get(name) || null
    const attended = h.filter((m) => m.status === 'attended').length
    const noShow = h.filter((m) => m.status === 'no_show').length
    const calls = s?.calls ?? null
    return {
      name,
      booked: b.length,
      frontal: b.filter((m) => m.type === 'frontal').length,
      zoom: b.filter((m) => m.type === 'zoom').length,
      held: h.length,
      attended,
      noShow,
      unmarked: h.filter((m) => m.status === 'pending' && past(m)).length,
      upcoming: h.filter((m) => m.status === 'pending' && !past(m)).length,
      deals: d.length,
      dealAmount: d.reduce((sum, x) => sum + n(x.amount), 0),
      dealList: d,
      collected: p.reduce((sum, x) => sum + n(x.amount), 0),
      reported: Boolean(s),
      calls,
      longCalls: s?.long_calls ?? null,
      followupsIn: s?.followups_in ?? null,
      followupsOut: s?.followups_out ?? null,
      from: s?.work_from || null,
      to: s?.work_to || null,
      notes: s?.notes?.trim() || null,
      // Meetings booked per 100 calls — only when calls were reported, since a
      // missing summary is not zero calls.
      perHundred: calls ? Math.round((b.length / calls) * 1000) / 10 : null,
    }
  })

  const active = (r) => r.booked || r.held || r.deals || r.collected || r.reported
  rows.sort(
    (a, z) =>
      Number(Boolean(active(z))) - Number(Boolean(active(a))) ||
      z.booked - a.booked ||
      z.dealAmount - a.dealAmount ||
      a.name.localeCompare(z.name, 'he')
  )

  const sum = (k) => rows.reduce((s, r) => s + n(r[k]), 0)
  const attended = sum('attended')
  const noShow = sum('noShow')
  const totals = {
    booked: sum('booked'),
    frontal: sum('frontal'),
    zoom: sum('zoom'),
    held: sum('held'),
    attended,
    noShow,
    unmarked: sum('unmarked'),
    upcoming: sum('upcoming'),
    // Over marked meetings only — an unmarked meeting is not a no-show.
    attendanceRate: attended + noShow ? Math.round((attended / (attended + noShow)) * 100) : null,
    deals: sum('deals'),
    dealAmount: sum('dealAmount'),
    collected: sum('collected'),
    calls: sum('calls'),
    longCalls: sum('longCalls'),
    reported: rows.filter((r) => r.reported).length,
    // Only roster agents are expected to file a summary.
    expected: agents.length,
    paceAvg,
  }

  // What a manager should look at first. Facts only — no advice.
  const flags = []
  const missing = rows.filter((r) => agents.includes(r.name) && !r.reported).map((r) => r.name)
  if (missing.length) {
    // While the day is still running nobody has "failed" to file yet.
    const lead = inProgress ? 'טרם שלחו סיכום' : 'לא שלחו סיכום'
    flags.push({ kind: 'unreported', text: `${lead}: ${missing.join(', ')}` })
  }
  if (totals.unmarked) {
    flags.push({
      kind: 'unmarked',
      text: `${count(totals.unmarked, 'פגישה אחת שכבר עברה לא סומנה', 'פגישות שכבר עברו לא סומנו')} (הגיע / לא הגיע)`,
    })
  }
  const idle = rows.filter((r) => agents.includes(r.name) && r.reported && r.booked === 0).map((r) => r.name)
  if (idle.length) flags.push({ kind: 'idle', text: `דיווחו בלי לקבוע פגישה: ${idle.join(', ')}` })

  return { rows, totals, flags }
}

const shekel = (v) => `₪${Math.round(n(v)).toLocaleString('en-US')}`

/**
 * The report as a WhatsApp message. Plain text with a few markers WhatsApp
 * renders (*bold*), short lines, and only agents who did something — a list of
 * zeroes is noise in a group chat.
 */
export function reportText(report, dateLabel) {
  const { rows, totals, flags } = report
  const lines = [`📊 *דוח יומי — ${dateLabel}*`, '']

  const pace = totals.paceAvg ? ` (ממוצע יומי ${totals.paceAvg})` : ''
  lines.push(`📅 נקבעו: *${totals.booked}* פגישות${pace}`)
  if (totals.booked) lines.push(`    פרונטלי ${totals.frontal} · זום ${totals.zoom}`)
  if (totals.held) {
    // A rate over a handful of marks with a dozen unmarked is not a rate.
    const rate = totals.attendanceRate == null || totals.unmarked ? '' : ` (${totals.attendanceRate}%)`
    const rest = [
      totals.unmarked && `לא סומנו ${totals.unmarked}`,
      totals.upcoming && `בהמשך היום ${totals.upcoming}`,
    ].filter(Boolean)
    lines.push(
      `✅ פגישות היום: הגיעו *${totals.attended}*, לא הגיעו ${totals.noShow}${rate}${rest.length ? ` · ${rest.join(' · ')}` : ''}`
    )
  }
  if (totals.deals) {
    const what = totals.deals === 1 ? 'עסקה אחת' : `עסקאות: *${totals.deals}*`
    lines.push(`🤝 ${what} · ${shekel(totals.dealAmount)}`)
  }
  if (totals.collected) lines.push(`💰 נגבה: *${shekel(totals.collected)}*`)
  if (totals.calls) lines.push(`📞 שיחות: ${totals.calls} · מעל 4 דק׳: ${totals.longCalls}`)
  lines.push(`📝 שלחו סיכום: ${totals.reported}/${totals.expected}`)

  const busy = rows.filter((r) => r.booked || r.held || r.deals || r.collected || r.calls)
  if (busy.length) {
    lines.push('', '*לפי סוכן*')
    for (const r of busy) {
      const parts = []
      if (r.booked) parts.push(count(r.booked, 'פגישה אחת נקבעה', 'נקבעו'))
      const marked = r.attended + r.noShow
      if (marked) parts.push(`${r.attended}/${marked} הגיעו`)
      // Unmarked meetings are not "0 came" — say they are unmarked.
      if (r.unmarked) parts.push(count(r.unmarked, 'אחת לא סומנה', 'לא סומנו'))
      if (r.deals) parts.push(`${count(r.deals, 'עסקה אחת', 'עסקאות')} ${shekel(r.dealAmount)}`)
      if (r.collected) parts.push(`נגבה ${shekel(r.collected)}`)
      if (r.calls) parts.push(`${r.calls} שיחות`)
      if (r.upcoming) parts.push(`${r.upcoming} בהמשך היום`)
      if (parts.length) lines.push(`• ${r.name} — ${parts.join(' · ')}`)
    }
  }

  if (flags.length) {
    lines.push('')
    for (const f of flags) lines.push(`⚠️ ${f.text}`)
  }
  return lines.join('\n')
}
