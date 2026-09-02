// Supabase Edge Function: send-deals-report
//
// Sends accounting a plain-TEXT breakdown of one agent's deals for a month —
// readable and searchable in WhatsApp, unlike the PNG report that
// send-whatsapp-report produces.
//
// The message is built HERE, from the database, not passed in by the browser:
// this endpoint can message a real person outside the team, so the client gets
// to choose *which month* and nothing else. `preview: true` returns exactly the
// text that would be sent without sending it, so the agent can read it first.
//
// Recipient: ACCOUNTING_WHATSAPP_NUMBER (an existing project secret — the same
// chat the monthly report already goes to, so no new chat is opened).
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

const RULE = '━━━━━━━━━━━━━'
const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The two things this college sells, as the office names them.
 *
 * `kind` is NOT NULL with a 'project' default, so these two cover everything
 * that exists today — but an unrecognised value still gets a group of its own
 * rather than being folded into one of these. A deal quietly counted under the
 * wrong heading is worse than a heading nobody expected.
 */
const KIND_LABEL: Record<string, string> = {
  project: 'פרויקט הגשמה',
  course: 'קורס בודד',
}
const KIND_ORDER = ['project', 'course']

/**
 * Month bounds as plain dates. Built from the calendar fields, never from an
 * ISO timestamp — converting local midnight to UTC shifts 01/07 back to 30/06
 * and would silently move every month boundary by a day.
 */
function monthDates(year: number, month: number) {
  const from = `${year}-${pad(month + 1)}-01`
  const nextYear = month === 11 ? year + 1 : year
  const nextMonth = month === 11 ? 0 : month + 1
  return { from, to: `${nextYear}-${pad(nextMonth + 1)}-01` }
}

/** 12000 → "12,000" */
function shekels(n: number): string {
  return `₪${Math.round(n).toLocaleString('en-US')}`
}

/** "2026-07-03" → "03/07" */
function shortDate(iso: string): string {
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}`
}

/**
 * Collected as a share of the deal value — "92%", or "92.5%" when the tenth
 * carries information. Accounting reads this figure next to two shekel sums it
 * can add up itself, so a rounded whole number that disagrees with them by a
 * hair is worse than one more digit.
 */
function pct(part: number, whole: number): string {
  if (!(whole > 0)) return '—'
  const p = (part / whole) * 100
  const rounded = Math.round(p * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Require a signed-in user before anything can be sent to accounting.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)

    const body = await req.json().catch(() => ({}))
    const agentName = String(body.agentName || '').trim()
    const year = Number(body.year)
    const month = Number(body.month) // 0-based, as in the app
    const preview = body.preview === true

    if (!agentName || !Number.isInteger(year) || !Number.isInteger(month)) {
      return json({ error: 'bad_request' }, 400)
    }

    const { from, to } = monthDates(year, month)
    const { data: deals, error: dealsErr } = await admin
      .from('deals')
      .select('client_name, amount, collected, kind, notes, deal_date')
      .eq('agent_name', agentName)
      .gte('deal_date', from)
      .lt('deal_date', to)
      .order('deal_date', { ascending: true })

    if (dealsErr) return json({ error: 'db_failed', detail: dealsErr.message }, 500)

    const list = deals || []
    if (list.length === 0) return json({ error: 'no_deals' }, 400)

    const total = list.reduce((s: number, d: any) => s + Number(d.amount || 0), 0)

    // NULL means "nobody has written the figure down yet"; 0 means "we tried and
    // got nothing". dealsService.js keeps them apart on purpose, so the report
    // does too: an unrecorded deal reads "טרם נגבה" rather than silently
    // reporting a collection of zero shekels.
    const isRecorded = (d: any) => d.collected !== null && d.collected !== undefined
    const collectedTotal = list.reduce(
      (s: number, d: any) => s + (isRecorded(d) ? Number(d.collected) : 0),
      0
    )
    const unrecorded = list.filter((d: any) => !isRecorded(d)).length
    const monthLabel = `${HE_MONTHS[month]} ${year}`

    // Split by what was sold, so the month reads as two businesses rather than
    // one number. The grand total still follows, unchanged.
    const groups = new Map<
      string,
      { label: string; count: number; total: number; collected: number }
    >()
    for (const d of list) {
      const key = String(d.kind || 'project')
      const g = groups.get(key) || {
        label: KIND_LABEL[key] || key,
        count: 0,
        total: 0,
        collected: 0,
      }
      g.count += 1
      g.total += Number(d.amount || 0)
      g.collected += isRecorded(d) ? Number(d.collected) : 0
      groups.set(key, g)
    }
    const rank = (k: string) => (KIND_ORDER.indexOf(k) < 0 ? 99 : KIND_ORDER.indexOf(k))
    const byKind = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([, g]) => g)

    // With only one kind sold this month, the split would just restate the total
    // sitting directly beneath it. Shown only when it actually divides something.
    const breakdown =
      byKind.length > 1
        ? byKind
            .map(
              (g) =>
                `*${g.label}* — ${g.count} ${g.count === 1 ? 'עסקה' : 'עסקאות'}\n` +
                `    💰 ${shekels(g.total)}  ·  ✅ נגבה ${shekels(g.collected)}`
            )
            .join('\n\n') + `\n${RULE}\n`
        : ''

    const lines = list.map((d: any, i: number) => {
      const parts = [
        `*${i + 1}. ${d.client_name || 'ללא שם'}*`,
        `    💰 ${shekels(Number(d.amount || 0))}  ·  🗓️ ${shortDate(d.deal_date)}`,
      ]
      parts.push(
        isRecorded(d)
          ? `    ✅ נגבה: ${shekels(Number(d.collected))}`
          : `    ⏳ טרם נגבה`
      )
      if (d.notes) parts.push(`    📝 ${String(d.notes).replace(/\n+/g, ' ').trim()}`)
      return parts.join('\n')
    })

    const message =
      `🧾 *דוח עסקאות חודשי*\n${RULE}\n` +
      `👤 *סוכן:* ${agentName}\n` +
      `📅 *חודש:* ${monthLabel}\n${RULE}\n\n` +
      `${lines.join('\n\n')}\n\n${RULE}\n` +
      breakdown +
      `📊 *סה"כ ${list.length} ${list.length === 1 ? 'עסקה' : 'עסקאות'}*\n` +
      `💰 *סכום כולל: ${shekels(total)}*\n` +
      `✅ *סה"כ נגבה: ${shekels(collectedTotal)}*\n` +
      `📈 *אחוז גבייה: ${pct(collectedTotal, total)}*\n` +
      // Said only when it applies, and said plainly: without it the percentage
      // above looks like a collection failure when it is really a paperwork gap.
      (unrecorded > 0
        ? unrecorded === 1
          ? `\n_לעסקה אחת טרם נרשמה גבייה — היא נספרת כ-0 באחוז._\n`
          : `\n_ל-${unrecorded} עסקאות טרם נרשמה גבייה — הן נספרות כ-0 באחוז._\n`
        : '') +
      `${RULE}\n` +
      `_הופק אוטומטית ממערכת הפגישות של מכללת R.E.S_`

    const toNumber = Deno.env.get('ACCOUNTING_WHATSAPP_NUMBER')
    const digits = String(toNumber || '').replace(/\D/g, '')
    if (digits.length < 8) return json({ error: 'invalid_whatsapp_number' }, 500)

    if (preview) {
      return json({
        ok: true,
        preview: message,
        recipientNumber: digits,
        count: list.length,
        total,
        collected: collectedTotal,
      })
    }

    // ── Send ──
    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('id_instance, api_token, api_url')
      .eq('agent_name', '__summary__')
      .maybeSingle()

    const apiUrl = String(inst?.api_url || Deno.env.get('GREENAPI_API_URL') || '').replace(/\/$/, '')
    const idInstance = inst?.id_instance || Deno.env.get('GREENAPI_ID_INSTANCE')
    const tokenInstance = inst?.api_token || Deno.env.get('GREENAPI_TOKEN_INSTANCE')
    if (!apiUrl || !idInstance || !tokenInstance || !toNumber) {
      return json({ error: 'missing_greenapi_config' }, 500)
    }

    const res = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${tokenInstance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: `${digits}@c.us`, message }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok || !out?.idMessage) {
      console.error('[send-deals-report]', res.status, JSON.stringify(out).slice(0, 300))
      return json({ error: 'greenapi_failed', status: res.status, detail: out }, 502)
    }

    return json({
      ok: true,
      idMessage: out.idMessage,
      count: list.length,
      total,
      collected: collectedTotal,
    })
  } catch (e) {
    console.error('[send-deals-report]', String(e))
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
