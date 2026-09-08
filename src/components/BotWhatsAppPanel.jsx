import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, MessageCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  credsLookValid,
  getSummaryState,
  saveSummaryInstance,
} from '../services/whatsappService'
import Spinner from './Spinner'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:bg-white'

const ERRORS = {
  invalid_credentials_format:
    'הפורמט לא תקין — idInstance הוא ספרות בלבד, וה־Token אותיות וספרות (15 תווים ומעלה).',
  missing_credentials: 'צריך למלא גם idInstance וגם Token.',
  bad_credentials: 'Green API דחה את הפרטים — בדוק שהעתקת את שניהם מהמופע הנכון.',
}

/**
 * The WhatsApp the BOT speaks through — one company instance, shared by
 * ".פגישה", ".היום", ".מחר", ".בוט" and the daily summary.
 *
 * Swapping it used to mean editing the whatsapp_instances row by hand, which is
 * a poor thing to be doing with an API token at the exact moment the bot is
 * already down. Opening a new Green API account is now paste-two-fields.
 */
export default function BotWhatsAppPanel() {
  const [state, setState] = useState(null)
  const [idInstance, setId] = useState('')
  const [apiToken, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const load = useCallback(async () => {
    try {
      setState(await getSummaryState())
    } catch (e) {
      setState({ configured: false, state: 'error', error: e?.message })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const formatOk = credsLookValid(idInstance, apiToken)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setDone(false)
    if (!formatOk) {
      setError(ERRORS.invalid_credentials_format)
      return
    }
    setSaving(true)
    try {
      await saveSummaryInstance(idInstance.trim(), apiToken.trim())
      setId('')
      setToken('')
      setDone(true)
      await load()
    } catch (err) {
      setError(ERRORS[err?.message] || err?.message || 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  const authorized = state?.state === 'authorized'

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Where it stands right now */}
      {state === null ? (
        <div className="py-6">
          <Spinner label="בודק חיבור…" />
        </div>
      ) : (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
            authorized ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${
              authorized ? 'bg-green-600' : 'bg-amber-500'
            }`}
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${authorized ? 'text-green-900' : 'text-amber-900'}`}>
              {authorized
                ? 'ווצאפ הבוט מחובר'
                : state.configured === false
                  ? 'לא הוגדר מופע ווצאפ לבוט'
                  : 'המופע מוגדר אבל המספר לא מקושר'}
            </p>
            <p className="text-xs leading-relaxed text-slate-600">
              דרכו יוצאות הודעות <b>.פגישה</b>, <b>.היום</b>, <b>.מחר</b>, <b>.בוט</b> וסיכום היום.
              {!authorized && ' לקישור המספר — סרקו את ה־QR בעמוד סיכום יום.'}
            </p>
          </div>
          <button onClick={load} className="btn-ghost shrink-0 px-2" aria-label="רענון">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-slate-50/80 p-3">
        <p className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            פתחתם חשבון Green API חדש? היכנסו לקונסולה של Green API, בחרו את המופע,
            והעתיקו משם את <b>idInstance</b> ואת <b>ApiTokenInstance</b>. אחרי השמירה צריך
            לסרוק QR מחדש (עמוד <b>סיכום יום</b>) ולהגדיר את כתובת ה־Webhook במופע החדש —
            אותה כתובת בדיוק שמוגדרת בישן.
          </span>
        </p>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">idInstance</label>
          <input
            value={idInstance}
            onChange={(e) => setId(e.target.value)}
            dir="ltr"
            inputMode="numeric"
            className={FIELD}
            placeholder="1101234567"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">ApiTokenInstance</label>
          <input
            value={apiToken}
            onChange={(e) => setToken(e.target.value)}
            dir="ltr"
            className={FIELD}
            placeholder="a1b2c3d4e5f6…"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        {done && (
          <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
            נשמר ✅ — עכשיו סרקו את ה־QR בעמוד סיכום יום כדי לקשר את המספר.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !formatOk}
          className="btn-primary gap-2 self-start disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          שמירת המופע החדש
        </button>
      </form>
    </div>
  )
}
