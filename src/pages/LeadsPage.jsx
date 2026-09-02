import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isAdminAgent, isManagerAgent } from '../lib/agents'
import { listLeads, setLeadHandled, setLeadRelevant } from '../services/leadsService'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'
import { Target } from 'lucide-react'

const REFRESH_MS = 60_000
const PAGE_SIZE = 25
const pad = (n) => String(n).padStart(2, '0')

/** "09:41 28/08/2026" — the BMBY lead-date format, to the minute. */
function leadDate(iso) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** The status words the table shows — ours, in BMBY's register. */
function statusLabel(l) {
  if (!l.relevant) return { text: 'לא רלוונטי', cls: 'text-slate-400' }
  if (l.status === 'done') return { text: 'טופל', cls: 'text-green-700' }
  return { text: 'ליד חדש', cls: 'text-slate-700' }
}

/**
 * The leads screen — BMBY's "מתעניינים חדשים" table, over our own data.
 *
 * A dense numbered table: agent, name, source, status, phones, the lead's
 * timestamp, and the two verdict columns — טופל and רלוונטי — as click-to-flip
 * marks. A row click opens the lead's file; the marks stop the click.
 */
export default function LeadsPage() {
  const { selectedAgent } = useAuth()
  const canSeeAll = isManagerAgent(selectedAgent) || isAdminAgent(selectedAgent)
  const navigate = useNavigate()

  const [leads, setLeads] = useState(null)
  const [filter, setFilter] = useState('open') // open | all
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const scope = canSeeAll ? null : selectedAgent

  const load = useCallback(
    async ({ background = false } = {}) => {
      if (!background) setLeads(null)
      try {
        setLeads(await listLeads({ agentName: scope, limit: 1000 }))
        setError('')
      } catch (e) {
        setError(e?.message || 'טעינת הלידים נכשלה')
        setLeads([])
      }
    },
    [scope]
  )

  useEffect(() => {
    load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load({ background: true })
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const patch = (id, p) => setLeads((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const shown = useMemo(() => {
    if (!leads) return []
    let out = filter === 'open' ? leads.filter((l) => l.status !== 'done' && l.relevant) : leads
    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter((l) =>
        [l.name, l.phone, l.email, l.source_name, l.agent_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    }
    return out
  }, [leads, filter, query])

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const rows = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => setPage(1), [filter, query])

  if (leads === null) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header — title, count line, controls */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">מתעניינים חדשים</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {shown.length} רשומות נמצאו, מראה את עמוד {safePage} מתוך {pages}
            {canSeeAll ? '' : ` · ${selectedAgent}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="סינון מהיר…"
              className="w-44 rounded-xl border border-slate-200 bg-white py-1.5 pe-8 ps-3 text-sm outline-none transition focus:border-amber-400"
            />
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
            {[
              ['open', 'ממתינים'],
              ['all', 'הכל'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  filter === val ? 'bg-slate-900 text-white' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              setBusy(true)
              await load({ background: true })
              setBusy(false)
            }}
            className="btn-ghost px-2"
            aria-label="רענון"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={Target}
          title={filter === 'open' ? 'אין לידים שממתינים' : 'לא נמצאו לידים'}
          description={
            filter === 'open'
              ? 'כל מה שנכנס כבר טופל או סומן לא רלוונטי.'
              : 'ברגע שמקור לידים ישלח — הם יופיעו כאן.'
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">
                  <Th w="w-10">#</Th>
                  <Th>איש מכירות</Th>
                  <Th>שם המתעניין</Th>
                  <Th>מקור הגעה</Th>
                  <Th>סטטוס</Th>
                  <Th>סלולרי</Th>
                  <Th>אימייל</Th>
                  <Th>תאריך ליד</Th>
                  <Th w="w-14" center>טופל</Th>
                  <Th w="w-14" center>רלוונטי</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((l, i) => {
                  const st = statusLabel(l)
                  const dim = l.status === 'done' || !l.relevant
                  return (
                    <tr
                      key={l.id}
                      onClick={() => navigate(`/leads/${l.id}`)}
                      className={`cursor-pointer transition hover:bg-green-50/60 ${
                        dim ? 'text-slate-400' : ''
                      }`}
                    >
                      <Td className="text-slate-400">{(safePage - 1) * PAGE_SIZE + i + 1}</Td>
                      <Td>{l.agent_name || '—'}</Td>
                      <Td>
                        <span className={`font-bold ${dim ? 'text-slate-400' : 'text-slate-900'}`}>
                          {l.name || 'ללא שם'}
                        </span>
                      </Td>
                      <Td className="max-w-[220px] truncate">{l.source_name || '—'}</Td>
                      <Td>
                        <span className={`font-semibold ${st.cls}`}>{st.text}</span>
                      </Td>
                      <Td>
                        {l.phone ? (
                          <a
                            href={`tel:${l.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            dir="ltr"
                            className="font-mono text-slate-700 underline-offset-2 hover:underline"
                          >
                            {l.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="max-w-[180px] truncate" dir="ltr">
                        {l.email || '—'}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs" dir="ltr">
                        {leadDate(l.created_at)}
                      </Td>
                      <Td center stop>
                        <Mark
                          on={l.status === 'done'}
                          onLabel="טופל — לחיצה מחזירה לממתין"
                          offLabel="סימון כטופל"
                          onClick={() => {
                            const next = l.status === 'done' ? 'new' : 'done'
                            patch(l.id, { status: next })
                            setLeadHandled(l.id, next === 'done').catch(() => load({ background: true }))
                          }}
                        />
                      </Td>
                      <Td center stop>
                        <Mark
                          on={l.relevant}
                          negative
                          onLabel="רלוונטי — לחיצה מסמנת לא רלוונטי"
                          offLabel="סימון כרלוונטי"
                          onClick={() => {
                            patch(l.id, { relevant: !l.relevant })
                            setLeadRelevant(l.id, !l.relevant).catch(() => load({ background: true }))
                          }}
                        />
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-2.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="btn-ghost px-2 disabled:opacity-30"
                aria-label="עמוד קודם"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-xs font-bold text-slate-600">
                עמוד {safePage} / {pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={safePage === pages}
                className="btn-ghost px-2 disabled:opacity-30"
                aria-label="עמוד הבא"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Th({ children, w = '', center = false }) {
  return (
    <th className={`px-3 py-2 ${center ? 'text-center' : 'text-start'} ${w}`}>{children}</th>
  )
}

function Td({ children, className = '', center = false, stop = false, dir }) {
  return (
    <td
      dir={dir}
      onClick={stop ? (e) => e.stopPropagation() : undefined}
      className={`px-3 py-2 ${center ? 'text-center' : ''} ${className}`}
    >
      {children}
    </td>
  )
}

/**
 * The BMBY verdict mark: a green ✓ or a red ✗, flipped by clicking.
 *
 * `negative` renders the OFF state as a red ✗ (רלוונטי off = actively junk),
 * while a plain mark's OFF state is a hollow ✗ (טופל off = simply not yet).
 */
function Mark({ on, onClick, onLabel, offLabel, negative = false }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? onLabel : offLabel}
      title={on ? onLabel : offLabel}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-slate-100 active:scale-90"
    >
      {on ? (
        <Check className="h-4 w-4 text-green-600" strokeWidth={3} aria-hidden="true" />
      ) : (
        <X
          className={`h-4 w-4 ${negative ? 'text-red-500' : 'text-red-400/70'}`}
          strokeWidth={3}
          aria-hidden="true"
        />
      )}
    </button>
  )
}
