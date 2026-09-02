import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { clientName } from '../lib/meetingTitle'
import { openWhatsApp } from '../lib/whatsappLink'
import { formatFullDay, formatTime } from '../lib/dateUtils'
import { generateMeetingWhatsApp } from '../services/meetingMessageService'

const STYLES = [
  { key: 'warm', label: 'טבעי ואישי' },
  { key: 'short', label: 'קצר וישיר' },
  { key: 'gentle', label: 'מקצועי ועדין' },
]

/**
 * A focused AI tool inside a meeting — draft, edit, then open the client's own
 * WhatsApp chat. Nothing is sent automatically.
 */
export default function AiWhatsAppComposer({ meeting, phone }) {
  const { selectedAgent } = useAuth()
  const [open, setOpen] = useState(false)
  const [intent, setIntent] = useState('')
  const [style, setStyle] = useState('warm')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const name = useMemo(
    () => clientName(meeting?.title, meeting?.agent_name),
    [meeting?.title, meeting?.agent_name]
  )

  useEffect(() => {
    setIntent('')
    setStyle('warm')
    setDraft('')
    setError('')
  }, [meeting?.id])

  // The meeting modal also listens for Escape. Capture the key first so one
  // press closes only this sheet rather than both layers at once.
  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const generate = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const next = await generateMeetingWhatsApp({
        meeting,
        agentName: selectedAgent,
        intent,
        style,
      })
      setDraft(next)
    } catch {
      setError('לא הצלחתי לנסח כרגע. נסו שוב בעוד רגע.')
    } finally {
      setBusy(false)
    }
  }

  const panel = open ? (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="מחולל הודעת WhatsApp"
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl animate-slide-up sm:rounded-[28px] sm:animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden bg-slate-950 px-5 pb-5 pt-4 text-white sm:px-6">
          <span
            className="absolute -start-10 -top-16 h-40 w-40 rounded-full bg-amber-400/15 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-extrabold">ניסוח הודעה עם AI</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-300">
                הודעה אישית ל{name !== '(ללא פרטים)' ? ` ${name}` : 'לקוח'} — מוכנה לעריכה
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-300 transition-colors duration-150 hover:bg-white/10 hover:text-white active:scale-[0.97]"
              aria-label="סגירה"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-900">{name}</p>
              <p className="text-xs font-medium text-slate-500">
                {formatFullDay(meeting.meeting_date)} · {formatTime(meeting.meeting_date)}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="ai-whatsapp-intent" className="mb-2.5 block text-sm font-extrabold text-slate-900">
              מה תרצה לכתוב ללקוח?
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1.5 transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-amber-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-200/70">
              <textarea
                id="ai-whatsapp-intent"
                value={intent}
                onChange={(event) => setIntent(event.target.value.slice(0, 1200))}
                rows={4}
                autoFocus
                placeholder="לדוגמה: תזכיר לו שהפגישה מחר, תגיד שאנחנו מחכים לו ושיאשר שהוא מגיע"
                className="w-full resize-none bg-transparent px-3 py-2.5 text-sm font-semibold leading-6 text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between gap-3 px-3 pb-1.5 text-[11px] font-medium text-slate-400">
                <span>כתוב חופשי — ה‑AI יסדר את הניסוח</span>
                <span className="shrink-0 tabular-nums">{intent.length}/1200</span>
              </div>
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="mb-2.5 text-sm font-extrabold text-slate-900">איך לכתוב?</legend>
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5">
              {STYLES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStyle(item.key)}
                  aria-pressed={style === item.key}
                  className={`rounded-xl px-2 py-2.5 text-[11px] font-extrabold leading-snug transition-[transform,background-color,color,box-shadow] duration-150 active:scale-[0.97] sm:text-xs ${
                    style === item.key
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            onClick={generate}
            disabled={busy || !intent.trim()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-slate-950/15 transition-[transform,background-color] duration-150 hover:bg-black active:scale-[0.97] disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : draft ? (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
            )}
            {busy ? 'מנסח את ההודעה…' : draft ? 'נסח מחדש' : 'נסח לי הודעה'}
          </button>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">
              {error}
            </p>
          )}

          {draft && (
            <div className="mt-5 animate-fade-up">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                <span className="text-sm font-extrabold text-slate-900">ההודעה מוכנה</span>
                <span className="ms-auto text-[11px] font-medium tabular-nums text-slate-400">
                  {draft.length} תווים
                </span>
              </div>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={6}
                className="w-full resize-none rounded-2xl border border-green-200 bg-green-50/60 px-4 py-3.5 text-sm font-semibold leading-7 text-slate-900 outline-none transition-[border-color,background-color] duration-150 focus:border-green-500 focus:bg-white"
              />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white px-4 py-3 pb-safe sm:px-6 sm:pb-3">
          <button
            onClick={() => openWhatsApp(phone, draft)}
            disabled={!draft.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#20bd5a] px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-green-700/15 transition-[transform,filter] duration-150 hover:brightness-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            פתח בווטסאפ של {name !== '(ללא פרטים)' ? name : 'הלקוח'}
          </button>
          <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
            ההודעה לא נשלחת אוטומטית — אפשר לערוך ולאשר אותה בווטסאפ.
          </p>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-start shadow-sm transition-[transform,border-color,background-color,box-shadow] duration-150 hover:border-amber-400 hover:bg-amber-100/70 hover:shadow-md active:scale-[0.97]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-amber-300 shadow-md shadow-slate-950/15">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-slate-900">נסח הודעת WhatsApp עם AI</span>
          <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
            אישית לפי הלקוח, הפגישה והמטרה שלך
          </span>
        </span>
        <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black text-slate-950">
          חדש
        </span>
      </button>
      {panel && createPortal(panel, document.body)}
    </>
  )
}
