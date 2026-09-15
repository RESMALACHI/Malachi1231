import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Send, TabletSmartphone, Loader2 } from 'lucide-react'
import { blockingFields, isEmpty, prefillValues } from '../../lib/formFields'
import { renderFieldImage } from '../../lib/fieldImage'
import { createRequest, logEvent, signLink, updateRequest } from '../../services/formsService'
import PageStack from './PageStack'
import FieldBox from './FieldBox'
import FieldSheet from './FieldSheet'

/**
 * The agent's pass over a form before it goes out — iForms' fill screen.
 *
 * Orange boxes are the agent's (price, courses, payments) and must be filled
 * before sending. Blue boxes are the client's; the agent may pre-fill what they
 * already know, and the client can still change it. The client's signature and
 * attachments stay theirs.
 *
 * Three ways out, as in iForms:
 *   שמור ללא שליחה        a draft, to finish later
 *   חתימה במכשיר הזה      the client signs here and now, on this device
 *   שלח טופס               a link for the client (WhatsApp now; mail later)
 *
 * On send, the agent's boxes are rendered to images and stored with the
 * request — the signed PDF is stamped with those, so the price the client signs
 * is the price the agent set.
 */
export default function FormFiller({ template, contact, extraEmail, draft, agent, onClose, onFinished }) {
  const fields = template.fields || []
  const [values, setValues] = useState(
    () => draft?.values || prefillValues(fields, { contact, agent })
  )
  const [activeId, setActiveId] = useState(null)
  const [busy, setBusy] = useState(null)
  const [errorIds, setErrorIds] = useState([])
  const [msg, setMsg] = useState('')

  const active = fields.find((f) => f.id === activeId) || null
  const mine = (f) => f.filler === 'sender' || !['signature', 'attachment'].includes(f.type)
  const senderMissing = useMemo(() => blockingFields(fields, values, 'sender'), [fields, values])

  const act = async (mode) => {
    if (busy) return
    if (mode !== 'draft' && senderMissing.length) {
      setErrorIds(senderMissing.map((f) => f.id))
      setMsg(
        senderMissing.length === 1
          ? `יש למלא את "${senderMissing[0].label}" לפני השליחה`
          : `יש למלא ${senderMissing.length} שדות כתומים לפני השליחה`
      )
      return
    }
    // Opened now, inside the click — a window opened after the save would be
    // stopped by the popup blocker.
    const tab = mode === 'inperson' ? window.open('about:blank', '_blank') : null
    setBusy(mode)
    setMsg('')
    try {
      const senderImages = {}
      for (const f of fields) {
        if (f.filler !== 'sender' || isEmpty(values[f.id])) continue
        const page = template.pages[f.page]
        const img =
          f.type === 'signature'
            ? await renderFieldImage(f, null, page.w, page.h, values[f.id])
            : await renderFieldImage(f, values[f.id], page.w, page.h)
        if (img) senderImages[f.id] = img
      }
      const status = mode === 'draft' ? 'draft' : 'sent'
      const req = draft
        ? await updateRequest(draft.id, { values, sender_images: senderImages, status, extra_email: extraEmail || null })
        : await createRequest({ template, contact, extraEmail, initiator: agent, values, senderImages, status })
      if (mode !== 'draft') {
        await logEvent(req.id, 'sent', agent, { channel: mode === 'inperson' ? 'in_person' : 'link' })
      }
      if (tab) tab.location.href = signLink(req.token)
      onFinished(req, mode)
    } catch (e) {
      tab?.close()
      setMsg(e.message || 'השמירה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-100" dir="rtl">
      {/* ── The iForms bar ── */}
      <div className="flex flex-wrap items-center gap-2 bg-sky-800 px-3 py-2.5 text-white shadow-md sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{template.name}</p>
          <p className="truncate text-[11px] font-semibold text-sky-100/80">
            ל: {contact.name}
            {contact.phone ? ` · ${contact.phone}` : ''}
          </p>
        </div>
        <button
          onClick={() => act('draft')}
          disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-sky-900 shadow-sm transition hover:bg-sky-50 disabled:opacity-60 sm:text-sm"
        >
          {busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור ללא שליחה
        </button>
        <button
          onClick={() => act('inperson')}
          disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-sky-900 shadow-sm transition hover:bg-sky-50 disabled:opacity-60 sm:text-sm"
          title="הלקוח חותם עכשיו, במכשיר הזה"
        >
          {busy === 'inperson' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TabletSmartphone className="h-4 w-4" />}
          חתימה במכשיר הזה
        </button>
        <button
          onClick={() => act('send')}
          disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-extrabold text-slate-900 shadow-sm transition hover:bg-amber-300 disabled:opacity-60 sm:text-sm"
        >
          {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          שלח טופס
        </button>
        <button onClick={onClose} className="rounded-lg p-2 text-sky-100 transition hover:bg-white/10" aria-label="סגירה">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-4 border-b border-slate-200 bg-white px-4 py-2 text-[11.5px] font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-amber-500 bg-amber-200" /> ממלא/ת הנציג
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-sky-500 bg-sky-100" /> ממלא הלקוח
        </span>
        {msg && <span className="font-bold text-rose-600">{msg}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-8">
        <div className="mx-auto max-w-[900px]">
          <PageStack
            pages={template.pages}
            renderOverlay={(pi, width) => {
              const page = template.pages[pi]
              const pageH = (width * page.h) / page.w
              return fields
                .filter((f) => f.page === pi)
                .map((f) => (
                  <FieldBox
                    key={f.id}
                    field={f}
                    value={values[f.id]}
                    attachmentName={values[f.id]?.name}
                    boxHeightPx={f.h * pageH}
                    editable={mine(f)}
                    accent={f.filler === 'sender' ? 'amber' : 'sky'}
                    error={errorIds.includes(f.id)}
                    onClick={() => setActiveId(f.id)}
                  />
                ))
            }}
          />
        </div>
      </div>

      {active && (
        <FieldSheet
          key={active.id}
          field={active}
          value={values[active.id]}
          stepLabel={active.filler === 'sender' ? 'שדה של הנציג' : 'מילוי מראש עבור הלקוח'}
          onSave={(v) => {
            setValues((cur) => ({ ...cur, [active.id]: v }))
            setErrorIds((ids) => ids.filter((x) => x !== active.id))
            setActiveId(null)
          }}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>,
    document.body
  )
}
