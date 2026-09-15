import { useEffect, useRef, useState } from 'react'
import { X, Eraser, Paperclip, Check } from 'lucide-react'
import { valueError } from '../../lib/formFields'
import { compressImage } from '../../lib/fieldImage'
import SignaturePad from './SignaturePad'

/**
 * Filling one box, in a sheet of its own.
 *
 * On a phone the page is a picture a few hundred pixels wide; typing inside a
 * 9px box on it is miserable. Every box opens here instead — a real input at a
 * real size, the right keyboard for the type (numbers, phone, mail), and a
 * full-width pad for the signature.
 */
export default function FieldSheet({ field, value, onSave, onClose, stepLabel }) {
  const [v, setV] = useState(value ?? (field.type === 'checkbox' ? false : ''))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const padRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  const save = async () => {
    let out = v
    if (field.type === 'signature') {
      out = padRef.current?.toDataUrl() || (typeof value === 'string' && padRef.current?.isEmpty() ? value : null)
      if (!out) {
        setErr(field.required ? 'יש לחתום לפני האישור' : '')
        if (field.required) return
      }
    }
    const e = field.type === 'signature' || field.type === 'attachment' ? null : valueError(field, out)
    if (e && !(e === 'שדה חובה' && !field.required)) {
      setErr(e)
      return
    }
    onSave(out)
  }

  const pickFile = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      setV({ name: file.name, dataUrl: await compressImage(file) })
    } catch {
      setErr('לא ניתן לקרוא את הקובץ — צלמו או בחרו תמונה')
    } finally {
      setBusy(false)
    }
  }

  const common = {
    ref: inputRef,
    value: v ?? '',
    onChange: (e) => {
      setV(e.target.value)
      setErr('')
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' && field.type !== 'textarea') save()
    },
    // 16px: below that iOS zooms the page when the field takes focus.
    className:
      'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base font-semibold text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200',
  }

  const input = () => {
    switch (field.type) {
      case 'textarea':
        return <textarea {...common} rows={4} />
      case 'number':
        return <input {...common} inputMode="decimal" dir="ltr" />
      case 'phone':
        return <input {...common} type="tel" inputMode="tel" dir="ltr" placeholder="05X-XXXXXXX" />
      case 'email':
        return <input {...common} type="email" inputMode="email" dir="ltr" placeholder="name@example.com" />
      case 'idNumber':
        return <input {...common} inputMode="numeric" dir="ltr" maxLength={9} placeholder="9 ספרות" />
      case 'date':
        return <input {...common} type="date" dir="ltr" />
      case 'checkbox':
        return (
          <button
            type="button"
            onClick={() => setV((x) => !x)}
            className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-base font-bold transition ${
              v ? 'border-sky-500 bg-sky-50 text-sky-900' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 ${
                v ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300'
              }`}
            >
              {v && <Check className="h-5 w-5" strokeWidth={3} />}
            </span>
            {v ? 'מסומן' : 'לא מסומן — לחצו לסימון'}
          </button>
        )
      case 'signature':
        return (
          <div>
            {typeof value === 'string' && value && (
              <p className="mb-2 text-xs font-semibold text-slate-500">חתימה קיימת — חתמו מחדש כדי להחליף אותה</p>
            )}
            <SignaturePad ref={padRef} height={200} onChange={() => setErr('')} />
            <button
              type="button"
              onClick={() => padRef.current?.clear()}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              <Eraser className="h-4 w-4" aria-hidden="true" />
              ניקוי
            </button>
          </div>
        )
      case 'attachment':
        return (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-sky-400">
            {v?.dataUrl ? (
              <img src={v.dataUrl} alt="" className="max-h-48 rounded-lg shadow" />
            ) : (
              <Paperclip className="h-8 w-8 text-slate-400" aria-hidden="true" />
            )}
            <span className="text-sm font-bold text-slate-700">{busy ? 'מעבד…' : v?.dataUrl ? 'החלפת תמונה' : 'צילום או בחירת תמונה'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        )
      default:
        return <input {...common} />
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up sm:rounded-3xl sm:animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-label={field.label}
      >
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {stepLabel && <p className="text-[11px] font-bold text-sky-700">{stepLabel}</p>}
            <p className="text-lg font-extrabold text-slate-900">
              {field.label || 'שדה'}
              {field.required && <span className="text-rose-500"> *</span>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>
        {input()}
        {err && <p className="mt-2 text-sm font-bold text-rose-600">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-xl bg-sky-700 py-3 text-base font-bold text-white shadow-sm transition hover:bg-sky-800 active:scale-[0.98] disabled:opacity-50"
          >
            אישור
          </button>
          {field.type !== 'signature' && field.type !== 'checkbox' && (
            <button
              type="button"
              onClick={() => onSave(field.type === 'attachment' ? null : '')}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ניקוי
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
