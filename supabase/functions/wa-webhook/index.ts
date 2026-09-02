// Supabase Edge Function: wa-webhook
// Green API calls this on every WhatsApp message. We act ONLY when:
//   1. the URL carries the secret token   (blocks random internet hits)
//   2. the message is from the meeting group
//   3. the text starts with ".פגישה"
// Then: parse → create the Google Calendar event → reply in the group.
//
// PRODUCTION: authenticates as the Service Account (JWT) and routes each event
// to its real calendar by the parsed "יומן:" — zahar → pgishotzahar,
// ramatgan → pgishotramatgan. The bot ONLY creates events (POST); it never
// edits or deletes an existing one.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseMeeting, toCalendarEvent, TRIGGER } from './parseMeeting.ts'
import { buildAgenda } from './agenda.ts'
import { resolveMentions } from './mentions.ts'

// Read-only agenda commands: the day's meetings, grouped by type, in time order.
const TRIGGER_TODAY = '.היום'
const TRIGGER_TOMORROW = '.מחר'

// Sent when someone messages a bare ".פגישה" with nothing else — a short guide
// plus a copy-and-fill template.
const HELP_TEXT =
  '📅 *קביעת פגישה*\n' +
  'העתיקו את התבנית, מלאו את הפרטים, ושלחו 👇\n\n' +
  '.פגישה\n' +
  'סוג: \n' +
  'יומן: \n' +
  '0501112222\n' +
  'שם: ישראל ישראלי\n' +
  'שעה: 11:00\n' +
  'תאריך: יום + תאריך\n' +
  'תיאור\n' +
  'תיאור\n' +
  'תיאור\n' +
  'מבצע הפגישה: X\n' +
  'מתאם הפגישה: X\n\n' +
  '━━━━━━━━━━\n' +
  'ℹ️ *מדריך מילוי:*\n' +
  '• *סוג* — פרונטלי / זום\n' +
  '• *יומן* — צחר / רמת גן\n' +
  '• *תאריך* — "יום חמישי 23/07" או "23/07"\n' +
  '• *שם / שעה / מתאם הפגישה* — חובה\n' +
  '• *מבצע הפגישה / תיאור* — לא חובה\n\n' +
  '━━━━━━━━━━\n' +
  '🗂️ *פקודות נוספות:*\n' +
  '• *.היום* — כל פגישות היום\n' +
  '• *.מחר* — כל פגישות מחר'

// Every reply the bot sends begins with one of these. Used to recognise — and
// skip — the bot's own messages, so it can accept a ".פגישה" written from ANY
// device (incoming / outgoing / API) without ever re-processing itself.
const BOT_REPLY_MARKERS = ['📅', '✅', '❌', '⚠️']

// Google Maps links for the branches, dropped into the client's confirmation so
// they can navigate with one tap instead of copying an address into an app.
// Zoom meetings deliberately have none — sending a place to someone joining a
// video call is worse than sending nothing.
const BRANCH_MAP = {
  ramatgan: 'https://maps.app.goo.gl/9N7tgQ5exTDT1Jn6A',
  haifa: 'https://maps.app.goo.gl/1zPoH2wErNm1g6M28',
  zahar: 'https://maps.app.goo.gl/JCPYq6C6xbhbWK7q6',
}

// For the human-readable date in the confirmation ("יום ראשון, 26/07/2026").
const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const RULE = '━━━━━━━━━━━━━'

function ok(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

function firstText(...values: unknown[]): string {
  return (values.find((value) => typeof value === 'string' && value.length > 0) as string) || ''
}

/**
 * Green API uses a few text containers depending on whether the message was
 * typed on the phone, WhatsApp Web/Desktop, quoted, edited or sent via API.
 * Do not gate extraction on typeMessage: the useful text field is authoritative.
 */
function msgText(body: any): string {
  const md = body?.messageData || body || {}
  return firstText(
    md.textMessageData?.textMessage,
    md.extendedTextMessageData?.text,
    md.extendedTextMessageData?.textMessage,
    md.quotedMessageData?.textMessage,
    md.quotedMessageData?.extendedTextMessageData?.text,
    md.editedMessageData?.textMessage,
    md.editedMessageData?.extendedTextMessageData?.text,
    md.fileMessageData?.caption,
    md.caption,
    md.textMessage,
    md.text
  )
}

/**
 * WhatsApp can add invisible RTL/LTR controls around Hebrew text. They look
 * harmless in the UI but make startsWith('.פגישה') fail. NFKC also turns a
 * full-width dot typed by some mobile keyboards into a normal command dot.
 */
function normalizeWhatsAppText(text: string): string {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .trim()
}

function trace(event: string, details: Record<string, unknown> = {}) {
  // Metadata only: never log message text, phone numbers, chat IDs or secrets.
  console.log('[wa-webhook]', JSON.stringify({ event, ...details }))
}

function commandKind(text: string): 'meeting' | 'today' | 'tomorrow' | null {
  if (text.startsWith(TRIGGER_TODAY)) return 'today'
  if (text.startsWith(TRIGGER_TOMORROW)) return 'tomorrow'
  if (text.startsWith(TRIGGER)) return 'meeting'
  return null
}

function journalText(message: any): string {
  return normalizeWhatsAppText(firstText(
    message?.textMessage,
    message?.extendedTextMessage?.text,
    message?.extendedTextMessageData?.text,
    message?.caption
  ))
}

function startEnd(date: string, time: string) {
  const [Y, Mo, D] = date.split('-').map(Number)
  const [H, Mi] = time.split(':').map(Number)
  const s = new Date(Date.UTC(Y, Mo - 1, D, H, Mi))
  const e = new Date(s.getTime() + 3600000)
  const f = (d: Date) => d.toISOString().slice(0, 19)
  return { start: f(s), end: f(e) }
}

// ── Service Account auth: sign a JWT with the SA key, exchange for an access
// token. Used ONLY to create events; the code never issues edit/delete. ──
function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
async function saAccessToken(sa: any, scope: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )
  const jwt = `${signingInput}.${b64url(sig)}`
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const t = await res.json()
  return t.access_token || null
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
      .in('key', [
        'wa_webhook_token', 'wa_meeting_group',
        'gcal_sa_json', 'gcal_cal_zahar', 'gcal_cal_ramatgan',
      ])
    const cfg: Record<string, string> = {}
    for (const r of cfgRows || []) cfg[r.key] = r.value

    const url = new URL(req.url)
    if (!cfg.wa_webhook_token || url.searchParams.get('t') !== cfg.wa_webhook_token) {
      trace('ignored', { reason: 'bad_token' })
      return ok({ ignored: 'bad_token' })
    }

    /**
     * Green API's live webhook occasionally stops forwarding phone/Web/Desktop
     * messages even though they are present in its journal. The minute poll is a
     * durable fallback: it replays only command messages from allowed groups into
     * this same handler. wa_processed makes webhook + poll races idempotent.
     */
    if (url.searchParams.get('poll') === '1') {
      const groups = (cfg.wa_meeting_group || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const { data: pollInst } = await admin
        .from('whatsapp_instances')
        .select('id_instance, api_token, api_url')
        .eq('agent_name', '__summary__')
        .maybeSingle()

      if (!pollInst || groups.length === 0) {
        trace('poll_failed', { reason: pollInst ? 'no_groups' : 'no_instance' })
        return ok({ error: pollInst ? 'no_groups' : 'no_instance' })
      }

      const base = `${String(pollInst.api_url).replace(/\/$/, '')}/waInstance${pollInst.id_instance}`
      const loadJournal = async (kind: 'incoming' | 'outgoing') => {
        const method = kind === 'incoming' ? 'lastIncomingMessages' : 'lastOutgoingMessages'
        try {
          const res = await fetch(`${base}/${method}/${pollInst.api_token}?minutes=5`)
          if (!res.ok) {
            trace('poll_journal_failed', { kind, status: res.status })
            return []
          }
          const payload = await res.json()
          return Array.isArray(payload) ? payload : []
        } catch {
          trace('poll_journal_failed', { kind, status: 'network_error' })
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
          !commandKind(text) ||
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

      const target = new URL(req.url)
      target.searchParams.delete('poll')
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
          const res = await fetch(target.toString(), {
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
          else failed++
        } catch {
          failed++
        }
      }

      trace('poll_complete', {
        scanned: incoming.length + outgoing.length,
        candidates: unique.size,
        alreadyProcessed: seen.size,
        forwarded,
        failed,
      })
      return ok({ handled: 'journal_poll', forwarded, failed })
    }

    const body = await req.json().catch(() => ({}))
    const T = body.typeWebhook
    // Accept every flavour of text message: from other participants ('incoming'),
    // from this phone ('outgoing'), and API-sent ('outgoingAPI') — someone may
    // write ".פגישה" from any device. The bot's OWN replies are filtered out by
    // the reply-marker guard below, not by the webhook type.
    if (
      T !== 'incomingMessageReceived' &&
      T !== 'outgoingMessageReceived' &&
      T !== 'outgoingAPIMessageReceived'
    ) {
      trace('ignored', { reason: 'not_a_message', typeWebhook: T || 'missing' })
      return ok({ ignored: 'not_a_message' })
    }

    const chatId = body.senderData?.chatId || body.chatId || body.messageData?.chatId || ''
    // wa_meeting_group is a comma-separated allow-list of group chatIds — the bot
    // acts only in these groups. Add a group by appending its chatId.
    const groups = (cfg.wa_meeting_group || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!groups.includes(chatId)) {
      trace('ignored', { reason: 'other_chat', typeWebhook: T, hasChatId: Boolean(chatId) })
      return ok({ ignored: 'other_chat' })
    }

    const text = normalizeWhatsAppText(msgText(body))
    const typeMessage = body.messageData?.typeMessage || 'missing'
    // Never act on our own replies. Every message the bot sends starts with one
    // of these markers, so this is what keeps it from re-processing itself —
    // independent of which webhook type the message arrived as.
    if (BOT_REPLY_MARKERS.some((m) => text.startsWith(m))) {
      trace('ignored', { reason: 'own_reply', typeWebhook: T, typeMessage })
      return ok({ ignored: 'own_reply' })
    }
    // Which command was written. The agenda replies start with 📅, which is
    // already a reply marker, so the bot never re-processes its own output.
    const command = commandKind(text)
    const wantsToday = command === 'today'
    const wantsTomorrow = command === 'tomorrow'
    const wantsMeeting = command === 'meeting'
    if (!command) {
      trace('ignored', {
        reason: 'no_trigger',
        typeWebhook: T,
        typeMessage,
        hasText: Boolean(text),
        textLength: text.length,
        firstCodePoint: text ? text.codePointAt(0)?.toString(16) : null,
      })
      return ok({ ignored: 'no_trigger' })
    }

    trace('command', {
      command,
      typeWebhook: T,
      typeMessage,
    })

    const idMessage = body.idMessage || body.messageData?.idMessage || ''
    if (idMessage) {
      const { error: dupErr } = await admin
        .from('wa_processed')
        .insert({ id_message: idMessage, chat_id: chatId })
      if (dupErr) return ok({ ignored: 'duplicate' })
    }

    // Fetched once: both replying and resolving @mentions need these creds.
    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('id_instance, api_token, api_url')
      .eq('agent_name', '__summary__')
      .maybeSingle()

    const reply = async (message: string) => {
      if (!inst) return
      const base = `${inst.api_url.replace(/\/$/, '')}/waInstance${inst.id_instance}`
      await fetch(`${base}/sendMessage/${inst.api_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      }).catch(() => {})
    }

    // ".היום" / ".מחר" — read-only day agenda. Nothing is created or changed.
    if (wantsToday || wantsTomorrow) {
      await reply(await buildAgenda(admin, wantsTomorrow ? 1 : 0))
      return ok({ handled: wantsTomorrow ? 'agenda_tomorrow' : 'agenda_today' })
    }

    // @mentions arrive as bare phone numbers. Resolve them to names BEFORE
    // parsing, so the calendar description reads "@איציק" — and so a mention's
    // digits can never be mistaken for the client's own phone number.
    const resolvedText = await resolveMentions(admin, text, inst)
    const p = parseMeeting(resolvedText)

    // Bare ".פגישה" with nothing after it → send the how-to template, not a
    // wall of "missing field" errors.
    if (!p.fullMessage) {
      await reply(HELP_TEXT)
      return ok({ handled: 'help' })
    }

    if (!p.ok) {
      await reply(
        `❌ *הפגישה לא נקלטה*\n` +
        `חסרים או שגויים הפרטים הבאים:\n\n` +
        `• ${p.errors.join('\n• ')}\n\n` +
        `✍️ תקנו ושלחו שוב — או כתבו *.פגישה* לקבלת התבנית.`
      )
      return ok({ handled: 'invalid' })
    }

    if (!cfg.gcal_sa_json) {
      await reply('⚠️ שגיאה בחיבור ליומן. פנו למנהל המערכת.')
      return ok({ error: 'no_sa_key' })
    }
    const sa = JSON.parse(cfg.gcal_sa_json)
    const accessToken = await saAccessToken(sa, 'https://www.googleapis.com/auth/calendar.events')
    if (!accessToken) {
      await reply('⚠️ שגיאה בחיבור ליומן. פנו למנהל המערכת.')
      return ok({ error: 'no_token' })
    }

    const ev = toCalendarEvent(p)
    const { start, end } = startEnd(p.date!, p.time!)

    // Route to the real calendar named in "יומן:" (zahar / ramatgan).
    const calendarId = ev.calendar === 'zahar' ? cfg.gcal_cal_zahar : cfg.gcal_cal_ramatgan
    if (!calendarId) {
      await reply('⚠️ היומן לא מוגדר במערכת. פנו למנהל המערכת.')
      return ok({ error: 'no_calendar_id' })
    }

    const createRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: ev.title,
          description: ev.description,
          start: { dateTime: start, timeZone: 'Asia/Jerusalem' },
          end: { dateTime: end, timeZone: 'Asia/Jerusalem' },
        }),
      }
    )
    const created = await createRes.json()
    if (!created.id) {
      await reply('⚠️ לא הצלחתי ליצור את האירוע ביומן. נסו שוב.')
      return ok({ error: 'create_failed', detail: created })
    }

    const typeHe = p.type === 'zoom' ? 'זום' : 'פרונטלי'
    const calHe = ev.calendar === 'zahar' ? 'צחר' : 'רמת גן'
    // Readable date + the full hour window, so the writer can verify at a glance
    // instead of decoding an ISO string.
    const [yy, mm, dd] = p.date!.split('-')
    const niceDate = `יום ${HE_WEEKDAYS[new Date(p.date! + 'T00:00:00').getDay()]}, ${dd}/${mm}/${yy}`
    const endTime = end.slice(11, 16)

    // One-tap client reminder: a wa.me link that opens the CLIENT's chat in the
    // tapper's own WhatsApp with the branch's real invitation template — no API,
    // no quota, and it arrives from the agent's personal number.
    //
    // Branch: zoom / zahar come from the parsed fields. חיפה meetings live on
    // the ramat-gan CALENDAR, so the branch is read from the message text.
    const clientFirst = (p.name || '').trim().split(/\s+/)[0]
    const isHaifa = p.type === 'frontal' && /חיפה/.test(p.fullMessage || '')
    const branch =
      p.type === 'zoom' ? 'zoom' : isHaifa ? 'haifa' : ev.calendar === 'zahar' ? 'zahar' : 'ramatgan'
    const branchHe =
      branch === 'zoom' ? 'זום' : branch === 'haifa' ? 'חיפה' : branch === 'zahar' ? 'צחר' : 'רמת גן'

    const wdHe = HE_WEEKDAYS[new Date(p.date! + 'T00:00:00').getDay()]
    const hour = +p.time!.slice(0, 2)
    const tod = hour < 12 ? 'בבוקר' : hour < 16 ? 'בצהריים' : hour < 18 ? 'אחר הצהריים' : 'בערב'

    let clientMsg: string
    if (branch === 'zoom') {
      clientMsg =
        `היי ${clientFirst}, מקבוצת R.E.S! 👋\n\n` +
        `רק רציתי לוודא שרשמת לך – הפגישה שלנו נקבעה\n` +
        `${dd}/${mm} ליום ${wdHe} בשעה ${p.time} ${tod}. 🗓️\n\n` +
        `הפגישה תתקיים בזום, וקצת לפני הזמן ישלחו לך קישור מסודר לווצאפ שלך. 🎥\n\n` +
        `שיהיה המון בהצלחה, מחכים לשוחח איתך! 🌟`
    } else if (branch === 'ramatgan') {
      clientMsg =
        `היי ${clientFirst}! 🌟\n\n` +
        `שמחנו לתאם לך פגישת ייעוץ ללימודים וקריירה במכללת R.E.S.\n\n` +
        `הנה כל הפרטים שחשוב לזכור:\n\n` +
        `📅 מתי?\n` +
        `יום ${wdHe}, ${dd}/${mm}/${yy} בשעה ${p.time} ${tod}.\n\n` +
        `📍 איפה?\n` +
        `סניף רמת גן – רחוב תובל 30, בניין "בית אור" (מרכז הבורסה).\n` +
        `עולים לקומה 6 במעלית, ועוד חצי קומה ברגל במדרגות.\n` +
        `🗺️ ניווט: ${BRANCH_MAP.ramatgan}\n\n` +
        `🚗 דרכי הגעה וניווט:\n\n` +
        `הגעה ברכבת: יש לרדת בתחנת "סבידור מרכז" (הסניף במרחק הליכה קצר).\n\n` +
        `הגעה ברכב: יש חניון מסודר ממש אחרי שער הכניסה של הבניין.\n\n` +
        `🗺️ לנוחיותך, מדריך הגעה מצולם בווידאו: https://youtu.be/Oyc6E11vQl4\n\n` +
        `⏳ נשמח אם תשתדל להגיע כ-10 דקות לפני הזמן כדי שנוכל להתחיל ברוגע. הקפה כבר עליי! ☕😉\n\n` +
        `💬 המספר הזה הוא הווטסאפ האישי שלי לכל שאלה או תיאום.\n\n` +
        `📞 במידה ותנסה להשיג אותי בנייד ולא אהיה זמין, מצרף לך גם את המענה הטלפוני של הסניף לכל צורך: 2574* ☎️\n\n` +
        `שיהיה המון בהצלחה, מחכים לך!`
    } else {
      const place =
        branch === 'haifa'
          ? { title: 'במכללת RES חיפה', addr: 'מעלה השחרור 7 חיפה', map: BRANCH_MAP.haifa }
          : {
              title: 'במכללת RES ראש פינה',
              addr: 'א.ת צח"ר ראש פינה - ברקת 1',
              map: BRANCH_MAP.zahar,
            }
      clientMsg =
        `היי ${clientFirst}!\n` +
        `אז כפי שקבענו, פגישת יעוץ ללמודים ועבודה\n` +
        `🍒 *${place.title}* 🍒\n\n` +
        `שתערך יום ${wdHe} בתאריך ${+dd}/${+mm}\n` +
        `בשעה: ${p.time} ⏰\n` +
        `כתובת - ${place.addr}. 📌\n` +
        `🗺️ ניווט: ${place.map}\n\n` +
        `השתדל להגיע עשר דקות בערך לפני שעת הפגישה ⏳\n` +
        `הקפה עליי 😉\n\n` +
        `לכל שאלה זה הוואטסאפ האישי שלי 🙏🏼\n\n` +
        `☝🏼 במידה ומנסה להשיג אותי ללא הצלחה\n` +
        `מצרף לך את המספר טלפון של הסניף לכל צורך! ✌🏼\n` +
        `*2574\n\n` +
        `מאחל לך המון בהצלחה ומחכה לראות אותך אצלנו!\n` +
        `זמין בעבורך לכל שאלה`
    }

    const waLink = `https://wa.me/972${p.phone!.slice(1)}?text=${encodeURIComponent(clientMsg)}`
    // The encoded template is thousands of characters — store it and post a short
    // /go?id= link instead, so the group message stays readable. If storing fails
    // for any reason, fall back to the long link rather than losing the feature.
    const linkId = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    const { error: linkErr } = await admin.from('wa_links').insert({ id: linkId, url: waLink })
    const linkOut = linkErr
      ? waLink
      : `${Deno.env.get('SUPABASE_URL')}/functions/v1/go?id=${linkId}`

    await reply(
      `✅ *הפגישה נוצרה ביומן*\n${RULE}\n` +
      `👤 *לקוח:* ${p.name}\n` +
      `📞 *טלפון:* ${p.phone}\n` +
      `📅 *תאריך:* ${niceDate}\n` +
      `🕒 *שעה:* ${p.time} – ${endTime}\n${RULE}\n` +
      `📍 *סוג:* ${typeHe}\n` +
      `🗓️ *יומן:* ${calHe}\n` +
      `🤝 *מתאם:* ${p.coordinator}` +
      (p.performerRaw ? `\n👔 *מבצע:* ${p.performerRaw}` : '') +
      `\n${RULE}\n` +
      `📨 *שלחו ללקוח הודעת אישור (תבנית ${branchHe}) — בלחיצה אחת:*\n${linkOut}`
    )
    return ok({ handled: 'created', id: created.id, calendar: calendarId })
  } catch (e) {
    console.error('[wa-webhook]', String(e))
    return ok({ error: 'server_error' })
  }
})
