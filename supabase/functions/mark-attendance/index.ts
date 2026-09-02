// Supabase Edge Function: mark-attendance
//
// Sets a meeting's attendance from a notification button. Called by the service
// worker on the phone, which holds no credentials — its authority is a
// single-use token minted when the notification was sent (see push_actions).
//
// POST { token, status }  status ∈ attended | no_show
//
// verify_jwt is false on purpose: a notification is tapped from the lock
// screen, where there is no session to speak of. The token IS the credential,
// and it is deliberately weak — it can set one field on one meeting, once.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const ALLOWED = new Set(['attended', 'no_show'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json().catch(() => ({}))
    const token = String(body.token || '').trim()
    const status = String(body.status || '').trim()

    if (!token) return json({ ok: false, error: 'no_token' }, 400)
    if (!ALLOWED.has(status)) return json({ ok: false, error: 'bad_status' }, 400)

    const { data: row } = await admin
      .from('push_actions')
      .select('token, meeting_id, expires_at')
      .eq('token', token)
      .maybeSingle()

    // A missing row covers both "never existed" and "already used" — the same
    // answer either way, so a replayed tap can't reveal which.
    if (!row) return json({ ok: false, error: 'invalid_token' }, 401)

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from('push_actions').delete().eq('token', token)
      return json({ ok: false, error: 'expired' }, 401)
    }

    const { data: updated, error } = await admin
      .from('meetings')
      .update({ status })
      .eq('id', row.meeting_id)
      .select('id, title, status')
      .maybeSingle()

    if (error) return json({ ok: false, error: 'update_failed', detail: error.message }, 500)

    // Burn the token whether or not the meeting still exists — it has done its
    // one job and must not survive to do it again.
    await admin.from('push_actions').delete().eq('token', token)

    if (!updated) return json({ ok: false, error: 'meeting_gone' }, 404)
    return json({ ok: true, status: updated.status, title: updated.title })
  } catch (e) {
    console.error('[mark-attendance]', String(e))
    return json({ ok: false, error: String(e).slice(0, 200) }, 500)
  }
})
