// Supabase Edge Function: form-sign — the only door the CLIENT has into טפסים.
//
//   load    { token }  → the form to fill: page images, fields, prefilled values.
//                        Logs "opened" (time, IP, device) — part of the evidence.
//   submit  { token, values, images, attachments, nameImage, consent }
//                      → stamps the signed PDF and freezes it.
//
// No login: the client has none. The request's token IS the permission — 64
// hex characters from two UUIDv4s, unguessable, and good for one signature.
// verify_jwt is off for that reason; everything here is keyed to the token and
// uses the service role only for that one request's rows and files.
//
// THE SIGNED PDF (stamp.ts) is built from the office's own template PDF — never
// from anything the client uploads — with the client's boxes stamped as images
// their browser drew (Hebrew renders correctly there; a PDF library draws it
// backwards), the agent's boxes stamped from images saved at SEND time (so a
// client cannot alter the price they sign for), attachments appended, and a
// certificate page: id, signer, phone, time, IP, device, consent, a SHA-256 of
// the values and the audit trail. The final file's own SHA-256 is stored with
// the request, so any later change to the file is detectable.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSignedPdf } from './stamp.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const BUCKET = 'forms'
const MAX_IMAGE_B64 = 2_500_000 // per image, base64 chars (~1.8MB)

// ── Value checks — must match src/lib/formFields.js ───────────────────────
function isValidIsraeliId(raw: string) {
  const s = String(raw || '').replace(/\D/g, '')
  if (!s || s.length > 9) return false
  const id = s.padStart(9, '0')
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = Number(id[i]) * ((i % 2) + 1)
    if (d > 9) d -= 9
    sum += d
  }
  return sum % 10 === 0
}
const empty = (v: unknown) => v === undefined || v === null || v === '' || v === false
function valueError(f: any, v: unknown): string | null {
  if (empty(v)) return f.required ? 'required' : null
  const s = String(v).trim()
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'email'
  if (f.type === 'phone' && !/^0\d{8,9}$/.test(s.replace(/[\s-]/g, ''))) return 'phone'
  if (f.type === 'idNumber' && !isValidIsraeliId(s)) return 'id'
  return null
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
async function sha256Hex(data: Uint8Array | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function clientMeta(req: Request) {
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    null
  return { ip, ua: (req.headers.get('user-agent') || '').slice(0, 400) || null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))
    const token = String(body.token || '')
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'not_found' }, 404)

    const { data: r } = await admin.from('form_requests').select('*').eq('token', token).maybeSingle()
    if (!r) return json({ error: 'not_found' }, 404)
    const meta = clientMeta(req)
    const snap = r.template_snapshot || {}
    const fields: any[] = Array.isArray(snap.fields) ? snap.fields : []
    const pages: any[] = Array.isArray(snap.pages) ? snap.pages : []

    const signedUrl = async (path: string, secs = 3600) => {
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, secs)
      return data?.signedUrl || null
    }

    // ── load ──────────────────────────────────────────────────────────────
    if (body.action === 'load') {
      if (r.status === 'cancelled') return json({ status: 'cancelled', templateName: r.template_name })
      if (r.status === 'draft') return json({ status: 'draft', templateName: r.template_name })
      if (r.status === 'signing') return json({ status: 'signing', templateName: r.template_name })
      if (r.status === 'signed') {
        return json({
          status: 'signed',
          templateName: r.template_name,
          contactName: r.contact_name,
          signedAt: r.signed_at,
          pdfUrl: r.signed_pdf_path ? await signedUrl(r.signed_pdf_path) : null,
        })
      }

      // "opened" — logged once per ten minutes, so a client reloading the page
      // does not bury the trail.
      const since = new Date(Date.now() - 10 * 60_000).toISOString()
      const { data: recent } = await admin
        .from('form_events')
        .select('id')
        .eq('request_id', r.id)
        .eq('kind', 'opened')
        .gte('at', since)
        .limit(1)
      if (!recent?.length) {
        await admin.from('form_events').insert({ request_id: r.id, kind: 'opened', actor: 'client', ip: meta.ip, user_agent: meta.ua })
      }
      if (r.status === 'sent') {
        await admin.from('form_requests').update({ status: 'opened', updated_at: new Date().toISOString() }).eq('id', r.id)
      }

      const pageOut = []
      for (const p of pages) pageOut.push({ w: p.w, h: p.h, url: p.image ? await signedUrl(p.image) : null })

      return json({
        status: 'opened',
        templateName: r.template_name,
        contact: { name: r.contact_name, phone: r.contact_phone, email: r.contact_email },
        fields,
        pages: pageOut,
        values: r.values || {},
      })
    }

    // ── submit ────────────────────────────────────────────────────────────
    if (body.action === 'submit') {
      if (r.status === 'signed') return json({ error: 'already_signed' }, 409)
      if (!['sent', 'opened'].includes(r.status)) return json({ error: 'not_signable' }, 409)
      if (body.consent !== true) return json({ error: 'no_consent' }, 400)

      const images: Record<string, string> = body.images && typeof body.images === 'object' ? body.images : {}
      const attachIn: Record<string, string> = body.attachments && typeof body.attachments === 'object' ? body.attachments : {}
      for (const v of [...Object.values(images), ...Object.values(attachIn)]) {
        if (typeof v !== 'string' || v.length > MAX_IMAGE_B64) return json({ error: 'image_too_large' }, 413)
      }
      const senderImages: Record<string, string> = r.sender_images || {}

      // The agent's boxes are the server's, whatever the browser sends.
      const stored = r.values || {}
      const incoming = body.values && typeof body.values === 'object' ? body.values : {}
      const values: Record<string, unknown> = {}
      for (const f of fields) values[f.id] = f.filler === 'sender' ? stored[f.id] : incoming[f.id]

      const problems: string[] = []
      for (const f of fields) {
        if (f.type === 'signature') {
          const img = f.filler === 'sender' ? senderImages[f.id] : images[f.id]
          if (f.required && !img) problems.push(f.id)
        } else if (f.type === 'attachment') {
          if (f.required && !attachIn[f.id]) problems.push(f.id)
        } else if (valueError(f, values[f.id])) problems.push(f.id)
      }
      if (problems.length) return json({ error: 'invalid', fields: problems }, 422)

      // Claim the request first, so two taps on "sign" cannot make two PDFs.
      const { data: claimed } = await admin
        .from('form_requests')
        .update({ status: 'signing', updated_at: new Date().toISOString() })
        .eq('id', r.id)
        .in('status', ['sent', 'opened'])
        .select('id')
      if (!claimed?.length) return json({ error: 'already_signed' }, 409)

      try {
        const src = await admin.storage.from(BUCKET).download(snap.source_path)
        if (src.error || !src.data) throw new Error('template_missing')

        // Attachments: kept as files, and appended to the PDF as pages.
        const attachments: { fieldId: string; bytes: Uint8Array }[] = []
        const attachmentRows: { field: string; path: string }[] = []
        for (const f of fields) {
          const dataUrl = attachIn[f.id]
          if (f.type !== 'attachment' || !dataUrl) continue
          const bytes = b64ToBytes(String(dataUrl).split(',').pop() || '')
          const path = `attachments/${r.id}/${f.id}.jpg`
          await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true })
          attachments.push({ fieldId: f.id, bytes })
          attachmentRows.push({ field: f.id, path })
        }

        const now = new Date()
        const valuesHash = await sha256Hex(JSON.stringify(values))
        const { data: trail } = await admin.from('form_events').select('kind, actor, ip, at').eq('request_id', r.id).order('at')

        const pdf = await buildSignedPdf({
          templateBytes: new Uint8Array(await src.data.arrayBuffer()),
          fields,
          images,
          senderImages,
          attachments,
          cert: {
            requestId: r.id,
            templateId: r.template_id,
            initiator: r.initiator,
            phone: r.contact_phone,
            email: r.contact_email,
            ip: meta.ip,
            ua: meta.ua,
            signedAt: now,
            valuesHash,
            trail: [...(trail || []), { kind: 'signed', actor: 'client', ip: meta.ip, at: now.toISOString() }],
            nameImage: typeof body.nameImage === 'string' && body.nameImage.length < 200_000 ? body.nameImage : null,
          },
        })
        const pdfHash = await sha256Hex(pdf)
        const path = `signed/${r.id}.pdf`
        const up = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
        if (up.error) throw new Error(`upload: ${up.error.message}`)

        await admin
          .from('form_requests')
          .update({
            status: 'signed',
            values,
            attachments: attachmentRows,
            signed_at: now.toISOString(),
            signed_pdf_path: path,
            signed_pdf_sha256: pdfHash,
            signer_ip: meta.ip,
            signer_ua: meta.ua,
            updated_at: now.toISOString(),
          })
          .eq('id', r.id)
        await admin.from('form_events').insert({
          request_id: r.id,
          kind: 'signed',
          actor: 'client',
          ip: meta.ip,
          user_agent: meta.ua,
          meta: { pdf_sha256: pdfHash, values_sha256: valuesHash },
        })

        return json({ ok: true, pdfUrl: await signedUrl(path) })
      } catch (e) {
        // Give the request back, so the client can try again.
        await admin.from('form_requests').update({ status: r.status }).eq('id', r.id)
        console.error('[form-sign] submit', String(e))
        return json({ error: 'sign_failed' }, 500)
      }
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[form-sign]', String(e))
    return json({ error: 'server_error' }, 500)
  }
})
