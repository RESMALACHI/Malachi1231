// The read-only tools ".בוט" can call.
//
// The first version handed the model a fixed snapshot — today, tomorrow, this
// month — which meant it confidently answered those three questions and knew
// nothing else. Anything about last month, a named client, a lead or a deal was
// outside its world.
//
// So the model no longer gets the data up front; it gets these, and asks. Every
// tool is a parameterised SELECT written HERE: the model chooses a tool and
// fills in arguments, it never writes SQL and never reaches the database
// directly. Nothing writes. Arguments are validated and row counts capped, so a
// confused (or mischievous) call costs a wasted query and nothing else.
//
// Results come back as labelled text rather than JSON — a small model quotes a
// number far more reliably when the text already says what the number is. Any
// aggregate the model might be asked for is computed here for the same reason:
// it should be quoting, never doing arithmetic.

import { BLOCK, ilRangeUtc } from './agenda.ts'

const TZ = 'Asia/Jerusalem'
const MAX_ROWS = 60

const dtFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const when = (iso: string | null) => (iso ? dtFmt.format(new Date(iso)).replace(', ', ' ') : '—')
const day = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—')
const typeHe = (t: string | null) => (t === 'zoom' ? 'זום' : t === 'frontal' ? 'פרונטלי' : 'ללא סוג')
const statusHe = (s: string | null) =>
  s === 'attended' ? 'הגיע' : s === 'no_show' ? 'לא הגיע' : 'טרם סומן'
const money = (n: unknown) => `₪${Number(n || 0).toLocaleString('en-US')}`
const oneLine = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim()

const clampLimit = (n: unknown, fallback = 25) => {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? Math.min(MAX_ROWS, Math.floor(v)) : fallback
}

/** PostgREST treats these as wildcards/separators — neutralise before ilike. */
const safeLike = (s: unknown) =>
  oneLine(s).replace(/[%_,()*]/g, ' ').trim().slice(0, 60)

/**
 * The tool definitions the model sees. Descriptions are the entire interface —
 * they are what it reads to decide which tool answers the question in front of
 * it, so they say when to reach for each one, not just what it returns.
 */
export const TOOL_SPECS = [
  {
    type: 'function',
    function: {
      name: 'search_meetings',
      description:
        'רשימת פגישות בטווח תאריכים. השתמש בזה לשאלות על פגישות ספציפיות: של מי, מתי, של איזה לקוח, מה הסטטוס. לשאלות "כמה" עדיף count_meetings.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'תאריך התחלה YYYY-MM-DD (לפי תאריך הפגישה)' },
          to: { type: 'string', description: 'תאריך סיום YYYY-MM-DD, כולל' },
          agent: { type: 'string', description: 'שם הסוכן, אם השאלה על סוכן מסוים' },
          client: { type: 'string', description: 'חלק משם הלקוח או מהכותרת, לחיפוש לקוח' },
          status: { type: 'string', enum: ['attended', 'no_show', 'pending'] },
          type: { type: 'string', enum: ['zoom', 'frontal'] },
          by: {
            type: 'string',
            enum: ['date', 'booked'],
            description: 'date = מתי הפגישה מתקיימת (ברירת מחדל). booked = מתי היא נקבעה.',
          },
          limit: { type: 'number' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'count_meetings',
      description:
        'ספירת פגישות בטווח תאריכים, מפולחת לפי סוכן, כולל כמה הגיעו ולא הגיעו. זה הכלי לשאלות "כמה", "מי הכי הרבה", השוואות בין סוכנים ובין חודשים.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD, כולל' },
          agent: { type: 'string' },
          type: { type: 'string', enum: ['zoom', 'frontal'] },
          by: {
            type: 'string',
            enum: ['date', 'booked'],
            description:
              'date = פגישות שמתקיימות בטווח. booked = פגישות שנקבעו בטווח. "כמה נקבעו" תמיד booked.',
          },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_leads',
      description: 'לידים שנכנסו — לפי טווח תאריכים, סוכן, סטטוס, מקור או שם.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD, כולל' },
          agent: { type: 'string' },
          status: { type: 'string' },
          query: { type: 'string', description: 'חלק משם הליד' },
          limit: { type: 'number' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_deals',
      description: 'עסקאות שנסגרו בטווח תאריכים, עם סכומים וסיכום. לשאלות על מכירות והכנסות.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD, כולל' },
          agent: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'day_summaries',
      description:
        'סיכומי היום שהסוכנים מילאו: שיחות, שיחות ארוכות, מעקבים, שעות עבודה והערות. לשאלות על פעילות יומית ושיחות.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD, כולל' },
          agent: { type: 'string' },
        },
        required: ['from', 'to'],
      },
    },
  },
]

type Args = Record<string, unknown>

async function searchMeetings(admin: any, a: Args): Promise<string> {
  const range = ilRangeUtc(String(a.from), String(a.to))
  if (!range) return 'טווח תאריכים לא תקין. השתמש בפורמט YYYY-MM-DD.'
  const col = a.by === 'booked' ? 'event_created_at' : 'meeting_date'

  let q = admin
    .from('meetings')
    .select('title, meeting_date, event_created_at, type, agent_name, status, location')
    .gte(col, range.start.toISOString())
    .lt(col, range.end.toISOString())
    .order(col, { ascending: true })
    .limit(clampLimit(a.limit))

  if (a.agent) q = q.ilike('agent_name', `%${safeLike(a.agent)}%`)
  if (a.client) q = q.ilike('title', `%${safeLike(a.client)}%`)
  if (a.status === 'attended' || a.status === 'no_show' || a.status === 'pending') {
    q = q.eq('status', a.status)
  }
  if (a.type === 'zoom' || a.type === 'frontal') q = q.eq('type', a.type)

  const { data, error } = await q
  if (error) return `שגיאה בשליפת הפגישות: ${error.message}`

  const rows = (data || []).filter((m: any) => !BLOCK.test(m.title || ''))
  if (rows.length === 0) return 'לא נמצאו פגישות בטווח הזה.'

  const lines = rows.map(
    (m: any) =>
      `- ${when(m.meeting_date)} · ${m.agent_name || 'לא משויך'} · ${typeHe(m.type)} · ${statusHe(m.status)}` +
      `${m.location ? ` · ${m.location}` : ''} · נקבעה ${day(m.event_created_at)} · "${oneLine(m.title)}"`
  )
  return `נמצאו ${rows.length} פגישות:\n${lines.join('\n')}`
}

async function countMeetings(admin: any, a: Args): Promise<string> {
  const range = ilRangeUtc(String(a.from), String(a.to))
  if (!range) return 'טווח תאריכים לא תקין. השתמש בפורמט YYYY-MM-DD.'
  const col = a.by === 'booked' ? 'event_created_at' : 'meeting_date'

  let q = admin
    .from('meetings')
    .select('title, agent_name, status')
    .gte(col, range.start.toISOString())
    .lt(col, range.end.toISOString())
    .not('agent_name', 'is', null)
    .limit(4000)

  if (a.agent) q = q.ilike('agent_name', `%${safeLike(a.agent)}%`)
  if (a.type === 'zoom' || a.type === 'frontal') q = q.eq('type', a.type)

  const { data, error } = await q
  if (error) return `שגיאה בספירת הפגישות: ${error.message}`

  const rows = (data || []).filter((m: any) => !BLOCK.test(m.title || ''))
  type T = { n: number; attended: number; noShow: number; pending: number }
  const by = new Map<string, T>()
  for (const m of rows) {
    const t = by.get(m.agent_name) || { n: 0, attended: 0, noShow: 0, pending: 0 }
    t.n += 1
    if (m.status === 'attended') t.attended += 1
    else if (m.status === 'no_show') t.noShow += 1
    else t.pending += 1
    by.set(m.agent_name, t)
  }

  const what = a.by === 'booked' ? 'נקבעו' : 'מתקיימות'
  if (rows.length === 0) return `אין פגישות ש${what} בטווח ${a.from} עד ${a.to}.`

  const ranked = [...by.entries()].sort((x, y) => y[1].n - x[1].n)
  const lines = ranked.map(
    ([name, t]) =>
      `- ${name}: ${t.n} · הגיעו ${t.attended} · לא הגיעו ${t.noShow} · טרם סומנו ${t.pending}`
  )
  return [
    `פגישות ש${what} בין ${a.from} ל-${a.to}: סה"כ ${rows.length}`,
    'לפי סוכן (מהגבוה לנמוך):',
    ...lines,
  ].join('\n')
}

async function searchLeads(admin: any, a: Args): Promise<string> {
  const range = ilRangeUtc(String(a.from), String(a.to))
  if (!range) return 'טווח תאריכים לא תקין. השתמש בפורמט YYYY-MM-DD.'

  let q = admin
    .from('leads')
    .select('name, phone, source_name, agent_name, status, created_at')
    .gte('created_at', range.start.toISOString())
    .lt('created_at', range.end.toISOString())
    .order('created_at', { ascending: false })
    .limit(clampLimit(a.limit))

  if (a.agent) q = q.ilike('agent_name', `%${safeLike(a.agent)}%`)
  if (a.status) q = q.eq('status', oneLine(a.status).slice(0, 30))
  if (a.query) q = q.ilike('name', `%${safeLike(a.query)}%`)

  const { data, error } = await q
  if (error) return `שגיאה בשליפת הלידים: ${error.message}`
  const rows = data || []
  if (rows.length === 0) return 'לא נמצאו לידים בטווח הזה.'

  const lines = rows.map(
    (l: any) =>
      `- ${day(l.created_at)} · ${oneLine(l.name) || 'ללא שם'} · ${l.phone || 'ללא טלפון'} · מקור: ${l.source_name || '—'} · סוכן: ${l.agent_name || 'לא משויך'} · סטטוס: ${l.status || '—'}`
  )
  return `נמצאו ${rows.length} לידים:\n${lines.join('\n')}`
}

async function listDeals(admin: any, a: Args): Promise<string> {
  const range = ilRangeUtc(String(a.from), String(a.to))
  if (!range) return 'טווח תאריכים לא תקין. השתמש בפורמט YYYY-MM-DD.'

  let q = admin
    .from('deals')
    .select('client_name, agent_name, amount, collected, kind, created_at')
    .gte('created_at', range.start.toISOString())
    .lt('created_at', range.end.toISOString())
    .order('created_at', { ascending: false })
    .limit(clampLimit(a.limit, 40))

  if (a.agent) q = q.ilike('agent_name', `%${safeLike(a.agent)}%`)

  const { data, error } = await q
  if (error) return `שגיאה בשליפת העסקאות: ${error.message}`
  const rows = data || []
  if (rows.length === 0) return 'לא נסגרו עסקאות בטווח הזה.'

  const total = rows.reduce((s: number, d: any) => s + Number(d.amount || 0), 0)
  const collected = rows.reduce((s: number, d: any) => s + Number(d.collected || 0), 0)
  const kindHe = (k: string) => (k === 'project' ? 'פרויקט הגשמה' : k === 'course' ? 'קורס בודד' : k || '—')
  const lines = rows.map(
    (d: any) =>
      `- ${day(d.created_at)} · ${oneLine(d.client_name) || 'ללא שם'} · ${d.agent_name || '—'} · ${money(d.amount)} (נגבה ${money(d.collected)}) · ${kindHe(d.kind)}`
  )
  return [
    `${rows.length} עסקאות · סה"כ ${money(total)} · נגבה ${money(collected)}`,
    ...lines,
  ].join('\n')
}

async function daySummaries(admin: any, a: Args): Promise<string> {
  const from = String(a.from || '').trim()
  const to = String(a.to || '').trim()
  if (!ilRangeUtc(from, to)) return 'טווח תאריכים לא תקין. השתמש בפורמט YYYY-MM-DD.'

  // summary_date is a plain DATE column — compared as text, no timezone involved.
  let q = admin
    .from('day_summaries')
    .select('agent_name, summary_date, meetings_booked, calls, long_calls, followups_in, followups_out, work_from, work_to, notes')
    .gte('summary_date', from)
    .lte('summary_date', to)
    .order('summary_date', { ascending: false })
    .limit(MAX_ROWS)

  if (a.agent) q = q.ilike('agent_name', `%${safeLike(a.agent)}%`)

  const { data, error } = await q
  if (error) return `שגיאה בשליפת סיכומי היום: ${error.message}`
  const rows = data || []
  if (rows.length === 0) return 'לא נמצאו סיכומי יום בטווח הזה.'

  const lines = rows.map(
    (r: any) =>
      `- ${r.summary_date} · ${r.agent_name} · ${r.calls ?? 0} שיחות (${r.long_calls ?? 0} ארוכות) · ${r.meetings_booked ?? 0} פגישות נקבעו · מעקבים ${r.followups_in ?? 0}/${r.followups_out ?? 0}` +
      `${r.work_from || r.work_to ? ` · ${r.work_from || '?'}–${r.work_to || '?'}` : ''}` +
      `${r.notes ? ` · הערה: ${oneLine(r.notes).slice(0, 120)}` : ''}`
  )
  return `${rows.length} סיכומי יום:\n${lines.join('\n')}`
}

const HANDLERS: Record<string, (admin: any, a: Args) => Promise<string>> = {
  search_meetings: searchMeetings,
  count_meetings: countMeetings,
  search_leads: searchLeads,
  list_deals: listDeals,
  day_summaries: daySummaries,
}

/**
 * Run one tool call. Never throws and never returns empty — the loop feeds this
 * straight back to the model, and a blank tool result makes it hallucinate.
 */
export async function runTool(admin: any, name: string, rawArgs: string): Promise<string> {
  const handler = HANDLERS[name]
  if (!handler) return `כלי לא מוכר: ${name}`
  let args: Args = {}
  try {
    args = JSON.parse(rawArgs || '{}')
  } catch {
    return 'הפרמטרים לא היו JSON תקין.'
  }
  try {
    const out = await handler(admin, args)
    return out.slice(0, 6000) || 'אין תוצאות.'
  } catch (e) {
    console.error('[tools]', name, String(e).slice(0, 200))
    return 'הכלי נכשל. נסה שאילתה אחרת.'
  }
}
