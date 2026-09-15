import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Copy, MessageCircle, Mail, X } from 'lucide-react'
import { openWhatsApp } from '../../lib/whatsappLink'
import { logEvent, signLink } from '../../services/formsService'

/**
 * "The form is on its way" — the link, and the ways to hand it over.
 *
 * WhatsApp opens the AGENT's own chat with the client, message pre-filled; the
 * agent presses send. Nothing goes out from a shared number, and nothing is sent
 * without the agent seeing it. Mail arrives with the mail connection in ניהול.
 */
export function waMessage(request) {
  const first = String(request.contact_name || '').split(/\s+/)[0]
  return [
    `שלום ${first},`,
    `מצורף לחתימה: ${request.template_name} — מכללת R.E.S.`,
    `למילוי וחתימה דיגיטלית:`,
    signLink(request.token),
  ].join('\n')
}

export default function SentDialog({ request, agent, resend = false, onClose }) {
  const [copied, setCopied] = useState(false)
  const link = signLink(request.token)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* the link is selectable in the box */
    }
  }

  const whatsapp = () => {
    if (openWhatsApp(request.contact_phone, waMessage(request)) && resend) {
      logEvent(request.id, 'resent', agent, { channel: 'whatsapp' }).catch(() => {})
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-scale-in" dir="rtl">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-slate-900">{resend ? 'שליחה חוזרת' : 'הטופס מוכן לחתימה'}</p>
            <p className="text-sm text-slate-600">
              {request.template_name} · {request.contact_name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <input readOnly value={link} dir="ltr" className="min-w-0 flex-1 bg-transparent px-1 text-xs font-semibold text-slate-600 outline-none" onFocus={(e) => e.target.select()} />
          <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'הועתק' : 'העתקה'}
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            onClick={whatsapp}
            disabled={!request.contact_phone}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 active:scale-[0.99] disabled:opacity-50"
          >
            <MessageCircle className="h-5 w-5" />
            {request.contact_phone ? `שליחה בווצאפ ל-${request.contact_phone}` : 'אין טלפון לאיש הקשר'}
          </button>
          <button disabled className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-400">
            <Mail className="h-4 w-4" />
            שליחה במייל — אחרי חיבור המייל בניהול
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
