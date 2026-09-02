// Supabase Edge Function: voice-intent
//
// Turns a spoken Hebrew (or Arabic) sentence into a meeting the form can be
// filled from. It is the LAST of three tiers, and by design the rarest:
//
//   1. rules, in the extension      — free, instant, catches most sentences
//   2. Chrome's on-device model     — free, instant, never leaves the machine
//   3. here                         — only when both of those came back empty
//
// Measured on the real data, the team books ~7.6 meetings a day, so this is
// reached a handful of times a day at most.
//
// THE PROVIDER IS A DATABASE ROW, NOT A DECISION IN THE CODE.
// app_auth.ai_provider switches between Gemini and any OpenAI-compatible
// endpoint (Groq, NVIDIA NIM, OpenRouter, Cloudflare). Moving the whole team to
// a different free tier is one UPDATE — no redeploy, and no extension update on
// four machines.
//
// It returns DATA, never an action. Nothing here writes to a calendar, a form,
// or the database; the agent still confirms every field on screen.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-bridge-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/** What the model is asked for — and nothing else. */
function buildPrompt(text: string, todayISO: string, weekday: string) {
  return `אתה מחלץ פרטי פגישה ממשפט שסוכן מכירות אמר בקול. ענה JSON בלבד.

היום ${todayISO}, יום ${weekday}. שעון ישראל.

החזר בדיוק את המבנה הזה:
{"date":"YYYY-MM-DD או null","time":{"h":0-23,"m":0-59} או null,"kind":"frontal או zoom או null","note":"טקסט או null"}

כללים:
- "פרונטלי", "אצלנו", "במשרד", "בסניף" → frontal. "זום", "וידאו", "אונליין", "מרחוק" → zoom.
- שעות עבודה 09:00–19:00. שעה 1–8 בלי הבהרה היא אחר הצהריים (4 → 16:00).
- "בבוקר" מחייב שעת בוקר. "בערב" מחייב שעת ערב.
- אם לא נאמר תאריך — null. אם לא נאמרה שעה — null. אל תמציא.
- note הוא רק תוכן שהסוכן ביקש לרשום בתיאור, אחרת null.

המשפט: "${text}"`
}

/** Pull the first JSON object out of a reply that may be wrapped in fences. */
function firstJson(raw: string): any | null {
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Google's own shape. */
async function askGemini(key: string, model: string, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    }
  )
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `gemini ${res.status}`)
  return body?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

/**
 * Groq, NVIDIA NIM, OpenRouter, Cloudflare — all speak this one.
 *
 * Two things are deliberately NOT assumed, because the biggest free model on
 * NVIDIA's catalog (nemotron-3-ultra-550b) breaks both assumptions:
 *
 *   response_format  its model card says "Structured Output: Not supported",
 *                    so sending it is an error rather than a hint. It is opt-in
 *                    via app_auth.ai_json_mode = 'on'. We do not need it: the
 *                    reply is parsed with firstJson(), which digs the object
 *                    out of whatever prose or fences surround it.
 *
 *   max_tokens       it is a REASONING model — it thinks before it answers. A
 *                    tight cap gets spent on the thinking and returns an empty
 *                    message. 1024 leaves room for both, and app_auth.ai_extra
 *                    can switch thinking off entirely per provider, e.g.
 *                    {"chat_template_kwargs":{"enable_thinking":false}}
 */
async function askOpenAICompatible(
  endpoint: string,
  key: string,
  model: string,
  prompt: string,
  jsonMode: boolean,
  extra: Record<string, unknown>
) {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...extra,
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `provider ${res.status}`)
  const msg = body?.choices?.[0]?.message
  // A reasoning model puts its thinking in reasoning_content and the answer in
  // content. Fall back to the thinking only if content came back empty.
  return msg?.content || msg?.reasoning_content || ''
}

/**
 * Never trust the model's shape. A hallucinated hour of 47 or a date of
 * "מחר" must come back as null rather than reach a form as a real value.
 */
function sanitise(v: any) {
  const out: any = { date: null, time: null, kind: null, note: null }
  if (!v || typeof v !== 'object') return out

  if (typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
    const [y, m, d] = v.date.split('-').map(Number)
    const probe = new Date(Date.UTC(y, m - 1, d))
    if (probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d) out.date = v.date
  }

  const t = v.time
  if (t && typeof t === 'object') {
    const h = Number(t.h)
    const m = Number(t.m)
    if (Number.isInteger(h) && h >= 0 && h <= 23 && Number.isInteger(m) && m >= 0 && m <= 59) {
      out.time = { h, m }
    }
  }

  if (v.kind === 'frontal' || v.kind === 'zoom') out.kind = v.kind
  if (typeof v.note === 'string' && v.note.trim() && v.note.trim() !== 'null') {
    out.note = v.note.trim().slice(0, 500)
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: rows } = await admin
      .from('app_auth')
      .select('key, value')
      .in('key', [
        'crm_bridge_token',
        'gemini_api_key',
        'ai_provider',
        'ai_key',
        'ai_endpoint',
        'ai_model',
        'ai_json_mode',
        'ai_extra',
      ])
    const cfg: Record<string, string> = {}
    for (const r of rows || []) cfg[r.key] = r.value

    // Same shared token the extension already sends to crm-bridge.
    const sent = req.headers.get('x-bridge-token') || ''
    if (!cfg.crm_bridge_token || sent !== cfg.crm_bridge_token) {
      return json({ error: 'unauthorized' }, 401)
    }

    const { text } = await req.json().catch(() => ({ text: '' }))
    const said = String(text || '').trim().slice(0, 400)
    if (!said) return json({ date: null, time: null, kind: null, note: null })

    // Israel local date, so "מחר" resolves against the agent's day and not UTC.
    const nowIL = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })
    )
    const iso = `${nowIL.getFullYear()}-${String(nowIL.getMonth() + 1).padStart(2, '0')}-${String(
      nowIL.getDate()
    ).padStart(2, '0')}`
    const prompt = buildPrompt(said, iso, HE_WEEKDAYS[nowIL.getDay()])

    const provider = (cfg.ai_provider || 'gemini').toLowerCase()
    let raw = ''

    if (provider === 'gemini') {
      const key = cfg.ai_key || cfg.gemini_api_key
      if (!key) return json({ error: 'no_key' }, 500)
      raw = await askGemini(key, cfg.ai_model || 'gemini-flash-latest', prompt)
    } else {
      // Groq / NVIDIA / OpenRouter / Cloudflare — one row switches between them.
      if (!cfg.ai_endpoint || !cfg.ai_key || !cfg.ai_model) {
        return json({ error: 'provider_not_configured' }, 500)
      }
      // Provider quirks live in the database too, so a model that needs a
      // special switch does not need a redeploy to get one.
      let extra: Record<string, unknown> = {}
      if (cfg.ai_extra) {
        try {
          extra = JSON.parse(cfg.ai_extra)
        } catch {
          extra = {}
        }
      }
      raw = await askOpenAICompatible(
        cfg.ai_endpoint,
        cfg.ai_key,
        cfg.ai_model,
        prompt,
        (cfg.ai_json_mode || '').toLowerCase() === 'on',
        extra
      )
    }

    return json(sanitise(firstJson(raw)))
  } catch (e) {
    console.error('[voice-intent]', String(e))
    // A failure here must be silent to the agent: the rules already answered,
    // or there was nothing to answer. Never block the bar on this.
    return json({ date: null, time: null, kind: null, note: null, error: 'failed', detail: String(e).slice(0, 300) })
  }
})
