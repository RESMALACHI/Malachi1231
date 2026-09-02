// Supabase Edge Function: ai-chat
//
// The assistant that knows the college. Two things reach the model:
//
//   1. THE BRAIN — instructions מלאכי writes in the ניהול page
//      (app_settings.ai_brain). Editable without a deploy, which is the point.
//   2. THE NUMBERS — a live snapshot from company_funnel(), the same function
//      the manager's report page draws. One source, so the chat and the screen
//      can never quote different figures for the same month.
//
// The API key stays here. It is read from app_auth, which only the service role
// can see; putting it in the bundle would hand a copy to every visitor.
//
// Auth: a signed-in team session is required. This endpoint spends money and
// reads the whole company's performance, so it is not left open the way the
// lead webhook is.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const DEFAULT_AI_ENDPOINT = 'https://api.groq.com/openai/v1'
const DEFAULT_AI_MODEL = 'qwen/qwen3.8-27b'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

/** yyyy-mm-dd for the first and last day of a month offset from today. */
function monthRange(offset = 0) {
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(first), to: iso(last) }
}

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '—'

/**
 * The snapshot, written for a reader rather than a parser.
 *
 * Prose with explicit labels and units beats raw JSON here: a smaller model
 * quotes a number far more reliably when the text already says what it is, and
 * the conversion rates are computed HERE rather than left as arithmetic for it
 * to get wrong.
 */
function describe(label: string, f: any): string {
  const t = f?.totals || {}
  const done = (t.attended || 0) + (t.no_show || 0)

  const lines = [
    `### ${label} (${f?.range?.from} עד ${f?.range?.to})`,
    `שיחות שדווחו: ${t.calls ?? 0} · מתוכן מעל 4 דקות: ${t.long_calls ?? 0}`,
    `לידים שנכנסו: ${t.leads ?? 0}`,
    `פגישות שנקבעו: ${t.booked ?? 0} (פרונטלי ${t.frontal ?? 0}, זום ${t.zoom ?? 0})`,
    `מתוכן כבר התקיימו: ${done} — הגיעו ${t.attended ?? 0}, לא הגיעו ${t.no_show ?? 0}, טרם סומנו ${t.pending ?? 0}`,
    `אחוז הגעה (מתוך פגישות שכבר עברו): ${pct(t.attended || 0, done)}`,
    `עסקאות שנסגרו: ${t.deals ?? 0} · סכום: ₪${Number(t.revenue || 0).toLocaleString('en-US')} · נגבה: ₪${Number(t.collected || 0).toLocaleString('en-US')}`,
    `אחוז גבייה: ${pct(Number(t.collected || 0), Number(t.revenue || 0))}`,
    `סגירה מתוך מי שהגיע: ${pct(t.deals || 0, t.attended || 0)}`,
  ]

  const agents = (f?.by_agent || []) as any[]
  if (agents.length) {
    lines.push('', 'לפי סוכן:')
    for (const a of agents) {
      const closed = (a.attended || 0) + (a.no_show || 0)
      lines.push(
        `- ${a.name}: ${a.calls} שיחות (${a.long_calls} ארוכות, ${a.days_reported} ימים דווחו), ` +
          `${a.booked} פגישות נקבעו, ${a.attended} הגיעו, ${a.no_show} לא הגיעו ` +
          `(הגעה ${pct(a.attended || 0, closed)}), ` +
          `${a.deals} עסקאות ₪${Number(a.revenue || 0).toLocaleString('en-US')} ` +
          `(נגבה ₪${Number(a.collected || 0).toLocaleString('en-US')})`
      )
    }
  }

  const sources = (f?.by_source || []) as any[]
  if (sources.length) {
    lines.push('', 'מקורות לידים: ' + sources.map((s) => `${s.source} (${s.leads})`).join(', '))
  }
  const kinds = (f?.by_kind || []) as any[]
  if (kinds.length) {
    const label = (k: string) => (k === 'project' ? 'פרויקט הגשמה' : k === 'course' ? 'קורס בודד' : k)
    lines.push(
      'תמהיל מכירות: ' +
        kinds.map((k) => `${label(k.kind)} — ${k.deals} עסקאות ₪${Number(k.revenue || 0).toLocaleString('en-US')}`).join(', ')
    )
  }

  return lines.join('\n')
}

const WHATSAPP_STYLES: Record<string, string> = {
  warm: 'חם, אישי ומקצועי',
  short: 'קצר וישיר, בלי מילים מיותרות',
  gentle: 'עדין, רגוע ולא מכירתי',
}

const safe = (value: unknown, max: number) => String(value || '').trim().slice(0, max)

type DraftResult = {
  reply?: string
  error?: string
  status?: number
  detail?: unknown
}

/** A short, single-purpose model call that cannot leak into the assistant chat. */
async function draftWhatsAppMessage(
  endpoint: string,
  model: string,
  apiKey: string,
  body: any
): Promise<DraftResult> {
  const intent = safe(body?.intent, 1200)
  if (!intent) return { error: 'empty_intent' }
  const style = WHATSAPP_STYLES[safe(body?.style, 30)] || WHATSAPP_STYLES.warm

  const system = [
    'אתה כותב הודעת WhatsApp אחת בשם נציג/ת R.E.S ללקוח.',
    'החזר רק את נוסח ההודעה המוכן לשליחה. בלי כותרת, בלי הסבר, בלי מרכאות ובלי Markdown.',
    'הטקסט שמתקבל הוא הוראה מהסוכן לנסח הודעה — הוא אינו שיחה איתך ואסור לך לענות לסוכן.',
    'כתוב תמיד אל הלקוח בגוף שני, מנקודת המבט של הסוכן. לעולם אל תכתוב "עדכנתי", "עדכנתי אותך", "הבנתי", "כמובן" או "אבצע".',
    'דוגמה מחייבת: "תעדכן אותו שהפגישה נדחתה לשעה 16:00" הופך ל"היי {שם_לקוח}, הפגישה נדחתה לשעה 16:00." ולא לתשובת אישור.',
    'המטרה היא לנסח את דברי הסוכן באופן מדויק ופשוט — לא להרחיב אותם ולא לכתוב הודעה "יפה" משלך.',
    'כתוב רק את המשפטים הנחוצים, בעברית טבעית. עד 3 משפטים קצרים ועד 450 תווים.',
    'אין לך גישה לפרטי הלקוח. השתמש בדיוק במשתנים הבאים במקומות הטבעיים: {שם_לקוח}, {תאריך}, {שעה}, {מיקום}, {שם_סוכן}.',
    'אין חובה להשתמש בכל המשתנים — רק באלה שרלוונטיים למטרת ההודעה. אל תשנה את כתיב המשתנים.',
    'שמור בנאמנות על המשמעות, העובדות והטון של הטקסט שהסוכן כתב. אפשר רק לתקן עברית, סדר וזרימה.',
    'אל תעתיק את הטקסט של הסוכן כמעט מילה במילה. נסח אותו מחדש כך שישמע כמו הודעה אמיתית ומושקעת.',
    'בסגנון חם או עדין מותר להוסיף משפט אישי אחד קצר שמחזק או מכוון את הלקוח, כל עוד הוא כללי ונובע מהבקשה: למשל איחול בהצלחה, עידוד להגיע מוכנ/ה או הזמנה לנצל הזדמנות.',
    'ההרחבה חייבת להיות כללית בלבד — אסור להמציא עובדה, רגש של אדם אחר, מחמאה מוגזמת, ציפייה לשיחה, הבטחה, הטבה, מחיר, מיקום או שעה.',
    'אל תשנה ניסוח מהותי, שם, תפקיד או כינוי שהסוכן כתב. אם הטקסט לא ברור, נסח אותו בפשטות בלי לנחש למה התכוון.',
    'אל תכתוב שהודעה נשלחה אוטומטית ואל תלחץ על הלקוח.',
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = [
    `מה הסוכן רוצה לומר ללקוח:\n<agent_text>${intent}</agent_text>`,
    `סגנון: ${style}`,
    'נסח עכשיו הודעת WhatsApp אחת מוכנה לשליחה. היצמד לטקסט הסוכן: אל תוסיף תוכן, אל תייפה אותו ואל תנחש פרטים חסרים.',
  ]
    .filter(Boolean)
    .join('\n')

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      reasoning_effort: 'none',
      max_tokens: 1200,
    }),
  })

  const out = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('[ai-chat:whatsapp]', response.status, JSON.stringify(out).slice(0, 300))
    return { error: 'model_failed', status: response.status, detail: out?.error ?? null }
  }

  const reply = safe(out?.choices?.[0]?.message?.content, 1200)
    .replace(/^\s*["״“]|["״”]\s*$/g, '')
    .trim()
  if (!reply) return { error: 'empty_reply' }
  return { reply }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const body = await req.json().catch(() => ({}))
    const mode = safe(body.mode, 40)
    const messages = Array.isArray(body.messages) ? body.messages : []
    // Each agent talks to the assistant in their own thread; first-person
    // questions ("כמה קבעתי") are about THIS person's row in the numbers.
    const askerName = String(body.agentName || '').trim().slice(0, 60)

    const [{ data: aiRows }, { data: brainRow }] = await Promise.all([
      admin
        .from('app_auth')
        .select('key, value')
        .in('key', ['ai_key', 'ai_endpoint', 'ai_model']),
      admin.from('app_settings').select('value').eq('key', 'ai_brain').maybeSingle(),
    ])
    const aiConfig: Record<string, string> = {}
    for (const row of aiRows || []) aiConfig[row.key] = row.value

    const apiKey = aiConfig.ai_key
    const endpoint = aiConfig.ai_endpoint || DEFAULT_AI_ENDPOINT
    const model = aiConfig.ai_model || DEFAULT_AI_MODEL
    if (!apiKey) return json({ error: 'no_api_key' }, 500)

    const brain = String(brainRow?.value?.text || '').trim()

    // A meeting WhatsApp draft is deliberately isolated from the analytics
    // assistant: no funnel query, no chat history and no saved conversation.
    if (mode === 'whatsapp_draft') {
      const result = await draftWhatsAppMessage(endpoint, model, apiKey, body)
      if (result.error) return json(result, result.status ? 502 : 500)
      return json({ ok: true, reply: result.reply })
    }

    if (messages.length === 0) return json({ error: 'no_messages' }, 400)

    // This month and last, so "האם השתפרנו" has something to compare against.
    const cur = monthRange(0)
    const prev = monthRange(-1)
    const [{ data: fCur }, { data: fPrev }, { data: rosterRow }] = await Promise.all([
      admin.rpc('company_funnel', { from_date: cur.from, to_date: cur.to }),
      admin.rpc('company_funnel', { from_date: prev.from, to_date: prev.to }),
      admin.from('app_settings').select('value').eq('key', 'roster').maybeSingle(),
    ])

    const team = (rosterRow?.value?.agents || [])
      .map((a: any) => `${a.name} (${(a.roles || ['agent']).join('/')})`)
      .join(', ')

    const context = [
      brain,
      '',
      '## נתוני החברה — מעודכנים לרגע זה',
      `צוות: ${team}`,
      askerName
        ? `מי שמדבר איתך עכשיו: ${askerName}. שאלות בגוף ראשון — "קבעתי", "שלי", "הפגישות שלי" — מתייחסות לנתונים של ${askerName} בפירוט לפי סוכן.`
        : '',
      '',
      describe('החודש הנוכחי', fCur),
      '',
      describe('החודש הקודם', fPrev),
      '',
      '## איך לקרוא את הנתונים',
      '- "שיחות" מגיעות מסיכומי היום שהסוכנים ממלאים ידנית, ולכן הן חסרות בימים שלא דווחו. ' +
        'אל תסיק מהן שסוכן לא עבד.',
      '- "טרם סומנו" הן פגישות שעוד לא עבר זמנן, או שאיש לא סימן בהן נוכחות. ' +
        'הן אינן אי-הגעה.',
      // The model was dividing attendance by every booked meeting, including the
      // ones still in the future, and reporting a far worse number than the true
      // one. The rates are already computed above; it must quote, not re-derive.
      '- **אל תחשב אחוזים בעצמך.** כל האחוזים שאתה צריך כבר מופיעים למעלה — צטט אותם כמו שהם. ' +
        'במיוחד: אחוז הגעה מחושב רק מפגישות שכבר עבר זמנן, לא מכל הפגישות שנקבעו, ' +
        'וחישוב מחדש שלו ייתן מספר שגוי.',
      '',
      '## איך לדבר',
      '- אתה שותף חד, אנושי ואכפתי לצוות — לא מחולל דוחות ולא נציג שירות. כתוב בעברית ישראלית טבעית ומקצועית.',
      '- ענה קודם על מה שנשאל. אל תפתח ב"בהחלט", "בשמחה", "לפי הנתונים" או בחזרה על השאלה.',
      '- אין תבנית קבועה: שאלת מספר פשוטה יכולה לקבל משפט אחד; ניתוח יכול לקבל פסקה קצרה; ' +
        'ורשימת נקודות מתאימה רק כשבאמת יש כמה דברים נפרדים.',
      '- ברירת המחדל היא תשובה של משפט אחד עד ארבעה. הארך רק אם המשתמש ביקש ניתוח, השוואה או פירוט.',
      '- גם תשובה קצרה חייבת להיות משפט טבעי ושלם, לא מספר בודד או שבר משפט. למשל: ' +
        '"קבעת 12 פגישות החודש" ולא "12 פגישות".',
      '- שנה באופן טבעי את הפתיחה, קצב המשפטים ומבנה התשובה. בדוק את תשובותיך הקודמות בשיחה ואל תמחזר פתיח, סיום או שלד.',
      '- התאם את הטון לכוונה: בעיה דורשת אבחון ישיר; הצלחה ראויה לפרגון קצר וספציפי; ' +
        'בקשת רעיונות מזמינה חשיבה יצירתית; ושאלה אישית מקבלת תשובה בגובה העיניים.',
      '- בשאלה רגשית, הכר ברגש במשפט קצר וספציפי ואז חזור לעניין. אל תכתוב קלישאות כמו ' +
        '"אני מבין לגמרי", "זה טבעי להרגיש" או נאום מוטיבציה.',
      '- אם המשתמש אומר שהוא מבואס, לחוץ או מתוסכל: המשפט הראשון חייב להתייחס באופן אנושי לסיבה המספרית שבנתונים; ' +
        'אחריו תן תובנה אחת וצעד אחד בלבד, אלא אם ביקשו תוכנית מפורטת.',
      '- הימנע משפת דוח כמו "הנתונים מצביעים על", "המלצה ראשונה/שנייה" או "לסיכום". ' +
        'כתוב כפי שמנהל טוב היה מדבר בשיחה קצרה עם איש צוות.',
      '- הפרד בין עובדה להשערה. אם הנתונים לא מוכיחים למה משהו קרה, אמור שזו אפשרות לבדיקה — לעולם אל תציג סיבה משוערת כעובדה.',
      '- בבקשת רעיונות, תן בדרך כלל את שלושת הרעיונות החזקים ביותר, כל אחד במשפט או שניים. הרחב רק אם ביקשו עוד או פירוט.',
      '- מותר לומר "זה נראה טוב", "פה יש נורה אדומה" או "הייתי מתחיל מכאן" כשזה באמת תואם לנתונים. ' +
        'אל תהיה דרמטי ואל תשתמש בקלישאות מוטיבציה.',
      '- השתמש בשם של מי שמדבר רק כשזה מרגיש טבעי ומוסיף חום — לא בכל תשובה.',
      '- המלצה תכלול צעד מעשי רק כשהמשתמש ביקש עצה או כשהנתונים מצביעים בבירור על פעולה מועילה.',
      '- טקסט רגיל בלבד. בלי טבלאות ובלי סימני markdown כמו ** או | או #; מקפים מותרים רק לרשימה אמיתית.',
    ].join('\n')

    const res = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: context },
          // Only the last few turns: the snapshot above is large, and an old
          // month's figures scrolling back into view is worse than forgetting.
          ...messages.slice(-8).map((m: any) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content || '').slice(0, 4000),
          })),
        ],
        // Groq recommends the model's non-thinking dialogue mode around these
        // values. More variation here prevents every answer sounding templated,
        // while the factual guardrails above still anchor every number.
        temperature: 0.7,
        top_p: 0.8,
        // The in-app assistant needs a fast final answer, not a long hidden
        // reasoning pass. Qwen supports disabling reasoning for this use case.
        reasoning_effort: 'none',
        max_tokens: 1200,
      }),
    })

    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[ai-chat]', res.status, JSON.stringify(out).slice(0, 300))
      return json({ error: 'model_failed', status: res.status, detail: out?.error ?? null }, 502)
    }

    const choice = out?.choices?.[0]
    const reply = String(choice?.message?.content || '').trim()
    if (!reply) {
      // Ran out of room mid-thought. Say so plainly rather than returning the
      // model's private reasoning as if it were an answer.
      console.error('[ai-chat] empty content, finish:', choice?.finish_reason)
      return json({ error: 'empty_reply', finish: choice?.finish_reason ?? null }, 502)
    }

    return json({ ok: true, reply })
  } catch (e) {
    console.error('[ai-chat]', String(e))
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
