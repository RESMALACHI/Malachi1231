import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import Spinner from './Spinner'

/**
 * Small centered confirmation dialog. Render it when you need a yes/no.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  onConfirm,
  onCancel,
  busy = false,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onCancel])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-sm overflow-hidden rounded-3xl rounded-b-none p-6 pb-10 text-center animate-slide-up sm:rounded-b-3xl sm:pb-6 sm:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
        {message && <p className="mt-1.5 text-sm text-slate-500">{message}</p>}
        <div className="mt-6 flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy} className="btn-gradient flex-1">
            {busy ? <Spinner /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
