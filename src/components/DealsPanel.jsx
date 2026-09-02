import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus,
  Handshake,
  Pencil,
  Trash2,
  X,
  Save,
  Wallet,
  Link2,
  MessageCircle,
} from 'lucide-react'
import Spinner from './Spinner'
import Toast from './Toast'
import ConfirmDialog from './ConfirmDialog'
import DealsBonusCard from './DealsBonusCard'
import { formatDay, formatTime } from '../lib/dateUtils'
import { getDeals, saveDeal, deleteDeal, todayISO, dealsReport } from '../services/dealsService'
import { collectionState } from '../lib/dealsBonus'
import { useModalLock } from '../lib/useModalLock'
import { openWhatsApp } from '../lib/whatsappLink'

const shekel = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
})

/** Strip the calendar boilerplate so the dropdown reads like a client list. */
function meetingLabel(m) {
  const title = (m.title || '(ללא כותרת)').replace(/\s+/g, ' ').trim()
  const short = title.length > 42 ? `${title.slice(0, 41)}…` : title
  return `${formatDay(m.meeting_date)} ${formatTime(m.meeting_date)} · ${short}`
}

const EMPTY = {
  id: null,
  meetingId: '',
  amount: '',
  collected: '',
  kind: 'project',
  notes: '',
  dealDate: '',
}

const KINDS = [
  { key: 'project', label: 'פרוייקט', hint: 'נכנס לטבלת האחוזים' },
  { key: 'course', label: 'קורס בודד', hint: '2% עד ₪6,000' },
]

/** Colours for the collection states. The rule itself lives in lib/dealsBonus. */
const COLLECTION_STATES = {
  paid: { dot: 'bg-green-600', chip: 'bg-green-100 text-green-700', label: 'נגבה' },
  partial: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', label: 'חלקי' },
  unpaid: { dot: 'bg-red-500', chip: 'bg-red-100 text-red-700', label: 'טרם שילם' },
  unknown: { dot: 'bg-slate-300', chip: 'bg-slate-100 text-slate-500', label: 'לא נרשם' },
}

const LEGEND = [
  { key: 'paid', text: 'נגבה במלואו' },
  { key: 'partial', text: 'שילם חלקית' },
  { key: 'unpaid', text: 'טרם שילם' },
  { key: 'unknown', text: 'לא נרשמה גבייה' },
]

/**
 * Deals closed this month — entered by hand. Each deal can point at the meeting
 * it came from, which is what finally connects a booked meeting to money.
 */
export default function DealsPanel({ agentName, isManager, meetings, year, month, monthLabel }) {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // null = closed
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [toast, setToast] = useState(null)
  const [reportBusy, setReportBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDeals(await getDeals(isManager ? null : agentName, year, month))
    } catch (err) {
      setError(err.message || 'שגיאה בטעינת העסקאות')
    } finally {
      setLoading(false)
    }
  }, [agentName, isManager, year, month])

  useEffect(() => {
    load()
  }, [load])

  const total = useMemo(
    () => deals.reduce((sum, d) => sum + Number(d.amount || 0), 0),
    [deals]
  )

  // The month's meetings, newest first — the dropdown to attach a deal to.
  const linkable = useMemo(
    () => [...meetings].sort((a, b) => new Date(b.meeting_date) - new Date(a.meeting_date)),
    [meetings]
  )

  const openNew = () => setForm({ ...EMPTY, dealDate: todayISO() })

  const openEdit = (d) =>
    setForm({
      id: d.id,
      meetingId: d.meeting_id || '',
      amount: String(d.amount ?? ''),
      collected: d.collected === null || d.collected === undefined ? '' : String(d.collected),
      kind: d.kind === 'course' ? 'course' : 'project',
      notes: d.notes || '',
      dealDate: d.deal_date,
    })

  const submit = async (e) => {
    e.preventDefault()
    if (!form || saving) return
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      setToast({ type: 'error', text: 'הסכום חייב להיות מספר חיובי' })
      return
    }
    setSaving(true)
    try {
      const meeting = meetings.find((m) => m.id === form.meetingId)
      await saveDeal({
        id: form.id,
        meetingId: form.meetingId || null,
        agentName,
        // Stored alongside the link so the deal stays readable even if the
        // calendar sync later removes the meeting row.
        clientName: meeting?.title || null,
        amount,
        collected: form.collected,
        kind: form.kind,
        notes: form.notes,
        dealDate: form.dealDate || todayISO(),
      })
      setForm(null)
      setToast({ type: 'success', text: form.id ? 'העסקה עודכנה' : 'העסקה נוספה' })
      load()
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'שמירת העסקה נכשלה' })
    } finally {
      setSaving(false)
    }
  }

  /** Fetch the message, then open the agent's WhatsApp with it pre-filled. */
  const openReport = async () => {
    setReportBusy(true)
    try {
      const res = await dealsReport({ agentName, year, month })
      if (!openWhatsApp(res.recipientNumber, res.preview)) {
        setToast({ type: 'error', text: 'מספר הווצאפ של אפרת אינו תקין' })
        return
      }
      setToast({ type: 'success', text: 'ווצאפ נפתח עם ההודעה המוכנה לאפרת' })
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'לא הצלחתי להפיק את הדוח' })
    } finally {
      setReportBusy(false)
    }
  }

  const remove = async () => {
    if (!confirming) return
    try {
      await deleteDeal(confirming.id)
      setConfirming(null)
      setToast({ type: 'success', text: 'העסקה נמחקה' })
      load()
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'מחיקת העסקה נכשלה' })
      setConfirming(null)
    }
  }

  // Editing stays over the current deal list, rather than pushing the form to
  // the top of the page and making the selected deal disappear from view.
  useModalLock(!!form, () => !saving && setForm(null))

  // The 10-meeting gate counts meetings the client actually attended.
  const attendedMeetings = useMemo(
    () => meetings.filter((m) => m.status === 'attended' && m.agent_name === agentName).length,
    [meetings, agentName]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Personal pay — agents only, and never inside the exported report. */}
      {!isManager && !loading && !error && deals.length > 0 && (
        <DealsBonusCard
          deals={deals}
          attendedMeetings={attendedMeetings}
          monthLabel={monthLabel}
        />
      )}

      {/* Month totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card flex items-center gap-4 p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <Wallet className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-500">סך העסקאות החודש</p>
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">
              {shekel.format(total)}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Handshake className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-500">מספר עסקאות</p>
            <p className="text-2xl font-extrabold tabular-nums text-slate-900">{deals.length}</p>
          </div>
        </div>
      </div>

      {/* Add + send — the manager reads the numbers, agents enter their own. */}
      {!isManager && !form && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={openNew} className="btn-gradient flex-1 justify-center !py-3">
            <Plus className="h-4 w-4" aria-hidden="true" />
            הוספת עסקה
          </button>
          <button
            onClick={openReport}
            disabled={deals.length === 0 || reportBusy}
            title={
              deals.length === 0
                ? 'אין עסקאות לשלוח בחודש זה'
                : 'שליחת פירוט העסקאות לאפרת בווצאפ'
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-green-700 hover:shadow-md hover:shadow-green-900/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-56"
          >
            {reportBusy ? (
              <Spinner />
            ) : (
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            )}
            פתיחה בווצאפ לאפרת
          </button>
        </div>
      )}

      {/* Form */}
      {form && createPortal(
        <div
          className="fixed inset-0 z-50 flex bg-white animate-fade-in sm:items-center sm:justify-center sm:bg-slate-950/40 sm:p-5 sm:backdrop-blur-sm"
          onClick={() => !saving && setForm(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="deal-form-title"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="card flex h-[100dvh] min-h-0 w-full max-w-2xl flex-col overflow-hidden !rounded-none !border-0 !shadow-none animate-slide-up sm:h-auto sm:max-h-[88vh] sm:!rounded-3xl sm:!border sm:shadow-2xl sm:animate-scale-in"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pt-4">
              <div>
                <h3 id="deal-form-title" className="font-extrabold text-slate-900">
                  {form.id ? 'עריכת עסקה' : 'עסקה חדשה'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {form.id ? 'עדכנו את הפרטים ושמרו את השינויים' : 'מלאו את פרטי העסקה החדשה'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm(null)}
                disabled={saving}
                className="btn-ghost -me-2 -mt-1 !px-2"
                aria-label="סגירה"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <div>
            <label htmlFor="deal-meeting" className="mb-1.5 block text-sm font-bold text-slate-700">
              מאיזו פגישה?
            </label>
            <select
              id="deal-meeting"
              value={form.meetingId}
              onChange={(e) => setForm({ ...form, meetingId: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            >
              <option value="">— ללא שיוך לפגישה —</option>
              {linkable.map((m) => (
                <option key={m.id} value={m.id}>
                  {meetingLabel(m)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              מוצגות פגישות החודש הנבחר. אפשר גם להשאיר ללא שיוך.
            </p>
          </div>

          <div>
            <span className="mb-2 block text-sm font-bold text-slate-700">סוג העסקה</span>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => {
                const active = form.kind === k.key
                return (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setForm({ ...form, kind: k.key })}
                    className={`rounded-xl border px-3 py-2.5 text-center transition active:scale-95 ${
                      active
                        ? 'border-transparent bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="block text-sm font-bold">{k.label}</span>
                    <span
                      className={`block text-[10px] ${active ? 'text-slate-300' : 'text-slate-400'}`}
                    >
                      {k.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="deal-amount" className="mb-1.5 block text-sm font-bold text-slate-700">
                סכום המכירה (₪)
              </label>
              <input
                id="deal-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm tabular-nums outline-none transition focus:border-slate-400 focus:bg-white"
              />
              <p className="mt-1 text-xs text-slate-400">מחיר העסקה המלא</p>
            </div>
            <div>
              <label
                htmlFor="deal-collected"
                className="mb-1.5 block text-sm font-bold text-slate-700"
              >
                גבייה בפועל (₪)
              </label>
              <input
                id="deal-collected"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={form.collected}
                onChange={(e) => setForm({ ...form, collected: e.target.value })}
                placeholder="טרם נגבה"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm tabular-nums outline-none transition focus:border-slate-400 focus:bg-white"
              />
              <p className="mt-1 text-xs text-slate-400">
                {form.kind === 'course'
                  ? 'לא משפיע על קורס בודד'
                  : 'קובע אם הפרויקט זכאי; הבונוס מחושב לפי מלוא סכום המכירה'}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="deal-date" className="mb-1.5 block text-sm font-bold text-slate-700">
              תאריך העסקה
            </label>
            <input
              id="deal-date"
              type="date"
              value={form.dealDate}
              onChange={(e) => setForm({ ...form, dealDate: e.target.value })}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm tabular-nums outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div>
            <label htmlFor="deal-notes" className="mb-1.5 block text-sm font-bold text-slate-700">
              הערות
            </label>
            <textarea
              id="deal-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="מה נסגר, תנאי תשלום, מה נשאר לעשות…"
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

            </div>

            <div className="flex shrink-0 gap-2 border-t border-slate-100 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
            <button type="submit" disabled={saving} className="btn-gradient flex-1 justify-center !py-3">
              {saving ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {form.id ? 'שמירת שינויים' : 'הוספת העסקה'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              disabled={saving}
              className="btn-ghost !py-3 sm:w-32"
            >
              ביטול
            </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* List */}
      {loading ? (
        <div className="card py-14">
          <Spinner label="טוען עסקאות…" />
        </div>
      ) : error ? (
        <div className="card p-4 text-sm text-red-700">{error}</div>
      ) : deals.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 text-center">
          <Handshake className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-sm text-slate-500">אין עסקאות רשומות בחודש זה</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {deals.map((d) => {
            const state = COLLECTION_STATES[collectionState(d)]
            return (
            <div key={d.id} className="flex items-start gap-3 p-4">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${state.dot}`}
                title={state.label}
              >
                <Handshake className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-lg font-extrabold tabular-nums text-slate-900">
                    {shekel.format(Number(d.amount || 0))}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${state.chip}`}
                  >
                    {d.collected === null || d.collected === undefined
                      ? state.label
                      : `נגבה ${shekel.format(Number(d.collected))}`}
                  </span>
                  {d.kind === 'course' && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                      קורס בודד
                    </span>
                  )}
                  {isManager && d.agent_name && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {d.agent_name}
                    </span>
                  )}
                  <span className="text-xs tabular-nums text-slate-400">
                    {formatDay(`${d.deal_date}T12:00:00`)}
                  </span>
                </div>
                {d.client_name && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-slate-600">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    {d.client_name}
                  </p>
                )}
                {d.notes && (
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-500">
                    {d.notes}
                  </p>
                )}
              </div>
              {!isManager && (
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(d)}
                    aria-label="עריכת העסקה"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 active:scale-95"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setConfirming(d)}
                    aria-label="מחיקת העסקה"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-red-500 transition hover:bg-red-50 active:scale-95"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            )
          })}

          {/* Four colours are meaningless without this. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-slate-50 px-4 py-3">
            {LEGEND.map((l) => (
              <span key={l.key} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${COLLECTION_STATES[l.key].dot}`}
                  aria-hidden="true"
                />
                {l.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="למחוק את העסקה?"
          message={`עסקה על סך ${shekel.format(Number(confirming.amount || 0))} תימחק לצמיתות.`}
          confirmLabel="כן, מחק"
          cancelLabel="ביטול"
          onConfirm={remove}
          onCancel={() => setConfirming(null)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
