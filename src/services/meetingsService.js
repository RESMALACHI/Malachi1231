import { supabase } from '../lib/supabaseClient'
import { monthRange } from '../lib/dateUtils'
import { clientName, clientPhone } from '../lib/meetingTitle'

/**
 * Meetings for one agent (by name) within a given month, ordered by date.
 *
 * Scoped by agent_name only — meetings are a shared dataset, so any logged-in
 * user sees the selected agent's meetings regardless of who synced them.
 */
export async function getMonthlyMeetings(agentName, year, month) {
  const { timeMin, timeMax } = monthRange(year, month)
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('agent_name', agentName)
    .gte('meeting_date', timeMin)
    .lt('meeting_date', timeMax)
    .order('meeting_date', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * One agent's meetings inside an arbitrary [timeMin, timeMax) window.
 *
 * The day/week views need this rather than the month query: a week can straddle
 * two months, and loading only one of them would silently hide half the week.
 */
export async function getMeetingsInRange(agentName, timeMin, timeMax) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('agent_name', agentName)
    .gte('meeting_date', timeMin)
    .lt('meeting_date', timeMax)
    .order('meeting_date', { ascending: true })

  if (error) throw error
  return data || []
}

/** Every agent's meetings in a window — the manager's day/week/month views. */
export async function getAllMeetingsInRange(timeMin, timeMax) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .gte('meeting_date', timeMin)
    .lt('meeting_date', timeMax)
    .order('meeting_date', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Unassigned meetings (פגישות אבודות) for a single month — every meeting whose
 * calendar text matched no agent (agent_name IS NULL). Ordered by date.
 */
export async function getUnassignedMeetings(year, month) {
  const { timeMin, timeMax } = monthRange(year, month)
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .is('agent_name', null)
    .eq('dismissed', false)
    .gte('meeting_date', timeMin)
    .lt('meeting_date', timeMax)
    .order('meeting_date', { ascending: true })

  if (error) throw error
  return data || []
}

/** How many unassigned meetings exist in a month (for the nav badge). */
export async function getUnassignedCount(year, month) {
  const { timeMin, timeMax } = monthRange(year, month)
  const { count, error } = await supabase
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .is('agent_name', null)
    .eq('dismissed', false)
    .gte('meeting_date', timeMin)
    .lt('meeting_date', timeMax)

  if (error) throw error
  return count || 0
}

/**
 * Permanently dismiss a lost meeting (manager-only, enforced in the UI). Flags
 * the row instead of hard-deleting so the next sync won't re-insert it.
 */
export async function dismissMeeting(meetingId) {
  const { error } = await supabase
    .from('meetings')
    .update({ dismissed: true })
    .eq('id', meetingId)

  if (error) throw error
}

/**
 * Claim an unassigned meeting for an agent. Only assigns rows that are still
 * unassigned (agent_name IS NULL), so two agents can't both grab the same one.
 * Returns the updated row, or null if it was already taken.
 */
export async function claimMeeting(meetingId, agentName, agentId) {
  const { data, error } = await supabase
    .from('meetings')
    .update({ agent_name: agentName, agent_id: agentId ?? null })
    .eq('id', meetingId)
    .is('agent_name', null)
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Move a meeting to another field agent.
 *
 * The calendar sync deliberately preserves `agent_name`, so a manual transfer
 * remains in place on the next sync instead of bouncing back to the old owner.
 * `agent_id` is cleared because it represents the person who originally
 * claimed/synced the row, not the new owner shown throughout the app.
 */
export async function transferMeeting(meetingId, agentName) {
  const nextAgent = String(agentName || '').trim()
  if (!meetingId || !nextAgent) throw new Error('missing_transfer_target')

  const { data, error } = await supabase
    .from('meetings')
    .update({ agent_name: nextAgent, agent_id: null })
    .eq('id', meetingId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

/** One agent's meetings from `sinceISO` onward (no upper bound), by date. */
export async function getMeetingsSince(agentName, sinceISO) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('agent_name', agentName)
    .gte('meeting_date', sinceISO)
    .order('meeting_date', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Meetings this agent BOOKED today — matched on `event_created_at`, the moment
 * the event was created in Google Calendar.
 *
 * Deliberately NOT `created_at`: that only records when our sync first inserted
 * the row, so a meeting booked last week but first seen by the sync today would
 * be miscounted as booked today.
 */
export async function getMeetingsBookedToday(agentName) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('meetings')
    .select('id, title, meeting_date, type, event_created_at')
    .eq('agent_name', agentName)
    .gte('event_created_at', start.toISOString())
    .lte('event_created_at', end.toISOString())
    .order('event_created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Find meetings by free text (client name, phone, anything in the details) —
 * across ALL months, since "where's that meeting with דני?" rarely knows which.
 *
 * Searches title + description only. NOT `location`: Google appends the country
 * to every address ("רמת גן, ישראל"), so searching a client named ישראל matched
 * every meeting held in Israel.
 *
 * Results are ranked title-first — the client's name lives in the title, so
 * those are what the searcher means; description hits are supporting matches.
 *
 * `allAgents` is for the manager's overview; an agent searches only their own.
 */
/** One meeting by id — the global search's deep link into the calendar. */
export async function getMeetingById(id) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function searchMeetings(agentName, query, { allAgents = false } = {}) {
  // PostgREST's or() is comma/dot separated — strip what would break the filter.
  const clean = String(query).trim().replace(/[",()\\]/g, '')
  if (clean.length < 2) return []
  const like = `%${clean}%`

  let req = supabase
    .from('meetings')
    .select('id, title, meeting_date, agent_name, status, type')
    .or(`title.ilike."${like}",description.ilike."${like}"`)
    .order('meeting_date', { ascending: false })
    .limit(40)

  if (!allAgents) req = req.eq('agent_name', agentName)

  const { data, error } = await req
  if (error) throw error

  const needle = clean.toLowerCase()
  return (data || [])
    .map((m) => ({ ...m, inTitle: (m.title || '').toLowerCase().includes(needle) }))
    .sort(
      (a, b) =>
        Number(b.inTitle) - Number(a.inTitle) ||
        new Date(b.meeting_date) - new Date(a.meeting_date)
    )
}

/**
 * Every other meeting with the same client — their history with the college.
 *
 * Identified by phone first (the one thing written the same way every time) and
 * only by name when no phone was recorded. A name-only match is the weaker of
 * the two, so it demands a real name: the placeholder and 3-letter fragments
 * would otherwise match half the calendar.
 *
 * Returns [] rather than throwing — a meeting's own detail view must still open
 * if the history lookup fails.
 */
export async function getClientHistory(agentName, meeting, { allAgents = false } = {}) {
  if (!meeting) return []

  const phone = clientPhone(meeting)
  // The last 9 digits match whether or not the leading zero was typed.
  const needle = phone
    ? phone.slice(-9)
    : (() => {
        const name = clientName(meeting.title, meeting.agent_name)
        return name && name.length >= 4 && name !== '(ללא פרטים)' ? name : null
      })()

  if (!needle) return []

  try {
    const rows = await searchMeetings(agentName, needle, { allAgents })
    return rows.filter((r) => r.id !== meeting.id)
  } catch {
    return []
  }
}

/**
 * Every agent's meetings booked on one calendar date (by `event_created_at`).
 * Powers the manager's per-agent daily view, and works for any past date —
 * unlike the reported summary, which only exists once an agent files it.
 */
export async function getMeetingsBookedOnDate(dateKey) {
  const start = new Date(`${dateKey}T00:00:00`)
  const end = new Date(`${dateKey}T23:59:59.999`)

  const { data, error } = await supabase
    .from('meetings')
    .select('id, agent_name, type, event_created_at')
    .gte('event_created_at', start.toISOString())
    .lte('event_created_at', end.toISOString())

  if (error) throw error
  return data || []
}

/** Every agent's meetings from `sinceISO` onward — for the manager's task view. */
export async function getAllMeetingsSince(sinceISO) {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .gte('meeting_date', sinceISO)
    .order('meeting_date', { ascending: true })

  if (error) throw error
  return data || []
}

/** Mark a task (follow-up / reschedule) as handled — hides it from the Tasks page. */
export async function closeTask(meetingId) {
  const { error } = await supabase
    .from('meetings')
    .update({ task_done: true })
    .eq('id', meetingId)

  if (error) throw error
}

/** Update the attendance status of a single meeting. */
export async function updateMeetingStatus(meetingId, status) {
  const { data, error } = await supabase
    .from('meetings')
    .update({ status })
    .eq('id', meetingId)
    .select()
    .single()

  if (error) throw error
  return data
}

/** Update the location type (zoom / frontal) of a single meeting. */
export async function updateMeetingType(meetingId, type) {
  const { data, error } = await supabase
    .from('meetings')
    .update({ type })
    .eq('id', meetingId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * All meetings in a month (across agent_names) for the admin summary.
 * RLS still scopes to what the caller is allowed to read.
 */
export async function getAllMeetingsForMonth(year, month) {
  const { timeMin, timeMax } = monthRange(year, month)
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .gte('meeting_date', timeMin)
    .lt('meeting_date', timeMax)
    .order('meeting_date', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Derive KPI numbers from a list of meeting rows. Pure — reused by both the
 * reports page and the admin per-agent summary.
 */
/**
 * An attendance rate for display. A null rate means nothing in the period has
 * been marked yet — which must read as "no data", never as 0%.
 */
export function formatRate(rate) {
  return rate == null ? '—' : `${rate}%`
}

export function computeKpis(meetings) {
  const total = meetings.length
  const attended = meetings.filter((m) => m.status === 'attended').length
  const noShow = meetings.filter((m) => m.status === 'no_show').length
  const pending = meetings.filter((m) => m.status === 'pending').length
  const zoom = meetings.filter((m) => m.type === 'zoom').length
  const frontal = meetings.filter((m) => m.type === 'frontal').length
  const unknown = meetings.filter((m) => m.type === 'unknown').length

  // Of the people who ACTUALLY arrived — how many were zoom vs frontal.
  // 'unknown' is kept separate rather than folded into frontal: the calendar
  // never said, and guessing would skew the bonus numbers.
  const attendedZoom = meetings.filter(
    (m) => m.status === 'attended' && m.type === 'zoom'
  ).length
  const attendedFrontal = meetings.filter(
    (m) => m.status === 'attended' && m.type === 'frontal'
  ).length
  const attendedUnknown = meetings.filter(
    (m) => m.status === 'attended' && m.type === 'unknown'
  ).length

  // Attendance rate = attended / (attended + no-show).
  //
  // Deliberately NOT attended/total. A meeting nobody has marked yet says
  // nothing about whether the client showed up, and counting it as a miss
  // punished the team for paperwork: July read 24% when the meetings that were
  // actually settled came out at 42%, and June read 19% against a real 51%.
  //
  // `decided` is the honest denominator. When it is zero the rate is NULL, not
  // 0 — "nothing has been marked" and "nobody came" are different facts, and
  // whole months here have no marks at all.
  const decided = attended + noShow
  const attendanceRate = decided > 0 ? Math.round((attended / decided) * 100) : null

  // ── One client, several meetings ────────────────────────────────────────────
  // Identity is the phone number when the calendar carries one — the same
  // person is written "דני", "דני כהן" and "דני כהן חיפה" across three
  // meetings, but their number does not change. Only when there is no number at
  // all does the cleaned-up name stand in.
  const seen = new Map()
  for (const m of meetings) {
    const phone = clientPhone(m)
    const key = phone ? `p:${phone}` : `n:${clientName(m.title, m.agent_name)}`
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  const uniqueClients = seen.size
  // Clients booked more than once, and how many meetings that accounts for.
  const repeatClients = [...seen.values()].filter((n) => n > 1).length
  const repeatMeetings = [...seen.values()].reduce((sum, n) => sum + (n > 1 ? n : 0), 0)
  const onceOnlyClients = uniqueClients - repeatClients

  return {
    total,
    attended,
    noShow,
    pending,
    decided,
    zoom,
    frontal,
    unknown,
    attendedZoom,
    attendedFrontal,
    attendedUnknown,
    attendanceRate,
    uniqueClients,
    repeatClients,
    repeatMeetings,
    onceOnlyClients,
  }
}
