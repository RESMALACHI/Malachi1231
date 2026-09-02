// Supabase Edge Function: lead-meeting
//
// Books a meeting from a lead's profile page — by composing the SAME ".פגישה"
// message the WhatsApp bot receives and running it through the SAME parser and
// the SAME calendar-creation path (service account, routed by "יומן:").
//
// Composing the bot's message instead of building an event directly is the
// point, not laziness: every downstream system — the sync, the agent
// classifier, the bonus logic — was built to read events the bot's format
// produces. A second, slightly different format would be a second dialect for
// all of them to mis-parse.
//
// CREATE-ONLY, like the bot: this file issues one POST to Google and nothing
// else. No update, no delete, ever.
//
// Auth: a signed-in team session. This writes to the office's real calendars.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseMeeting, toCalendarEvent } from './parseMeeting.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Wall-clock start/end, one hour long — identical to the bot's. */
function startEnd(date: string, time: string) {
  const [Y, Mo, D] = date.split('-').map(Number)
  const [H, Mi] = time.split(':').map(Number)
  const s = new Date(Date.UTC(Y, Mo - 1, D, H, Mi))
  const e = new Date(s.getTime() + 60 * 60 * 1000)
  const f = (d: Date) => d.toISOString().slice(0, 19)
  return { start: f(s), end: f(e) }
}

// ── Service-account token (copied from wa-webhook — same key, same scope) ──
function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
async function saAccessToken(sa: any): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
  const jwt = `${input}.${b64url(sig)}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const out = await res.json().catch(() => ({}))
  return out.access_token || null
}

const TYPE_LINE: Record<string, string> = {
  zoom: 'זום',
  ramatgan: 'פרונטלי רמת גן',
  haifa: 'פרונטלי חיפה',
  zahar: 'פרונטלי צחר',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    // Signed-in team member only — this writes to the real calendars.
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    const phone = String(body.phone || '').trim()
    const date = String(body.date || '').trim()   // yyyy-mm-dd from <input type=date>
    const time = String(body.time || '').trim()   // HH:MM
    const kind = String(body.kind || 'zoom')      // zoom | ramatgan | haifa | zahar
    const agent = String(body.agent || '').trim()
    const note = String(body.note || '').trim()

    if (!name || !phone || !date || !time || !agent) {
      return json({ ok: false, error: 'missing_fields' }, 400)
    }
    if (!TYPE_LINE[kind]) return json({ ok: false, error: 'bad_kind' }, 400)

    // The bot's own date format is dd/mm/yyyy.
    const [Y, M, D] = date.split('-')
    const ddmm = `${D}/${M}/${Y}`

    // Which Google account owns the event — the office convention: צחר events
    // in the zahar calendar, everything else (רמת גן, חיפה, זום) in ramat-gan's.
    const yoman = kind === 'zahar' ? 'צחר' : 'רמת גן'

    // Compose the canonical message and let the battle-tested parser read it —
    // if IT rejects the composition, nothing is created and the form learns why.
    const message = [
      '.פגישה',
      `שם: ${name}`,
      `טלפון: ${phone}`,
      `תאריך: ${ddmm}`,
      `שעה: ${time}`,
      `סוג: ${TYPE_LINE[kind]}`,
      `יומן: ${yoman}`,
      `מתאם הפגישה: ${agent}`,
      note ? note : null,
    ]
      .filter(Boolean)
      .join('\n')

    const p = parseMeeting(message)
    if (!p.ok) return json({ ok: false, error: 'parse_failed', errors: p.errors }, 400)

    const ev = toCalendarEvent(p)
    const { start, end } = startEnd(p.date!, p.time!)

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: rows } = await admin
      .from('app_auth')
      .select('key, value')
      .in('key', ['gcal_sa_json', 'gcal_cal_zahar', 'gcal_cal_ramatgan'])
    const cfg: Record<string, string> = {}
    for (const r of rows || []) cfg[r.key] = r.value
    if (!cfg.gcal_sa_json) return json({ ok: false, error: 'no_sa' }, 500)

    const token = await saAccessToken(JSON.parse(cfg.gcal_sa_json))
    if (!token) return json({ ok: false, error: 'no_google_token' }, 502)

    // Same routing rule as the bot: the event lives in the calendar its
    // "יומן:" names — zahar or ramat-gan (haifa meetings live in ramat-gan's).
    const calendarId = ev.calendar === 'zahar' ? cfg.gcal_cal_zahar : cfg.gcal_cal_ramatgan
    if (!calendarId) return json({ ok: false, error: 'no_calendar_id' }, 500)

    const createRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: ev.title,
          description: ev.description,
          start: { dateTime: start, timeZone: 'Asia/Jerusalem' },
          end: { dateTime: end, timeZone: 'Asia/Jerusalem' },
        }),
      }
    )
    const created = await createRes.json().catch(() => ({}))
    if (!created.id) return json({ ok: false, error: 'create_failed', detail: created }, 502)

    // Nudge the sync so the meeting shows up in the app in seconds, not in five
    // minutes. Best-effort: a failed nudge only means the cron catches it.
    const { data: tok } = await admin.from('app_auth').select('value').eq('key', 'sync_token').maybeSingle()
    if (tok?.value) {
      fetch(`${supabaseUrl}/functions/v1/sync-meetings?t=${tok.value}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => {})
    }

    return json({ ok: true, eventId: created.id, title: ev.title })
  } catch (e) {
    console.error('[lead-meeting]', String(e))
    return json({ ok: false, error: String(e).slice(0, 300) }, 500)
  }
})
