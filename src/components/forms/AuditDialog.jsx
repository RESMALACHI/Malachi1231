import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ShieldCheck, Loader2, FileDown, Send, Eye, PenLine, Ban, FilePlus2, RotateCw, Mail } from 'lucide-react'
import { fileUrl, listEvents } from '../../services/formsService'

const KIND = {
  created: { label: 'נוצר', icon: FilePlus2, tone: 'text-slate-500' },
  sent: { label: 'נשלח', icon: Send, tone: 'text-sky-600' },
  resent: { label: 'נשלח שוב', icon: RotateCw, tone: 'text-sky-600' },
  opened: { label: 'נפתח ע״י הלקוח', icon: Eye, tone: 'text-indigo-600' },
  signed: { label: 'נחתם', icon: PenLine, tone: 'text-green-600' },
  cancelled: { label: 'בוטל', icon: Ban, tone: 'text-rose-600' },
  emailed: { label: 'נשלח במייל', icon: Mail, tone: 'text-sky-600' },
}

const CHANNEL = { link: 'קישור', whatsapp: 'ווצאפ', in_person: 'חתימה במקום' }

/** "קישור לחתימה נשלח במייל" / "עותק חתום נשלח במייל" — and to whom. */
const labelOf = (e) =>
  e.kind !== 'emailed'
    ? null
    : e.meta?.what === 'copy'
      ? 'עותק חתום נשלח במייל'
      : e.meta?.reminder
        ? 'תזכורת לחתימה נשלחה במייל'
        : 'קישור לחתימה נשלח במייל'

/** A browser's user-agent, in words a manager can read. */
export function deviceOf(ua) {
  const s = String(ua || '')
  if (!s) return '—'
  const os = /iPhone|iPad/.test(s) ? 'iPhone/iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'Mac' : 'מכשיר אחר'
  const br = /Edg\//.test(s) ? 'Edge' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /Firefox\//.test(s) ? 'Firefox' : ''
  return br ? `${os} · ${br}` : os
}

const when = (iso) =>
  new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * The evidence behind one form: every step with its time, IP and device, and —
 * once signed — the SHA-256 of the frozen PDF. This is what would be shown if a
 * client ever said "I never signed that".
 */
export default function AuditDialog({ request, onClose }) {
  const [events, setEvents] = useState(null)

  useEffect(() => {
    listEvents(request.id).then(setEvents).catch(() => setEvents([]))
  }, [request.id])

  const openPdf = async () => {
    const w = window.open('about:blank', '_blank')
    try {
      w.location.href = await fileUrl(request.signed_pdf_path)
    } catch {
      w?.close()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl animate-scale-in" dir="rtl">
        <div className="flex items-start gap-3 border-b border-slate-100 p-5">
          <ShieldCheck className="h-7 w-7 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-slate-900">{request.status === 'signed' ? 'פרטי החתימה' : 'מעקב אחרי הטופס'}</p>
            <p className="truncate text-sm text-slate-600">
              {request.template_name} · {request.contact_name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {events == null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <ol className="relative flex flex-col gap-4 border-s-2 border-slate-100 ps-5">
              {events.map((e) => {
                const k = KIND[e.kind] || { label: e.kind, icon: FilePlus2, tone: 'text-slate-500' }
                const Icon = k.icon
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -start-[29px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-2 ring-slate-100">
                      <Icon className={`h-3.5 w-3.5 ${k.tone}`} />
                    </span>
                    <p className="text-sm font-bold text-slate-900">
                      {labelOf(e) || k.label}
                      {e.meta?.channel && <span className="font-semibold text-slate-500"> · {CHANNEL[e.meta.channel] || e.meta.channel}</span>}
                      {e.actor && e.actor !== 'client' && <span className="font-semibold text-slate-500"> · {e.actor}</span>}
                    </p>
                    <p className="text-xs font-semibold tabular-nums text-slate-500">{when(e.at)}</p>
                    {e.kind === 'emailed' && e.meta?.to?.length > 0 && (
                      <p className="text-[11px] text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>
                        {e.meta.to.join(', ')}
                        {e.meta.office ? ' + העתק למשרד' : ''}
                      </p>
                    )}
                    {(e.ip || e.user_agent) && (
                      <p className="text-[11px] text-slate-400" dir="ltr" style={{ textAlign: 'right' }}>
                        {[e.ip, deviceOf(e.user_agent)].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          {request.signed_pdf_sha256 && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] font-bold text-slate-500">טביעת אצבע של הקובץ החתום (SHA-256)</p>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-700" dir="ltr">
                {request.signed_pdf_sha256}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                כל שינוי בקובץ אחרי החתימה משנה את הטביעה — כך אפשר להוכיח שהמסמך לא שונה.
              </p>
            </div>
          )}
        </div>

        {request.signed_pdf_path && (
          <div className="border-t border-slate-100 p-4">
            <button onClick={openPdf} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-black">
              <FileDown className="h-4 w-4" />
              פתיחת הקובץ החתום
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
