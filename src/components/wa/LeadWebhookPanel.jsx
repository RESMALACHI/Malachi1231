// Where an advertising lead comes IN from.
//
// The flow beside this panel describes what happens after someone leaves their
// details. This is the part that decides whether they ever reach us at all: one
// URL that Facebook Lead Ads, a landing page or a form service posts to.
//
// NOT LIVE YET. The endpoint below is the address the function WILL have; no
// edge function answers it today and the token has not been issued. It is shown
// now because the shape of the request is the thing worth agreeing on first —
// which field is the name, which is the phone — and because whoever wires the
// ad account needs to know what they will be pasting. Everything on screen says
// so; a URL presented as working when nothing answers it would send real leads
// into a void and nobody would notice for a week.

import { useState } from 'react'
import { AlertTriangle, Check, Copy, Webhook } from 'lucide-react'

/** The project the edge functions live in. Hard-coded in a few places already. */
const ENDPOINT =
  'https://uhmzdhtjabhbcyslovfk.supabase.co/functions/v1/lead-webhook?t=<TOKEN>'

const SAMPLE = `{
  "name":   "דני כהן",
  "phone":  "0501234567",
  "source": "facebook",
  "campaign": "נדל\\"ן — ספטמבר",
  "note":   "מעוניין בקורס תיווך"
}`

/** What has to exist before this can be switched on. Stated, not implied. */
const TODO = [
  'פונקציית lead-webhook שמקבלת את הפנייה ורושמת אותה בטבלת הלידים',
  'טוקן סודי ב־app_auth (כמו wa_webhook_token) — בלי זה כל אחד יכול להזריק לידים',
  'תזמון שמריץ את שלבי התהליך ועוצר אותו ברגע שנוצר קשר',
]

function Row({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-slate-500">{label}</p>
      {children}
    </div>
  )
}

export default function LeadWebhookPanel() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ENDPOINT)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* a browser that refuses the clipboard still shows the URL to select */
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
          <Webhook className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900">מאיפה הלידים נכנסים</h2>
            <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              עדיין לא פעיל
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            כתובת אחת שאליה המודעה שולחת כל פנייה — פייסבוק, דף נחיתה או טופס.
            ברגע שפנייה נכנסת, התהליך שלמטה מתחיל לרוץ עליה.
          </p>
        </div>
      </div>

      <Row label="כתובת ה־Webhook">
        <div className="flex gap-2">
          <code
            dir="ltr"
            className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2.5 text-[11px] text-slate-100"
          >
            {ENDPOINT}
          </code>
          <button
            type="button"
            onClick={copy}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 active:scale-95"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? 'הועתק' : 'העתק'}
          </button>
        </div>
      </Row>

      <Row label="מה המודעה שולחת (POST, JSON)">
        <pre
          dir="ltr"
          className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700"
        >
          {SAMPLE}
        </pre>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          חובה: <b>phone</b>. כל השאר רשות — <b>source</b> ו־<b>campaign</b> הם מה
          שממלא את <b>{'{מקור}'}</b> בהודעות, ולכן שווה לשלוח אותם.
        </p>
      </Row>

      <div className="flex gap-2 rounded-xl bg-amber-50 p-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <div className="min-w-0 text-[11px] leading-relaxed text-amber-900">
          <p className="font-bold">מה חסר כדי להפעיל את זה:</p>
          <ul className="mt-1 list-disc space-y-0.5 pe-4">
            {TODO.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
