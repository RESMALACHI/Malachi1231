import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Copy, MessageCircle, Mail, X, Loader2, Check, RotateCw } from 'lucide-react'
import { openWhatsApp } from '../../lib/whatsappLink'
import { logEvent, signLink } from '../../services/formsService'
import { emailSignLink } from '../../services/mailService'
import { useMailReady } from './ui'

/**
 * "The form is on its way" — how the client gets the link.
 *
 * Mail goes by itself the moment the form is sent (Resend, from the office's
 * address), when mail is connected and the contact has an address — as iForms
 * did. WhatsApp opens the AGENT's own chat with the client, message pre-filled;
 * the agent presses send. And the link itself, to paste anywhere.
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

// A request mailed once from this tab is not mailed again by a remount.
const autoMailed = new Set()

export default function SentDialog({ request, agent, resend = false, onClose }) {
  const [copied, setCopied] = useState(false)
  const [mail, setMail] = useState({ state: 'idle' }) // idle | sending | sent | error
  const mailReady = useMailReady()
  const link = signLink(request.token)
  const address = [request.contact_email, request.extra_email].filter(Boolean).join(', ')

  const sendMail = useCallback(
    async (again) => {
      setMail({ state: 'sending' })
      try {
        const r = await emailSignLink(request.id, { agent, resend: again })
        setMail({ state: 'sent', to: (r?.to || []).join(', ') || address })
      } catch (e) {
        setMail({ state: 'error', text: e.message })
      }
    },
    [request.id, agent, address]
  )

  useEffect(() => {
    if (resend || !mailReady || !address || autoMailed.has(request.id)) return
    autoMailed.add(request.id)
    sendMail(false)
  }, [resend, mailReady, address, request.id, sendMail])

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

  const mailLine = () => {
    if (mailReady === null) return <span className="text-slate-400">בודק…</span>
    if (!mailReady) return <span className="text-slate-500">המייל עוד לא חובר — מנהל מחבר אותו בניהול → מייל</span>
    if (!address) return <span className="text-slate-500">אין מייל לאיש הקשר — שלחו בווצאפ</span>
    if (mail.state === 'sending')
      return (
        <span className="inline-flex items-center gap-1.5 text-sky-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> שולח…
        </span>
      )
    if (mail.state === 'sent')
      return (
        <span className="inline-flex items-center gap-1 font-bold text-green-700">
          <Check className="h-4 w-4" /> נשלח ל-<span dir="ltr">{mail.to}</span>
        </span>
      )
    if (mail.state === 'error')
      return (
        <span className="flex flex-col items-start gap-1">
          <span className="font-bold text-rose-600">{mail.text}</span>
          <button onClick={() => sendMail(true)} className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:underline">
            <RotateCw className="h-3.5 w-3.5" /> לנסות שוב
          </button>
        </span>
      )
    return (
      <button
        onClick={() => sendMail(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-800"
      >
        <Mail className="h-3.5 w-3.5" /> שליחה ל-<span dir="ltr">{address}</span>
      </button>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl animate-scale-in" dir="rtl">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-slate-900">{resend ? 'שליחה חוזרת ללקוח' : 'הטופס מוכן לחתימה'}</p>
            <p className="text-sm text-slate-600">
              {request.template_name} · {request.contact_name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-5 text-xs font-extrabold text-slate-500">איך הלקוח יקבל את הטופס</p>
        <div className="mt-2 flex flex-col divide-y divide-slate-100 rounded-2xl border border-slate-200">
          <div className="flex items-start gap-3 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Mail className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold text-slate-900">מייל</p>
              <div className="mt-0.5 text-xs font-semibold">{mailLine()}</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold text-slate-900">ווצאפ</p>
              {request.contact_phone ? (
                <>
                  <button
                    onClick={whatsapp}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> שליחה ל-{request.contact_phone}
                  </button>
                  <p className="mt-1 text-[11px] text-slate-500">נפתח הווצאפ שלכם עם הודעה מוכנה — נשאר ללחוץ "שלח".</p>
                </>
              ) : (
                <p className="mt-0.5 text-xs font-semibold text-slate-500">אין טלפון לאיש הקשר</p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs font-extrabold text-slate-500">או להעתיק את הקישור ולשלוח בכל דרך</p>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <input readOnly value={link} dir="ltr" className="min-w-0 flex-1 bg-transparent px-1 text-xs font-semibold text-slate-600 outline-none" onFocus={(e) => e.target.select()} />
          <button onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'הועתק' : 'העתקה'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
          <p className="font-extrabold">מה קורה עכשיו?</p>
          <p className="mt-0.5">
            הלקוח פותח את הקישור, ממלא וחותם מהטלפון. בהיסטוריה הסטטוס מתעדכן לבד: <b>נפתח</b> ← <b>נחתם</b>. הקובץ החתום נשמר כאן
            {mailReady ? ', ועותק שלו נשלח ללקוח במייל.' : '.'}
          </p>
        </div>

        <button onClick={onClose} className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-black">
          סיום
        </button>
      </div>
    </div>,
    document.body
  )
}
