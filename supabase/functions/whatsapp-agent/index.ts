// Supabase Edge Function: whatsapp-agent
//
// Per-agent WhatsApp automation via Green API. Each agent connects their own
// business WhatsApp by scanning a QR shown in the app, then sends template
// messages automatically through their own number.
//
// Passing { shared: true } targets the reserved '__summary__' instance instead:
// one company-wide WhatsApp used only by the day-summary page. Its token is
// RLS-blocked from clients and only ever read here (service role).
//
// Auto-injected secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SHARED_KEY = '__summary__'

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
 * Green API chatId for a destination. Accepts:
 *   - a full chatId  ("…@g.us" / "…@c.us")        → used as-is
 *   - a group id     ("972504573304-1549874088")  → "…@g.us"
 *   - a phone number ("0506060176" / "+972…")     → "972…@c.us"
 */
function toChatId(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/@[cg]\.us$/i.test(s)) return s
  if (/^\d+-\d+$/.test(s)) return `${s}@g.us`
  let d = s.replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '972' + d.slice(1)
  return `${d}@c.us`
}

function credsLookValid(idInstance: string, apiToken: string): boolean {
  return /^\d{6,}$/.test(idInstance) && /^[A-Za-z0-9]{15,}$/.test(apiToken)
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 12000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctl.signal })
  } finally {
    clearTimeout(t)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    const agentName = String(body.agentName || '')
    const isShared = body.shared === true

    // Which instance this call targets: the shared summary one, or the agent's.
    const lookupName = isShared ? SHARED_KEY : agentName
    if (!lookupName) return json({ error: 'missing_agent' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)

    // Agents may only ever save/reset their OWN instance.
    if (action === 'save') {
      if (isShared) return json({ error: 'forbidden' }, 403)
      const idInstance = String(body.idInstance || '').trim()
      const apiToken = String(body.apiToken || '').trim()
      const apiUrl = String(body.apiUrl || 'https://api.green-api.com').trim()
      if (!idInstance || !apiToken) return json({ error: 'missing_credentials' }, 400)
      if (!credsLookValid(idInstance, apiToken)) {
        return json({ error: 'invalid_credentials_format' }, 400)
      }
      // The shared summary instance must never double as an agent's personal
      // one — their messages would then go out from the summary number, and the
      // WhatsApp page would look "connected" without a real personal account.
      const { data: shared } = await admin
        .from('whatsapp_instances')
        .select('id_instance')
        .eq('agent_name', SHARED_KEY)
        .maybeSingle()
      if (shared?.id_instance === idInstance) {
        return json({ error: 'instance_reserved_for_summary' }, 400)
      }
      const { error } = await admin.from('whatsapp_instances').upsert({
        agent_name: agentName,
        id_instance: idInstance,
        api_token: apiToken,
        api_url: apiUrl,
        status: 'notAuthorized',
        updated_at: new Date().toISOString(),
      })
      if (error) return json({ error: 'save_failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'reset') {
      if (isShared) return json({ error: 'forbidden' }, 403)
      await admin.from('whatsapp_instances').delete().eq('agent_name', agentName)
      return json({ ok: true })
    }

    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('id_instance, api_token, api_url')
      .eq('agent_name', lookupName)
      .maybeSingle()

    if (!inst) return json({ configured: false })

    if (!credsLookValid(inst.id_instance, inst.api_token)) {
      return json({ configured: true, state: 'error', error: 'bad_credentials' })
    }

    const base = `${inst.api_url.replace(/\/$/, '')}/waInstance${inst.id_instance}`
    const tok = inst.api_token

    async function setStatus(status: string) {
      await admin
        .from('whatsapp_instances')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('agent_name', lookupName)
    }

    if (action === 'state' || action === 'qr') {
      let sr: Response
      try {
        sr = await fetchWithTimeout(`${base}/getStateInstance/${tok}`)
      } catch {
        return json({ configured: true, state: 'error', error: 'unreachable' })
      }
      if (sr.status === 401 || sr.status === 403 || sr.status === 404 || sr.status === 400) {
        return json({ configured: true, state: 'error', error: 'bad_credentials', status: sr.status })
      }
      const sd = await sr.json().catch(() => null)
      if (!sr.ok || !sd) {
        return json({ configured: true, state: 'error', error: 'api_error', status: sr.status })
      }
      const stateInstance = sd?.stateInstance || 'unknown'
      if (stateInstance === 'authorized') {
        await setStatus('authorized')
        return json({ configured: true, state: 'authorized' })
      }
      await setStatus('notAuthorized')

      if (action === 'state') return json({ configured: true, state: stateInstance })

      let r: Response
      try {
        r = await fetchWithTimeout(`${base}/qr/${tok}`)
      } catch {
        return json({ configured: true, state: 'error', error: 'unreachable' })
      }
      if (!r.ok) {
        return json({ configured: true, state: 'error', error: 'qr_failed', status: r.status })
      }
      const d = await r.json().catch(() => ({}))
      if (d?.type === 'alreadyLogged') {
        await setStatus('authorized')
        return json({ configured: true, state: 'authorized' })
      }
      if (d?.type === 'qrCode' && d?.message) {
        return json({ configured: true, state: 'notAuthorized', qr: d.message })
      }
      if (d?.type === 'error') {
        return json({ configured: true, state: 'error', error: 'qr_error', detail: String(d?.message || '').slice(0, 160) })
      }
      return json({ configured: true, state: 'notAuthorized', qr: null })
    }

    if (action === 'send') {
      const chatId = toChatId(String(body.phone || ''))
      const message = String(body.message || '')
      if (!chatId || !message) return json({ error: 'missing_message' }, 400)
      let r: Response
      try {
        r = await fetchWithTimeout(`${base}/sendMessage/${tok}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message }),
        })
      } catch {
        return json({ error: 'unreachable' }, 502)
      }
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d?.idMessage) {
        return json({ error: 'send_failed', detail: JSON.stringify(d).slice(0, 200) }, 502)
      }
      return json({ ok: true, idMessage: d.idMessage })
    }

    if (action === 'logout') {
      if (isShared) return json({ error: 'forbidden' }, 403)
      try {
        await fetchWithTimeout(`${base}/logout/${tok}`)
      } catch {
        /* ignore */
      }
      await setStatus('notAuthorized')
      return json({ ok: true })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    return json({ error: 'server_error', detail: String(e).slice(0, 200) }, 500)
  }
})
