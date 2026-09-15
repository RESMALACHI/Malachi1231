import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ChevronLeft, Search, X, Loader2, UserRound } from 'lucide-react'
import { listContacts } from '../../services/formsService'
import { mailStatus } from '../../services/mailService'

export const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100'

/** A value that settles `ms` after the last change — for search-as-you-type. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/**
 * Is mail connected? null while asking, then true / false. A failed question
 * counts as "not connected" — the mail buttons then say so instead of failing.
 */
export function useMailReady() {
  const [ready, setReady] = useState(null)
  useEffect(() => {
    let alive = true
    mailStatus()
      .then((s) => alive && setReady(!!s?.configured))
      .catch(() => alive && setReady(false))
    return () => {
      alive = false
    }
  }, [])
  return ready
}

/** "1 עד 50 מתוך 3,028 רשומות", page size, and paging — iForms' footer. */
export function Pager({ page, pageSize, count, onPage, onPageSize }) {
  const from = count ? page * pageSize + 1 : 0
  const to = Math.min(count, (page + 1) * pageSize)
  const last = Math.max(0, Math.ceil(count / pageSize) - 1)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
      <span className="tabular-nums">
        {from.toLocaleString('en-US')} עד {to.toLocaleString('en-US')} מתוך {count.toLocaleString('en-US')} רשומות
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          הצג
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          פריטים
        </label>
        <div className="flex items-center">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            aria-label="הקודם"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="px-1 tabular-nums text-slate-700">
            {page + 1}/{last + 1}
          </span>
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= last}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            aria-label="הבא"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Find a contact by name, phone or mail — searched on the server, since the
 * list is thousands long.
 */
export function ContactPicker({ value, onChange, autoFocus = false }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const dq = useDebounced(q, 250)
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    listContacts({ search: dq, pageSize: 20 })
      .then((r) => alive && setRows(r.rows))
      .catch(() => alive && setRows([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [dq, open])

  useEffect(() => {
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2">
        <UserRound className="h-4 w-4 shrink-0 text-sky-700" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{value.name}</p>
          <p className="truncate text-xs font-semibold text-slate-500" dir="ltr" style={{ textAlign: 'right' }}>
            {[value.phone, value.email].filter(Boolean).join(' · ') || 'ללא פרטי קשר'}
          </p>
        </div>
        <button onClick={() => onChange(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white" aria-label="החלפת איש קשר">
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="איש קשר — שם, טלפון או מייל"
        className={`${INPUT} ps-9`}
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs font-semibold text-slate-400">לא נמצאו אנשי קשר</p>
          ) : (
            rows.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                  setQ('')
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-sky-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{c.name}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{c.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const dateFmt = (iso) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '-') : '')
export { dateFmt }
