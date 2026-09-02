// Supabase Edge Function: team-login
//
// The app has no per-person accounts: entry is a question only the team can
// answer ("which CRM do we work with?"). This endpoint checks the answer
// SERVER-SIDE and hands back a real Supabase session for a shared account.
//
// Why server-side rather than checking in the app:
//   • An answer checked in the browser is theatre — anyone can read the bundle,
//     take the public anon key and query the database directly.
//   • So the accepted answers and the shared account's password live in
//     `app_auth`, a table with NO RLS policies (unreachable from any client
//     key) that only this function reads via the service role. Nothing secret
//     ships to the browser.
//
// verify_jwt MUST be false here — this is what you call to GET a session.
//
// Request (POST JSON): { answer }
// Response: { access_token, refresh_token } | { error: 'bad_answer' }
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

/**
 * Fold away everything a human might vary: case, spaces, quotes, גרשיים and
 * final-letter forms. "BMBY", " bmby ", "במבי", "במב״י" all land on the same
 * string — nobody should be locked out over a stray space.
 */
function normalise(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s"'`.\-_״׳]/g, '')
    .replace(/ן/g, 'נ')
    .replace(/ם/g, 'מ')
    .replace(/ץ/g, 'צ')
    .replace(/ף/g, 'פ')
    .replace(/ך/g, 'כ')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const body = await req.json().catch(() => ({}))
    // `pin` stays accepted so an old tab mid-session doesn't hard-fail.
    const given = normalise(body.answer ?? body.pin ?? '')
    if (!given) return json({ error: 'bad_answer' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: rows, error: cfgErr } = await admin
      .from('app_auth')
      .select('key, value')
      .in('key', ['team_answers', 'shared_email', 'shared_password'])

    if (cfgErr) return json({ error: 'server_error' }, 500)

    const cfg: Record<string, string> = {}
    for (const r of rows || []) cfg[r.key] = r.value
    if (!cfg.team_answers || !cfg.shared_email || !cfg.shared_password) {
      return json({ error: 'not_configured' }, 500)
    }

    const accepted = cfg.team_answers.split(',').map(normalise).filter(Boolean)

    // A wrong answer costs a second — enough to make automated guessing
    // impractical, without troubling a human who mistyped.
    if (!accepted.includes(given)) {
      await new Promise((r) => setTimeout(r, 1000))
      return json({ error: 'bad_answer' }, 401)
    }

    // Sign the shared account in. Created on first use so there's no manual
    // dashboard step to forget.
    const client = createClient(supabaseUrl, anonKey)
    let auth = await client.auth.signInWithPassword({
      email: cfg.shared_email,
      password: cfg.shared_password,
    })

    if (auth.error) {
      const { error: createErr } = await admin.auth.admin.createUser({
        email: cfg.shared_email,
        password: cfg.shared_password,
        email_confirm: true,
      })
      // A racing request may have created it a moment ago — retrying covers that.
      if (createErr && !/already/i.test(createErr.message)) {
        return json({ error: 'signin_failed', detail: createErr.message }, 500)
      }
      auth = await client.auth.signInWithPassword({
        email: cfg.shared_email,
        password: cfg.shared_password,
      })
      if (auth.error) {
        return json({ error: 'signin_failed', detail: auth.error.message }, 500)
      }
    }

    const s = auth.data.session
    if (!s) return json({ error: 'signin_failed' }, 500)

    return json({ access_token: s.access_token, refresh_token: s.refresh_token })
  } catch (e) {
    return json({ error: 'server_error', detail: String(e).slice(0, 200) }, 500)
  }
})
