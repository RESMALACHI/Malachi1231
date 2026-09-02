import { supabase } from '../lib/supabaseClient'
import { monthRange } from '../lib/dateUtils'
import { AGENT_ALIASES, IGNORE_WORDS } from '../lib/agents'

/** Raised when the iCal feed can't be reached or isn't configured on the server. */
export class FeedConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'FeedConfigError'
  }
}

/**
 * Sync ONE month of meetings into the shared meetings table — for ALL agents at
 * once, plus unassigned meetings (the Claim Yard).
 *
 * The `calendar-feed` Edge Function (classify-all mode) returns every event in
 * the window, each tagged with `agent_name` (the matched agent, or null when no
 * agent's name appears in the event) and `source` (the calendar it came from).
 *
 * Rules:
 *  - New event → INSERT with its classified agent_name (may be null), status
 *    'pending', auto-detected type, and source.
 *  - Existing event whose title/time/details changed → UPDATE those fields only.
 *    agent_name / status / type are NEVER overwritten here, so a claimed meeting
 *    (or a manually-set attendance) is permanent.
 *  - DB meeting whose event is gone from ALL feeds → DELETE. Because we look at
 *    the full event set (not one agent's matches), a claimed-but-unmatched
 *    meeting is correctly kept.
 *
 * @param {{ agentId?: string, year: number, month: number }} opts
 * @returns {{ fetched, inserted, updated, skipped, deleted }}
 */
export async function syncMonth({ agentId, year, month }) {
  const range = monthRange(year, month)

  // Pull EVERY event in the month, classified per agent (or unassigned).
  const { data, error: fnError } = await supabase.functions.invoke('calendar-feed', {
    body: {
      timeMin: range.timeMin,
      timeMax: range.timeMax,
      agentAliases: AGENT_ALIASES,
      ignore: IGNORE_WORDS,
    },
  })

  if (fnError) {
    throw new FeedConfigError(
      'לא הצלחנו לשלוף את היומן מהשרת. ודא שפונקציית calendar-feed נפרסה ושהוגדר ה-secret‏ ICAL_URLS.'
    )
  }
  if (data?.error) {
    if (data.error === 'no_ical_urls') {
      throw new FeedConfigError('לא הוגדרו כתובות יומן (ICAL_URLS) בשרת.')
    }
    throw new Error(`שגיאה בשליפת היומן: ${data.error}`)
  }

  const events = data?.events || []
  const fetchedIds = new Set(events.map((e) => e.google_event_id))

  // True when at least one calendar feed failed to fetch — the event set below
  // is then only PART of the calendars, and absence proves nothing.
  const incomplete = Boolean(data?.incomplete)
  const failedFeeds = data?.feeds?.failed || []

  // Load ALL existing meetings for the month (every agent + unassigned).
  const { data: dbRows, error: dbError } = await supabase
    .from('meetings')
    .select(
      'id, google_event_id, title, meeting_date, description, location, event_created_at'
    )
    .gte('meeting_date', range.timeMin)
    .lt('meeting_date', range.timeMax)

  if (dbError) throw dbError

  const dbByEventId = new Map()
  for (const r of dbRows || []) {
    if (r.google_event_id) dbByEventId.set(r.google_event_id, r)
  }

  // New events → insert (agent_name may be null = unassigned / Claim Yard).
  const newRows = events
    .filter((e) => !dbByEventId.has(e.google_event_id))
    .map((e) => ({
      agent_id: agentId ?? null,
      agent_name: e.agent_name ?? null,
      google_event_id: e.google_event_id,
      title: e.title,
      meeting_date: e.meeting_date,
      type: e.type,
      status: 'pending',
      description: e.description,
      location: e.location,
      source: e.source ?? null,
      event_created_at: e.event_created_at ?? null,
    }))

  let inserted = 0
  if (newRows.length > 0) {
    const { data: ins, error } = await supabase
      .from('meetings')
      .upsert(newRows, { onConflict: 'google_event_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw error
    inserted = ins?.length ?? newRows.length
  }

  // Existing events whose content changed → update title/time/details only.
  // agent_name, status and type are intentionally left untouched.
  const changedRows = events
    .filter((e) => {
      const existing = dbByEventId.get(e.google_event_id)
      if (!existing) return false
      const timeChanged =
        new Date(existing.meeting_date).getTime() !== new Date(e.meeting_date).getTime()
      // Rows synced before we captured the calendar's CREATED need backfilling.
      const needsCreatedBackfill = !existing.event_created_at && !!e.event_created_at
      return (
        existing.title !== e.title ||
        timeChanged ||
        (existing.description || '') !== e.description ||
        (existing.location || '') !== e.location ||
        needsCreatedBackfill
      )
    })
    .map((e) => {
      const existing = dbByEventId.get(e.google_event_id)
      return {
        google_event_id: e.google_event_id,
        title: e.title,
        meeting_date: e.meeting_date,
        description: e.description,
        location: e.location,
        // Keep whatever we already have if this feed entry has no CREATED.
        event_created_at: e.event_created_at ?? existing?.event_created_at ?? null,
      }
    })

  let updated = 0
  if (changedRows.length > 0) {
    const { data: upd, error } = await supabase
      .from('meetings')
      .upsert(changedRows, { onConflict: 'google_event_id' })
      .select('id')
    if (error) throw error
    updated = upd?.length ?? changedRows.length
  }

  // Delete meetings whose event is gone from ALL feeds.
  //
  // Skipped entirely when any feed failed: with a partial event set we cannot
  // tell "deleted in Google Calendar" from "that calendar didn't answer", and
  // deleting on that guess would destroy every meeting the failed feed owns —
  // together with the attendance marks the bonus is calculated from. Leaving a
  // stale row until the next healthy sync is trivially recoverable; deleting a
  // real one is not.
  let deleted = 0
  if (!incomplete) {
    const idsToDelete = (dbRows || [])
      .filter((r) => r.google_event_id && !fetchedIds.has(r.google_event_id))
      .map((r) => r.id)

    if (idsToDelete.length > 0) {
      const { error, count } = await supabase
        .from('meetings')
        .delete({ count: 'exact' })
        .in('id', idsToDelete)
      if (error) throw error
      deleted = count ?? idsToDelete.length
    }
  }

  return {
    fetched: events.length,
    inserted,
    updated,
    skipped: events.length - inserted - updated,
    deleted,
    incomplete,
    failedFeeds,
  }
}
