// Supabase Edge Function: training-sim — the prospect in זירת אימון.
//
// Two actions:
//
//   turn   { persona, lang, rep, history }
//          → the virtual prospect's next line: { say, trust, gain, state }
//   grade  { persona, lang, rep, history, outcome, metrics, objections }
//          → a coach's read of the whole call: { score, verdict, strengths,
//            fixes, practice, foundHidden }
//
// FREE BY DESIGN. It runs on the team's existing Groq key, whose free plan
// allows (measured 14/09) 8,000 tokens a minute and 1,000 requests a day PER
// MODEL. The simulator therefore uses its own model — app_auth.sim_model,
// default openai/gpt-oss-120b — so a morning of practice can never eat the
// assistant's quota, and the other way round. When the free ceiling is hit the
// answer is a clear "rate_limited", never a bill.
//
// Why gpt-oss-120b: the same probe line was sent to every model on the key.
// The qwen models answered in broken Hebrew ("אני בתעסוקה", "תעיפי הרגע");
// gpt-oss-120b answered like a person, in ~0.3s.
//
// TRUST is not the model's to invent. The client measures each agent line
// (lib/simMetrics.js — word count, question, pressure) and charges the penalty
// itself; it sends the result as "trust now". The model adds only the part that
// needs judgement (gain, -1..+2), and this function clamps it. A model left to
// judge "was that a monologue?" once waved through a 38-word pitch.
//
// Auth: a signed-in team session (verify_jwt on). It spends quota, so it is
// not left open.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEFAULT_ENDPOINT = 'https://api.groq.com/openai/v1'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt
}

type Persona = {
  name: string
  gender: 'm' | 'f'
  startTrust: number
  bookAt: number
  opening: string
  brief: { who: string; surface: string; hidden: string; works: string; hangup: string }
}
type Line = { role: 'rep' | 'prospect'; text: string; trust?: number; gain?: number; measured?: any; trustNow?: number }

/** Only the fields the prompt uses, each capped — the client sends the persona. */
function readPersona(p: any): Persona {
  const b = p?.brief || {}
  return {
    name: str(p?.name, 40),
    gender: p?.gender === 'f' ? 'f' : 'm',
    startTrust: int(p?.startTrust, 0, 10, 4),
    bookAt: int(p?.bookAt, 1, 10, 7),
    opening: str(p?.opening, 200),
    brief: {
      who: str(b.who, 500),
      surface: str(b.surface, 300),
      hidden: str(b.hidden, 500),
      works: str(b.works, 400),
      hangup: str(b.hangup, 300),
    },
  }
}

function readHistory(h: unknown): Line[] {
  if (!Array.isArray(h)) return []
  return h.slice(-40).map((x: any) => ({
    role: x?.role === 'rep' ? 'rep' : 'prospect',
    text: str(x?.text, 700),
    trust: typeof x?.trust === 'number' ? int(x.trust, 0, 10, 0) : undefined,
    gain: typeof x?.gain === 'number' ? int(x.gain, -1, 2, 0) : undefined,
    measured: x?.measured && typeof x.measured === 'object' ? x.measured : undefined,
    trustNow: typeof x?.trustNow === 'number' ? int(x.trustNow, 0, 10, 0) : undefined,
  })).filter((x) => x.text)
}

const LANG_STYLE: Record<string, string> = {
  he: 'natural, grammatical, everyday spoken Israeli Hebrew, like a native speaker on the phone ("האמת", "רגע", "סבבה" are fine; no formal or invented phrases)',
  ar: 'natural colloquial Palestinian/Israeli Arabic as spoken in the Galilee, in Arabic script (not formal MSA)',
}

function addressRule(lang: string, repGender: 'm' | 'f') {
  if (lang === 'ar') {
    return repGender === 'f'
      ? 'THE REP IS FEMALE: address her in feminine Arabic (إنتِ، قوليلي، بتقدري).'
      : 'THE REP IS MALE: address him in masculine Arabic (إنت، قلّي، بتقدر).'
  }
  return repGender === 'f'
    ? 'THE REP IS FEMALE: address her ONLY in feminine Hebrew (את, תגידי, תסבירי, את יכולה, שלך). Never אתה/תגיד to her.'
    : 'THE REP IS MALE: address him ONLY in masculine Hebrew (אתה, תגיד, תסביר, אתה יכול).'
}

const COLLEGE =
  'What the rep can offer (you know only what they actually tell you): "פרויקט הגשמה" — practical real-estate training with a personal mentor who goes out to the field with you and closes your first deals with you; courses from a catalogue of 13; digital business tools; Ministry of Labour certificates; subsidised by איגוד הנדל"ן. The price depends on the track and the subsidy and is given only in the meeting. Branches: Ramat Gan, Haifa, Be\'er Sheva; Zoom is possible.'

function turnPrompt(p: Persona, lang: string, repGender: 'm' | 'f') {
  const b = p.brief
  return [
    `Role-play: you are a PROSPECT answering a phone call. Speak ${LANG_STYLE[lang] || LANG_STYLE.he}.`,
    'A sales rep from R.E.S real-estate college calls because you left your details on a real-estate ad. The rep\'s goal is to book you for a consultation meeting with a concrete day and time.',
    `YOU: ${b.who} You are ${p.gender === 'f' ? 'female — speak about yourself in feminine forms' : 'male — speak about yourself in masculine forms'}.`,
    addressRule(lang, repGender),
    `SURFACE OBJECTION (raise it early, come back to it if dodged): ${b.surface}`,
    `HIDDEN REAL CONCERN: ${b.hidden} NEVER volunteer it. Reveal it only when the rep asks an open question about you, your life, or what is holding you back.`,
    `WHAT WORKS ON YOU: ${b.works}`,
    `WHAT MAKES YOU HANG UP: ${b.hangup}`,
    COLLEGE,
    'FACTS: react only to what the rep actually said. Never invent a price, a date, or details nobody mentioned.',
    '',
    'TRUST (0-10) is computed for you and shown after each rep message as "trust now", already including penalties for measured faults (monologue, pressure). Add your own "gain" for the good in the rep\'s LAST message only:',
    ' +2 a genuine question about you, used something you said, or truly handled your concern',
    ' +1 a short, clear, respectful answer',
    '  0 nothing that moved you',
    ' -1 it felt fake, evasive or scripted',
    `Final trust = trust now + gain. If final <= 1: a short annoyed goodbye, state "hung_up". Agree to a meeting ONLY if final >= ${p.bookAt}, your hidden concern was addressed, and a concrete day and time were offered — then state "booked" and repeat the day and time in your own words. Your tone follows trust: low = short, cold, suspicious; high = open and curious.`,
    'STYLE: 1-2 short sentences, at most 22 words — a phone call, not an essay. Never break character. Never mention AI, a simulation or training. Never coach, grade or compliment the rep.',
    'Reply ONLY with JSON: {"gain":<-1..2>,"trust":<final 0-10>,"say":"<your words>","state":"talking|booked|hung_up"}',
  ].join('\n')
}

function measuredTag(m: any, trustNow: number) {
  const parts = [`${int(m?.words, 0, 999, 0)} words`, m?.asked ? 'asked a question' : 'no question']
  if (m?.monologue) parts.push('MONOLOGUE')
  else if (m?.long) parts.push('LONG')
  if (m?.pressure) parts.push(`PRESSURE ("${str(m.pressure, 30)}")`)
  if (m?.twoOptions) parts.push('offered two concrete time options')
  return `[measured: ${parts.join(', ')}. trust now: ${trustNow}]`
}

function turnMessages(p: Persona, history: Line[], lang: string, repGender: 'm' | 'f') {
  const msgs: { role: string; content: string }[] = [{ role: 'system', content: turnPrompt(p, lang, repGender) }]
  let trust = p.startTrust
  for (const line of history) {
    if (line.role === 'prospect') {
      trust = line.trust ?? trust
      msgs.push({
        role: 'assistant',
        content: JSON.stringify({ gain: line.gain ?? 0, trust, say: line.text, state: 'talking' }),
      })
    } else {
      const now = line.trustNow ?? trust
      msgs.push({ role: 'user', content: `${line.text}\n${measuredTag(line.measured, now)}` })
    }
  }
  return msgs
}

function gradePrompt(
  p: Persona,
  lang: string,
  repGender: 'm' | 'f',
  history: Line[],
  outcome: string,
  metrics: any,
  objections: { q: string; a: string }[]
) {
  const b = p.brief
  const langName = lang === 'ar' ? 'Arabic (colloquial, Arabic script)' : 'Hebrew'
  const person = repGender === 'f' ? 'feminine' : 'masculine'
  const obj = objections.length
    ? objections.map((o) => `- "${o.q}" → ${o.a}`).join('\n')
    : '(none provided)'
  // Each agent line carries what the code measured on it, so a fix is anchored
  // in a fact ("32 words, no question") rather than the coach's impression.
  const repFacts = (m: any) => {
    if (!m) return ''
    const f = [`${int(m.words, 0, 999, 0)} words`, m.asked ? 'asks' : 'no question']
    if (m.monologue) f.push('MONOLOGUE')
    if (m.pressure) f.push(`PRESSURE "${str(m.pressure, 30)}"`)
    if (m.twoOptions) f.push('two concrete options')
    return ` (${f.join(', ')})`
  }
  const lines = history
    .map((l, i) =>
      l.role === 'rep'
        ? `[${i}] REP${repFacts(l.measured)}: ${l.text}`
        : `[${i}] PROSPECT (trust ${l.trust ?? '?'}): ${l.text}`
    )
    .join('\n')
  const outcomeText =
    outcome === 'booked'
      ? 'BOOKED — the prospect agreed to a meeting'
      : outcome === 'hung_up'
        ? 'THE PROSPECT HUNG UP'
        : 'ENDED BY THE REP without a booking'

  return [
    'You are a strict, fair sales coach at R.E.S real-estate college in Israel. Evaluate a PRACTICE phone call: the rep called a simulated prospect to BOOK A CONSULTATION MEETING (a concrete day and time). Booking is the only goal of this call; selling the program happens in the meeting.',
    '',
    "THE OFFICE'S METHOD (from its own call script):",
    '- Open: get permission for a minute; do not sell yet.',
    '- Discover: ask open questions about the person, then be quiet and listen.',
    '- Connect: reflect back what they said before explaining anything.',
    '- Value before price: the price is NEVER given on the phone — it depends on the subsidy and is set in the meeting.',
    '- Invite with "where is convenient for you?", not "do you want to meet?". Face-to-face first; Zoom only if it is far.',
    '- Close with TWO concrete options (day + time). Never "when suits you?".',
    '- Confirm the day, time and place out loud.',
    "The team's official objection answers:",
    obj,
    'Note: the script itself says the digital tools are "worth 19,800 shekels" — saying that is describing value, NOT giving a price. Only an actual price for the program counts as giving a price.',
    '',
    `THE PROSPECT (hidden from the rep): ${b.who} Surface objection: ${b.surface} Hidden concern: ${b.hidden} What works: ${b.works}`,
    `OUTCOME: ${outcomeText}.`,
    `MEASURED IN CODE (trust these numbers): rep's share of the words ${int(metrics?.repShare, 0, 100, 0)}%, questions asked ${int(metrics?.questions, 0, 99, 0)}, meeting invitations ${int(metrics?.meetingAsks, 0, 99, 0)}, two concrete options offered: ${metrics?.twoOptions ? 'yes' : 'no'}, monologues ${int(metrics?.monologues, 0, 99, 0)}, longest line ${int(metrics?.longest, 0, 999, 0)} words.`,
    '',
    'TRANSCRIPT (numbers in brackets are line indexes):',
    lines,
    '',
    `Write all feedback in natural, spoken ${langName} — the way a good team lead talks to an agent in a WhatsApp voice note: short sentences, everyday words, nothing formal. Speak TO the rep in ${person} second person${lang === 'he' ? (repGender === 'f' ? ' (את: שאלת, פתחת, כדאי לך)' : ' (אתה: שאלת, פתחת, כדאי לך)') : ''} — never about "the rep". No flattery, no generic advice: every point must be about this call, and only claim what the transcript shows.`,
    '"better" is exactly what the rep can say on the phone next time, in the style of the official answers above: at most 30 words, sounds like a person, usually ends with a question to the prospect.',
    'Return ONLY JSON:',
    '{"score":<0-100>,"verdict":"<one sentence: what decided this call>","strengths":["<at most 2, one specific sentence each>"],"fixes":[{"line":<index of a REP line>,"why":"<short: what it cost>","better":"<what to say instead — natural spoken words, ready to use>"}],"practice":"<one sentence to practise before the next real call>","found_hidden":<true|false>}',
    'At most 3 fixes, each on a different REP line, most costly first. If the rep did well, fewer fixes is fine.',
    'Scoring: booked with two concrete options and the hidden concern found: 85-100. Booked otherwise: 65-84. Not booked but real discovery happened: 40-64. Pitched without asking, or pushed: 0-39. If the prospect hung up: at most 45. Any MONOLOGUE or PRESSURE line: at most 80, whatever the outcome. Rep\'s share of the words above 60%: take off 5.',
  ].join('\n')
}

function firstJson(text: string): any | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * One model call. A 429 on the free plan is usually a per-minute ceiling that
 * resets in seconds — Groq says how many in retry-after — so a short wait is
 * absorbed here instead of dropping the agent mid-call.
 */
async function callModel(
  cfg: { endpoint: string; key: string; model: string },
  messages: { role: string; content: string }[],
  opts: { maxTokens: number; effort: string; temperature: number; patienceS: number }
): Promise<{ ok: true; data: any } | { ok: false; status: number; retryAfter?: number; detail?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${cfg.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        reasoning_effort: opts.effort,
        response_format: { type: 'json_object' },
      }),
    })
    if (res.status === 429) {
      const wait = Math.ceil(Number(res.headers.get('retry-after')) || 0)
      if (attempt === 0 && wait > 0 && wait <= opts.patienceS) {
        await sleep(wait * 1000 + 250)
        continue
      }
      return { ok: false, status: 429, retryAfter: wait || undefined }
    }
    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[training-sim]', res.status, JSON.stringify(out?.error ?? {}).slice(0, 300))
      return { ok: false, status: res.status, detail: out?.error?.message }
    }
    const content = String(out?.choices?.[0]?.message?.content || '')
    const parsed = firstJson(content)
    if (parsed) return { ok: true, data: parsed }
    console.error('[training-sim] unparsable', out?.choices?.[0]?.finish_reason)
    if (attempt === 0) continue // a reasoning model that ran out of room — once more
    return { ok: false, status: 502, detail: 'unparsable_reply' }
  }
  return { ok: false, status: 502 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: rows } = await admin
      .from('app_auth')
      .select('key, value')
      .in('key', ['ai_key', 'ai_endpoint', 'sim_model', 'sim_effort'])
    const c: Record<string, string> = {}
    for (const r of rows || []) c[r.key] = r.value
    if (!c.ai_key) return json({ error: 'no_api_key' }, 500)
    const cfg = { endpoint: c.ai_endpoint || DEFAULT_ENDPOINT, key: c.ai_key, model: c.sim_model || DEFAULT_MODEL }
    const effort = c.sim_effort || 'low'

    const body = await req.json().catch(() => ({}))
    const action = str(body.action, 20)
    const lang = body.lang === 'ar' ? 'ar' : 'he'
    const repGender: 'm' | 'f' = body.rep?.gender === 'f' ? 'f' : 'm'
    const persona = readPersona(body.persona)
    const history = readHistory(body.history)
    if (!persona.brief.who) return json({ error: 'no_persona' }, 400)

    if (action === 'turn') {
      const last = history[history.length - 1]
      if (!last || last.role !== 'rep') return json({ error: 'no_rep_line' }, 400)
      const trustNow = last.trustNow ?? persona.startTrust

      const r = await callModel(cfg, turnMessages(persona, history, lang, repGender), {
        maxTokens: 1000,
        effort,
        temperature: 0.8,
        patienceS: 12,
      })
      if (!r.ok) return json({ error: r.status === 429 ? 'rate_limited' : 'model_failed', retryAfter: r.retryAfter ?? null }, r.status === 429 ? 429 : 502)

      const gain = int(r.data.gain, -1, 2, 0)
      const trust = Math.max(0, Math.min(10, trustNow + gain))
      const say = str(r.data.say, 400)
      if (!say) return json({ error: 'empty_reply' }, 502)

      let state = ['talking', 'booked', 'hung_up'].includes(r.data.state) ? r.data.state : 'talking'
      // The model agreed to meet a rep it does not trust yet — one point of
      // slack for its own arithmetic, no more. Otherwise the booking is a gift.
      if (state === 'booked' && trust < persona.bookAt - 1) state = 'talking'
      if (trust <= 0) state = 'hung_up'

      return json({ ok: true, say, gain, trust, state })
    }

    if (action === 'grade') {
      if (!history.some((l) => l.role === 'rep')) return json({ error: 'empty_call' }, 400)
      const objections = (Array.isArray(body.objections) ? body.objections : [])
        .slice(0, 14)
        .map((o: any) => ({ q: str(o?.q, 120), a: str(o?.a, 200) }))
        .filter((o: any) => o.q)
      const outcome = ['booked', 'hung_up', 'ended'].includes(body.outcome) ? body.outcome : 'ended'

      const r = await callModel(
        cfg,
        [{ role: 'user', content: gradePrompt(persona, lang, repGender, history, outcome, body.metrics, objections) }],
        { maxTokens: 2500, effort: 'medium', temperature: 0.3, patienceS: 25 }
      )
      if (!r.ok) return json({ error: r.status === 429 ? 'rate_limited' : 'model_failed', retryAfter: r.retryAfter ?? null }, r.status === 429 ? 429 : 502)

      const d = r.data
      const repIdx = new Set(history.map((l, i) => (l.role === 'rep' ? i : -1)).filter((i) => i >= 0))
      const seen = new Set<number>()
      const fixes = (Array.isArray(d.fixes) ? d.fixes : [])
        .map((f: any) => ({ line: int(f?.line, -1, 999, -1), why: str(f?.why, 240), better: str(f?.better, 400) }))
        // A fix must point at something the agent actually said, once.
        .filter((f: any) => repIdx.has(f.line) && f.better && !seen.has(f.line) && seen.add(f.line))
        .slice(0, 3)

      // The caps the prompt states, enforced: a booking won with a speech and a
      // "חייב" is not a model call, whatever the coach felt about the ending.
      let score = int(d.score, 0, 100, 0)
      if (outcome === 'hung_up') score = Math.min(score, 45)
      if (int(body.metrics?.monologues, 0, 99, 0) > 0 || int(body.metrics?.pressures, 0, 99, 0) > 0) {
        score = Math.min(score, 80)
      }

      return json({
        ok: true,
        score,
        verdict: str(d.verdict, 300),
        strengths: (Array.isArray(d.strengths) ? d.strengths : []).map((s: any) => str(s, 240)).filter(Boolean).slice(0, 2),
        fixes,
        practice: str(d.practice, 300),
        foundHidden: d.found_hidden === true,
      })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[training-sim]', String(e))
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
