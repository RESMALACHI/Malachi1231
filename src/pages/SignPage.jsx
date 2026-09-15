import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Download, FileSignature, Loader2, ShieldCheck, AlertTriangle, ChevronLeft } from 'lucide-react'
import { blockingFields, isEmpty, readingOrder } from '../lib/formFields'
import { renderFieldImage, renderNameImage } from '../lib/fieldImage'
import { loadForSigning, submitSigned } from '../services/formsService'
import PageStack from '../components/forms/PageStack'
import FieldBox from '../components/forms/FieldBox'
import FieldSheet from '../components/forms/FieldSheet'

/**
 * The page a client opens from the link — no login, no app, a phone.
 *
 * Built around one gesture: tap a blue box, fill it in a proper sheet, and the
 * "next" button walks you to the next one until the form is complete. Nothing
 * is sent until the client ticks "read and agree" and presses sign; then the
 * form-sign function freezes the PDF and the client gets their copy on the spot.
 */
export default function SignPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | fill | done | signed | cancelled | draft | signing | error
  const [values, setValues] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorIds, setErrorIds] = useState([])
  const [message, setMessage] = useState('')
  const [pdfUrl, setPdfUrl] = useState(null)
  const [emailedTo, setEmailedTo] = useState([])
  const pageEls = useRef({})

  useEffect(() => {
    let alive = true
    loadForSigning(token)
      .then((d) => {
        if (!alive) return
        setData(d)
        if (d.status === 'signed') {
          setPdfUrl(d.pdfUrl)
          setPhase('signed')
        } else if (['cancelled', 'draft', 'signing'].includes(d.status)) setPhase(d.status)
        else {
          setValues(d.values || {})
          setPhase('fill')
        }
      })
      .catch(() => alive && setPhase('error'))
    return () => {
      alive = false
    }
  }, [token])

  const fields = data?.fields || []
  const pages = data?.pages || []
  const mine = useMemo(() => readingOrder(fields.filter((f) => f.filler !== 'sender')), [fields])
  const missing = useMemo(() => blockingFields(fields, values), [fields, values])
  const missingMine = missing.filter((f) => f.filler !== 'sender')
  const missingTheirs = missing.filter((f) => f.filler === 'sender')
  const requiredMine = mine.filter((f) => f.required)
  const doneCount = requiredMine.filter((f) => !isEmpty(values[f.id])).length

  const active = fields.find((f) => f.id === activeId) || null

  const scrollTo = (f) => {
    const el = pageEls.current[f.page]
    if (!el) return
    const r = el.getBoundingClientRect()
    const y = window.scrollY + r.top + f.y * r.height - window.innerHeight * 0.3
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  }

  // A box to point at without opening anything — a checkbox is ticked on the
  // page itself, so "the next field" only scrolls to it and makes it glow.
  const [flashId, setFlashId] = useState(null)
  const goTo = (f, delay) => {
    scrollTo(f)
    if (f.type === 'checkbox') {
      setFlashId(f.id)
      setTimeout(() => setFlashId((cur) => (cur === f.id ? null : cur)), 1800)
    } else {
      setTimeout(() => setActiveId(f.id), delay)
    }
  }

  const openNext = useCallback(
    (afterId = null) => {
      const order = mine
      const start = afterId ? order.findIndex((f) => f.id === afterId) + 1 : 0
      const next =
        order.slice(start).find((f) => missingMine.some((m) => m.id === f.id)) ||
        order.find((f) => missingMine.some((m) => m.id === f.id))
      if (next) goTo(next, 250)
    },
    [mine, missingMine]
  )

  /** A tap on a box: a checkbox ticks (or unticks) right there; anything else opens its sheet. */
  const pick = (f) => {
    if (f.type === 'checkbox') {
      setValues((cur) => ({ ...cur, [f.id]: !cur[f.id] }))
      setErrorIds((e) => e.filter((x) => x !== f.id))
      setFlashId(null)
    } else {
      setActiveId(f.id)
    }
  }

  const saveValue = (v) => {
    const id = activeId
    const nextValues = { ...values, [id]: v }
    setValues(nextValues)
    setErrorIds((e) => e.filter((x) => x !== id))
    setActiveId(null)
    // Walk on to the next empty box — the rhythm that makes a phone form quick.
    const stillMissing = blockingFields(fields, nextValues).filter((f) => f.filler !== 'sender' && f.id !== id)
    if (stillMissing.length) {
      const order = mine
      const from = order.findIndex((f) => f.id === id) + 1
      const next = order.slice(from).find((f) => stillMissing.some((m) => m.id === f.id))
      if (next) setTimeout(() => goTo(next, 300), 120)
    }
  }

  const sign = async () => {
    if (missing.length || !consent || busy) return
    setBusy(true)
    setMessage('')
    try {
      const images = {}
      const attachments = {}
      const outValues = {}
      for (const f of mine) {
        const v = values[f.id]
        const page = pages[f.page]
        if (!page || isEmpty(v)) continue
        if (f.type === 'attachment') {
          attachments[f.id] = v.dataUrl
          outValues[f.id] = v.name || 'קובץ מצורף'
        } else if (f.type === 'signature') {
          const img = await renderFieldImage(f, null, page.w, page.h, v)
          if (img) images[f.id] = img
          outValues[f.id] = true
        } else {
          const img = await renderFieldImage(f, v, page.w, page.h)
          if (img) images[f.id] = img
          outValues[f.id] = v
        }
      }
      const nameImage = await renderNameImage(data.contact?.name || '')
      const r = await submitSigned({ token, values: outValues, images, attachments, nameImage, consent: true })
      setPdfUrl(r.pdfUrl)
      setEmailedTo(Array.isArray(r.emailedTo) ? r.emailedTo : [])
      setPhase('done')
      window.scrollTo({ top: 0 })
    } catch (e) {
      if (e.code === 'invalid' && e.fields) {
        setErrorIds(e.fields)
        setMessage('חלק מהשדות לא תקינים — הם מסומנים באדום')
      } else if (e.code === 'already_signed') {
        setPhase('signed')
      } else {
        setMessage('השליחה נכשלה — בדקו את החיבור ונסו שוב')
      }
    } finally {
      setBusy(false)
    }
  }

  // ── Non-fill states ─────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-24 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-sky-700" />
          <p className="text-sm font-semibold">טוען את הטופס…</p>
        </div>
      </Shell>
    )
  }
  if (phase !== 'fill') {
    const map = {
      done: { icon: CheckCircle2, tone: 'text-green-600', title: 'המסמך נחתם בהצלחה', text: 'תודה! עותק חתום נשמר במכללת R.E.S, ואפשר להוריד אותו כאן.' },
      signed: { icon: CheckCircle2, tone: 'text-green-600', title: 'המסמך כבר נחתם', text: 'הטופס הזה נחתם בעבר. אפשר להוריד את העותק החתום.' },
      cancelled: { icon: AlertTriangle, tone: 'text-amber-600', title: 'הטופס בוטל', text: 'הקישור הזה כבר לא פעיל. לפרטים — פנו לנציג שלכם במכללה.' },
      draft: { icon: AlertTriangle, tone: 'text-amber-600', title: 'הטופס עוד לא נשלח', text: 'הטופס עדיין בעריכה אצל הנציג.' },
      signing: { icon: Loader2, tone: 'text-sky-700', title: 'החתימה בתהליך', text: 'רגע… רעננו את העמוד בעוד כמה שניות.' },
      error: { icon: AlertTriangle, tone: 'text-rose-600', title: 'הקישור לא נמצא', text: 'ייתכן שהקישור שגוי או פג תוקף. בקשו מהנציג קישור חדש.' },
    }[phase]
    const Icon = map.icon
    return (
      <Shell title={data?.templateName}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
          <Icon className={`h-16 w-16 ${map.tone} ${phase === 'signing' ? 'animate-spin' : ''}`} />
          <h1 className="text-2xl font-extrabold text-slate-900">{map.title}</h1>
          <p className="text-sm font-medium leading-relaxed text-slate-600">{map.text}</p>
          {phase === 'done' && emailedTo.length > 0 && (
            <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
              עותק חתום נשלח גם למייל <span dir="ltr">{emailedTo.join(', ')}</span>
            </p>
          )}
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-sky-800"
            >
              <Download className="h-5 w-5" />
              הורדת העותק החתום (PDF)
            </a>
          )}
        </div>
      </Shell>
    )
  }

  // ── Filling ─────────────────────────────────────────────────────────────
  const firstName = String(data.contact?.name || '').split(/\s+/)[0]
  const progress = requiredMine.length ? Math.round((doneCount / requiredMine.length) * 100) : 100
  const stepOf = active ? `שדה ${mine.findIndex((f) => f.id === active.id) + 1} מתוך ${mine.length}` : ''

  return (
    <Shell title={data.templateName} progress={progress}>
      <div className="mx-auto max-w-3xl px-3 pb-44 pt-4 sm:px-6">
        <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm leading-relaxed text-sky-950">
          <p className="font-bold">
            שלום{firstName ? ` ${firstName}` : ''}, לפניך {data.templateName} לחתימה.
          </p>
          <p className="mt-0.5 text-sky-900/80">
            לחצו על השדות הכחולים כדי למלא אותם, קראו את המסמך, ובסוף אשרו וחתמו.
          </p>
        </div>

        <PageStack
          pages={pages}
          pageRef={(i, el) => (pageEls.current[i] = el)}
          renderOverlay={(pi, width) => {
            const page = pages[pi]
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
                  editable={f.filler !== 'sender'}
                  error={errorIds.includes(f.id)}
                  highlight={flashId === f.id}
                  onClick={() => pick(f)}
                />
              ))
          }}
        />
      </div>

      {/* ── The bar that always knows the next step ── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.8rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.25)] backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {message && <p className="mb-2 text-center text-sm font-bold text-rose-600">{message}</p>}
          {missingTheirs.length > 0 ? (
            <p className="text-center text-sm font-bold text-amber-700">
              חסרים בטופס פרטים שהנציג צריך למלא — פנו לנציג שלכם במכללה.
            </p>
          ) : missingMine.length > 0 ? (
            <button
              onClick={() => openNext(activeId)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-700 py-3.5 text-base font-bold text-white shadow-lg shadow-sky-900/20 transition hover:bg-sky-800 active:scale-[0.99]"
            >
              {doneCount === 0 ? 'מתחילים למלא' : `לשדה הבא · נותרו ${missingMine.length}`}
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm font-semibold leading-snug text-slate-800">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-sky-700"
                />
                קראתי את המסמך במלואו, הבנתי אותו ואני מסכים/ה לתנאיו.
              </label>
              <button
                onClick={sign}
                disabled={!consent || busy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-3.5 text-base font-bold text-white shadow-lg shadow-green-900/20 transition hover:bg-green-700 active:scale-[0.99] disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSignature className="h-5 w-5" />}
                {busy ? 'חותם…' : 'חתימה ושליחה'}
              </button>
            </div>
          )}
        </div>
      </div>

      {active && (
        <FieldSheet
          key={active.id}
          field={active}
          value={values[active.id]}
          stepLabel={stepOf}
          onSave={saveValue}
          onClose={() => setActiveId(null)}
        />
      )}
    </Shell>
  )
}

/** The frame of the public page: the college's name, the document, progress. */
function Shell({ title, progress = null, children }) {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="h-[3px] bg-gradient-to-l from-amber-600 via-yellow-300 to-amber-500" />
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-[11px] font-black text-amber-300">
            R.E.S
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-slate-900">{title || 'מכללת R.E.S'}</p>
            <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              <ShieldCheck className="h-3 w-3 text-green-600" />
              חתימה דיגיטלית מאובטחת · מכללת R.E.S
            </p>
          </div>
          {progress != null && (
            <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-extrabold tabular-nums text-sky-800">
              {progress}%
            </span>
          )}
        </div>
        {progress != null && (
          <div className="h-1 bg-slate-100">
            <div className="h-full bg-sky-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}
      </header>
      {children}
    </div>
  )
}
