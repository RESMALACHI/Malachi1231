import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MessageCircle,
  Send,
  Phone,
  User,
  Calendar,
  Clock,
  Check,
  Loader2,
  QrCode,
  ShieldCheck,
  LogOut,
  KeyRound,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { WA_TEMPLATES, toWaNumber, BRANCHES } from '../lib/waTemplates'
import {
  PLACEHOLDERS,
  createTemplate,
  deleteTemplate,
  listMyTemplates,
  renderBody,
  toRuntime,
  updateTemplate,
} from '../services/waCustomTemplates'
import {
  getState,
  getQr,
  saveInstance,
  sendMessage,
  logout,
  resetInstance,
  credsLookValid,
} from '../services/whatsappService'

const ERR_TEXT = {
  bad_credentials: 'הפרטים שהוזנו שגויים — ה־idInstance או ה־Token לא נכונים.',
  invalid_credentials_format: 'הפרטים לא בפורמט תקין (idInstance = מספרים, Token = אותיות/ספרות).',
  instance_reserved_for_summary:
    'ה-instance הזה שמור לסיכומי יום — כאן צריך instance אישי משלך (Green API נפרד).',
  unreachable: 'לא הצלחנו להגיע ל־Green API. בדוק חיבור אינטרנט או שהפרטים שגויים.',
  api_error: 'שגיאה מ־Green API — ככל הנראה הפרטים שגויים.',
  qr_failed: 'נכשלה יצירת ה־QR — בדוק את פרטי ה־API.',
  qr_error: 'נכשלה יצירת ה־QR.',
}
const errText = (code, detail) =>
  (ERR_TEXT[code] || 'שגיאה בחיבור.') + (detail ? ` (${detail})` : '')

const FIELD_META = {
  name: { icon: User, label: 'שם הלקוח', type: 'text', placeholder: 'לדוגמה: דני כהן' },
  date: { icon: Calendar, label: 'תאריך', type: 'date' },
  time: { icon: Clock, label: 'שעה', type: 'time' },
  // A picker, not a free-text field: the message carries a map link, and a
  // typo in a branch name would send the client to the wrong city.
  branch: { icon: MapPin, label: 'סניף', type: 'select' },
}

/* ── Header ─────────────────────────────────────────────────────── */
function Header({ right }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-500 text-white shadow-md shadow-green-600/30">
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">ווצאפ</h1>
          <p className="text-sm text-slate-500">
            חבר את הווצאפ העסקי שלך פעם אחת — ומאז ההודעות נשלחות אוטומטית.
          </p>
        </div>
      </div>
      {right}
    </div>
  )
}

/* ── 1. Setup: paste the agent's Green API credentials (one time) ─── */
function SetupCard({ onSaved, agentName }) {
  const [idInstance, setId] = useState('')
  const [apiToken, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const formatOk = credsLookValid(idInstance, apiToken)

  const save = async () => {
    if (!idInstance.trim() || !apiToken.trim()) return
    if (!formatOk) {
      setErr('פורמט שגוי: idInstance = ספרות בלבד, Token = אותיות/ספרות (15+).')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await saveInstance(agentName, idInstance.trim(), apiToken.trim())
      onSaved()
    } catch (e) {
      setErr(errText(e.message) === 'שגיאה בחיבור.' ? e.message : errText(e.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mx-auto flex max-w-lg flex-col gap-4 p-6">
      <div className="flex items-center gap-2 text-slate-800">
        <KeyRound className="h-5 w-5 text-green-600" aria-hidden="true" />
        <h2 className="text-lg font-bold">חיבור ראשוני — פעם אחת</h2>
      </div>
      <ol className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <li>
          1. היכנס ל־
          <a
            href="https://console.green-api.com"
            target="_blank"
            rel="noreferrer"
            className="mx-1 inline-flex items-center gap-1 font-semibold text-green-700 hover:underline"
          >
            console.green-api.com <ExternalLink className="h-3 w-3" />
          </a>
          וצור Instance.
        </li>
        <li>2. העתק משם את ה־<b>idInstance</b> ואת ה־<b>ApiTokenInstance</b>.</li>
        <li>3. הדבק אותם כאן — וזהו, לא תצטרך לחזור על זה.</li>
      </ol>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-700">idInstance</span>
        <input
          value={idInstance}
          onChange={(e) => setId(e.target.value)}
          placeholder="1101800000"
          dir="ltr"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-green-400 focus:bg-white"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-700">ApiTokenInstance</span>
        <input
          value={apiToken}
          onChange={(e) => setToken(e.target.value)}
          placeholder="a1b2c3d4..."
          dir="ltr"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-green-400 focus:bg-white"
        />
      </label>
      {err && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {err}
        </p>
      )}
      <button
        onClick={save}
        disabled={busy || !formatOk}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-green-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        המשך לחיבור
      </button>
      {!formatOk && (idInstance.trim() || apiToken.trim()) && (
        <p className="text-center text-xs text-amber-600">
          idInstance צריך להיות ספרות בלבד, ו־Token אותיות/ספרות (לפחות 15 תווים).
        </p>
      )}
    </div>
  )
}

/* ── 2. Connect: show the QR to scan (or a clear error) ───────────── */
function ConnectCard({ agentName, onConnected, onReset }) {
  const [qr, setQr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failMsg, setFailMsg] = useState('') // set → stop polling, show error screen
  const alive = useRef(true)
  const timer = useRef(null)
  const fails = useRef(0)

  const stop = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  const poll = useCallback(async () => {
    try {
      const res = await getQr(agentName)
      if (!alive.current) return
      if (res.state === 'authorized') {
        stop()
        onConnected()
        return
      }
      if (res.state === 'error' || res.configured === false) {
        stop()
        setFailMsg(errText(res.error, res.detail))
        return
      }
      fails.current = 0
      setQr(res.qr || null)
    } catch (e) {
      if (!alive.current) return
      // A couple of transient failures are tolerated; then surface the error.
      fails.current += 1
      if (fails.current >= 2) {
        stop()
        setFailMsg(e.message || 'שגיאה בחיבור.')
      }
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [agentName, onConnected])

  useEffect(() => {
    alive.current = true
    fails.current = 0
    poll()
    timer.current = setInterval(poll, 5000) // QR rotates ~every 20s
    return () => {
      alive.current = false
      stop()
    }
  }, [poll])

  // ── Error screen ──
  if (failMsg) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold text-slate-900">שגיאה בחיבור</h2>
        <p className="text-sm text-slate-500">{failMsg}</p>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-95"
        >
          <KeyRound className="h-4 w-4" /> הזן פרטי API מחדש
        </button>
      </div>
    )
  }

  // ── QR screen ──
  return (
    <div className="card mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      <div className="flex items-center gap-2 text-slate-800">
        <QrCode className="h-5 w-5 text-green-600" aria-hidden="true" />
        <h2 className="text-lg font-bold">סרוק כדי להתחבר</h2>
      </div>
      <p className="text-sm text-slate-500">
        פתח ווצאפ בטלפון ← <b>מכשירים מקושרים</b> ← <b>קישור מכשיר</b> ← וסרוק:
      </p>

      <div className="relative flex h-64 w-64 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-2">
        {qr ? (
          <img
            src={`data:image/png;base64,${qr}`}
            alt="WhatsApp QR"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">{loading ? 'טוען QR…' : 'ממתין ל־QR…'}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <RefreshCw className="h-3.5 w-3.5" /> ה־QR מתרענן אוטומטית עד לחיבור
      </div>
      <button
        onClick={onReset}
        className="text-xs font-semibold text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
      >
        להזין פרטי API אחרים
      </button>
    </div>
  )
}

/* ── Personal template editor ─────────────────────────────────────── */

/**
 * Write your own template, with live preview.
 *
 * Placeholders are Hebrew words in braces, inserted by buttons so nobody has
 * to memorize them. The preview renders with sample values the whole time —
 * "playing with it" is the point, and a preview that only appears after
 * saving isn't playing.
 */
function TemplateEditor({ agentName, editing, setEditing, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const bodyRef = useRef(null)

  const set = (patch) => setEditing((e) => ({ ...e, ...patch }))

  const insert = (token) => {
    const el = bodyRef.current
    const body = editing.body || ''
    if (!el) return set({ body: body + token })
    const at = el.selectionStart ?? body.length
    set({ body: body.slice(0, at) + token + body.slice(el.selectionEnd ?? at) })
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = at + token.length
    })
  }

  const preview = renderBody(editing.body, {
    name: 'דני',
    date: new Date().toISOString().slice(0, 10),
    time: '16:00',
    branch: 'ramat-gan',
    agent: String(agentName || '').trim().split(/\s+/)[0],
  })

  const save = async () => {
    const title = String(editing.title || '').trim()
    const body = String(editing.body || '').trim()
    if (!title) return setErr('צריך שם לתבנית')
    if (!body) return setErr('ההודעה ריקה')
    setBusy(true)
    setErr('')
    try {
      let row = null
      if (editing.id) await updateTemplate(editing.id, { title, body })
      else row = await createTemplate(agentName, { title, body })
      onSaved(row)
    } catch (e) {
      setErr(e?.message || 'השמירה נכשלה')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-green-200 bg-green-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-800">
          {editing.id ? 'עריכת תבנית' : 'תבנית אישית חדשה'}
        </span>
        <button
          onClick={() => setEditing(null)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
          aria-label="סגירת העורך"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <input
        value={editing.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="שם התבנית (לדוגמה: אישור הגעה שלי)"
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-green-400"
      />

      <textarea
        ref={bodyRef}
        value={editing.body}
        onChange={(e) => set({ body: e.target.value })}
        rows={6}
        dir="rtl"
        placeholder={'היי {שם}, מחכה לך ב{סניף} ב-{תאריך} בשעה {שעה} 🙂'}
        className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-green-400"
      />

      <div className="flex flex-wrap gap-1">
        {PLACEHOLDERS.map((p) => (
          <button
            key={p.token}
            onClick={() => insert(p.token)}
            title={p.label}
            className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] font-bold text-green-800 ring-1 ring-green-200 transition hover:bg-green-100 active:scale-95"
          >
            {p.token}
          </button>
        ))}
      </div>

      {preview && (
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <p className="mb-1 text-[10px] font-bold tracking-wide text-slate-400">
            תצוגה מקדימה (עם ערכי דוגמה)
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{preview}</p>
        </div>
      )}

      {err && <p className="text-sm font-semibold text-red-600">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 rounded-xl bg-green-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 active:scale-95 disabled:opacity-50"
        >
          {busy ? 'שומר…' : 'שמירה'}
        </button>
      </div>
    </div>
  )
}


/* ── 3. Connected: the sending interface (automatic) ──────────────── */
function SenderInterface({ agentName, onDisconnect }) {
  const [activeKey, setActiveKey] = useState(WA_TEMPLATES[0].key)
  const [phone, setPhone] = useState('')
  const [values, setValues] = useState({})
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null) // {ok, text}

  // This agent's own templates. Only someone whose WhatsApp is connected ever
  // reaches this component, which is exactly the rule: connected → may create.
  const [mine, setMine] = useState([])
  const [editing, setEditing] = useState(null) // null | {id?, title, body}
  const loadMine = useCallback(
    () => listMyTemplates(agentName).then(setMine).catch(() => {}),
    [agentName]
  )
  useEffect(() => {
    loadMine()
  }, [loadMine])

  const templates = useMemo(() => [...WA_TEMPLATES, ...mine.map(toRuntime)], [mine])
  const template = useMemo(
    () => templates.find((t) => t.key === activeKey) || templates[0],
    [activeKey, templates]
  )

  // The signed-in agent is folded in so a template can introduce its sender.
  // Values the agent typed still win, so nothing here overrides a filled field.
  useEffect(
    () =>
      setMessage(
        template.build({ agent: String(agentName || '').trim().split(/\s+/)[0], ...values })
      ),
    [template, values, agentName]
  )
  useEffect(() => setValues({}), [activeKey])

  const waNumber = toWaNumber(phone)
  const canSend = waNumber.length >= 11 && message.trim().length > 0 && !sending
  const setField = (k, v) => setValues((p) => ({ ...p, [k]: v }))

  const send = async () => {
    if (!canSend) return
    setSending(true)
    setToast(null)
    try {
      await sendMessage(agentName, phone, message)
      setToast({ ok: true, text: 'נשלח בהצלחה ✅' })
      setPhone('')
      setValues({})
    } catch (e) {
      setToast({ ok: false, text: e.message || 'שליחה נכשלה' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Connected banner */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold text-green-800">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          הווצאפ שלך מחובר — ההודעות יישלחו אוטומטית מהמספר שלך
        </span>
        <button
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-green-800 transition hover:bg-green-100 active:scale-95"
        >
          <LogOut className="h-3.5 w-3.5" /> נתק
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Template picker */}
        <div className="flex flex-col gap-2">
          <p className="px-1 text-xs font-bold tracking-wide text-slate-400">בחר תבנית</p>
          {templates.map((t) => {
            const active = t.key === activeKey
            return (
              <div
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setActiveKey(t.key)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-2xl border p-3.5 text-right transition active:scale-[0.98] ${
                  active
                    ? 'border-green-500 bg-green-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-bold text-slate-800">{t.title}</span>
                  <span className="block truncate text-xs text-slate-500">{t.hint}</span>
                </span>
                {t.mine ? (
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const row = mine.find((r) => r.id === t.id)
                        if (row) setEditing({ id: row.id, title: row.title, body: row.body })
                      }}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
                      aria-label={`עריכת ${t.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await deleteTemplate(t.id).catch(() => {})
                        if (activeKey === t.key) setActiveKey(WA_TEMPLATES[0].key)
                        loadMine()
                      }}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`מחיקת ${t.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  active && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )
                )}
              </div>
            )
          })}

          {editing ? (
            <TemplateEditor
              agentName={agentName}
              editing={editing}
              setEditing={setEditing}
              onSaved={(row) => {
                setEditing(null)
                loadMine()
                if (row) setActiveKey(`mine-${row.id}`)
              }}
            />
          ) : (
            <button
              onClick={() => setEditing({ title: '', body: '' })}
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 p-3 text-sm font-bold text-slate-500 transition hover:border-green-400 hover:text-green-700"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              תבנית אישית חדשה
            </button>
          )}
        </div>

        {/* Form + send */}
        <div className="card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold text-slate-900">{template.title}</h2>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
              מספר הלקוח
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="050-0000000"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-green-400 focus:bg-white"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {template.fields.map((f) => {
              const meta = FIELD_META[f]
              if (!meta) return null
              const Icon = meta.icon
              return (
                <label key={f} className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    {meta.label}
                  </span>
                  {meta.type === 'select' ? (
                    <select
                      value={values[f] || ''}
                      onChange={(e) => setField(f, e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-green-400 focus:bg-white"
                    >
                      <option value="">זום / לא רלוונטי</option>
                      {BRANCHES.map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={meta.type}
                      value={values[f] || ''}
                      onChange={(e) => setField(f, e.target.value)}
                      placeholder={meta.placeholder}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-green-400 focus:bg-white"
                    />
                  )}
                </label>
              )
            })}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">ההודעה שתישלח</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              dir="rtl"
              className="resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-green-400 focus:bg-white"
            />
          </label>

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
            {sending ? 'שולח…' : 'שלח אוטומטית'}
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
          {!sending && phone && waNumber.length < 11 && (
            <p className="text-center text-xs text-amber-600">מספר טלפון לא תקין</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Orchestrator ─────────────────────────────────────────────────── */
export default function WhatsAppPage() {
  const { selectedAgent } = useAuth()
  const agentName = selectedAgent
  // phase: 'loading' | 'setup' | 'connect' | 'ready'
  const [phase, setPhase] = useState('loading')

  const refresh = useCallback(async () => {
    try {
      const res = await getState(agentName)
      if (res.configured === false) setPhase('setup')
      else if (res.state === 'authorized') setPhase('ready')
      else setPhase('connect')
    } catch {
      setPhase('setup')
    }
  }, [agentName])

  useEffect(() => {
    setPhase('loading')
    refresh()
  }, [refresh])

  const disconnect = async () => {
    try {
      await logout(agentName)
    } catch {
      /* ignore */
    }
    setPhase('connect')
  }

  // Forget the stored credentials and go back to the setup form.
  const resetCreds = async () => {
    try {
      await resetInstance(agentName)
    } catch {
      /* ignore */
    }
    setPhase('setup')
  }

  return (
    <div className="flex flex-col gap-5">
      <Header />
      {phase === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" /> טוען…
        </div>
      )}
      {phase === 'setup' && <SetupCard agentName={agentName} onSaved={() => setPhase('connect')} />}
      {phase === 'connect' && (
        <ConnectCard
          agentName={agentName}
          onConnected={() => setPhase('ready')}
          onReset={resetCreds}
        />
      )}
      {phase === 'ready' && (
        <SenderInterface agentName={agentName} onDisconnect={disconnect} />
      )}
    </div>
  )
}
