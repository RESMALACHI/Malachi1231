// Supabase Edge Function: send-whatsapp-report
//
// Sends a monthly meetings report (PNG, produced client-side) to the accounting
// department's WhatsApp via Green API.
//   1. Upload the image to the public `report-snapshots` Storage bucket.
//   2. Send it with Green API's sendFileByUrl (needs a public URL).
//   3. Delete the temporary snapshot.
//
// Required function secrets:
//   GREENAPI_API_URL, GREENAPI_ID_INSTANCE, GREENAPI_TOKEN_INSTANCE,
//   ACCOUNTING_WHATSAPP_NUMBER  (international format, e.g. 972506060176)
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Request (POST JSON): { agentName, monthNum, year, imageBase64 }
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

const BUCKET = 'report-snapshots'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // Require a valid Supabase user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const agentName = String(body.agentName || 'סוכן')
    const monthNum = String(body.monthNum || '')
    const year = String(body.year || '')
    const toNumber = Deno.env.get('ACCOUNTING_WHATSAPP_NUMBER')
    const digits = String(toNumber || '').replace(/\D/g, '')
    if (digits.length < 8) {
      return json({ error: 'invalid_whatsapp_number' }, 500)
    }

    if (body.preview === true) {
      return json({ ok: true, recipientNumber: digits })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    // Green API credentials come from the SAME row the rest of the app uses
    // (`whatsapp_instances` / '__summary__'), so swapping the instance is one DB
    // update instead of hunting through function secrets. The env vars stay as a
    // fallback, and the recipient number is still its own secret.
    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('id_instance, api_token, api_url')
      .eq('agent_name', '__summary__')
      .maybeSingle()

    const apiUrl = String(inst?.api_url || Deno.env.get('GREENAPI_API_URL') || '').replace(/\/$/, '')
    const idInstance = inst?.id_instance || Deno.env.get('GREENAPI_ID_INSTANCE')
    const tokenInstance = inst?.api_token || Deno.env.get('GREENAPI_TOKEN_INSTANCE')
    if (!apiUrl || !idInstance || !tokenInstance || !toNumber) {
      return json({ error: 'missing_greenapi_config' }, 500)
    }

    const rawImage = String(body.imageBase64 || '')
    if (!rawImage) return json({ error: 'missing_image' }, 400)

    // Decode the data URL / base64 to bytes.
    const base64 = rawImage.includes('base64,') ? rawImage.split('base64,')[1] : rawImage
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

    // Step A — upload to the public bucket. The storage KEY must be ASCII
    // (Supabase rejects Hebrew/non-ASCII keys), so use a random ASCII path.
    const safeAgent = agentName.replace(/\s+/g, '-')
    const path = `report-${Date.now()}-${crypto.randomUUID()}.png`
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/png', upsert: true })
    if (upErr) return json({ error: 'storage_upload_failed', detail: upErr.message }, 500)

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    const publicUrl = pub?.publicUrl
    if (!publicUrl) return json({ error: 'no_public_url' }, 500)

    // Step B — send via Green API.
    const fileName = `RES-Report-${safeAgent}.png`
    const caption =
      `שלום לצוות הנהלת החשבונות,\n\n` +
      `מצורף דוח סיכום הפגישות החודשי של הסוכן *${agentName}* עבור חודש *${monthNum}/${year}*.\n\n` +
      `הופק אוטומטית ממערכת מעקב הפגישות - מכללת R.E.S.`

    // Green API needs a digits-only number, e.g. 972506060176@c.us (no +/spaces).
    const endpoint = `${apiUrl}/waInstance${idInstance}/sendFileByUrl/${tokenInstance}`
    const greenRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: `${digits}@c.us`,
        urlFile: publicUrl,
        fileName,
        caption,
      }),
    })
    const greenData = await greenRes.json().catch(() => ({}))

    if (!greenRes.ok || !greenData?.idMessage) {
      // Leave the file in place if sending failed (so it can be retried/inspected).
      return json({ error: 'greenapi_failed', detail: greenData }, 502)
    }

    // Step C — cleanup. Give Green API a moment to fetch the URL, then delete.
    // Non-fatal: a failed cleanup shouldn't fail the send.
    try {
      await new Promise((r) => setTimeout(r, 4000))
      await admin.storage.from(BUCKET).remove([path])
    } catch (_) {
      // ignore cleanup errors
    }

    return json({ ok: true, idMessage: greenData.idMessage })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
