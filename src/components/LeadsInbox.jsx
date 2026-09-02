import { useCallback, useEffect, useState } from 'react'
import { Inbox, MessageCircle, Phone, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { REAL_AGENTS } from '../lib/agents'
import { deleteLead, listLeads, setLeadAgent, setLeadHandled } from '../services/leadsService'
import { toWaNumber } from '../lib/waTemplates'
import ConfirmDialog from './ConfirmDialog'
import EmptyState from './EmptyState'
import Spinner from './Spinner'

// Two states, matching the לידים page. Four shades of "in progress" meant every
// screen had to explain itself and nobody agreed what "נוצר קשר" implied.
const STATUS = [
  { key: 'new', label: 'ממתין', style: 'bg-red-100 text-red-700' },
  { key: 'done', label: 'טופל', style: 'bg-green-100 text-green-700' },
]

/**
 * The leads that came in, newest first.
 *
 * Everything on a row is external text somebody typed into a form on the
 * internet. It is rendered as text and nothing else — never a link built from
 * it, never markup — and the phone is the one field normalised, because that is
 * the one the agent presses.
 */
export default function LeadsInbox() {
  const [leads, setLeads] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setLeads(await listLeads({ limit: 60 }))
      setError('')
    } catch (e) {
      setError(e?.message || 'טעינת הלידים נכשלה')
      setLeads([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = (id, p) => setLeads((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))

  if (leads === null) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="עדיין אין לידים"
        description="ברגע שמקור יתחיל לשלוח, הלידים יופיעו כאן — עם השיוך לסוכן."
      />
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}

      {leads.map((l) => (
        <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/leads/${l.id}`}
                  className="font-bold text-slate-900 underline-offset-2 hover:underline"
                >
                  {l.name || 'ללא שם'}
                </Link>
                {l.source_name && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                    {l.source_name}
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  {new Date(l.created_at).toLocaleString('he-IL')}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                {l.phone && <span dir="ltr">{l.phone}</span>}
                {l.email && <span dir="ltr" className="truncate">{l.email}</span>}
              </div>
              {l.note && <p className="mt-1 text-sm text-slate-500">{l.note}</p>}
            </div>

            {l.phone && (
              <div className="flex shrink-0 gap-1">
                <a
                  href={`tel:${l.phone}`}
                  className="btn-ghost px-2"
                  aria-label={`חיוג ל${l.name || 'ליד'}`}
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href={`https://wa.me/${toWaNumber(l.phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost px-2 text-green-600"
                  aria-label={`ווצאפ ל${l.name || 'ליד'}`}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
            <select
              value={l.agent_name || ''}
              onChange={(e) => {
                patch(l.id, { agent_name: e.target.value || null })
                setLeadAgent(l.id, e.target.value || null).catch(() => load())
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-slate-500"
              aria-label="שיוך לסוכן"
            >
              <option value="">ללא שיוך</option>
              {REAL_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-1">
              {STATUS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    patch(l.id, { status: s.key })
                    setLeadHandled(l.id, s.key === 'done').catch(() => load())
                  }}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                    l.status === s.key ? s.style : 'text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setConfirm(l)}
              className="btn-ghost ms-auto px-2 text-red-600"
              aria-label="מחיקת הליד"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      {confirm && (
        <ConfirmDialog
          title={`למחוק את הליד של ${confirm.name || 'ללא שם'}?`}
          message="הליד יימחק לצמיתות. אם המקור ישלח אותו שוב הוא ייכנס מחדש."
          confirmLabel="מחיקה"
          onConfirm={async () => {
            const id = confirm.id
            setConfirm(null)
            setLeads((l) => l.filter((x) => x.id !== id))
            await deleteLead(id).catch(() => load())
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
