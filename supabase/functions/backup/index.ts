// Supabase Edge Function: backup — the app's own backups (migration 0018).
//
//   run      { email? }  → one zip of everything: every data table as JSON,
//                          schema.sql, every stored file (the signed PDFs above
//                          all) and manifest.json. Saved to the private
//                          `backups` bucket; older than 30 days are removed.
//                          Emailed when asked — and by the nightly run on the
//                          night into Sunday, to the address set in ניהול.
//   status              → the last run, the saved backups, the settings
//   download { name }   → a short-lived link to one saved backup
//
// Who calls: pg_cron every night, with `?t=<app_auth.backup_token>` (so
// verify_jwt is off, as for sync-meetings), or the ניהול page with the team
// session. Secrets are not in any backup — see the migration.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { strToU8, zipSync } from 'npm:fflate@0.8.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const BUCKET = 'backups'
const KEEP_DAYS = 30
// Gmail refuses a message over 25MB, and an attachment grows by a third when
// encoded — so bigger backups are emailed as a link instead.
const ATTACH_MAX = 15 * 1024 * 1024
const EXCLUDED = ['app_auth', 'user_google_tokens', 'whatsapp_instances']
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/

/** Israel's date, time and weekday — the backup is named and scheduled by them. */
function israelNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: string) => parts.find((p) => p.type === t)?.value || ''
  return {
    date: `${g('year')}-${g('month')}-${g('day')}`,
    time: `${g('hour')}${g('minute')}`,
    label: `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`,
    sunday: g('weekday') === 'Sun',
  }
}

async function sha256Hex(bytes: Uint8Array) {
  const h = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey)

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    // ── Who is calling ──
    const token = new URL(req.url).searchParams.get('t') || ''
    let by = 'לילי אוטומטי'
    if (token) {
      const { data } = await admin.from('app_auth').select('value').eq('key', 'backup_token').maybeSingle()
      if (!data?.value || token !== data.value) return json({ error: 'bad_token' }, 401)
      if (action !== 'run') return json({ error: 'forbidden' }, 403)
    } else {
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'unauthorized' }, 401)
      by = body.agent ? String(body.agent).slice(0, 80) : 'ידני'
    }

    const settingsOf = async () => {
      const { data } = await admin.from('app_settings').select('value').eq('key', 'backup_settings').maybeSingle()
      const v = (data?.value || {}) as { email?: string; weekly?: boolean }
      return { email: String(v.email || '').trim(), weekly: v.weekly !== false }
    }

    // ── status ──
    if (action === 'status') {
      const [{ data: last }, { data: files }, settings] = await Promise.all([
        admin.from('app_settings').select('value').eq('key', 'backup_last').maybeSingle(),
        admin.storage.from(BUCKET).list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } }),
        settingsOf(),
      ])
      const list = (files || [])
        .filter((f: any) => f.name.endsWith('.zip'))
        .map((f: any) => ({ name: f.name, size: f.metadata?.size || 0, at: f.created_at }))
      return json({ last: last?.value || null, list, settings })
    }

    // ── download ──
    if (action === 'download') {
      const name = String(body.name || '')
      if (!/^[\w.-]+\.zip$/.test(name)) return json({ error: 'bad_name' }, 400)
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(name, 300, { download: name })
      if (error || !data) return json({ error: 'not_found' }, 404)
      return json({ url: data.signedUrl })
    }

    if (action !== 'run') return json({ error: 'unknown_action' }, 400)

    // ── run ──
    const started = Date.now()
    const now = israelNow()
    try {
      const entries: Record<string, [Uint8Array, { level: 0 | 1 }]> = {}

      // Every table, as the JSON of its rows.
      const { data: tables, error: tErr } = await admin.rpc('backup_tables')
      if (tErr) throw new Error(`tables: ${tErr.message}`)
      const counts: Record<string, number> = {}
      const readTable = async (name: string) => {
        const res = await fetch(`${url}/rest/v1/rpc/backup_table_json`, {
          method: 'POST',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ t: name }),
        })
        if (!res.ok) throw new Error(`table ${name}: ${res.status}`)
        // A function returning text comes back as one JSON string.
        const text = await res.json()
        entries[`data/${name}.json`] = [strToU8(typeof text === 'string' ? text : JSON.stringify(text)), { level: 1 }]
      }
      const list = (tables || []) as { name: string; row_count: number }[]
      for (let i = 0; i < list.length; i += 6) {
        await Promise.all(list.slice(i, i + 6).map((t) => readTable(t.name)))
      }
      for (const t of list) counts[t.name] = Number(t.row_count)

      // The schema to rebuild them.
      const { data: schema, error: sErr } = await admin.rpc('backup_schema')
      if (sErr) throw new Error(`schema: ${sErr.message}`)
      entries['schema.sql'] = [strToU8(String(schema || '')), { level: 1 }]

      // Every stored file — signed PDFs, templates, attachments. Already
      // compressed formats, so stored as they are.
      const { data: files, error: fErr } = await admin.rpc('backup_files')
      if (fErr) throw new Error(`files: ${fErr.message}`)
      const fileList = (files || []) as { bucket: string; name: string }[]
      let fileCount = 0
      for (let i = 0; i < fileList.length; i += 6) {
        await Promise.all(
          fileList.slice(i, i + 6).map(async (f) => {
            const { data, error } = await admin.storage.from(f.bucket).download(f.name)
            if (error || !data) throw new Error(`file ${f.bucket}/${f.name}`)
            entries[`files/${f.bucket}/${f.name}`] = [new Uint8Array(await data.arrayBuffer()), { level: 0 }]
            fileCount++
          })
        )
      }

      const totalRows = Object.values(counts).reduce((s, n) => s + n, 0)
      const manifest = {
        app: 'R.E.S meeting-tracker',
        created_at: new Date().toISOString(),
        israel_time: now.label,
        by,
        tables: counts,
        total_rows: totalRows,
        files: fileCount,
        excluded: EXCLUDED,
        note: 'data/<table>.json = the rows of each table; schema.sql = the tables, policies and functions; files/<bucket>/… = stored files. Secrets are left out on purpose — re-enter them in ניהול after a restore.',
      }
      entries['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 1 }]

      const zip = zipSync(entries)
      const name = `${now.date}_${now.time}.zip`
      const up = await admin.storage.from(BUCKET).upload(name, zip, { contentType: 'application/zip', upsert: true })
      if (up.error) throw new Error(`upload: ${up.error.message}`)
      const sha = await sha256Hex(zip)

      // Keep 30 days.
      const cutoff = Date.now() - KEEP_DAYS * 86_400_000
      const { data: saved } = await admin.storage.from(BUCKET).list('', { limit: 1000 })
      const old = (saved || [])
        .filter((f: any) => f.name.endsWith('.zip') && f.created_at && new Date(f.created_at).getTime() < cutoff)
        .map((f: any) => f.name)
      if (old.length) await admin.storage.from(BUCKET).remove(old)

      // The copy by email: when asked, or on the night into Sunday.
      const settings = await settingsOf()
      let emailed: string | null = null
      let emailError: string | null = null
      const wantEmail = body.email === true || (body.scheduled === true && now.sunday && settings.weekly)
      if (wantEmail) {
        try {
          emailed = await emailBackup(admin, { to: settings.email, zip, name, label: now.label, totalRows, tables: list.length, fileCount })
        } catch (e) {
          emailError = e instanceof Error ? e.message : String(e)
        }
      }

      const last = {
        ok: true,
        at: new Date().toISOString(),
        name,
        size: zip.length,
        sha256: sha,
        tables: list.length,
        rows: totalRows,
        files: fileCount,
        seconds: Math.round((Date.now() - started) / 1000),
        by,
        emailed,
        email_error: emailError,
      }
      await admin.from('app_settings').upsert({ key: 'backup_last', value: last, updated_at: last.at }, { onConflict: 'key' })
      return json(last)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[backup]', message.slice(0, 300))
      await admin
        .from('app_settings')
        .upsert(
          { key: 'backup_last', value: { ok: false, at: new Date().toISOString(), error: message.slice(0, 300), by }, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
      return json({ ok: false, error: message.slice(0, 300) }, 500)
    }
  } catch (e) {
    console.error('[backup]', String(e).slice(0, 300))
    return json({ error: 'server_error' }, 500)
  }
})

/** The weekly copy — attached when it fits in a Gmail message, a link otherwise. */
async function emailBackup(
  admin: any,
  o: { to: string; zip: Uint8Array; name: string; label: string; totalRows: number; tables: number; fileCount: number }
) {
  if (!EMAIL.test(o.to)) throw new Error('לא נקבע מייל לגיבוי (ניהול → גיבויים)')
  const { data: rows } = await admin
    .from('app_auth')
    .select('key, value')
    .in('key', ['resend_api_key', 'mail_from', 'mail_from_name'])
  const cfg = Object.fromEntries((rows || []).map((r: any) => [r.key, String(r.value || '')]))
  if (!cfg.resend_api_key || !cfg.mail_from) throw new Error('המייל לא מחובר (ניהול → מייל)')

  const attach = o.zip.length <= ATTACH_MAX
  let link = ''
  if (!attach) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(o.name, 7 * 86_400, { download: o.name })
    link = data?.signedUrl || ''
  }
  const mb = (o.zip.length / 1024 / 1024).toFixed(1)
  const html = `<!doctype html><html dir="rtl" lang="he"><body dir="rtl" style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0f172a;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold;text-align:right;">גיבוי שבועי · מכללת R.E.S</td></tr>
<tr><td style="padding:24px;text-align:right;color:#0f172a;font-size:15px;line-height:1.7;">
<p style="margin:0 0 10px;">הגיבוי המלא של המערכת מ-${esc(o.label)}:</p>
<p style="margin:0 0 10px;color:#475569;">${o.totalRows.toLocaleString('en-US')} רשומות ב-${o.tables} טבלאות, ו-${o.fileCount} קבצים (טפסים חתומים, תבניות וצירופים). גודל: ${mb}MB.</p>
<p style="margin:0 0 10px;">${attach ? 'הקובץ מצורף למייל הזה.' : `להורדת הקובץ (הקישור בתוקף 7 ימים): <a href="${esc(link)}">הורדת הגיבוי</a>`}</p>
<p style="margin:0;color:#b91c1c;font-size:13px;">יש בקובץ פרטים של לקוחות — שומרים אותו במקום בטוח ולא מעבירים הלאה.</p>
</td></tr></table></body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `"${(cfg.mail_from_name || 'מכללת R.E.S').replace(/["<>]/g, '')}" <${cfg.mail_from}>`,
      to: [o.to],
      subject: `גיבוי שבועי — מכללת R.E.S — ${o.label.slice(0, 10)}`,
      html,
      ...(attach ? { attachments: [{ filename: `גיבוי-RES-${o.name}`, content: encodeBase64(o.zip) }] } : {}),
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok || !out?.id) throw new Error(`Resend: ${String(out?.message || res.status).slice(0, 200)}`)
  return o.to
}
