import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crown } from 'lucide-react'

/**
 * 4-digit PIN gate. Auto-checks when the 4th digit is typed; wrong code shakes
 * + clears. Portaled to <body>.
 *
 * `pin` is REQUIRED and comes from the roster — there is no default. A default
 * would mean a mistyped or missing setting silently falls back to a code
 * somebody else knows.
 */
export default function PinDialog({
  onSuccess,
  onCancel,
  pin,
  title = 'כניסת מנהל',
  icon: Icon = Crown,
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    // Focus after the dialog paints so the keyboard opens on mobile too.
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      clearTimeout(t)
    }
  }, [onCancel])

  const handleChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setError(false)
    setValue(v)
    if (v.length === 4) {
      if (v === pin) {
        onSuccess()
      } else {
        setError(true)
        setValue('')
      }
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-sm rounded-3xl rounded-b-none p-6 pb-10 text-center animate-slide-up sm:rounded-b-3xl sm:pb-6 sm:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-black ring-2 ring-amber-300">
          <Icon className="h-7 w-7 text-amber-300" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">הזינו קוד בן 4 ספרות</p>

        {/* PIN boxes + hidden input capturing the keystrokes */}
        <div
          className={`relative mx-auto mt-5 w-fit ${error ? 'animate-wiggle' : ''}`}
          onClick={() => inputRef.current?.focus()}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="קוד מנהל"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <div className="pointer-events-none flex gap-3" dir="ltr">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`flex h-14 w-12 items-center justify-center rounded-xl border-2 text-2xl font-bold text-slate-900 transition ${
                  error
                    ? 'border-red-300 bg-red-50'
                    : i === value.length
                      ? 'border-slate-900 bg-white'
                      : 'border-slate-200 bg-slate-50'
                }`}
              >
                {value[i] ? '●' : ''}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm font-semibold text-red-600">קוד שגוי — נסו שוב</p>
        )}

        <button
          onClick={onCancel}
          className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
        >
          ביטול
        </button>
      </div>
    </div>,
    document.body
  )
}
