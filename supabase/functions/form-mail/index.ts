// Supabase Edge Function: form-mail — טפסים by email, through Resend.
//
//   status                      → is mail connected? (never returns the key)
//   save   { apiKey?, from, fromName, replyTo, officeCopy, forgetKey? }
//                               → the settings, into app_auth (ניהול → מייל)
//   test   { to }               → a test email
//   send   { requestId, origin, agent, resend, reminder }
//                               → the link to fill and sign, to the contact
//                                 (reminder: worded "still waiting for you")
//   copy   { requestId, agent?, auto? }
//                               → the signed PDF, to the contact (+ office bcc)
//
// The Resend key lives in app_auth (service role only) — the browser can set it
// but never read it back. Team calls carry the shared session's JWT; `copy` is
// also called by form-sign right after a signature, with the service key.
//
// Nothing here logs an address or a message to the console. Where an email went
// IS recorded, in form_events — it is part of the form's evidence.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { copyEmail, linkEmail, testEmail } from './templates.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const BUCKET = 'forms'
const DEFAULT_ORIGIN = 'https://res-meetings.vercel.app'
const KEYS = {
  apiKey: 'resend_api_key',
  from: 'mail_from',
  fromName: 'mail_from_name',
  replyTo: 'mail_reply_to',
  officeCopy: 'mail_office_copy',
} as const

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/
const isEmail = (s: unknown) => EMAIL.test(String(s || '').trim())

/** Distinct valid addresses, first spelling kept. */
function recipients(list: unknown[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const s = String(raw || '').trim()
    if (!isEmail(s) || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out.slice(0, 10)
}

class MailError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

/** What Resend said, in words the office can act on. */
function fromResend(status: number, body: any): MailError {
  const msg = String(body?.message || '')
  const name = String(body?.name || '')
  if (status === 401 || /api[_ ]key/i.test(name) || /api key is invalid/i.test(msg)) {
    return new MailError('bad_key', 'מפתח ה-API של Resend לא תקין — העתיקו אותו מחדש מ-Resend (API Keys).')
  }
  if (/own email address|testing emails/i.test(msg)) {
    return new MailError(
      'testing_mode',
      'חשבון Resend עוד במצב ניסיון: הוא שולח רק לכתובת שאיתה נרשמתם. כדי לשלוח ללקוחות — מאמתים דומיין ב-Resend (Domains) ושמים כתובת שולח מהדומיין הזה.'
    )
  }
  if (/domain.*(not verified|verify)|verify.*domain/i.test(msg)) {
    return new MailError('domain_unverified', 'הדומיין של כתובת השולח עוד לא אומת ב-Resend. בודקים ב-Resend → Domains שהסטטוס Verified.')
  }
  if (status === 429 || /quota/i.test(name)) {
    return new MailError('quota', 'הגעתם למכסת המיילים של Resend (בחינם: 100 ביום). נסו שוב מאוחר יותר.', 429)
  }
  return new MailError('mail_failed', msg ? `Resend דחה את המייל: ${msg}` : 'שליחת המייל נכשלה', 502)
}

async function resendSend(apiKey: string, payload: Record<string, unknown>, idempotencyKey?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok && body?.id) return String(body.id)
  throw fromResend(res.status, body)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    // Who is calling: form-sign (service key, `copy` only) or a signed-in team session.
    const internal = authHeader === `Bearer ${serviceKey}`
    if (internal) {
      if (action !== 'copy') return json({ error: 'forbidden' }, 403)
    } else {
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'unauthorized' }, 401)
    }

    const admin = createClient(url, serviceKey)
    const { data: rows } = await admin.from('app_auth').select('key, value').in('key', Object.values(KEYS))
    const raw = Object.fromEntries((rows || []).map((r: any) => [r.key, String(r.value || '')]))
    const cfg = {
      apiKey: raw[KEYS.apiKey] || '',
      from: raw[KEYS.from] || '',
      fromName: (raw[KEYS.fromName] || 'מכללת R.E.S').replace(/["<>]/g, ''),
      replyTo: raw[KEYS.replyTo] || '',
      officeCopy: raw[KEYS.officeCopy] || '',
    }
    const configured = !!(cfg.apiKey && cfg.from)
    const sender = () => ({
      from: `"${cfg.fromName}" <${cfg.from}>`,
      ...(isEmail(cfg.replyTo) ? { reply_to: cfg.replyTo } : {}),
    })

    // ── status ──────────────────────────────────────────────────────────────
    if (action === 'status') {
      return json({
        configured,
        keyHint: cfg.apiKey ? `re_…${cfg.apiKey.slice(-4)}` : null,
        from: cfg.from,
        fromName: raw[KEYS.fromName] || '',
        replyTo: cfg.replyTo,
        officeCopy: cfg.officeCopy,
      })
    }

    // ── save ────────────────────────────────────────────────────────────────
    if (action === 'save') {
      const apiKey = String(body.apiKey || '').trim()
      const next: Record<string, string> = {
        [KEYS.from]: String(body.from || '').trim(),
        [KEYS.fromName]: String(body.fromName || '').trim().slice(0, 80),
        [KEYS.replyTo]: String(body.replyTo || '').trim(),
        [KEYS.officeCopy]: String(body.officeCopy || '').trim(),
      }
      if (!isEmail(next[KEYS.from])) return json({ error: 'bad_from', message: 'כתובת השולח לא תקינה' }, 400)
      for (const k of [KEYS.replyTo, KEYS.officeCopy]) {
        if (next[k] && !isEmail(next[k])) return json({ error: 'bad_address', message: 'אחת הכתובות לא תקינה' }, 400)
      }
      if (apiKey) {
        if (!/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
          return json({ error: 'bad_key_format', message: 'מפתח של Resend מתחיל ב-re_ — העתיקו אותו שוב, בלי רווחים' }, 400)
        }
        next[KEYS.apiKey] = apiKey
      } else if (!cfg.apiKey && !body.forgetKey) {
        return json({ error: 'missing_key', message: 'חסר מפתח API של Resend' }, 400)
      }
      const at = new Date().toISOString()
      const { error } = await admin
        .from('app_auth')
        .upsert(Object.entries(next).map(([key, value]) => ({ key, value, updated_at: at })), { onConflict: 'key' })
      if (error) return json({ error: 'save_failed', message: 'השמירה נכשלה' }, 500)
      if (body.forgetKey) await admin.from('app_auth').delete().eq('key', KEYS.apiKey)
      return json({ ok: true })
    }

    if (!configured) {
      if (body.auto) return json({ ok: false, skipped: 'not_configured' })
      return json({ error: 'not_configured', message: 'המייל עוד לא חובר. מנהל מחבר אותו בעמוד ניהול → מייל.' }, 400)
    }

    // ── test ────────────────────────────────────────────────────────────────
    if (action === 'test') {
      const to = String(body.to || '').trim()
      if (!isEmail(to)) return json({ error: 'bad_address', message: 'כתובת לא תקינה' }, 400)
      const id = await resendSend(cfg.apiKey, { ...sender(), to: [to], ...testEmail() })
      return json({ ok: true, id })
    }

    const requestId = String(body.requestId || '')
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: 'not_found' }, 404)
    const { data: r } = await admin.from('form_requests').select('*').eq('id', requestId).maybeSingle()
    if (!r) return json({ error: 'not_found', message: 'הטופס לא נמצא' }, 404)
    const agent = body.agent ? String(body.agent).slice(0, 80) : null

    // ── send: the link to fill and sign ────────────────────────────────────
    if (action === 'send') {
      if (!['sent', 'opened'].includes(r.status)) {
        return json({ error: 'not_waiting', message: 'אפשר לשלוח במייל רק טופס שממתין לחתימה' }, 409)
      }
      const to = recipients([r.contact_email, r.extra_email])
      if (!to.length) return json({ error: 'no_email', message: 'אין מייל לאיש הקשר' }, 400)
      const origin = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(body.origin || '')) ? String(body.origin) : DEFAULT_ORIGIN
      const mail = linkEmail({
        name: r.contact_name,
        templateName: r.template_name,
        link: `${origin}/sign/${r.token}`,
        initiator: r.initiator,
        reminder: !!body.reminder,
      })
      // The first send of a request is idempotent: a double click, or React
      // mounting the dialog twice, is one email. A deliberate resend is not.
      const id = await resendSend(cfg.apiKey, { ...sender(), to, ...mail }, body.resend ? undefined : `link-${r.id}`)
      await admin.from('form_events').insert({
        request_id: r.id,
        kind: 'emailed',
        actor: agent,
        meta: { what: 'link', to, email_id: id, resend: !!body.resend, reminder: !!body.reminder },
      })
      return json({ ok: true, to })
    }

    // ── copy: the signed PDF ───────────────────────────────────────────────
    if (action === 'copy') {
      if (r.status !== 'signed' || !r.signed_pdf_path) {
        return json({ error: 'not_signed', message: 'הטופס עוד לא נחתם' }, 409)
      }
      // The client's own address, and any email box they filled in the form.
      const fields: any[] = Array.isArray(r.template_snapshot?.fields) ? r.template_snapshot.fields : []
      const typed = fields.filter((f) => f.type === 'email' && f.filler !== 'sender').map((f) => r.values?.[f.id])
      const to = recipients([r.contact_email, r.extra_email, ...typed])
      if (!to.length) {
        if (body.auto) return json({ ok: false, skipped: 'no_email' })
        return json({ error: 'no_email', message: 'אין מייל לאיש הקשר' }, 400)
      }
      if (body.auto) {
        const { data: done } = await admin
          .from('form_events')
          .select('id')
          .eq('request_id', r.id)
          .eq('kind', 'emailed')
          .contains('meta', { what: 'copy' })
          .limit(1)
        if (done?.length) return json({ ok: true, skipped: 'already_sent', to })
      }
      const file = await admin.storage.from(BUCKET).download(r.signed_pdf_path)
      if (file.error || !file.data) throw new MailError('file_missing', 'הקובץ החתום לא נמצא', 500)
      const bytes = new Uint8Array(await file.data.arrayBuffer())
      const name = `${String(r.template_name || 'טופס').replace(/[\\/:*?"<>|]+/g, ' ').trim()} - חתום.pdf`
      const office = isEmail(cfg.officeCopy) && !to.some((t) => t.toLowerCase() === cfg.officeCopy.toLowerCase())
      const id = await resendSend(
        cfg.apiKey,
        {
          ...sender(),
          to,
          ...(office ? { bcc: [cfg.officeCopy] } : {}),
          ...copyEmail({ name: r.contact_name, templateName: r.template_name, signedAt: r.signed_at }),
          attachments: [{ filename: name, content: encodeBase64(bytes) }],
        },
        body.auto ? `copy-${r.id}` : undefined
      )
      await admin.from('form_events').insert({
        request_id: r.id,
        kind: 'emailed',
        actor: body.auto ? null : agent,
        meta: { what: 'copy', to, email_id: id, office },
      })
      return json({ ok: true, to })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    if (e instanceof MailError) return json({ error: e.code, message: e.message }, e.status)
    console.error('[form-mail]', String(e).slice(0, 300))
    return json({ error: 'server_error', message: 'שליחת המייל נכשלה' }, 500)
  }
})
