import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyReport, reportText } from './dailyReport.js'

const day = {
  agents: ['ודיע', 'עדי', 'מרים'],
  booked: [
    { agent_name: 'ודיע', type: 'frontal' },
    { agent_name: 'ודיע', type: 'zoom' },
    { agent_name: 'עדי', type: 'frontal' },
  ],
  held: [
    { agent_name: 'ודיע', status: 'attended' },
    { agent_name: 'ודיע', status: 'no_show' },
    { agent_name: 'עדי', status: 'pending' },
  ],
  deals: [{ agent_name: 'ודיע', amount: '16800.00' }],
  payments: [{ agent_name: 'ודיע', amount: 4000 }],
  summaries: [
    { agent_name: 'ודיע', calls: 50, long_calls: 5, notes: '  יום טוב  ' },
    { agent_name: 'עדי', calls: 40, long_calls: 2 },
  ],
  paceAvg: 12,
}

test('totals add up across agents', () => {
  const { totals } = buildDailyReport(day)
  assert.equal(totals.booked, 3)
  assert.equal(totals.frontal, 2)
  assert.equal(totals.zoom, 1)
  assert.equal(totals.held, 3)
  assert.equal(totals.attended, 1)
  assert.equal(totals.noShow, 1)
  assert.equal(totals.unmarked, 1)
  assert.equal(totals.deals, 1)
  assert.equal(totals.dealAmount, 16800)
  assert.equal(totals.collected, 4000)
  assert.equal(totals.calls, 90)
  assert.equal(totals.reported, 2)
  assert.equal(totals.expected, 3)
})

test('attendance is over marked meetings only — unmarked is not a no-show', () => {
  assert.equal(buildDailyReport(day).totals.attendanceRate, 50)
  const none = buildDailyReport({ ...day, held: [{ agent_name: 'עדי', status: 'pending' }] })
  assert.equal(none.totals.attendanceRate, null)
})

test('per agent, busiest first; a missing summary is null calls, not zero', () => {
  const { rows } = buildDailyReport(day)
  assert.deepEqual(rows.map((r) => r.name), ['ודיע', 'עדי', 'מרים'])
  const miriam = rows.find((r) => r.name === 'מרים')
  assert.equal(miriam.reported, false)
  assert.equal(miriam.calls, null)
  assert.equal(miriam.perHundred, null)
  assert.equal(rows[0].perHundred, 4) // 2 booked / 50 calls
  assert.equal(rows[0].notes, 'יום טוב')
})

test('someone in the data but not on the roster still shows', () => {
  const r = buildDailyReport({ ...day, deals: [...day.deals, { agent_name: 'דניאל', amount: 9000 }] })
  assert.ok(r.rows.some((x) => x.name === 'דניאל' && x.dealAmount === 9000))
  // …but is not expected to have filed a summary.
  assert.ok(!r.flags.find((f) => f.kind === 'unreported').text.includes('דניאל'))
})

test('flags name who did not report and count unmarked meetings', () => {
  const { flags } = buildDailyReport(day)
  assert.equal(flags.find((f) => f.kind === 'unreported').text, 'לא שלחו סיכום: מרים')
  assert.match(flags.find((f) => f.kind === 'unmarked').text, /^פגישה אחת שכבר עברה לא סומנה/)
})

test('a meeting later today is upcoming, not unmarked', () => {
  const noon = new Date('2026-09-14T12:00:00').getTime()
  const r = buildDailyReport({
    ...day,
    now: noon,
    held: [
      { agent_name: 'עדי', status: 'pending', meeting_date: '2026-09-14T10:00:00' },
      { agent_name: 'עדי', status: 'pending', meeting_date: '2026-09-14T17:00:00' },
      { agent_name: 'עדי', status: 'pending', meeting_date: '2026-09-14T18:00:00' },
    ],
  })
  assert.equal(r.totals.unmarked, 1)
  assert.equal(r.totals.upcoming, 2)
  assert.match(reportText(r, 'x'), /לא סומנו 1 · בהמשך היום 2/)
})

test('while the day runs, a missing summary is "not yet", not "did not"', () => {
  const { flags } = buildDailyReport({ ...day, inProgress: true })
  assert.equal(flags.find((f) => f.kind === 'unreported').text, 'טרם שלחו סיכום: מרים')
})

test('the WhatsApp text lists only agents who did something, in proper Hebrew', () => {
  const text = reportText(buildDailyReport(day), 'יום שני 14.09')
  assert.match(text, /דוח יומי — יום שני 14\.09/)
  assert.match(text, /נקבעו: \*3\* פגישות \(ממוצע יומי 12\)/)
  assert.match(text, /• ודיע — 2 נקבעו · 1\/2 הגיעו · עסקה אחת ₪16,800 · נגבה ₪4,000 · 50 שיחות/)
  assert.match(text, /• עדי — פגישה אחת נקבעה · אחת לא סומנה · 40 שיחות/)
  assert.match(text, /🤝 עסקה אחת · ₪16,800/)
  assert.doesNotMatch(text, /• מרים/)
  assert.match(text, /⚠️ לא שלחו סיכום: מרים/)
})
