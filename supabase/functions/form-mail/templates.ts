// The emails טפסים sends — Hebrew, right-to-left, and plain enough to survive
// Gmail, Outlook and a phone's mail app alike: tables, inline styles, one
// button, and a text version beside the HTML.
//
// The words and the colour are the office's: set in טפסים → עיצוב הודעות and
// stored in app_settings key 'form_messages'. Anything not set falls back to
// DEFAULTS below. Placeholders in braces are filled per email:
//   {שם} first name · {שם מלא} · {טופס} form · {נציג} who sent it · {תאריך}
// The office's text is escaped like everything else — words, not HTML — and
// the button to the form is always there, whatever the text says.
//
// Pure — no Deno, no imports — so the designer in the app imports this same
// file to draw its preview instantly: what it shows is what is sent.

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const firstName = (name: unknown) => String(name || '').trim().split(/\s+/)[0] || ''

export const DEFAULTS = {
  brand: 'מכללת R.E.S',
  color: '#0369a1',
  greeting: 'שלום {שם},',
  footer: 'נשלח על ידי {נציג}, מכללת R.E.S. אם ההודעה הגיעה אליך בטעות — אפשר להתעלם ממנה.',
  link: {
    subject: 'טופס לחתימה: {טופס} — מכללת R.E.S',
    body: 'נשלח אליך לחתימה: {טופס}.\nהמילוי והחתימה נעשים אונליין, מהטלפון או מהמחשב, ולוקחים דקה או שתיים. אין צורך להדפיס או לסרוק. בסיום יישלח אליך עותק חתום במייל.',
    button: 'למילוי וחתימה',
  },
  reminder: {
    subject: 'תזכורת: {טופס} ממתין לחתימתך — מכללת R.E.S',
    body: 'רק מזכירים — {טופס} עדיין ממתין לחתימתך.\nהמילוי והחתימה לוקחים דקה או שתיים, מהטלפון או מהמחשב.',
    button: 'למילוי וחתימה',
  },
  copy: {
    subject: 'העתק חתום: {טופס} — מכללת R.E.S',
    body: 'תודה! החתימה שלך על {טופס} התקבלה.\nנחתם בתאריך {תאריך}.\nמצורף למייל הזה העותק החתום, כקובץ PDF — כדאי לשמור אותו אצלך.',
  },
}

type Kind = 'link' | 'reminder' | 'copy'
export type Vars = { name?: string | null; templateName?: string | null; initiator?: string | null; date?: string }

const str = (v: unknown, fallback: string, max: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return (s || fallback).slice(0, max)
}

const isHex = (v: unknown) => /^#[0-9a-f]{6}$/i.test(String(v || ''))

/**
 * The office's settings over the defaults — every field checked, nothing
 * trusted. Each email may have a colour of its own; '' means "the colour of
 * all the emails".
 */
export function mergeMessages(raw: any) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const part = (k: Kind) => {
    const d: any = DEFAULTS[k]
    const v = r[k] && typeof r[k] === 'object' ? r[k] : {}
    return {
      subject: str(v.subject, d.subject, 200),
      body: str(v.body, d.body, 3000),
      button: d.button ? str(v.button, d.button, 60) : '',
      color: isHex(v.color) ? String(v.color) : '',
    }
  }
  return {
    brand: str(r.brand, DEFAULTS.brand, 60),
    color: isHex(r.color) ? String(r.color) : DEFAULTS.color,
    greeting: str(r.greeting, DEFAULTS.greeting, 200),
    footer: typeof r.footer === 'string' ? r.footer.trim().slice(0, 500) : DEFAULTS.footer,
    link: part('link'),
    reminder: part('reminder'),
    copy: part('copy'),
  }
}

/** Fill the braces. In HTML the text is escaped first, the values escaped as they go in. */
function fill(text: string, v: Vars, html: boolean) {
  const values: Record<string, string> = {
    'שם': firstName(v.name),
    'שם מלא': String(v.name || '').trim(),
    'טופס': String(v.templateName || '').trim(),
    'נציג': String(v.initiator || '').trim() || 'מכללת R.E.S',
    'תאריך': v.date || '',
  }
  const src = html ? esc(text) : text
  return src.replace(/\{([^{}]{1,20})\}/g, (all, key) => {
    if (!(key in values)) return all
    const val = values[key]
    if (!html) return val
    return key === 'טופס' ? `<b>${esc(val)}</b>` : esc(val)
  })
}

function frame(inner: string, footer: string, brand: string, color: string) {
  return `<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body dir="rtl" style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:${color};padding:18px 24px;text-align:right;color:#ffffff;font-size:20px;font-weight:bold;">${esc(brand)}</td></tr>
<tr><td style="padding:28px 24px 8px;text-align:right;color:#0f172a;font-size:16px;line-height:1.7;">${inner}</td></tr>
${footer ? `<tr><td style="padding:16px 24px 24px;text-align:right;color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #f1f5f9;">${footer}</td></tr>` : ''}
</table>
</td></tr>
</table>
</body>
</html>`
}

function button(href: string, label: string, color: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
<td style="background:${color};border-radius:12px;">
<a href="${esc(href)}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;">${esc(label)}</a>
</td></tr></table>`
}

/**
 * One email, in the office's words. `link` is the form's address (link and
 * reminder); a copy has none — its PDF is attached.
 */
export function renderEmail(kind: Kind, v: Vars, raw: any, link = '') {
  const m = mergeMessages(raw)
  const t = m[kind]
  const color = t.color || m.color
  const lines = t.body.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const greeting = m.greeting ? `<p style="margin:0 0 12px;">${fill(m.greeting, v, true)}</p>` : ''
  const paragraphs = lines
    .map((l, i) => `<p style="margin:0 0 12px;${i ? 'color:#475569;' : ''}">${fill(l, v, true)}</p>`)
    .join('\n')
  const cta = link
    ? `${button(link, t.button || DEFAULTS.link.button, color)}
<p style="margin:0 0 4px;color:#64748b;font-size:13px;">אם הכפתור לא נפתח, אפשר להעתיק את הקישור לדפדפן:</p>
<p dir="ltr" style="margin:0 0 8px;font-size:12px;color:${color};word-break:break-all;text-align:left;">${esc(link)}</p>`
    : ''
  return {
    subject: fill(t.subject, v, false),
    html: frame(greeting + paragraphs + cta, fill(m.footer, v, true), m.brand, color),
    text: [fill(m.greeting, v, false), '', ...lines.map((l) => fill(l, v, false)), ...(link ? ['', link] : []), '', fill(m.footer, v, false)]
      .join('\n')
      .trim(),
  }
}

/** Israel's date and time of a signature, as two words — "(15.09.2026, 15:34)" scrambles in RTL. */
export function signedLabel(iso: string | null) {
  if (!iso) return ''
  const part = (opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', ...opts })
  return `${part({ day: '2-digit', month: '2-digit', year: 'numeric' })} בשעה ${part({ hour: '2-digit', minute: '2-digit' })}`
}

/** "Does it work?" — from the ניהול page. */
export function testEmail(raw: any) {
  const m = mergeMessages(raw)
  return {
    subject: 'בדיקת חיבור — מייל הטפסים של מכללת R.E.S',
    html: frame(
      `<p style="margin:0 0 12px;"><b>המייל מחובר ✓</b></p>
<p style="margin:0 0 8px;color:#475569;">אם ההודעה הזו הגיעה — החיבור ל-Resend עובד. טפסים לחתימה ועותקים חתומים יישלחו ללקוחות מהכתובת הזו.</p>`,
      'נשלח מעמוד ניהול → מייל.',
      m.brand,
      m.color
    ),
    text: 'המייל מחובר. אם ההודעה הזו הגיעה — החיבור ל-Resend עובד.',
  }
}
