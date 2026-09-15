import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Wallet, X, TrendingUp, AlertTriangle, Lock, Handshake, GraduationCap, Plus, Loader2 } from 'lucide-react'
import {
  calcDealBonus,
  MIN_MEETINGS,
  QUALIFY_FULL,
  QUALIFY_PARTIAL,
  PARTIAL_ALLOWANCE,
  COURSE_MAX,
} from '../lib/dealsBonus'
import { formatIls } from '../lib/bonus'
import { useModalLock } from '../lib/useModalLock'

const pct = (n) => `${(n * 100).toFixed((n * 100) % 1 === 0 ? 0 : 1)}%`
const ils = (n) => `${Math.round(n).toLocaleString('he-IL')}`

const REJECT_REASON = {
  missing_collection: 'לא נרשמה גבייה',
  partial_allowance_used: `מעבר ל-${PARTIAL_ALLOWANCE} עסקאות חלקיות`,
  below_minimum: `גבייה מתחת ל-${QUALIFY_PARTIAL.toLocaleString('he-IL')} ₪`,
}

/** Compact stat tile — count on top, the money under it. */
function Stat({ icon: Icon, label, count, sum, tone }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold leading-none tabular-nums text-slate-900">
        {count}
      </p>
      <p className="mt-1 text-xs font-semibold tabular-nums text-slate-500">{sum}</p>
    </div>
  )
}

/** One thin notice line — icon + short text, no box-in-box padding. */
function Note({ icon: Icon, tone, children }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed ${tone}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

/**
 * Adding money to the month by hand: a sum and the reason for it. The reason
 * is required — it goes to accounting beside the sum, in the deals report.
 */
function AddAdditionRow({ onSave, onCancel }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const n = Number(String(amount).replace(/[,\s₪]/g, ''))
    if (!Number.isFinite(n) || n <= 0) return setErr('הסכום צריך להיות מספר חיובי')
    if (n > 100000) return setErr('סכום גבוה מדי')
    if (note.trim().length < 2) return setErr('כתבו בהערה על מה התוספת')
    setErr('')
    setSaving(true)
    try {
      await onSave({ amount: n, note: note.trim() })
    } catch (e2) {
      setErr(e2.message || 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 bg-green-50/60 px-4 py-3">
      <div className="flex gap-2">
        <input
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="סכום ₪"
          aria-label="סכום התוספת"
          className="w-28 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold tabular-nums outline-none focus:border-green-500"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="הערה — על מה התוספת?"
          aria-label="הערה לתוספת"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-green-500"
        />
      </div>
      {err && <p className="text-xs font-bold text-red-600">{err}</p>}
      <p className="text-[10px] leading-snug text-slate-500">
        נכנס לסה״כ הבונוס (בתנאי {MIN_MEETINGS} הפגישות) ומופיע עם ההערה בדוח לאפרת.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          הוספה
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">
          ביטול
        </button>
      </div>
    </form>
  )
}

/**
 * Everything is sized to fit one phone screen WITHOUT scrolling — that is the
 * design constraint this whole layout answers, so keep additions on a strict
 * budget: every new row here must earn its height.
 */
function DetailsModal({ b, monthLabel, onClose, onAdd, onRemove }) {
  useModalLock(true, onClose)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null) // addition id awaiting "כן"

  const coursesSales = b.courseLines.reduce((s, c) => s + Number(c.deal.amount || 0), 0)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl animate-slide-up sm:rounded-2xl sm:animate-scale-in"
      >
        {/* Slim header */}
        <div className="relative flex items-center justify-between rounded-t-3xl bg-gradient-to-br from-green-600 to-emerald-500 px-5 py-4 text-white sm:rounded-t-2xl">
          <div>
            <p className="text-[11px] font-bold opacity-80">בונוס עסקאות · {monthLabel}</p>
            <p className="mt-0.5 text-3xl font-extrabold tabular-nums leading-none">
              {formatIls(b.total)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 transition hover:bg-black/10"
            aria-label="סגירה"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {/* What counted — two tiles instead of four stacked rows */}
          <div className={`grid gap-2 ${b.courseLines.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Stat
              icon={Handshake}
              label="פרוייקטים מזכים"
              count={b.qualified.length}
              sum={`${ils(b.qualifiedSales)} ₪ מכירות`}
              tone="border-green-100 bg-green-50/60"
            />
            {b.courseLines.length > 0 && (
              <Stat
                icon={GraduationCap}
                label="קורסים בודדים"
                count={b.courseLines.length}
                sum={`${ils(coursesSales)} ₪`}
                tone="border-sky-100 bg-sky-50/60"
              />
            )}
          </div>
          <p className="px-1 text-[11px] leading-snug text-slate-400">
            הגבייה קובעת זכאות; לאחר הזכאות מלוא סכום המכירה נכנס לחישוב. פרוייקט זכאי מגבייה
            של {ils(QUALIFY_FULL)} ₪; בין {ils(QUALIFY_PARTIAL)} ל-{ils(QUALIFY_FULL)} — עד{' '}
            {PARTIAL_ALLOWANCE} בחודש. קורס בודד מתוגמל בנפרד (2% עד {ils(COURSE_MAX)} ₪).
          </p>

          {/* Deals that fell out — one line each */}
          {b.rejected.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-3 py-2">
              {b.rejected.map((r, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between gap-2 py-0.5 text-[11px] text-amber-800"
                >
                  <span className="truncate">{r.deal.client_name || 'ללא שם'}</span>
                  <span className="shrink-0 font-semibold">{REJECT_REASON[r.reason]}</span>
                </div>
              ))}
            </div>
          )}

          {/* The payslip */}
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
              <span className="text-[11px] font-bold tracking-wide text-slate-400">החישוב</span>
              {onAdd && !adding && (
                <button
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-bold text-green-700 transition hover:bg-green-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  הוספת סכום לבונוס
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-600">
                  מדרגת עמלה על מכירות מזכות
                  {b.bracket && (
                    <span className="ms-1.5 rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                      {pct(b.bracket.rate)}
                    </span>
                  )}
                </span>
                <span className="font-bold tabular-nums text-slate-900">
                  {b.bracket ? formatIls(b.salesBonus) : '—'}
                </span>
              </div>

              {b.courseLines.map((c, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-slate-600">
                    {c.deal.client_name || 'קורס בודד'}
                    <span
                      className={`ms-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        c.eligible ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {c.eligible ? '2%' : 'לא זכאי'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      c.eligible ? 'font-bold text-slate-900' : 'font-medium text-slate-300'
                    }`}
                  >
                    {formatIls(c.bonus)}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className={b.collectionUnlocked ? 'text-slate-600' : 'text-slate-400'}>
                  בונוס גבייה
                  {b.collectionUnlocked ? (
                    <span className="ms-1.5 rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                      {pct(b.collectionRate)}
                    </span>
                  ) : (
                    <Lock className="ms-1.5 inline h-3 w-3 text-slate-300" aria-hidden="true" />
                  )}
                  {/* The fraction itself. An agent querying their pay should be
                      able to check the number without asking anyone. */}
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-400" dir="ltr">
                    {formatIls(b.collectionCollected)} / {formatIls(b.collectionBase)}
                  </span>
                </span>
                <span
                  className={`tabular-nums ${
                    b.collectionUnlocked
                      ? 'font-bold text-slate-900'
                      : 'font-medium text-slate-300'
                  }`}
                >
                  {b.collectionUnlocked ? formatIls(b.collectionBonus) : '—'}
                </span>
              </div>

              {/* Money added by hand — each with the reason it was added. */}
              {b.additionLines.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0 text-slate-600">
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      תוספת
                    </span>
                    <span className="mt-0.5 block whitespace-pre-line break-words text-xs text-slate-500">{a.note}</span>
                  </span>
                  {removing === a.id ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold">
                      <span className="text-slate-500">למחוק?</span>
                      <button
                        onClick={async () => {
                          setRemoving(null)
                          await onRemove(a.id)
                        }}
                        className="rounded-md bg-red-600 px-2 py-0.5 text-white hover:bg-red-700"
                      >
                        כן
                      </button>
                      <button onClick={() => setRemoving(null)} className="rounded-md px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">
                        לא
                      </button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="font-bold tabular-nums text-slate-900">{formatIls(a.amount)}</span>
                      {onRemove && (
                        <button
                          onClick={() => setRemoving(a.id)}
                          aria-label="מחיקת התוספת"
                          title="מחיקת התוספת"
                          className="rounded-md p-0.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              ))}

              {adding && <AddAdditionRow onCancel={() => setAdding(false)} onSave={async (v) => (await onAdd(v)) && setAdding(false)} />}
            </div>

            {/* Total — the one number the whole dialog exists for */}
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
              <span className="text-sm font-bold text-white">סה״כ</span>
              <span className="text-2xl font-extrabold tabular-nums text-green-400">
                {formatIls(b.total)}
              </span>
            </div>
          </div>

          {/* Compact notices — only the ones that apply */}
          {!b.meetingsOk && (
            <Note icon={AlertTriangle} tone="bg-red-50 text-red-800">
              מותנה ב-{MIN_MEETINGS} פגישות בחודש — יש {b.attendedMeetings}, אז משולם 0 ₪ (לפני
              התנאי: {formatIls(b.gross)}).
            </Note>
          )}
          {b.missingCollection.length > 0 && (
            <Note icon={AlertTriangle} tone="bg-amber-50 text-amber-800">
              ב-{b.missingCollection.length} עסקאות לא נרשמה גבייה — הן לא נספרות עד שתמלאו אותה.
            </Note>
          )}
          {!b.collectionUnlocked && b.toCollectionUnlock > 0 && (
            <Note icon={Lock} tone="bg-slate-50 text-slate-600">
              בונוס הגבייה נפתח מ-100,000 ₪ בפרויקטים מזכים וקורסים בודדים — חסרים{' '}
              <b>{formatIls(b.toCollectionUnlock)}</b>.
            </Note>
          )}
          {b.nextBracket && b.nextGain > 0 && (
            <Note icon={TrendingUp} tone="bg-green-50 text-green-800">
              עוד <b>{formatIls(b.toNextSales)}</b> במכירות מזכות והעמלה עולה ל-
              <b>{pct(b.nextBracket.rate)}</b> — שווה <b>{formatIls(b.nextGain)}</b> נוספים.
            </Note>
          )}

          <p className="text-center text-[10px] text-slate-400">
            לפי הטבלה: בונוס עסקאות <b>או</b> בונוס פגישות בחודש — לא שניהם.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Green "what did the deals earn" card, mirroring the gold meeting-bonus one.
 * `onAdd` / `onRemove` handle the month's additions by hand; onAdd resolves
 * truthy once saved.
 */
export default function DealsBonusCard({ deals, attendedMeetings, monthLabel, additions = [], onAdd, onRemove }) {
  const [open, setOpen] = useState(false)
  const b = useMemo(
    () => calcDealBonus(deals, attendedMeetings, additions),
    [deals, attendedMeetings, additions]
  )
  const warn = b.missingCollection.length > 0 || !b.meetingsOk

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-l from-green-600 via-green-500 to-emerald-400 p-5 text-right shadow-lg shadow-green-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99]"
      >
        <span
          className="pointer-events-none absolute -end-8 -top-10 h-32 w-32 rounded-full bg-white/25 blur-2xl"
          aria-hidden="true"
        />
        <span className="relative flex items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900/90 text-green-300 shadow-md transition-transform duration-200 group-hover:scale-105">
              <Wallet className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="flex flex-col text-start">
              <span className="text-sm font-bold text-white/80">בונוס עסקאות · {monthLabel}</span>
              <span className="text-3xl font-extrabold tabular-nums leading-tight text-white">
                {formatIls(b.total)}
              </span>
              {b.additionsTotal > 0 && (
                <span className="text-[11px] font-semibold text-white/85">כולל תוספות {formatIls(b.additionsTotal)}</span>
              )}
            </span>
          </span>
          <span className="hidden shrink-0 rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-bold text-white sm:block">
            לפירוט החישוב
          </span>
        </span>
        {warn && (
          <span className="relative mt-3 flex items-center gap-1.5 rounded-lg bg-slate-900/85 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {!b.meetingsOk
              ? `חסרות פגישות — הבונוס מותנה ב-${MIN_MEETINGS} בחודש`
              : `${b.missingCollection.length} עסקאות ללא גבייה רשומה`}
          </span>
        )}
      </button>

      {open && (
        <DetailsModal b={b} monthLabel={monthLabel} onClose={() => setOpen(false)} onAdd={onAdd} onRemove={onRemove} />
      )}
    </>
  )
}
