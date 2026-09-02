// Supabase Edge Function: sync-meetings
//
// Server-side calendar sync. A pg_cron job calls this every few minutes, so the
// meetings table stays fresh WITHOUT every open browser tab fetching + parsing
// the iCal feeds itself (that client-side loop is what made the app crawl on
// weak office machines).
//
// Auth: no JWT — guarded by a secret token in the URL (?t=...), checked against
// app_auth.sync_token, same pattern as wa-webhook.
//
// Window: start of the CURRENT month → end of NEXT month (meetings are booked
// ahead), or a specific { year, month } from the body.
//
// Diff rules — identical to the client's src/services/syncService.js:
//  - new event            → INSERT (status pending; agent_name may be null)
//  - changed event        → UPDATE title/time/details only; agent_name /
//                           status / type are NEVER overwritten
//  - event gone from ALL feeds → DELETE, but ONLY when every feed answered —
//    with a partial feed set, absence proves nothing and deleting would wipe
//    the attendance marks people's pay is calculated from.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { fetchWindowEvents } from './feed.ts'

// FALLBACK ONLY — the live table comes from the roster (loadAliases below).
// Kept in sync with src/lib/agents.js BUILTIN_ROSTER so a database that cannot
// be read still classifies the team as it always has.
const AGENT_ALIASES: Record<string, string[]> = {
  'מלאכי אזערי': ['מלאכי אזערי', 'מלאכי'],
  'ודיע': ['וודיע', 'ודיע'],
  'עדי': ['עדי בן שטרית', 'עדי'],
  'מרים': ['מרים', 'מריים', 'מירים'],
  'ויטלי': ['ויטלי', 'ויטאלי'],
  'שליו': ['שליו חסידים'],
}
const IGNORE_WORDS = ['רן']

/**
 * The alias table, read from the roster the control panel edits.
 *
 * מלאכי can add and rename people from inside the app, and a new agent whose
 * aliases only existed in this file would have every meeting they book land in
 * the Claim Yard unassigned — the failure would look like the sync working.
 *
 * The hardcoded table above stays as the fallback: if app_settings cannot be
 * read, matching keeps working for the team it has always known rather than
 * stopping altogether.
 */
async function loadAliases(admin: any): Promise<Record<string, string[]>> {
  try {
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'roster')
      .maybeSingle()
    const list = data?.value?.agents
    if (!Array.isArray(list) || list.length === 0) return AGENT_ALIASES

    const out: Record<string, string[]> = {}
    for (const a of list) {
      const name = String(a?.name || '').trim()
      if (!name) continue
      // A manager-only person owns no meetings and must not be a classification
      // target: a meeting filed on them shows in NOBODY's calendar. The roster
      // editor forces every entry at least one alias, so the roles array — not
      // an empty alias list — is what says "not a target". (Seen live: a tier-3
      // event said "מבצע הפגישה: איציק חסידים" and vanished onto איציק.)
      // Entries without roles are legacy agents; they stay matchable.
      const roles = Array.isArray(a?.roles) ? a.roles : []
      if (roles.length && !roles.includes('agent')) continue
      const aliases = (Array.isArray(a?.aliases) ? a.aliases : [])
        .map((x: unknown) => String(x || '').trim())
        .filter(Boolean)
      if (aliases.length) out[name] = aliases
    }
    return Object.keys(out).length ? out : AGENT_ALIASES
  } catch {
    return AGENT_ALIASES
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: tokRow } = await admin
      .from('app_auth')
      .select('value')
      .eq('key', 'sync_token')
      .maybeSingle()
    const url = new URL(req.url)
    if (!tokRow?.value || url.searchParams.get('t') !== tokRow.value) {
      return json({ error: 'unauthorized' }, 401)
    }

    const feeds = (Deno.env.get('ICAL_URLS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (feeds.length === 0) return json({ error: 'no_ical_urls' }, 500)

    // Window: the requested month, or current month through end of next month.
    const body = await req.json().catch(() => ({}))
    const now = new Date()
    const y = Number.isInteger(body.year) ? body.year : now.getFullYear()
    const m = Number.isInteger(body.month) ? body.month : now.getMonth()
    const explicit = Number.isInteger(body.year) && Number.isInteger(body.month)
    const timeMin = new Date(y, m, 1)
    const timeMax = explicit ? new Date(y, m + 1, 1) : new Date(y, m + 2, 1)

    const { events, failed } = await fetchWindowEvents(
      feeds,
      timeMin,
      timeMax,
      await loadAliases(admin),
      IGNORE_WORDS
    )
    const incomplete = failed.length > 0
    const fetchedIds = new Set(events.map((e) => e.google_event_id))

    const { data: dbRows, error: dbError } = await admin
      .from('meetings')
      .select('id, google_event_id, title, meeting_date, description, location, event_created_at')
      .gte('meeting_date', timeMin.toISOString())
      .lt('meeting_date', timeMax.toISOString())
    if (dbError) throw dbError

    const dbByEventId = new Map<string, any>()
    for (const r of dbRows || []) {
      if (r.google_event_id) dbByEventId.set(r.google_event_id, r)
    }

    // New events → insert (agent_name may be null = the Claim Yard).
    const newRows = events
      .filter((e) => !dbByEventId.has(e.google_event_id))
      .map((e) => ({
        agent_id: null,
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
      const { data: ins, error } = await admin
        .from('meetings')
        .upsert(newRows, { onConflict: 'google_event_id', ignoreDuplicates: true })
        .select('id')
      if (error) throw error
      inserted = ins?.length ?? newRows.length
    }

    // Changed events → update content fields only.
    const changedRows = events
      .filter((e) => {
        const existing = dbByEventId.get(e.google_event_id)
        if (!existing) return false
        const timeChanged =
          new Date(existing.meeting_date).getTime() !== new Date(e.meeting_date).getTime()
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
          event_created_at: e.event_created_at ?? existing?.event_created_at ?? null,
        }
      })

    let updated = 0
    if (changedRows.length > 0) {
      const { data: upd, error } = await admin
        .from('meetings')
        .upsert(changedRows, { onConflict: 'google_event_id' })
        .select('id')
      if (error) throw error
      updated = upd?.length ?? changedRows.length
    }

    // Delete only with a COMPLETE view of every feed (see header comment).
    let deleted = 0
    if (!incomplete) {
      const idsToDelete = (dbRows || [])
        .filter((r) => r.google_event_id && !fetchedIds.has(r.google_event_id))
        .map((r) => r.id)
      if (idsToDelete.length > 0) {
        const { error, count } = await admin
          .from('meetings')
          .delete({ count: 'exact' })
          .in('id', idsToDelete)
        if (error) throw error
        deleted = count ?? idsToDelete.length
      }
    }

    return json({
      ok: true,
      window: { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() },
      fetched: events.length,
      inserted,
      updated,
      deleted,
      incomplete,
      failedFeeds: failed,
    })
  } catch (e) {
    console.error('[sync-meetings]', String(e))
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
