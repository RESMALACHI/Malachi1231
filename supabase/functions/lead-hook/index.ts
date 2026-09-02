// Supabase Edge Function: lead-hook
//
// The door leads come in through. A landing page, a Facebook lead form, an
// affiliate — anything that can POST — sends one here:
//
//   POST https://<project>.supabase.co/functions/v1/lead-hook?t=<token>
//
// No JWT: the sender is somebody else's server and will never hold one. The
// token in the URL identifies which source is calling, and each source has its
// own, so revoking one costs exactly one integration.
//
// WHAT IT WILL NOT DO: reject a lead it does not fully understand. A lead that
// arrives in an unexpected shape is still a person who asked to be called, so
// the raw body is ALWAYS stored even when not one field could be mapped —
// wrong mapping then costs five minutes, not a week of silence.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// A megabyte is far past any lead form and well short of anything that could
// hurt the table.
const MAX_BODY = 1_000_000

/**
 * The spellings these fields actually arrive under, in both languages.
 *
 * Order matters — the first key present wins — so the specific ones come before
 * the vague. 'name' before 'first_name' would take half a name when both exist.
 */
const GUESS: Record<string, string[]> = {
  name: [
    'full_name', 'fullname', 'name', 'contact_name', 'lead_name', 'client_name',
    'שם מלא', 'שם', 'שם הליד', 'שם פרטי ומשפחה',
  ],
  phone: [
    'phone_number', 'phone', 'mobile', 'mobile_number', 'cell', 'tel',
    'telephone', 'whatsapp', 'טלפון', 'נייד', 'מספר טלפון', 'פלאפון', 'מס טלפון',
  ],
  email: ['email', 'e-mail', 'mail', 'email_address', 'אימייל', 'מייל', 'דואל', 'דוא"ל'],
  note: [
    'message', 'note', 'notes', 'comment', 'comments', 'description', 'text',
    'הודעה', 'הערה', 'הערות', 'תוכן', 'פנייה',
  ],
}

/**
 * Any payload → a flat map of lowercase key to string value.
 *
 * Providers nest differently and none of them agree: plain objects, `data.*`
 * wrappers, and Facebook's `field_data: [{name, values:[…]}]`. Flattening first
 * means the mapping below reads one shape instead of four.
 */
function flatten(input: unknown, out: Record<string, string> = {}, prefix = ''): Record<string, string> {
  if (input === null || input === undefined) return out

  if (Array.isArray(input)) {
    // Facebook Lead Ads and friends: a list of {name, values} or {name, value}.
    for (const item of input) {
      const n = (item as any)?.name ?? (item as any)?.key ?? (item as any)?.field
      if (n && typeof n === 'string') {
        const v = (item as any)?.values ?? (item as any)?.value ?? (item as any)?.text
        const flat = Array.isArray(v) ? v.join(' ') : v
        if (flat !== undefined && flat !== null && typeof flat !== 'object') {
          out[n.toLowerCase().trim()] = String(flat).trim()
          continue
        }
      }
      flatten(item, out, prefix)
    }
    return out
  }

  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const key = String(k).toLowerCase().trim()
      if (v !== null && typeof v === 'object') {
        // Kept BOTH ways: "data.phone" for an explicit mapping, and bare "phone"
        // so the guesses below find it without knowing the wrapper's name.
        flatten(v, out, prefix ? `${prefix}.${key}` : key)
      } else if (v !== undefined && v !== null && String(v).trim() !== '') {
        const full = prefix ? `${prefix}.${key}` : key
        out[full] = String(v).trim()
        if (!(key in out)) out[key] = String(v).trim()
      }
    }
  }
  return out
}

/** An explicit mapping first, then the usual spellings. */
function pick(flat: Record<string, string>, mapped: string | undefined, guesses: string[]): string {
  if (mapped) {
    const v = flat[String(mapped).toLowerCase().trim()]
    if (v) return v
  }
  for (const g of guesses) {
    const v = flat[g]
    if (v) return v
  }
  return ''
}

/** An Israeli mobile as the rest of the app stores it: 05XXXXXXXX. */
function normalisePhone(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('972')) d = '0' + d.slice(3)
  if (d.startsWith('00972')) d = '0' + d.slice(5)
  if (d.length === 9 && d.startsWith('5')) d = '0' + d
  // Anything that is not a recognisable Israeli mobile is kept as typed rather
  // than mangled — a landline or a foreign number is still a lead.
  return d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('t') || ''
    if (!token) return json({ error: 'missing_token' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: source } = await admin
      .from('lead_sources')
      .select('id, name, active, assign_to, field_map')
      .eq('token', token)
      .maybeSingle()

    if (!source) return json({ error: 'unknown_token' }, 401)
    if (!source.active) return json({ error: 'source_disabled' }, 403)

    // ── Read the body in whatever form it came ──
    let payload: unknown = {}
    const ctype = (req.headers.get('content-type') || '').toLowerCase()
    const text = (await req.text()).slice(0, MAX_BODY)

    if (ctype.includes('application/json')) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { _unparsed: text }
      }
    } else if (text && (ctype.includes('form-urlencoded') || text.includes('='))) {
      payload = Object.fromEntries(new URLSearchParams(text))
    } else if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { _unparsed: text }
      }
    }
    // Query parameters count too — some providers only do GET, and it is the
    // easiest thing to paste into a browser when testing an integration.
    const qs = Object.fromEntries(url.searchParams)
    delete qs.t
    if (Object.keys(qs).length) payload = { ...(payload as object), ...qs }

    const flat = flatten(payload)
    const map = (source.field_map || {}) as Record<string, string>

    const name = pick(flat, map.name, GUESS.name)
    const phoneRaw = pick(flat, map.phone, GUESS.phone)
    const phone = normalisePhone(phoneRaw)
    const email = pick(flat, map.email, GUESS.email)
    const note = pick(flat, map.note, GUESS.note)

    // The source always learns what it was sent, mapped or not — this is what
    // the panel shows so a mapping can be written from a real body.
    //
    // Through an RPC that increments in the database. Reading the count here and
    // writing count+1 back loses a lead every time two arrive together, which
    // for a campaign is most of them.
    const bump = () =>
      admin.rpc('bump_lead_source', { src_id: source.id, body: payload as Record<string, unknown> })

    // ── Duplicate? ──
    // Providers retry, and people press the button twice. Same phone, same
    // source, inside a day: counted, not stored again.
    if (phone) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: dupe } = await admin
        .from('leads')
        .select('id')
        .eq('phone', phone)
        .eq('source_id', source.id)
        .gte('created_at', since)
        .maybeSingle()

      if (dupe) {
        await bump()
        return json({ ok: true, duplicate: true, id: dupe.id })
      }
    }

    // ── Who gets it ──
    let agent: string | null = source.assign_to || null
    if (!agent) {
      // Rotation, by who was given one least recently. Reading the roster from
      // the database rather than a list in here means an agent added in the
      // control panel starts receiving leads immediately.
      const { data: cfg } = await admin
        .from('app_settings').select('value').eq('key', 'roster').maybeSingle()
      // Whoever holds the 'agent' role. Roles stack, so a manager who also
      // sells is in the rotation and a manager who does not is not. The legacy
      // single `role` field is still read, for a roster written by older code.
      const roster: string[] = (cfg?.value?.agents || [])
        .filter((a: any) => {
          if (!a?.name) return false
          if (Array.isArray(a.roles)) return a.roles.includes('agent')
          return a.role !== 'manager'
        })
        .map((a: any) => String(a.name))

      // An empty roster here means a lead is about to be stored with no owner
      // and no screen that surfaces it to an agent. It happened once, during a
      // live roster edit — quietly. Never quietly again.
      if (!roster.length) console.error('[lead-hook] roster empty — lead will be unassigned')

      if (roster.length) {
        const { data: recent } = await admin
          .from('leads')
          .select('agent_name, created_at')
          .not('agent_name', 'is', null)
          .order('created_at', { ascending: false })
          .limit(200)

        const lastSeen = new Map<string, string>()
        for (const r of recent || []) {
          if (!lastSeen.has(r.agent_name)) lastSeen.set(r.agent_name, r.created_at)
        }
        // Anyone who has never had one goes first; after that, longest wait.
        agent = roster.sort((a, b) => {
          const A = lastSeen.get(a) || ''
          const B = lastSeen.get(b) || ''
          return A.localeCompare(B)
        })[0]
      }
    }

    const { data: lead, error } = await admin
      .from('leads')
      .insert({
        source_id: source.id,
        source_name: source.name,
        agent_name: agent,
        name: name || null,
        phone: phone || null,
        email: email || null,
        note: note || null,
        raw: payload as Record<string, unknown>,
      })
      .select('id')
      .single()

    await bump()
    if (error) {
      console.error('[lead-hook] insert failed:', error.message)
      return json({ error: 'insert_failed' }, 500)
    }

    return json({
      ok: true,
      id: lead.id,
      // Echoed so whoever is wiring this up can see what was understood without
      // opening the app. No token, nothing about other sources.
      parsed: { name: name || null, phone: phone || null, email: email || null },
      assigned_to: agent,
    })
  } catch (e) {
    console.error('[lead-hook]', String(e))
    return json({ error: 'server_error' }, 500)
  }
})
