// Supabase Edge Function: crm-proxy
//
// Secure bridge between the "לקוחות" page and the Bambi CRM WS API. The browser
// never sees the CRM credentials — they live here as function secrets:
//   CRM_BASE_URL      e.g. https://api.bambi.co.il/ws   (from the API doc)
//   CRM_LOGIN         (username)
//   CRM_PASSWORD
//   CRM_PROJECT_ID
//
// NOTE: the exact request/response shape of each endpoint (search / tasks /
// insert / complete / update) is filled in from the CRM's API document. Until
// the endpoints below are wired, non-status actions return { error:'not_wired' }.
//
// Actions (POST JSON): status | search | tasks | insert_task | complete_task | update_task
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

interface Creds {
  baseUrl: string
  login: string
  password: string
  projectId: string
}
function readCreds(): Creds | null {
  const baseUrl = Deno.env.get('CRM_BASE_URL')
  const login = Deno.env.get('CRM_LOGIN')
  const password = Deno.env.get('CRM_PASSWORD')
  const projectId = Deno.env.get('CRM_PROJECT_ID')
  if (!baseUrl || !login || !password || !projectId) return null
  return { baseUrl: baseUrl.replace(/\/$/, ''), login, password, projectId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // Require a valid Supabase user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    const creds = readCreds()

    // Health check for the UI — is the CRM configured yet?
    if (action === 'status') return json({ configured: Boolean(creds) })

    if (!creds) return json({ configured: false, error: 'not_configured' })

    // ── CRM endpoint wiring (filled in from the Bambi API document) ──────────
    // Each branch will POST to `${creds.baseUrl}/…` with { login, password,
    // projectId, … } and map the response into the app's internal shape:
    //   client → { id, name, phone, email }
    //   task   → { id, title, status }
    switch (action) {
      case 'search': {
        // const q = String(body.query || '')
        // const r = await fetch(`${creds.baseUrl}/searchClient`, {...})
        return json({ configured: true, error: 'not_wired', clients: [] })
      }
      case 'tasks': {
        return json({ configured: true, error: 'not_wired', tasks: [] })
      }
      case 'insert_task':
      case 'complete_task':
      case 'update_task': {
        return json({ configured: true, error: 'not_wired' })
      }
      default:
        return json({ error: 'unknown_action' }, 400)
    }
  } catch (e) {
    return json({ error: 'server_error', detail: String(e).slice(0, 200) }, 500)
  }
})
