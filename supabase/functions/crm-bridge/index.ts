// Supabase Edge Function: crm-bridge
//
// The browser extension's only door into this system. It answers one question —
// "which meetings has this agent booked recently?" — so the extension can offer
// them for one-click filling into BMBY's meeting form.
//
// Read-only by design. The extension can see a short list of the agent's own
// meetings and nothing else: no clients table, no deals, no other agent's work.
// If the token ever leaks, that is the entire blast radius.
//
// Auth is a shared token in app_auth.crm_bridge_token, sent as a header. It is
// deliberately NOT the anon key: the anon key reaches the whole PostgREST API,
// and an extension installed on several office machines is not a place to put
// that.
//
// POST { agentName, limit?, sync? }   header: x-bridge-token
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-bridge-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Calendar holds are not meetings and must never be offered for filling. */
const BLOCK = /לא לקבוע|תפוס|חסום/u

const TZ = 'Asia/Jerusalem'

const WALL = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Israel's offset from UTC, in ms, at a given instant. */
function offsetMs(t: number): number {
  const map: Record<string, number> = {}
  for (const p of WALL.formatToParts(new Date(t))) {
    if (p.type !== 'literal') map[p.type] = Number(p.value)
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour === 24 ? 0 : map.hour,
    map.minute,
    map.second
  )
  return asUTC - t
}

/**
 * The UTC instant of midnight-in-Israel today.
 *
 * Solved by iteration, not by one correction. We want T where the wall clock
 * reads midnight, i.e. T = M - offset(T) — but offset depends on T. Correcting
 * once uses offset(M), which is the WRONG side of the clock change on the two
 * days a year Israel switches, and lands an hour out. A second pass, using the
 * offset at the answer we just computed, converges.
 */
function israelMidnightUtc(now = new Date()): Date {
  const [y, mo, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number)

  const midnightAsUTC = Date.UTC(y, mo - 1, d)
  let t = midnightAsUTC - offsetMs(midnightAsUTC)
  t = midnightAsUTC - offsetMs(t)
  return new Date(t)
}

/**
 * Pull the calendar NOW instead of waiting for the five-minute cron.
 *
 * Measured on a month of real bookings: once the cron sync went live the lag
 * from "written in the calendar" to "in our database" became 2.4 minutes on
 * average with a hard ceiling of 5.0 — which is exactly the cron period, not
 * the feed being slow. So the wait is pure scheduling, and pressing refresh can
 * simply do the fetch itself.
 *
 * Debounced through app_settings rather than a module variable: edge functions
 * run as several independent instances, and a counter in one of them says
 * nothing about what the others just did.
 *
 * Failure here is never fatal. A sync that times out or errors still falls
 * through to the query below and returns whatever the cron last brought in —
 * stale results beat an error message in the agent's face.
 */
const SYNC_TIMEOUT_MS = 25_000

async function pullCalendar(admin: any, minGapMs: number): Promise<'ok' | 'skipped' | 'failed'> {
  try {
    const { data: row } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'crm_last_sync')
      .maybeSingle()

    const last = Number(row?.value?.at) || 0
    if (Date.now() - last < minGapMs) return 'skipped'

    const { data: tok } = await admin
      .from('app_auth')
      .select('value')
      .eq('key', 'sync_token')
      .maybeSingle()
    if (!tok?.value) return 'failed'

    // Claim the slot BEFORE the fetch, not after: two agents pressing refresh in
    // the same second would otherwise both see an old timestamp and both sync.
    await admin
      .from('app_settings')
      .upsert({ key: 'crm_last_sync', value: { at: Date.now() } }, { onConflict: 'key' })

    const res = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-meetings?t=${encodeURIComponent(
        tok.value
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
      }
    )
    return res.ok ? 'ok' : 'failed'
  } catch (e) {
    console.error('[crm-bridge] sync', String(e))
    return 'failed'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: tok } = await admin
      .from('app_auth')
      .select('value')
      .eq('key', 'crm_bridge_token')
      .maybeSingle()

    const sent = req.headers.get('x-bridge-token') || ''
    if (!tok?.value || sent !== tok.value) return json({ ok: false, error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const agentName = String(body.agentName || '').trim()
    if (!agentName) return json({ ok: false, error: 'no_agent' }, 400)

    // Generous on purpose: a busy agent has ~30 meetings in this window, and a
    // list that silently stops short is worse than a long one — the meeting you
    // came to record is exactly the one that would be missing.
    const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 100)

    // The debounce is what makes an open BMBY tab affordable. Every tab polls on
    // its own ten-second clock, but they all share this one gate, so the actual
    // calendar fetch happens once per window however many tabs are watching.
    //
    // AUTO_GAP is deliberately UNDER the extension's ten-second cadence: at
    // exactly ten, ordinary jitter means every other poll arrives a hair early,
    // gets skipped, and the real cadence silently becomes twenty.
    //
    // "now" is a person pressing refresh, and must not be swallowed by an
    // automatic pull that happened to land a moment earlier — it only needs a
    // gap big enough to absorb a double-click.
    const AUTO_GAP = 9_000
    const NOW_GAP = 3_000
    const syncMode =
      body.sync === 'now'
        ? NOW_GAP
        : body.sync === 'auto' || body.sync === 'open'
          ? AUTO_GAP
          : 0
    const synced = syncMode ? await pullCalendar(admin, syncMode) : 'off'

    // From the START of today in Israel, not from this moment: a 09:00 meeting
    // must still be listed at 14:00, or an agent recording their morning would
    // find it missing. Forward thirty days.
    const from = israelMidnightUtc().toISOString()
    const to = new Date(Date.now() + 30 * 864e5).toISOString()

    const { data, error } = await admin
      .from('meetings')
      .select('id, title, meeting_date, type, location, description, agent_name')
      .eq('agent_name', agentName)
      .gte('meeting_date', from)
      .lte('meeting_date', to)
      .order('meeting_date', { ascending: true })
      .limit(limit)

    if (error) return json({ ok: false, error: 'query_failed', detail: error.message }, 500)

    const meetings = (data || []).filter((m: any) => !BLOCK.test(m.title || ''))
    return json({ ok: true, meetings, synced })
  } catch (e) {
    console.error('[crm-bridge]', String(e))
    return json({ ok: false, error: String(e).slice(0, 200) }, 500)
  }
})
