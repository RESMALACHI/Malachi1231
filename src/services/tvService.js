// Everything the "מסך טלוויזיה" board needs.
//
// The board shows how many meetings the team HAS — for TODAY and for THIS WEEK
// — and rotates between those plus a leaderboard. A meeting counts by its own
// date (when it takes place), not by when it was booked: the wall should say
// "12 meetings today", and an agent with 8 meetings this week should read as 8
// whether they booked them yesterday or last month.
//
// The live feed / celebration still keys off a genuinely new row appearing
// (see TVPage), so a booking made right now still pops on screen.
//
// Deals count by created_at (when the deal was logged) — that IS the deal's
// moment, there is no separate "deal date".

import { supabase } from '../lib/supabaseClient'

const EMPTY = { scope: 'today', booked: [], deals: [], counts: { meetings: 0, deals: 0, revenue: 0 } }
export const EMPTY_BOARD = EMPTY

const midnight = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** The local (Israel) window a scope covers: [start, end). */
function windowFor(scope) {
  const start = midnight()
  const end = new Date(start)
  if (scope === 'month') {
    start.setDate(1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 1)
  } else if (scope === 'week') {
    start.setDate(start.getDate() - start.getDay())
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  } else {
    end.setDate(end.getDate() + 1)
  }
  return { start, end }
}

const SCOPE_LIMIT = { today: 200, week: 800, month: 1000 }

async function fetchBoard(scope) {
  const { start, end } = windowFor(scope)

  // Only meetings the sync could pin to an agent count on the board. The shared
  // calendars are full of blockers — "איציק תפוס", "לא לקבוע" — that never
  // match an agent alias and so land with agent_name = null; those are not
  // bookings and must not inflate the numbers or the leaderboard.
  //
  // Deliberately "has an agent" rather than "is in REAL_AGENTS": /tv lives
  // OUTSIDE the app Layout, and SettingsProvider — the only thing that loads
  // the live roster from the database — lives inside it. On a TV that has never
  // signed into the app itself, agents.js is still on BUILTIN_ROSTER, so a
  // roster check here quietly dropped every meeting of anyone added since
  // (דניאל's four meetings vanished and "פגישות היום" read 3 instead of 7).
  const [bookedRes, dealsRes] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, agent_name, title, meeting_date, type, event_created_at')
      .gte('meeting_date', start.toISOString())
      .lt('meeting_date', end.toISOString())
      .not('agent_name', 'is', null)
      .order('meeting_date', { ascending: true })
      .limit(SCOPE_LIMIT[scope] || 500),
    supabase
      .from('deals')
      .select('id, agent_name, client_name, amount, kind, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .not('agent_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  if (bookedRes.error) throw bookedRes.error
  if (dealsRes.error) throw dealsRes.error

  const booked = bookedRes.data || []
  const deals = dealsRes.data || []

  return {
    scope,
    booked,
    deals,
    counts: {
      meetings: booked.length,
      deals: deals.length,
      revenue: deals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    },
  }
}

/** Both windows in one shot — today's board, and the month behind המובילים. */
export async function getTvBoards() {
  if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
    return { today: demoBoard('today'), month: demoBoard('month') }
  }
  const [today, month] = await Promise.all([fetchBoard('today'), fetchBoard('month')])
  return { today, month }
}

/**
 * The everyday load — average meetings PER DAY over the last `days` complete
 * days (today excluded so a slow morning doesn't drag the bar down), counted by
 * the meeting's own date to match the board. Lets it say whether today is busy.
 */
export async function getDailyPace(days = 14) {
  if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
    return { avgPerDay: 12 }
  }
  const from = midnight()
  from.setDate(from.getDate() - days)
  const { count, error } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .gte('meeting_date', from.toISOString())
    .lt('meeting_date', midnight().toISOString())
    .not('agent_name', 'is', null) // match the board — assigned meetings only

  if (error) throw error
  return { avgPerDay: Math.max(0, Math.round((count || 0) / days)) }
}

/** One merged, newest-first stream of "things that happened". */
export function mergeFeed({ booked = [], deals = [] }) {
  const items = [
    ...booked.map((m) => ({
      key: `m:${m.id}`,
      kind: 'meeting',
      at: m.event_created_at,
      agent: m.agent_name,
      who: m.title,
      when: m.meeting_date,
      type: m.type,
    })),
    ...deals.map((d) => ({
      key: `d:${d.id}`,
      kind: 'deal',
      at: d.created_at,
      agent: d.agent_name,
      who: d.client_name,
      amount: Number(d.amount) || 0,
    })),
  ].filter((x) => x.at)

  items.sort((a, b) => new Date(b.at) - new Date(a.at))
  return items
}

/** Per-agent tallies for the leaderboard — strongest first. */
export function leaderboardFrom({ booked = [], deals = [] }) {
  const rows = new Map()
  const row = (name) => {
    const key = name || '—'
    if (!rows.has(key)) rows.set(key, { name: key, meetings: 0, deals: 0, revenue: 0 })
    return rows.get(key)
  }
  for (const b of booked) row(b.agent_name).meetings += 1
  for (const d of deals) {
    const r = row(d.agent_name)
    r.deals += 1
    r.revenue += Number(d.amount) || 0
  }
  return [...rows.values()]
    .filter((r) => r.name !== '—')
    .sort((a, b) => b.meetings - a.meetings || b.revenue - a.revenue || b.deals - a.deals)
}

/* ── ?demo — a good week's worth of wins ──────────────────────────────────── */
function demoBoard(scope) {
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString()
  const agents = ['ודיע', 'ויטלי', 'מרים', 'מלאכי אזערי', 'עדי', 'דניאל']
  const clients = [
    'לואי קסיס', 'חתם ברגס', 'דנה לוי', 'יוסי כהן', 'רון אבידן', 'שירה מזרחי',
    'משפחת אלון', 'נועה גבע', 'איתי ברק', 'מאיה סער', 'טל רגב', 'עומר נחום',
  ]
  // A meeting some time inside the demo window (today, or spread across this
  // week / month) so it lands the same way a real one would.
  const inWindow = (i) => {
    const d = new Date()
    if (scope === 'month') d.setDate(1 + (i % d.getDate()))
    else if (scope === 'week') d.setDate(d.getDate() - d.getDay() + (i % 6))
    d.setHours(9 + (i % 9), (i * 17) % 60, 0, 0)
    return d.toISOString()
  }
  const n = scope === 'month' ? 77 : scope === 'week' ? 34 : 11
  const booked = Array.from({ length: n }, (_, i) => ({
    id: `${scope}-m${i}`,
    agent_name: agents[i % agents.length],
    title: `פגישה ${i % 3 ? 'פרונטלית' : 'זום'} - ${clients[i % clients.length]} - ${agents[i % agents.length]}`,
    meeting_date: inWindow(i),
    type: i % 3 ? 'frontal' : 'zoom',
    event_created_at: ago(2 + i * (scope === 'week' ? 190 : 26)),
  }))
  const deals = [
    { id: `${scope}-d1`, agent_name: 'ויטלי', client_name: 'משפחת ברקוביץ', amount: 24000, kind: 'project', created_at: ago(70) },
    ...(scope === 'today'
      ? []
      : [
          { id: `${scope}-d2`, agent_name: 'מרים', client_name: 'אור פלח', amount: 12500, kind: 'course', created_at: ago(1600) },
          { id: `${scope}-d3`, agent_name: 'ודיע', client_name: 'קרן שדה', amount: 38000, kind: 'project', created_at: ago(3400) },
        ]),
  ]
  return {
    scope,
    booked,
    deals,
    counts: {
      meetings: booked.length,
      deals: deals.length,
      revenue: deals.reduce((s, d) => s + d.amount, 0),
    },
  }
}
