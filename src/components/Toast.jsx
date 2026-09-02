import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

/**
 * Lightweight toast pinned to the bottom of the screen. Auto-dismisses.
 * Controlled by the parent: render it when `toast` is set.
 */
export default function Toast({ toast, onDismiss, duration = 3000 }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onDismiss, duration)
    return () => clearTimeout(id)
  }, [toast, onDismiss, duration])

  if (!toast) return null

  const isError = toast.type === 'error'
  const Icon = isError ? AlertTriangle : CheckCircle2

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div
        role="status"
        className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur-md animate-slide-up ${
          isError
            ? 'border-red-200 bg-red-50/95 text-red-700'
            : 'border-green-200 bg-green-50/95 text-green-800'
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{toast.text}</span>
        <button
          onClick={onDismiss}
          className="ms-1 rounded-lg p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"
          aria-label="סגירה"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body
  )
}
