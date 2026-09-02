// Reliable Green API notification consumer for the free Developer plan.
//
// Green API's Webhook Endpoint stopped forwarding some phone/Web/Desktop
// messages. HTTP API mode keeps every notification in a FIFO queue for 24 hours.
// This worker drains that queue, sends message notifications through the existing
// wa-webhook handler, and acknowledges each item only after successful handling.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MESSAGE_WEBHOOKS = new Set([
  'incomingMessageReceived',
  'outgoingMessageReceived',
  'outgoingAPIMessageReceived',
])
const MAX_NOTIFICATIONS_PER_RUN = 30

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function trace(event: string, details: Record<string, unknown> = {}) {
  // Metadata only: never log message text, phone numbers, chat IDs or secrets.
  console.log('[wa-notification-consumer]', JSON.stringify({ event, ...details }))
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: cfgRow } = await admin
      .from('app_auth')
      .select('value')
      .eq('key', 'wa_webhook_token')
      .maybeSingle()
    const token = String(cfgRow?.value || '')

    const url = new URL(req.url)
    if (!token || url.searchParams.get('t') !== token) {
      trace('ignored', { reason: 'bad_token' })
      return json({ ignored: 'bad_token' })
    }

    const { data: groupRows } = await admin
      .from('app_auth')
      .select('key, value')
      .in('key', ['wa_meeting_group', 'wa_summary_group'])
    const groups = Object.fromEntries(
      (groupRows || []).map((row: { key: string; value: string }) => [row.key, String(row.value || '')])
    )

    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('id_instance, api_token, api_url')
      .eq('agent_name', '__summary__')
      .maybeSingle()
    if (!inst) {
      trace('failed', { reason: 'no_instance' })
      return json({ error: 'no_instance' }, 500)
    }

    const base = `${String(inst.api_url).replace(/\/$/, '')}/waInstance${inst.id_instance}`
    const receiveUrl = `${base}/receiveNotification/${inst.api_token}?receiveTimeout=5`
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-webhook?t=${encodeURIComponent(token)}`

    let received = 0
    let forwarded = 0
    let ignored = 0
    let acknowledged = 0
    let failed = 0
    const typeCounts: Record<string, number> = {}
    let quotaInfo: Record<string, unknown> | null = null
    let journalFallback = { attempted: 0, forwarded: 0, failed: 0 }

    for (let i = 0; i < MAX_NOTIFICATIONS_PER_RUN; i++) {
      let notification: any
      try {
        const receiveRes = await fetch(receiveUrl)
        if (!receiveRes.ok) {
          failed++
          trace('receive_failed', { status: receiveRes.status })
          break
        }
        notification = await receiveRes.json().catch(() => null)
      } catch {
        failed++
        trace('receive_failed', { status: 'network_error' })
        break
      }

      // Empty queue: ReceiveNotification returns null after its short long-poll.
      if (!notification?.receiptId || !notification?.body) break
      received++

      const body = notification.body
      const typeWebhook = String(body?.typeWebhook || 'missing')
      typeCounts[typeWebhook] = (typeCounts[typeWebhook] || 0) + 1
      const shouldRunJournalImmediately = typeWebhook === 'quotaExceeded'
      let handled = true

      if (MESSAGE_WEBHOOKS.has(typeWebhook)) {
        try {
          const handlerRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          handled = handlerRes.ok
          if (handled) forwarded++
          else trace('forward_failed', { status: handlerRes.status, typeWebhook })
        } catch {
          handled = false
          trace('forward_failed', { status: 'network_error', typeWebhook })
        }
      } else {
        ignored++
        if (typeWebhook === 'quotaExceeded') {
          const quota = body?.quotaData || {}
          const description = String(quota?.description || '')
          quotaInfo = {
            method: String(quota?.method || 'correspondents'),
            used: Number(quota?.used || 0),
            total: Number(quota?.total || 0),
            status: String(quota?.status || 'unknown'),
            meetingGroupAllowed: Boolean(groups.wa_meeting_group && description.includes(groups.wa_meeting_group)),
            summaryGroupAllowed: Boolean(groups.wa_summary_group && description.includes(groups.wa_summary_group)),
          }
          trace('quota_exceeded', quotaInfo)
        }
      }

      // Keep failed items in Green API's 24-hour queue so the next run retries.
      if (!handled) {
        failed++
        break
      }

      try {
        const deleteRes = await fetch(
          `${base}/deleteNotification/${inst.api_token}/${notification.receiptId}`,
          { method: 'DELETE' }
        )
        const deleteBody = await deleteRes.json().catch(() => ({}))
        if (!deleteRes.ok || deleteBody?.result !== true) {
          failed++
          trace('ack_failed', { status: deleteRes.status })
          break
        }
        acknowledged++
        // quotaExceeded is the signal for the journal fallback. Do not perform
        // another five-second long poll before handling the command we already
        // know is waiting in the journal.
        if (shouldRunJournalImmediately) break
      } catch {
        failed++
        trace('ack_failed', { status: 'network_error' })
        break
      }
    }

    // On the free Developer plan Green API replaces message notifications from
    // chats outside the monthly three-chat allowance with quotaExceeded. Use
    // that notification as an event trigger, then read the short journals only
    // at that moment. This preserves near-live commands without constant polling.
    if (quotaInfo) {
      const pollerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-journal-poller?t=${encodeURIComponent(token)}`
      // Give Green API's journal a short moment to expose the accepted message.
      // Shorter delays can race the journal and miss the command entirely.
      await new Promise((resolve) => setTimeout(resolve, 1200))

      for (let attempt = 0; attempt < 1; attempt++) {
        journalFallback.attempted++
        try {
          const pollerRes = await fetch(pollerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          })
          const pollerBody = await pollerRes.json().catch(() => ({}))
          if (!pollerRes.ok) {
            journalFallback.failed++
          } else {
            journalFallback.forwarded += Number(pollerBody?.forwarded || 0)
          }
        } catch {
          journalFallback.failed++
        }

        if (journalFallback.forwarded > 0 || journalFallback.failed > 0) break
      }
    }

    trace('complete', {
      received,
      forwarded,
      ignored,
      acknowledged,
      failed,
      typeCounts,
      quotaInfo,
      journalFallback,
    })
    return json({
      handled: 'notification_queue',
      received,
      forwarded,
      acknowledged,
      failed,
      typeCounts,
      quotaInfo,
      journalFallback,
    })
  } catch (error) {
    trace('crashed', { message: error instanceof Error ? error.message : 'unknown' })
    return json({ error: 'internal_error' }, 500)
  }
})
