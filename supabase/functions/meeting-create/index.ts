// Supabase Edge Function: meeting-create
//
// Turns a ".פגישה" WhatsApp message into a Google Calendar event. The parser
// (parseMeeting.ts, already unit-tested) does the reading; here we just get an
// access token and create the event.
//
// TEST MODE (current): every meeting is written to the connected test account's
// primary calendar, whatever its type. `wouldGoTo` in the response says which
// real calendar (zahar / ramatgan) it will route to once we go live.
//
// Credentials come from the RLS-locked app_auth table — never the browser.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseMeeting, toCalendarEvent } from './parseMeeting.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** refresh_token → access_token for the test calendar account. */
async function accessToken(admin: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: rows } = await admin
    .from('app_auth')
    .select('key, value')
    .in('key', ['gcal_client_id', 'gcal_client_secret', 'gcal_refresh_test'])
  const cfg: Record<string, string> = {}
  for (const r of rows || []) cfg[r.key] = r.value
  if (!cfg.gcal_client_id || !cfg.gcal_client_secret || !cfg.gcal_refresh_test) return null

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.gcal_client_id,
      client_secret: cfg.gcal_client_secret,
      refresh_token: cfg.gcal_refresh_test,
      grant_type: 'refresh_token',
    }),
  })
  const t = await r.json()
  return t.access_token || null
}

/**
 * Wall-clock start/end for the event. Built via Date.UTC so the components
 * round-trip unchanged through toISOString — Google then reads them in the
 * given timeZone. Adding an hour rolls correctly, even across midnight.
 */
function startEnd(date: string, time: string) {
  const [Y, Mo, D] = date.split('-').map(Number)
  const [H, Mi] = time.split(':').map(Number)
  const s = new Date(Date.UTC(Y, Mo - 1, D, H, Mi))
  const e = new Date(s.getTime() + 60 * 60 * 1000)
  const f = (d: Date) => d.toISOString().slice(0, 19)
  return { start: f(s), end: f(e) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json().catch(() => ({}))
    const message = String(body.message ?? '')
    if (!message.trim()) return json({ ok: false, error: 'empty_message' }, 400)

    const p = parseMeeting(message)

    // Couldn't parse → tell the group exactly what's missing, create nothing.
    if (!p.ok) {
      return json({
        ok: false,
        errors: p.errors,
        reply: `❌ לא הצלחתי לקלוט את הפגישה:\n• ${p.errors.join('\n• ')}\n\nתקנו ושלחו שוב.`,
      })
    }

    const ev = toCalendarEvent(p)
    const { start, end } = startEnd(p.date!, p.time!)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const token = await accessToken(admin)
    if (!token) return json({ ok: false, error: 'no_gcal_token' }, 500)

    // TEST MODE — always the primary calendar of the test account.
    const createRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
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
    const created = await createRes.json()
    if (!created.id) return json({ ok: false, step: 'create', detail: created }, 502)

    const typeHe = p.type === 'zoom' ? 'זום' : 'פרונטלי'
    return json({
      ok: true,
      reply:
        `✅ הפגישה נקלטה ונוצרה ביומן:\n` +
        `👤 ${p.name}\n📞 ${p.phone}\n📅 ${p.date} ${p.time}\n` +
        `📍 ${typeHe} · מתאם: ${p.coordinator}` +
        (p.performerRaw ? ` · מבצע: ${p.performerRaw}` : ''),
      event: {
        title: ev.title,
        description: ev.description,
        start,
        end,
        wouldRouteTo: ev.calendar, // in production: zahar / ramatgan
        link: created.htmlLink,
      },
    })
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500)
  }
})
