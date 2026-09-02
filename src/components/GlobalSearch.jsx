import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  FileText,
  Handshake,
  Loader2,
  Search,
  Target,
  X,
} from 'lucide-react'
import { searchEverything } from '../services/globalSearch'

const pad = (n) => String(n).padStart(2, '0')
const dmy = (iso) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`
}
const shekels = (n) => `₪${Math.round(Number(n) || 0).toLocaleString('en-US')}`

const STATUS_DOT = {
  attended: 'bg-green-500',
  no_show: 'bg-red-500',
  pending: 'bg-slate-300',
}

/**
 * The quick search that lives in the top bar of every page.
 *
 * Type a name, a phone, a client, a page — get everything the system knows,
 * grouped: meetings (all agents — "does anyone here know this caller" is the
 * question this exists to answer), leads, deals, and the app's own pages.
 * A meeting opens in the calendar, a lead opens its file.
 */
export default function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState(null)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const timer = useRef(null)
  const seq = useRef(0)

  const run = useCallback((text) => {
    clearTimeout(timer.current)
    const query = text.trim()
    if (query.length < 2) {
      setResults(null)
      setBusy(false)
      return
    }
    setBusy(true)
    timer.current = setTimeout(async () => {
      const mine = ++seq.current
      const out = await searchEverything(query).catch(() => null)
      // A slower earlier query must not overwrite a newer one's results.
      if (mine === seq.current) {
        setResults(out)
        setBusy(false)
      }
    }, 300)
  }, [])

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
      // The muscle-memory shortcut: Ctrl/Cmd+K focuses the search anywhere.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const go = (path) => {
    setOpen(false)
    setQ('')
    setResults(null)
    navigate(path)
  }

  const hasAny =
    results &&
    (results.meetings.length || results.leads.length || results.deals.length || results.pages.length)

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search
          className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            run(e.target.value)
          }}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          placeholder="חיפוש מהיר — שם, טלפון, לקוח, עמוד…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pe-9 ps-9 text-sm shadow-sm outline-none transition focus:border-amber-400 sm:ps-20"
          aria-label="חיפוש מהיר בכל המערכת"
        />
        <span className="absolute start-2.5 top-1/2 -translate-y-1/2">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" aria-hidden="true" />
          ) : q ? (
            <button
              onClick={() => {
                setQ('')
                setResults(null)
                inputRef.current?.focus()
              }}
              className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="ניקוי החיפוש"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 sm:inline">
              Ctrl K
            </kbd>
          )}
        </span>
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
          {!results && (
            <p className="px-4 py-3 text-sm text-slate-400">מחפש…</p>
          )}
          {results && !hasAny && (
            <p className="px-4 py-3 text-sm text-slate-400">
              לא נמצא כלום עבור "{q.trim()}".
            </p>
          )}

          {results?.pages.length > 0 && (
            <Group label="עמודים">
              {results.pages.map((p) => (
                <Row key={p.path} onClick={() => go(p.path)}>
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="font-semibold text-slate-800">{p.label}</span>
                </Row>
              ))}
            </Group>
          )}

          {results?.leads.length > 0 && (
            <Group label="לידים">
              {results.leads.map((l) => (
                <Row key={l.id} onClick={() => go(`/leads/${l.id}`)}>
                  <Target className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-slate-800">{l.name || 'ללא שם'}</span>
                    {l.phone && (
                      <span className="me-2 font-mono text-xs text-slate-400" dir="ltr">
                        {l.phone}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {l.agent_name || ''}
                  </span>
                </Row>
              ))}
            </Group>
          )}

          {results?.meetings.length > 0 && (
            <Group label="פגישות">
              {results.meetings.map((m) => (
                <Row key={m.id} onClick={() => go(`/?meeting=${m.id}`)}>
                  <CalendarDays className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[m.status] || 'bg-slate-300'}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-800">{m.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400" dir="ltr">
                    {dmy(m.meeting_date)}
                  </span>
                </Row>
              ))}
            </Group>
          )}

          {results?.deals.length > 0 && (
            <Group label="עסקאות">
              {results.deals.map((d) => (
                <Row key={d.id} onClick={() => go('/reports?tab=deals')}>
                  <Handshake className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                    {d.client_name || 'ללא שם'}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-slate-600">
                    {shekels(d.amount)}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400" dir="ltr">
                    {dmy(d.deal_date)}
                  </span>
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ label, children }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <p className="bg-slate-50/70 px-4 py-1.5 text-[10px] font-extrabold tracking-widest text-slate-400">
        {label}
      </p>
      {children}
    </div>
  )
}

function Row({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-right text-sm transition hover:bg-amber-50/60"
    >
      {children}
    </button>
  )
}
