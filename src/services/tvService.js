// Everything the "מסך טלוויזיה" board needs, in one round trip.
//
// The board celebrates two things as they happen: a meeting getting BOOKED, and
// a deal getting CLOSED. Both are read "since local midnight" so the office TV
// resets itself every morning without anyone touching it.
//
// "Booked" is measured on event_created_at — the moment the event was created in
// Google Calendar — NOT created_at, which only records when our sync first saw
// the row (the same distinction meetingsService makes for "booked today").

import { supabase } from '../lib/supabaseClient'

/** Local (Israel — the browser runs there) midnight, as an ISO string. */
function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function getTvBoard() {
  // ?demo on the URL fills the board with sample wins — for showing the screen
  // off in a meeting, or checking the layout before the day's first booking.
  if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
    return demoBoard()
  }

  const since = startOfTodayISO()

  const [bookedRes, dealsRes] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, agent_name, title, meeting_date, type, event_created_at')
      .gte('event_created_at', since)
      .order('event_created_at', { ascending: false })
      .limit(60),
    supabase
      .from('deals')
      .select('id, agent_name, client_name, amount, kind, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  if (bookedRes.error) throw bookedRes.error
  if (dealsRes.error) throw dealsRes.error

  const booked = bookedRes.data || []
  const deals = dealsRes.data || []

  return {
    booked,
    deals,
    counts: {
      meetings: booked.length,
      deals: deals.length,
      revenue: deals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    },
  }
}

/** Sample data for ?demo — a good morning's worth of wins. */
function demoBoard() {
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString()
  const soon = (min) => new Date(Date.now() + min * 60000).toISOString()
  const booked = [
    { id: 'd1', agent_name: 'ודיע', title: 'פגישה פרונטלית - לואי קסיס - ודיע', meeting_date: soon(75), type: 'frontal', event_created_at: ago(2) },
    { id: 'd2', agent_name: 'ויטלי', title: 'פגישת זום - חתם ברגס - ויטלי', meeting_date: soon(140), type: 'zoom', event_created_at: ago(21) },
    { id: 'd3', agent_name: 'מרים', title: 'פגישה פרונטלית - דנה לוי - מרים', meeting_date: soon(200), type: 'frontal', event_created_at: ago(55) },
    { id: 'd4', agent_name: 'מלאכי אזערי', title: 'פגישת זום - יוסי כהן - מלאכי', meeting_date: soon(260), type: 'zoom', event_created_at: ago(140) },
    { id: 'd5', agent_name: 'עדי', title: 'פגישה פרונטלית - רון אבידן - עדי', meeting_date: soon(20), type: 'frontal', event_created_at: ago(200) },
    { id: 'd6', agent_name: 'ודיע', title: 'פגישה פרונטלית - שירה מזרחי - ודיע', meeting_date: soon(320), type: 'frontal', event_created_at: ago(255) },
  ]
  const deals = [
    { id: 'd7', agent_name: 'ויטלי', client_name: 'משפחת ברקוביץ', amount: 24000, kind: 'project', created_at: ago(70) },
  ]
  return {
    booked,
    deals,
    counts: { meetings: booked.length, deals: deals.length, revenue: 24000 },
  }
}

/** One merged, newest-first stream of "things that happened today". */
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
