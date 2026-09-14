// The raw rows behind דוח יומי. The shaping lives in lib/dailyReport.js.

import { supabase } from '../lib/supabaseClient'
import { getMeetingsBookedOnDate } from './meetingsService'
import { getDaySummaries } from './daySummaryService'

const PACE_DAYS = 14

/** Local (Israel) day bounds — the browser runs in the office's timezone. */
function dayBounds(dateKey) {
  return { start: new Date(`${dateKey}T00:00:00`), end: new Date(`${dateKey}T23:59:59.999`) }
}

/**
 * Meetings booked per WORKING day (Sunday–Thursday) over the two weeks before
 * `dateKey`. Dividing by calendar days, weekends included, made every ordinary
 * weekday look "above average".
 */
async function bookingPace(start) {
  const from = new Date(start)
  from.setDate(from.getDate() - PACE_DAYS)
  let workdays = 0
  for (let d = new Date(from); d < start; d.setDate(d.getDate() + 1)) {
    if (d.getDay() <= 4) workdays++
  }
  const { count, error } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .gte('event_created_at', from.toISOString())
    .lt('event_created_at', start.toISOString())
    .not('agent_name', 'is', null)
  if (error) throw error
  return workdays ? Math.round((count || 0) / workdays) : null
}

export async function loadDailyReport(dateKey) {
  const { start, end } = dayBounds(dateKey)

  const [booked, heldRes, dealsRes, paysRes, summaries, paceAvg] = await Promise.all([
    getMeetingsBookedOnDate(dateKey),
    supabase
      .from('meetings')
      .select('id, agent_name, status, type, meeting_date, title')
      .gte('meeting_date', start.toISOString())
      .lte('meeting_date', end.toISOString())
      .not('agent_name', 'is', null),
    supabase
      .from('deals')
      .select('id, agent_name, client_name, amount, kind, deal_date')
      .eq('deal_date', dateKey),
    supabase.from('deal_payments').select('id, deal_id, amount').eq('paid_on', dateKey),
    getDaySummaries(dateKey),
    // The average is context, not the report — a failure must not sink the day.
    bookingPace(start).catch(() => null),
  ])
  for (const r of [heldRes, dealsRes, paysRes]) if (r.error) throw r.error

  // A charge carries no agent of its own; it is the agent's whose deal it is.
  const pays = paysRes.data || []
  const ids = [...new Set(pays.map((p) => p.deal_id))]
  const owner = {}
  if (ids.length) {
    const { data, error } = await supabase.from('deals').select('id, agent_name, client_name').in('id', ids)
    if (error) throw error
    for (const d of data || []) owner[d.id] = d
  }

  return {
    // Unassigned calendar entries are blockers ("איציק תפוס"), not bookings.
    booked: booked.filter((m) => m.agent_name),
    held: heldRes.data || [],
    deals: dealsRes.data || [],
    payments: pays.map((p) => ({
      ...p,
      agent_name: owner[p.deal_id]?.agent_name || null,
      client_name: owner[p.deal_id]?.client_name || null,
    })),
    summaries,
    paceAvg,
  }
}
