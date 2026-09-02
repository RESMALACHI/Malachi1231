// Durable WhatsApp command fallback.
//
// Green API occasionally keeps phone/Web/Desktop messages in its journals but
// does not forward their live webhook. This function runs once a minute, reads
// only the last five minutes, and replays command messages from allowed groups
// into wa-webhook. wa_processed makes the live webhook and this fallback safe to
// run together without ever handling the same command twice.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const COMMANDS = ['.פגישה', '.היום', '.מחר']
const BOT_REPLY_MARKERS = ['📅', '✅', '❌', '⚠️']

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function firstText(...values: unknown[]): string {
  return (values.find((value) => typeof value === 'string' && value.length > 0) as string) || ''
}

function normalizeText(text: string): string {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .trim()
}

function journalText(message: any): string {
  return normalizeText(firstText(
    message?.textMessage,
    message?.extendedTextMessage?.text,
    message?.extendedTextMessageData?.text,
    message?.caption
  ))
}

function isCommand(text: string): boolean {
  return COMMANDS.some((command) => text.startsWith(command))
}

function trace(event: string, details: Record<string, unknown> = {}) {
  // Metadata only: never log message text, phone numbers, chat IDs or secrets.
  console.log('[wa-journal-poller]', JSON.stringify({ event, ...details }))
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: cfgRows } = await admin
      .from('app_auth')
      .select('key, value')
      .in('key', ['wa_webhook_token', 'wa_meeting_group'])
    const cfg: Record<string, string> = {}
    for (const row of cfgRows || []) cfg[row.key] = row.value

    const url = new URL(req.url)
    if (!cfg.wa_webhook_token || url.searchParams.get('t') !== cfg.wa_webhook_token) {
      trace('ignored', { reason: 'bad_token' })
      return response({ ignored: 'bad_token' })
    }

    const groups = (cfg.wa_meeting_group || '')
      .split(',')
      .map((group) => group.trim())
      .filter(Boolean)

    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('id_instance, api_token, api_url')
      .eq('agent_name', '__summary__')
      .maybeSingle()

    if (!inst || groups.length === 0) {
      trace('failed', { reason: inst ? 'no_groups' : 'no_instance' })
      return response({ error: inst ? 'no_groups' : 'no_instance' }, 500)
    }

    const base = `${String(inst.api_url).replace(/\/$/, '')}/waInstance${inst.id_instance}`
    const loadJournal = async (kind: 'incoming' | 'outgoing') => {
      const method = kind === 'incoming' ? 'lastIncomingMessages' : 'lastOutgoingMessages'
      try {
        const res = await fetch(`${base}/${method}/${inst.api_token}?minutes=5`)
        if (!res.ok) {
          trace('journal_failed', { kind, status: res.status })
          return []
        }
        const payload = await res.json()
        return Array.isArray(payload) ? payload : []
      } catch {
        trace('journal_failed', { kind, status: 'network_error' })
        return []
      }
    }

    const [incoming, outgoing] = await Promise.all([
      loadJournal('incoming'),
      loadJournal('outgoing'),
    ])

    const unique = new Map<string, any>()
    for (const message of [...incoming, ...outgoing]) {
      const id = String(message?.idMessage || '')
      const text = journalText(message)
      if (
        !id ||
        !groups.includes(String(message?.chatId || '')) ||
        !isCommand(text) ||
        BOT_REPLY_MARKERS.some((marker) => text.startsWith(marker))
      ) continue
      unique.set(id, { ...message, _text: text })
    }

    const ids = [...unique.keys()]
    const seen = new Set<string>()
    if (ids.length > 0) {
      const { data: processed } = await admin
        .from('wa_processed')
        .select('id_message')
        .in('id_message', ids)
      for (const row of processed || []) seen.add(row.id_message)
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/wa-webhook?t=${encodeURIComponent(cfg.wa_webhook_token)}`
    let forwarded = 0
    let failed = 0

    for (const [id, message] of unique) {
      if (seen.has(id)) continue

      const sentByApi = message.sendByApi === true || message.sendByApi === 'true'
      const typeWebhook = message.type === 'incoming'
        ? 'incomingMessageReceived'
        : sentByApi
          ? 'outgoingAPIMessageReceived'
          : 'outgoingMessageReceived'

      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            typeWebhook,
            idMessage: id,
            senderData: { chatId: message.chatId },
            messageData: {
              typeMessage: 'textMessage',
              textMessageData: { textMessage: message._text },
            },
          }),
        })
        if (res.ok) forwarded++
        else {
          failed++
          trace('forward_failed', { status: res.status })
        }
      } catch {
        failed++
        trace('forward_failed', { status: 'network_error' })
      }
    }

    trace('complete', {
      scanned: incoming.length + outgoing.length,
      candidates: unique.size,
      alreadyProcessed: seen.size,
      forwarded,
      failed,
    })
    return response({ handled: 'journal_poll', forwarded, failed })
  } catch (error) {
    trace('crashed', { message: error instanceof Error ? error.message : 'unknown' })
    return response({ error: 'internal_error' }, 500)
  }
})
