// Supabase Edge Function: meeting-summary
//
// Two actions, both called from the "סיכום פגישה" page:
//
//   transcribe  { audio: <base64 wav>, meetingTitle? }
//               → Gemini turns the agent's voice note into a clean, written
//                 Hebrew summary. Returns { transcript, summary }.
//
//   send        { text }
//               → posts the finished summary to the "נבחרת החלומות" WhatsApp
//                 group — where the team writes its summaries. The target is
//                 app_auth.wa_summary_group (see resolveSummaryChat below); it is
//                 deliberately NOT wa_meeting_group, which is the allow-list of
//                 chats the bot *listens* in and points at a different group.
//
// The Gemini key lives in app_auth.gemini_api_key. Without it, transcription
// returns a clear error and the page falls back to typing by hand — the rest of
// the feature keeps working.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseDailyLimit } from './quota.ts'

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

// An ALIAS, deliberately: Google retires pinned versions (gemini-2.5-flash
// started 404-ing for new keys), and this tracks whatever the current flash
// model is. Override per-project with app_auth.gemini_model if ever needed.
const DEFAULT_MODEL = 'gemini-flash-latest'

// Transcription is deliberately its own step: a long recording arrives as
// several short chunks (one big upload kept failing from a phone), so this
// prompt must work on a fragment that may start or end mid-sentence.
const TRANSCRIBE_PROMPT = `מצורף קטע מהקלטה קולית בעברית שבה יועץ לימודים מספר מה קרה בפגישה עם לקוח.

תמלל את הקטע במדויק, מילה במילה.

החזר JSON בלבד:
{ "transcript": "<התמלול>" }

כללים:
- תמלל רק את מה שנשמע בפועל. אל תוסיף, אל תשלים ואל תתקן.
- הקטע עשוי להתחיל או להסתיים באמצע משפט — זה תקין, תמלל כפי שהוא.
- אם לא נשמע דיבור כלל, החזר מחרוזת ריקה.`

const SUMMARIZE_PROMPT = `להלן תמלול של יועץ לימודים במכללת נדל"ן המספר מה קרה בפגישה עם לקוח.

החזר JSON בלבד:
{
  "summary": "<סיכום כתוב, מסודר וקצר>",
  "outcome": "<enrolled | thinking | not_relevant | unknown>"
}

כללים לסיכום:
- כתוב בעברית, בגוף שלישי, בטון עסקי ותמציתי.
- 2 עד 5 שורות. כל שורה מתחילה בקו מפריד "- ".
- כלול רק מה שנאמר בפועל. אל תמציא פרטים, שמות, סכומים או תאריכים שלא נאמרו.
- אם נאמר מה השלב הבא (לחזור אליו, לשלוח חומר, ממתין לתשובה) — ציין זאת בשורה האחרונה.

כללים ל-outcome:
- "enrolled" רק אם נאמר במפורש שהלקוח נרשם / סגר / חתם.
- "thinking" אם הלקוח מתעניין אך טרם החליט.
- "not_relevant" אם נאמר שהלקוח לא מתאים או לא מעוניין.
- "unknown" בכל מקרה אחר.`

/** Pull the first JSON object out of a model reply (it may wrap it in fences). */
function extractJson(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Which chat the summary goes to.
 *
 * NOT the first entry of wa_meeting_group — that list is an allow-list of every
 * group the bot listens in, in no particular order, and its first entry turned
 * out to be a group that fell out of use. Resolved in order of confidence:
 *   1. app_auth.wa_summary_group — an explicit answer, set by a human.
 *   2. The chat the bot most recently handled a command in — i.e. whichever
 *      group the team is actually working in right now. Self-healing.
 *   3. The first allow-list entry, as a last resort.
 */
async function resolveSummaryChat(admin: any): Promise<string | null> {
  const { data: explicit } = await admin
    .from('app_auth')
    .select('value')
    .eq('key', 'wa_summary_group')
    .maybeSingle()
  if (explicit?.value) return String(explicit.value).trim()

  const { data: recent } = await admin
    .from('wa_processed')
    .select('chat_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recent?.chat_id) return String(recent.chat_id).trim()

  const { data: cfg } = await admin
    .from('app_auth')
    .select('value')
    .eq('key', 'wa_meeting_group')
    .maybeSingle()
  return (
    String(cfg?.value || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)[0] || null
  )
}

/**
 * Call Gemini, riding out a temporary overload.
 *
 * A 503 UNAVAILABLE means "this model is busy right now, try again" — Google's
 * own message says spikes are usually temporary. Surfacing that to an agent who
 * just spoke for two minutes throws the recording away over a few busy seconds,
 * so it's retried with a widening gap.
 *
 * Only 503 is retried. A 429 is a quota decision and hammering it makes things
 * worse; a 4xx won't change on a second try.
 */
async function callGemini(model: string, apiKey: string, parts: unknown[]): Promise<Response> {
  const backoffMs = [700, 2100] // ~2.8s of patience in total
  let res!: Response

  for (let attempt = 0; ; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      }
    )

    if (res.status !== 503 || attempt >= backoffMs.length) return res

    console.warn(`[meeting-summary] ${model} busy (503), retry ${attempt + 1}`)
    await new Promise((r) => setTimeout(r, backoffMs[attempt]))
  }
}

/** Today's date in Israel — the budget resets at local midnight, not at UTC. */
function israelToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * What the team has actually spent today, against the real ceiling.
 *
 * `limitRequests` is null until the ceiling is known — no invented denominator.
 * Nothing here is an estimate: the count is one row per call we really made.
 */
async function getQuota(admin: any) {
  const today = israelToday()

  const { data: rows } = await admin
    .from('transcription_usage')
    .select('seconds, kind')
    .eq('used_on', today)

  const list = rows || []
  const requestsToday = list.length
  const secondsToday = list.reduce((s: number, r: any) => s + Number(r.seconds || 0), 0)

  const { data: cfgRows } = await admin
    .from('app_auth')
    .select('key, value')
    .in('key', ['gemini_daily_requests_limit', 'gemini_quota_source', 'gemini_quota_last_error'])
  const cfg: Record<string, string> = {}
  for (const r of cfgRows || []) cfg[r.key] = r.value

  const limitRequests = Number(cfg.gemini_daily_requests_limit) || null

  return {
    date: today,
    requestsToday,
    secondsToday,
    limitRequests,
    remainingRequests: limitRequests ? Math.max(0, limitRequests - requestsToday) : null,
    limitSource: limitRequests ? cfg.gemini_quota_source || 'manual' : null,
    lastQuotaError: cfg.gemini_quota_last_error || null,
  }
}

/** Remember a Gemini call actually made, so the day's count is real. */
async function recordCall(admin: any, kind: string, seconds: number, agentName?: string) {
  await admin
    .from('transcription_usage')
    .insert({ agent_name: agentName || null, seconds: Math.max(0, seconds), kind })
}

/** Persist the ceiling the moment Google reveals it. */
async function rememberLimit(admin: any, limit: number, message: string) {
  await admin.from('app_auth').upsert(
    [
      { key: 'gemini_daily_requests_limit', value: String(limit) },
      { key: 'gemini_quota_source', value: 'google' },
      { key: 'gemini_quota_last_error', value: message.slice(0, 400) },
    ],
    { onConflict: 'key' }
  )
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

    // ── How much of today's shared budget is left ──
    if (action === 'quota') {
      return json({ ok: true, ...(await getQuota(admin)) })
    }

    // ── Post the finished summary to the meetings group ──
    if (action === 'send') {
      const text = String(body.text || '').trim()
      if (!text) return json({ ok: false, error: 'empty_text' }, 400)

      const chatId = await resolveSummaryChat(admin)
      if (!chatId) return json({ ok: false, error: 'no_group_configured' }, 500)

      const { data: inst } = await admin
        .from('whatsapp_instances')
        .select('id_instance, api_token, api_url')
        .eq('agent_name', '__summary__')
        .maybeSingle()
      if (!inst) return json({ ok: false, error: 'no_whatsapp_instance' }, 500)

      const base = `${String(inst.api_url).replace(/\/$/, '')}/waInstance${inst.id_instance}`
      const res = await fetch(`${base}/sendMessage/${inst.api_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: text }),
      })
      const detail = await res.text()
      if (!res.ok) {
        console.error('[meeting-summary] send', res.status, chatId, detail.slice(0, 300))
        // chatId is echoed back: a wrong target is exactly the failure this
        // endpoint hit before, and guessing it from the outside cost hours.
        return json({ ok: false, error: 'send_failed', status: res.status, chatId, detail }, 502)
      }
      return json({ ok: true, chatId, detail })
    }

    // Both AI actions need the key + model, so resolve them once.
    if (action === 'transcribe' || action === 'summarize') {
      const { data: keyRow } = await admin
        .from('app_auth')
        .select('value')
        .eq('key', 'gemini_api_key')
        .maybeSingle()
      const apiKey = keyRow?.value
      if (!apiKey) return json({ ok: false, error: 'no_api_key' }, 503)

      const { data: modelRow } = await admin
        .from('app_auth')
        .select('value')
        .eq('key', 'gemini_model')
        .maybeSingle()
      const model = modelRow?.value || DEFAULT_MODEL

      // ── One chunk of the voice note → its transcript ──
      // Stop before spending a request we know Google will refuse — but only
      // when the ceiling is actually known. An unknown limit never blocks.
      const before = await getQuota(admin)
      if (before.remainingRequests !== null && before.remainingRequests <= 0) {
        return json({ ok: false, error: 'quota_exhausted', quota: before }, 429)
      }

      let parts: unknown[]
      if (action === 'transcribe') {
        const audio = String(body.audio || '')
        if (!audio) return json({ ok: false, error: 'no_audio' }, 400)
        parts = [
          { text: TRANSCRIBE_PROMPT },
          { inline_data: { mime_type: 'audio/wav', data: audio } },
        ]
      } else {
        // ── The joined transcript → a written summary ──
        const transcript = String(body.transcript || '').trim()
        if (!transcript) return json({ ok: false, error: 'no_transcript' }, 400)
        const context = body.meetingTitle
          ? `\n\nהפגישה שעליה מדובר: "${String(body.meetingTitle).slice(0, 200)}".`
          : ''
        parts = [{ text: `${SUMMARIZE_PROMPT}${context}\n\nהתמלול:\n${transcript}` }]
      }

      const res = await callGemini(model, apiKey, parts)

      const out = await res.json()
      if (!res.ok) {
        console.error('[meeting-summary]', action, res.status, JSON.stringify(out).slice(0, 400))
        const message = out?.error?.message || ''

        // Still busy after the retries — say so plainly, so a temporary spike
        // isn't mistaken for a broken key or a spent quota.
        if (res.status === 503) {
          return json({ ok: false, error: 'model_busy', detail: message }, 503)
        }

        // Google just told us the real ceiling — learn it and never guess again.
        if (res.status === 429) {
          const learned = parseDailyLimit(out)
          if (learned) await rememberLimit(admin, learned, message)
          return json(
            {
              ok: false,
              error: 'quota_exhausted',
              detail: message,
              quota: await getQuota(admin),
            },
            429
          )
        }

        return json({ ok: false, error: 'gemini_failed', status: res.status, detail: message }, 502)
      }

      const text = out?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
      const parsed = extractJson(text)
      if (!parsed) return json({ ok: false, error: 'unparsable_reply', raw: text.slice(0, 400) }, 502)

      // Counted only after Gemini actually answered — a call that failed on the
      // network or was refused costs the team nothing.
      const seconds =
        action === 'transcribe' ? Math.max(0, Math.min(Number(body.seconds) || 0, 600)) : 0
      await recordCall(admin, action, seconds, body.agentName)
      const quota = await getQuota(admin)

      if (action === 'transcribe') {
        return json({ ok: true, transcript: String(parsed.transcript || '').trim(), quota })
      }

      const outcome = ['enrolled', 'thinking', 'not_relevant'].includes(parsed.outcome)
        ? parsed.outcome
        : null
      return json({
        ok: true,
        summary: String(parsed.summary || '').trim(),
        outcome,
        quota,
      })
    }

    return json({ ok: false, error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[meeting-summary]', String(e))
    return json({ ok: false, error: String(e).slice(0, 300) }, 500)
  }
})
