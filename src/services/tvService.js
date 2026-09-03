// Everything the "מסך טלוויזיה" board needs.
//
// The board celebrates two things as they happen: a meeting getting BOOKED, and
// a deal getting CLOSED. It shows them for two windows — TODAY and THIS WEEK
// (Sunday→now) — and the screen rotates between them plus a leaderboard.
//
// "Booked" is measured on event_created_at (when the event was created in
// Google Calendar), NOT created_at (when our sync first saw the row) — the same
// distinction meetingsService makes for "booked today".

import { supabase } from '../lib/supabaseClient'

const EMPTY = { scope: 'today', booked: [], deals: [], counts: { meetings: 0, deals: 0, revenue: 0 } }
export const EMPTY_BOARD = EMPTY

const midnight = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Local (Israel) midnight today, ISO. */
function startOfTodayISO() {
  return midnight().toISOString()
}

/** Local midnight on the Sunday that opens this week (the Israeli week), ISO. */
function startOfWeekISO() {
  const d = midnight()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString()
}

async function fetchBoard(scope) {
  const since = scope === 'week' ? startOfWeekISO() : startOfTodayISO()

  const [bookedRes, dealsRes] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, agent_name, title, meeting_date, type, event_created_at')
      .gte('event_created_at', since)
      .order('event_created_at', { ascending: false })
      .limit(scope === 'week' ? 500 : 120),
    supabase
      .from('deals')
      .select('id, agent_name, client_name, amount, kind, created_at')
      .gte('created_at', since)
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

/** Both windows in one shot — the screen rotates between them. */
export async function getTvBoards() {
  if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
    return { today: demoBoard('today'), week: demoBoard('week') }
  }
  const [today, week] = await Promise.all([fetchBoard('today'), fetchBoard('week')])
  return { today, week }
}

/**
 * The everyday booking rate, from the last `days` COMPLETE days (today excluded
 * so a slow morning doesn't drag the bar down). Lets the board say whether
 * today is running hot.
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
    .gte('event_created_at', from.toISOString())
    .lt('event_created_at', midnight().toISOString())

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
  const soon = (min) => new Date(Date.now() + min * 60000).toISOString()
  const agents = ['ודיע', 'ויטלי', 'מרים', 'מלאכי אזערי', 'עדי', 'שליו']
  const clients = [
    'לואי קסיס', 'חתם ברגס', 'דנה לוי', 'יוסי כהן', 'רון אבידן', 'שירה מזרחי',
    'משפחת אלון', 'נועה גבע', 'איתי ברק', 'מאיה סער', 'טל רגב', 'עומר נחום',
  ]
  const n = scope === 'week' ? 34 : 11
  const booked = Array.from({ length: n }, (_, i) => ({
    id: `${scope}-m${i}`,
    agent_name: agents[i % agents.length],
    title: `פגישה ${i % 3 ? 'פרונטלית' : 'זום'} - ${clients[i % clients.length]} - ${agents[i % agents.length]}`,
    meeting_date: soon(30 + i * 47),
    type: i % 3 ? 'frontal' : 'zoom',
    event_created_at: ago(2 + i * (scope === 'week' ? 190 : 26)),
  }))
  const deals = [
    { id: `${scope}-d1`, agent_name: 'ויטלי', client_name: 'משפחת ברקוביץ', amount: 24000, kind: 'project', created_at: ago(70) },
    ...(scope === 'week'
      ? [
          { id: `${scope}-d2`, agent_name: 'מרים', client_name: 'אור פלח', amount: 12500, kind: 'course', created_at: ago(1600) },
          { id: `${scope}-d3`, agent_name: 'ודיע', client_name: 'קרן שדה', amount: 38000, kind: 'project', created_at: ago(3400) },
        ]
      : []),
  ]
  return {
    scope,
    booked,
    deals,
    counts: {
      meetings: scope === 'week' ? 41 : 17,
      deals: deals.length,
      revenue: deals.reduce((s, d) => s + d.amount, 0),
    },
  }
}
