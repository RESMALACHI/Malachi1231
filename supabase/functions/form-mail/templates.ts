// The emails טפסים sends — Hebrew, right-to-left, and plain enough to survive
// Gmail, Outlook and a phone's mail app alike: tables, inline styles, one
// button, and a text version beside the HTML.

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const firstName = (name: unknown) => String(name || '').trim().split(/\s+/)[0] || ''

const SKY = '#0369a1'

function frame(inner: string, footer: string) {
  return `<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body dir="rtl" style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:${SKY};padding:18px 24px;text-align:right;color:#ffffff;font-size:20px;font-weight:bold;">מכללת R.E.S</td></tr>
<tr><td style="padding:28px 24px 8px;text-align:right;color:#0f172a;font-size:16px;line-height:1.7;">${inner}</td></tr>
<tr><td style="padding:16px 24px 24px;text-align:right;color:#94a3b8;font-size:12px;line-height:1.6;border-top:1px solid #f1f5f9;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
<td style="background:${SKY};border-radius:12px;">
<a href="${esc(href)}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:17px;font-weight:bold;text-decoration:none;">${esc(label)}</a>
</td></tr></table>`
}

/** The link to fill and sign — what "שלח טופס" sends. */
export function linkEmail(o: { name: string; templateName: string; link: string; initiator?: string | null }) {
  const hi = firstName(o.name) ? `שלום ${esc(firstName(o.name))},` : 'שלום,'
  const by = o.initiator ? `נשלח על ידי ${esc(o.initiator)}, מכללת R.E.S.` : 'נשלח ממכללת R.E.S.'
  return {
    subject: `טופס לחתימה: ${o.templateName} — מכללת R.E.S`,
    html: frame(
      `<p style="margin:0 0 12px;">${hi}</p>
<p style="margin:0 0 12px;">נשלח אליך לחתימה: <b>${esc(o.templateName)}</b>.</p>
<p style="margin:0;color:#475569;">המילוי והחתימה נעשים אונליין, מהטלפון או מהמחשב, ולוקחים דקה או שתיים. אין צורך להדפיס או לסרוק. בסיום יישלח אליך עותק חתום במייל.</p>
${button(o.link, 'למילוי וחתימה')}
<p style="margin:0 0 4px;color:#64748b;font-size:13px;">אם הכפתור לא נפתח, אפשר להעתיק את הקישור לדפדפן:</p>
<p dir="ltr" style="margin:0 0 8px;font-size:12px;color:${SKY};word-break:break-all;text-align:left;">${esc(o.link)}</p>`,
      `${by} אם ההודעה הגיעה אליך בטעות — אפשר להתעלם ממנה.`
    ),
    text: [hi, '', `נשלח אליך לחתימה: ${o.templateName}.`, 'למילוי וחתימה דיגיטלית:', o.link, '', by].join('\n'),
  }
}

/** The signed copy, with the PDF attached — sent once the client signs. */
export function copyEmail(o: { name: string; templateName: string; signedAt: string | null }) {
  const hi = firstName(o.name) ? `שלום ${esc(firstName(o.name))},` : 'שלום,'
  // Date and time as two words of their own — "(15.09.2026, 15:34)" in
  // parentheses comes out scrambled in a right-to-left line.
  const part = (opts: Intl.DateTimeFormatOptions) =>
    o.signedAt ? new Date(o.signedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', ...opts }) : ''
  const date = part({ day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = part({ hour: '2-digit', minute: '2-digit' })
  const when = date ? `נחתם בתאריך ${date} בשעה ${time}.` : ''
  return {
    subject: `העתק חתום: ${o.templateName} — מכללת R.E.S`,
    html: frame(
      `<p style="margin:0 0 12px;">${hi}</p>
<p style="margin:0 0 12px;">תודה! החתימה שלך על <b>${esc(o.templateName)}</b> התקבלה.</p>
${when ? `<p style="margin:0 0 12px;color:#475569;">${esc(when)}</p>` : ''}
<p style="margin:0 0 8px;color:#475569;">מצורף למייל הזה העותק החתום, כקובץ PDF — כדאי לשמור אותו אצלך.</p>`,
      'מכללת R.E.S · המסמך נחתם דיגיטלית, ובעמוד האחרון שלו מופיעים פרטי החתימה.'
    ),
    text: [hi, '', `תודה! החתימה שלך על ${o.templateName} התקבלה.`, when, 'העותק החתום מצורף כקובץ PDF.', '', 'מכללת R.E.S'].join('\n'),
  }
}

/** "Does it work?" — from the ניהול page. */
export function testEmail() {
  return {
    subject: 'בדיקת חיבור — מייל הטפסים של מכללת R.E.S',
    html: frame(
      `<p style="margin:0 0 12px;"><b>המייל מחובר ✓</b></p>
<p style="margin:0 0 8px;color:#475569;">אם ההודעה הזו הגיעה — החיבור ל-Resend עובד. טפסים לחתימה ועותקים חתומים יישלחו ללקוחות מהכתובת הזו.</p>`,
      'נשלח מעמוד ניהול → מייל.'
    ),
    text: 'המייל מחובר. אם ההודעה הזו הגיעה — החיבור ל-Resend עובד.',
  }
}
