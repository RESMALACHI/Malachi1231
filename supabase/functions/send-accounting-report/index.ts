// Supabase Edge Function: send-accounting-report
//
// Emails a monthly meetings report (PNG, produced client-side) to the accounting
// department for bonus calculation. Sends via the Resend HTTP API.
//
// Required function secrets:
//   RESEND_API_KEY   — Resend API key.
//   ACCOUNTING_EMAIL — recipient (the accounting dept's address).
//   RESEND_FROM      — optional verified sender. Defaults to Resend's sandbox
//                      sender; for production set a verified-domain address.
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY.
//
// Request (POST JSON): { agentName, monthLabel, monthNum, year, imageBase64 }
//   imageBase64 may be a data URL ("data:image/png;base64,…") or raw base64.
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

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const to = Deno.env.get('ACCOUNTING_EMAIL')
    const from = Deno.env.get('RESEND_FROM') || 'מערכת R.E.S <onboarding@resend.dev>'
    if (!apiKey) return json({ error: 'missing_resend_api_key' }, 500)
    if (!to) return json({ error: 'missing_accounting_email' }, 500)

    const body = await req.json().catch(() => ({}))
    const agentName = String(body.agentName || 'סוכן')
    const monthLabel = String(body.monthLabel || '')
    const monthNum = String(body.monthNum || '')
    const year = String(body.year || '')
    const rawImage = String(body.imageBase64 || '')
    if (!rawImage) return json({ error: 'missing_image' }, 400)

    // Accept a data URL or bare base64.
    const base64 = rawImage.includes('base64,') ? rawImage.split('base64,')[1] : rawImage

    const safeAgent = escapeHtml(agentName)
    const safeMonth = escapeHtml(monthLabel)
    const filename = `RES-Report-${agentName.replace(/\s+/g, '-')}-${monthNum}-${year}.png`

    const subject = `סיכום פגישות חודשי לחישוב בונוס - ${agentName} - ${monthNum}/${year}`

    const html = `
<div dir="rtl" style="font-family: Arial, sans-serif; text-align: right;">
  <p>שלום לצוות הנהלת החשבונות,</p>
  <p>מצורף בזאת דוח סיכום הפגישות החודשי של הסוכן <strong>${safeAgent}</strong> עבור חודש <strong>${safeMonth} ${year}</strong>, כפי שהופק אוטומטית ממערכת מעקב הפגישות של מכללת R.E.S.</p>
  <p>הדוח כולל את נתוני סך הפגישות, אחוזי ההגעה והפילוח לצורך חישוב הבונוסים החודשיים בשכר.</p>
  <br />
  <p>בברכה,<br />מערכת מעקב פגישות<br /><strong>מכללת R.E.S</strong></p>
</div>`.trim()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        attachments: [{ filename, content: base64 }],
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return json({ error: 'resend_failed', detail: data }, 502)
    }

    return json({ ok: true, id: data?.id ?? null })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
