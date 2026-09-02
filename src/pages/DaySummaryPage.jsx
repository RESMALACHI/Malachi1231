import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck,
  Phone,
  PhoneCall,
  Clock,
  StickyNote,
  Send,
  Loader2,
  CalendarCheck,
  RefreshCw,
  AlertTriangle,
  QrCode,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdminAgent, managerViewOnly } from '../lib/agents'
import { getMeetingsBookedToday } from '../services/meetingsService'
import {
  getSummaryState,
  getSummaryQr,
  sendSummary,
} from '../services/whatsappService'
import { saveDaySummary, getMyDaySummary, localDateKey } from '../services/daySummaryService'

// Where the daily summary goes — the "נבחרת החלומות" WhatsApp group.
const RECIPIENT = '972504573304-1549874088@g.us'
const RECIPIENT_LABEL = 'נבחרת החלומות'

// Every summary carries this stamp, whatever the agent edits above it.
const STAMP_TEXT = 'נשלח ממערכת הפגישות של RES'
const STAMP = `_${STAMP_TEXT}_`

/** One-time QR to link the shared summary WhatsApp. Admin-only. */
function SharedQrCard({ onConnected }) {
  const [qr, setQr] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    let timer = null
    const poll = async () => {
      try {
        const res = await getSummaryQr()
        if (!alive) return
        if (res.state === 'authorized') {
          clearInterval(timer)
          onConnected()
          return
        }
        if (res.state === 'error') {
          clearInterval(timer)
          setErr('שגיאה בחיבור — בדוק את פרטי ה-API של ווצאפ הסיכומים.')
          return
        }
        setQr(res.qr || null)
      } catch (e) {
        if (alive) setErr(e.message || 'שגיאה בטעינת ה-QR')
      }
    }
    poll()
    timer = setInterval(poll, 5000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [onConnected])

  return (
    <div className="card mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
      <div className="flex items-center gap-2 text-slate-800">
        <QrCode className="h-5 w-5 text-green-600" aria-hidden="true" />
        <h2 className="text-lg font-bold">חיבור ווצאפ הסיכומים</h2>
      </div>
      <p className="text-sm text-slate-500">
        סריקה חד-פעמית — ממנה כל הסוכנים ישלחו את הסיכום היומי.
        <br />
        ווצאפ בטלפון ← <b>מכשירים מקושרים</b> ← <b>קישור מכשיר</b>
      </p>
      <div className="flex h-60 w-60 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-2">
        {qr ? (
          <img
            src={`data:image/png;base64,${qr}`}
            alt="WhatsApp QR"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">{err || 'טוען QR…'}</span>
          </div>
        )}
      </div>
      {err && qr && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

const pad = (n) => String(n).padStart(2, '0')
const todayLabel = () => {
  const d = new Date()
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function buildMessage({
  agentName,
  booked,
  frontal,
  zoom,
  unknown,
  calls,
  longCalls,
  followupsIn,
  followupsOut,
  from,
  to,
  notes,
}) {
  const n = (v) => Number(v) || 0

  // A zero is left out rather than reported — except the two below, where the
  // zero is itself the answer the manager is looking for.
  const lines = [
    `📋 *סיכום יום — ${agentName}*`,
    `📅 ${todayLabel()}`,
    '',
    `🤝 פגישות שתואמו היום: ${booked}`, // always shown, "0" included
  ]
  if (frontal > 0) lines.push(`      🏢 פרונטלי: ${frontal}`)
  if (zoom > 0) lines.push(`      💻 זום: ${zoom}`)
  if (unknown > 0) lines.push(`      ❔ לא ידוע: ${unknown}`)

  // The long-call count rides on the same line rather than adding one: it is a
  // subset of the number beside it, and a separate line reads as a separate
  // total. Shown only when it was actually filled in — see long_calls in the
  // schema, where NULL means "not reported" and 0 means "none were long".
  if (n(calls) > 0) {
    const long = longCalls === '' || longCalls === null ? null : n(longCalls)
    lines.push(long === null ? `📞 שיחות: ${n(calls)}` : `📞 שיחות: ${n(calls)}  ·  מעל 4 דק׳: ${long}`)
  }

  // Follow-ups always report — as a sentence when there were none.
  lines.push(
    n(followupsIn) > 0 ? `📥 פולואפ שקיבלתי: ${n(followupsIn)}` : '📥 לא קיבלתי פולואפ',
    n(followupsOut) > 0 ? `📤 פולואפ שהעברתי: ${n(followupsOut)}` : '📤 לא העברתי פולואפ'
  )

  if (from || to) lines.push(`⏰ שעות עבודה: ${from || '—'} - ${to || '—'}`)
  if (notes.trim()) lines.push('', `📝 הערות:`, notes.trim())
  lines.push('', STAMP)
  return lines.join('\n')
}

export default function DaySummaryPage() {
  const { selectedAgent: agentName } = useAuth()
  const isManager = managerViewOnly(agentName) // איציק doesn't file a day summary

  const [rows, setRows] = useState(null) // null = loading
  const [reloading, setReloading] = useState(false)
  const [calls, setCalls] = useState('')
  const [longCalls, setLongCalls] = useState('')
  const [followupsIn, setFollowupsIn] = useState('')
  const [followupsOut, setFollowupsOut] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [waState, setWaState] = useState(null) // 'authorized' | other
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)

  // Which meetings this agent booked today (from the calendar sync).
  const loadBooked = useCallback(async () => {
    if (isManager) return
    setReloading(true)
    try {
      setRows(await getMeetingsBookedToday(agentName))
    } catch {
      setRows([])
    } finally {
      setReloading(false)
    }
  }, [agentName, isManager])

  const booked = rows?.length ?? 0
  const zoom = rows?.filter((r) => r.type === 'zoom').length ?? 0
  const frontal = rows?.filter((r) => r.type === 'frontal').length ?? 0
  const unknown = booked - zoom - frontal // the calendar didn't say

  // The summary always goes out through the shared company WhatsApp — not the
  // agent's own instance — so every agent sends from the same number.
  useEffect(() => {
    if (isManager) return
    setRows(null)
    loadBooked()
    getSummaryState()
      .then((r) => setWaState(r.configured === false ? 'missing' : r.state))
      .catch(() => setWaState('missing'))
  }, [agentName, loadBooked, isManager])

  // Anything already filed for today wins over an empty form. The extension's
  // call counter writes calls/long_calls straight into this row from BMBY, and
  // an agent who opens this page afterwards must see those numbers rather than
  // send blanks over them. Only fills fields the agent has not touched.
  useEffect(() => {
    if (isManager) return
    let alive = true
    getMyDaySummary(agentName, localDateKey())
      .then((row) => {
        if (!alive || !row) return
        const put = (value, setter) => {
          if (value === null || value === undefined) return
          setter((cur) => (cur === '' ? String(value) : cur))
        }
        put(row.calls, setCalls)
        put(row.long_calls, setLongCalls)
        put(row.followups_in, setFollowupsIn)
        put(row.followups_out, setFollowupsOut)
        if (row.work_from) setFrom((c) => c || row.work_from)
        if (row.work_to) setTo((c) => c || row.work_to)
        if (row.notes) setNotes((c) => c || row.notes)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [agentName, isManager])

  // Keep the (editable) message in sync with the fields.
  useEffect(() => {
    setMessage(
      buildMessage({
        agentName,
        booked,
        frontal,
        zoom,
        unknown,
        calls,
        longCalls,
        followupsIn,
        followupsOut,
        from,
        to,
        notes,
      })
    )
  }, [
    agentName,
    booked,
    frontal,
    zoom,
    unknown,
    calls,
    longCalls,
    followupsIn,
    followupsOut,
    from,
    to,
    notes,
  ])

  const connected = waState === 'authorized'
  const isAdmin = isAdminAgent(agentName) // only מלאכי links the shared WhatsApp
  const canSend = connected && message.trim().length > 0 && !sending

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setToast(null)
    try {
      // The stamp is non-negotiable — re-attach it if it was edited away.
      const body = message.includes(STAMP_TEXT)
        ? message
        : `${message.trimEnd()}\n\n${STAMP}`
      await sendSummary(RECIPIENT, body)
      // Record what was reported so the manager's daily view has it — the
      // WhatsApp message alone leaves no trace.
      try {
        await saveDaySummary({
          agent_name: agentName,
          summary_date: localDateKey(),
          meetings_booked: booked,
          frontal,
          zoom,
          unknown,
          calls: Number(calls) || 0,
          long_calls: longCalls === '' ? null : Number(longCalls) || 0,
          followups_in: Number(followupsIn) || 0,
          followups_out: Number(followupsOut) || 0,
          work_from: from || null,
          work_to: to || null,
          notes: notes.trim() || null,
        })
      } catch {
        /* the summary went out; don't fail the send over the bookkeeping */
      }
      setToast({ ok: true, text: 'הסיכום נשלח בהצלחה ✅' })
    } catch (e) {
      setToast({ ok: false, text: e.message || 'השליחה נכשלה' })
    } finally {
      setSending(false)
    }
  }

  const field =
    'rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:bg-white'

  const notConnected = useMemo(
    () =>
      !connected &&
      waState !== null && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <span className="text-sm font-semibold text-amber-800">
            {isAdmin
              ? 'ווצאפ הסיכומים אינו מחובר — סרוק את ה-QR שמתחת כדי לחבר אותו.'
              : 'ווצאפ הסיכומים אינו מחובר כרגע — פנה למנהל המערכת.'}
          </span>
        </div>
      ),
    [connected, waState, isAdmin]
  )

  // The manager (איציק) has no day summary — bounce home. Placed after the
  // hooks above so the hook order stays stable.
  if (isManager) return <Navigate to="/" replace />

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
          <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">סיכום יום</h1>
          <p className="text-sm text-slate-500">
            דיווח יומי — נשלח בוואטסאפ לקבוצת {RECIPIENT_LABEL}.
          </p>
        </div>
      </div>

      {notConnected}

      {/* Admin links the shared summary WhatsApp once, right here. */}
      {!connected && waState !== null && isAdmin && (
        <SharedQrCard onConnected={() => setWaState('authorized')} />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Fields */}
        <div className="card flex flex-col gap-4 p-5">
          {/* Auto: meetings booked today */}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-amber-500 to-yellow-400 px-4 py-3.5 text-slate-900 shadow-md shadow-amber-500/20">
            <span className="flex items-center gap-2 text-sm font-bold">
              <CalendarCheck className="h-5 w-5" aria-hidden="true" />
              פגישות שתיאמת היום
            </span>
            <span className="flex items-center gap-2">
              <span className="text-2xl font-extrabold tabular-nums">
                {rows === null ? '—' : booked}
              </span>
              <button
                onClick={loadBooked}
                title="רענון מהיומן"
                className="rounded-lg p-1.5 transition hover:bg-black/10 active:scale-95"
              >
                <RefreshCw
                  className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </span>
          </div>

          {/* Frontal / zoom / unknown split of those meetings */}
          {booked > 0 && (
            <div className={`-mt-2 grid gap-2 ${unknown > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">🏢 פרונטלי</span>
                <span className="text-base font-extrabold tabular-nums text-slate-900">
                  {frontal}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">💻 זום</span>
                <span className="text-base font-extrabold tabular-nums text-slate-900">
                  {zoom}
                </span>
              </div>
              {unknown > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-xs font-semibold text-amber-700">❔ לא ידוע</span>
                  <span className="text-base font-extrabold tabular-nums text-amber-700">
                    {unknown}
                  </span>
                </div>
              )}
            </div>
          )}

          <p className={`text-[11px] text-slate-400 ${booked > 0 ? '' : '-mt-2'}`}>
            נספר אוטומטית לפי הפגישות שנוספו היום ליומן ומשויכות אליך.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                כמות שיחות
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={calls}
                onChange={(e) => setCalls(e.target.value)}
                placeholder="לדוגמה: 45"
                className={field}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <PhoneCall className="h-4 w-4 text-slate-400" aria-hidden="true" />
                מעל 4 דקות
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={longCalls}
                onChange={(e) => setLongCalls(e.target.value)}
                placeholder="לדוגמה: 9"
                className={field}
              />
            </label>
          </div>
          <p className="-mt-2 text-[11px] text-slate-400">
            מתוך סך השיחות — כמה מהן נמשכו יותר מארבע דקות.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <ArrowDownToLine className="h-4 w-4 text-slate-400" aria-hidden="true" />
                פולואפ שקיבלתי
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={followupsIn}
                onChange={(e) => setFollowupsIn(e.target.value)}
                placeholder="0"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <ArrowUpFromLine className="h-4 w-4 text-slate-400" aria-hidden="true" />
                פולואפ שהעברתי
              </span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={followupsOut}
                onChange={(e) => setFollowupsOut(e.target.value)}
                placeholder="0"
                className={field}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                תחילת עבודה
              </span>
              <input
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                סיום עבודה
              </span>
              <input
                type="time"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={field}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <StickyNote className="h-4 w-4 text-slate-400" aria-hidden="true" />
              הערות נוספות
            </span>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="כל דבר שחשוב לדווח על היום…"
              className={`resize-y ${field}`}
            />
          </label>
        </div>

        {/* Preview + send */}
        <div className="card flex flex-col gap-3 p-5">
          <h2 className="text-lg font-bold text-slate-900">ההודעה שתישלח</h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={14}
            dir="rtl"
            className="flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-green-400 focus:bg-white"
          />
          <span className="text-[11px] text-slate-400">
            אפשר לערוך את הטקסט לפני השליחה.
          </span>

          <button
            onClick={send}
            disabled={!canSend}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-green-900/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 -scale-x-100" aria-hidden="true" />
            )}
            {sending ? 'שולח…' : `שליחה ל${RECIPIENT_LABEL}`}
          </button>

          {toast && (
            <p
              className={`text-center text-sm font-semibold ${
                toast.ok ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {toast.text}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
