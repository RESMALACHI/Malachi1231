// Supabase Edge Function: push
//
// Web Push for the installed app. Deliberately a transport and nothing else —
// every notification's wording arrives in the request, so this file holds no
// Hebrew copy and no idea what a "meeting" is.
//
// Actions (POST JSON):
//   key          → { publicKey }            the VAPID public key, for subscribing
//   subscribe    { subscription, agentName }
//   unsubscribe  { endpoint }
//   send         { agentName?, title, body, url?, tag?, token }
//                  token must match app_auth.push_token — this is the one action
//                  a cron job calls, so it can't lean on a user's JWT.
//   test         { agentName, title, body }  sends to that agent's own devices
//
// Keys live in app_auth (vapid_public_key / vapid_private_key / vapid_subject),
// never in code or environment files.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

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

interface Row {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failures: number
}

/** Load the VAPID trio once per request and hand it to web-push. */
async function configureVapid(admin: any): Promise<string | null> {
  const { data } = await admin
    .from('app_auth')
    .select('key, value')
    .in('key', ['vapid_public_key', 'vapid_private_key', 'vapid_subject'])

  const cfg: Record<string, string> = {}
  for (const r of data || []) cfg[r.key] = r.value

  if (!cfg.vapid_public_key || !cfg.vapid_private_key) return null

  webpush.setVapidDetails(
    cfg.vapid_subject || 'mailto:admin@example.com',
    cfg.vapid_public_key,
    cfg.vapid_private_key
  )
  return cfg.vapid_public_key
}

/**
 * Push to every device in `rows`.
 *
 * A 404 or 410 from the push service means the browser threw the subscription
 * away — that row is dead and is deleted, because retrying it forever is how a
 * subscriptions table fills with garbage. Any other failure is counted, and a
 * row that has failed repeatedly is dropped too.
 */
async function deliver(admin: any, rows: Row[], payload: unknown) {
  const body = JSON.stringify(payload)
  let sent = 0
  const dead: string[] = []
  const errors: string[] = []

  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          body
        )
        sent++
      } catch (e: any) {
        const code = Number(e?.statusCode) || 0
        if (code === 404 || code === 410 || r.failures >= 4) {
          dead.push(r.id)
        } else {
          await admin
            .from('push_subscriptions')
            .update({ failures: r.failures + 1 })
            .eq('id', r.id)
        }
        errors.push(`${code || 'err'}:${String(e?.message || e).slice(0, 80)}`)
      }
    })
  )

  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)
  if (sent) {
    await admin
      .from('push_subscriptions')
      .update({ last_sent_at: new Date().toISOString(), failures: 0 })
      .in(
        'id',
        rows.filter((r) => !dead.includes(r.id)).map((r) => r.id)
      )
  }

  return { sent, removed: dead.length, errors: errors.slice(0, 5) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    const publicKey = await configureVapid(admin)
    if (!publicKey) return json({ ok: false, error: 'no_vapid_keys' }, 500)

    if (action === 'key') return json({ ok: true, publicKey })

    if (action === 'subscribe') {
      const sub = body.subscription
      const agentName = String(body.agentName || '').trim()
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return json({ ok: false, error: 'bad_subscription' }, 400)
      }
      if (!agentName) return json({ ok: false, error: 'no_agent' }, 400)

      // Upsert on endpoint: re-subscribing on the same device (or an agent
      // switch on a shared phone) must move the row, not add a second one.
      const { error } = await admin.from('push_subscriptions').upsert(
        {
          agent_name: agentName,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: String(body.userAgent || '').slice(0, 300),
          failures: 0,
        },
        { onConflict: 'endpoint' }
      )
      if (error) return json({ ok: false, error: 'save_failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'unsubscribe') {
      const endpoint = String(body.endpoint || '')
      if (!endpoint) return json({ ok: false, error: 'no_endpoint' }, 400)
      await admin.from('push_subscriptions').delete().eq('endpoint', endpoint)
      return json({ ok: true })
    }

    if (action === 'send' || action === 'test') {
      // 'send' is the machine entry point and carries its own shared secret;
      // 'test' rides on the caller's JWT, which the platform already verified.
      if (action === 'send') {
        const { data: tok } = await admin
          .from('app_auth')
          .select('value')
          .eq('key', 'push_token')
          .maybeSingle()
        if (!tok?.value || String(body.token || '') !== tok.value) {
          return json({ ok: false, error: 'unauthorized' }, 401)
        }
      }

      const title = String(body.title || '').trim()
      if (!title) return json({ ok: false, error: 'no_title' }, 400)

      let q = admin.from('push_subscriptions').select('id, endpoint, p256dh, auth, failures')
      const agentName = String(body.agentName || '').trim()
      if (agentName) q = q.eq('agent_name', agentName)

      const { data: rows } = await q
      if (!rows || rows.length === 0) return json({ ok: true, sent: 0, note: 'no_devices' })

      const result = await deliver(admin, rows as Row[], {
        title,
        body: String(body.body || ''),
        url: String(body.url || '/'),
        tag: body.tag ? String(body.tag) : undefined,
        // Present only on "how did it go?" pushes. The service worker turns it
        // into the two answer buttons and posts it straight back — see
        // mark-attendance.
        markToken: body.markToken ? String(body.markToken) : undefined,
        markUrl: body.markToken
          ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/mark-attendance`
          : undefined,
      })
      return json({ ok: true, ...result })
    }

    return json({ ok: false, error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[push]', String(e))
    return json({ ok: false, error: String(e).slice(0, 300) }, 500)
  }
})
