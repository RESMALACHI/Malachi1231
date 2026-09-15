import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Loader2, Mail, RefreshCw, Send, TriangleAlert } from 'lucide-react'
import { mailStatus, saveMailSettings, sendTestMail } from '../services/mailService'
import Spinner from './Spinner'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:bg-white'

/**
 * מייל — the Resend account טפסים sends through: the link to sign when a form
 * is sent, and the signed PDF the moment the client signs.
 *
 * The key is pasted here and goes straight to app_auth through form-mail; the
 * page only ever gets back its last four characters.
 */
export default function MailPanel() {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ apiKey: '', from: '', fromName: '', replyTo: '', officeCopy: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [guide, setGuide] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [test, setTest] = useState({ state: 'idle' })

  const load = useCallback(async () => {
    try {
      const s = await mailStatus({ fresh: true })
      setStatus(s)
      setForm((f) => ({ ...f, from: s.from || '', fromName: s.fromName || '', replyTo: s.replyTo || '', officeCopy: s.officeCopy || '' }))
      setGuide(!s.configured)
    } catch (e) {
      setStatus({ configured: false, error: e.message })
      setGuide(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setDone(false)
    setSaving(true)
    try {
      await saveMailSettings({
        apiKey: form.apiKey.trim() || undefined,
        from: form.from.trim(),
        fromName: form.fromName.trim(),
        replyTo: form.replyTo.trim(),
        officeCopy: form.officeCopy.trim(),
      })
      setForm((f) => ({ ...f, apiKey: '' }))
      setDone(true)
      await load()
    } catch (err) {
      setError(err.message || 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTest({ state: 'sending' })
    try {
      await sendTestMail(testTo.trim())
      setTest({ state: 'sent' })
    } catch (err) {
      setTest({ state: 'error', text: err.message })
    }
  }

  if (status === null) {
    return (
      <div className="py-6">
        <Spinner label="בודק חיבור…" />
      </div>
    )
  }

  const on = status.configured

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Where it stands */}
      <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${on ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${on ? 'bg-green-600' : 'bg-amber-500'}`}>
          <Mail className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${on ? 'text-green-900' : 'text-amber-900'}`}>{on ? 'המייל מחובר' : 'המייל עוד לא מחובר'}</p>
          <p className="text-xs leading-relaxed text-slate-600">
            {on ? (
              <>
                נשלח מ-<b>{status.fromName || 'מכללת R.E.S'}</b> <span dir="ltr">&lt;{status.from}&gt;</span> · מפתח {status.keyHint}
              </>
            ) : (
              'עד שיחובר, טפסים נשלחים ללקוחות בווצאפ או בהעתקת קישור.'
            )}
          </p>
        </div>
        <button onClick={load} className="btn-ghost shrink-0 px-2" aria-label="רענון">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* What goes out by mail */}
      <div className="rounded-2xl bg-white p-3.5 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
        <p className="mb-1 font-extrabold text-slate-800">מה נשלח במייל</p>
        <p>
          • <b>קישור לחתימה</b> — ברגע שנציג לוחץ "שלח טופס" ולאיש הקשר יש מייל.
        </p>
        <p>
          • <b>עותק חתום (PDF)</b> — אוטומטית ללקוח, ברגע שהוא חותם. אפשר לשלוח שוב מההיסטוריה.
        </p>
      </div>

      {/* Setting Resend up, step by step */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <button onClick={() => setGuide((g) => !g)} className="flex w-full items-center gap-2 p-3.5 text-start text-sm font-extrabold text-slate-800">
          <span className="flex-1">איך מחברים — 4 שלבים ב-Resend</span>
          <ChevronDown className={`h-4 w-4 transition ${guide ? 'rotate-180' : ''}`} />
        </button>
        {guide && (
          <ol className="flex flex-col gap-2.5 border-t border-slate-100 p-3.5 text-xs leading-relaxed text-slate-600">
            <li>
              <b className="text-slate-800">1. נרשמים</b> ב-<span dir="ltr">resend.com</span>. בחינם: 3,000 מיילים בחודש, עד 100 ביום.
            </li>
            <li>
              <b className="text-slate-800">2. מאמתים את הדומיין של המכללה</b> — Domains ← Add Domain. Resend מציג כמה רשומות DNS; מוסיפים אותן
              אצל מי שמנהל את הדומיין (או שולחים לו אותן). כשהסטטוס <b>Verified</b> — אפשר לשלוח לכל לקוח.
            </li>
            <li>
              <b className="text-slate-800">3. יוצרים מפתח</b> — API Keys ← Create API Key, הרשאה <b>Sending access</b>. מעתיקים את המפתח (מתחיל
              ב-<span dir="ltr">re_</span>) — הוא מוצג רק פעם אחת.
            </li>
            <li>
              <b className="text-slate-800">4. מדביקים כאן</b> את המפתח, כותבים כתובת שולח מהדומיין המאומת (למשל{' '}
              <span dir="ltr">forms@</span>הדומיין), שומרים — ושולחים מייל בדיקה.
            </li>
            <li className="flex gap-2 rounded-xl bg-amber-50 p-2.5 text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              <span>
                עד שהדומיין מאומת, Resend שולח רק לכתובת שאיתה נרשמתם. לבדיקה בינתיים אפשר לשים כשולח{' '}
                <span dir="ltr">onboarding@resend.dev</span> ולשלוח מייל בדיקה לעצמכם.
              </span>
            </li>
          </ol>
        )}
      </div>

      {/* The settings */}
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl bg-slate-50/80 p-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">מפתח API של Resend</label>
          <input
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={set('apiKey')}
            dir="ltr"
            className={FIELD}
            placeholder={status.keyHint ? `שמור (${status.keyHint}) — ריק = בלי שינוי` : 're_…'}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">כתובת השולח</label>
            <input value={form.from} onChange={set('from')} dir="ltr" className={FIELD} placeholder="forms@your-domain.co.il" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">שם השולח</label>
            <input value={form.fromName} onChange={set('fromName')} className={FIELD} placeholder="מכללת R.E.S" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              תשובות מלקוחות יגיעו אל <span className="font-normal text-slate-400">(לא חובה)</span>
            </label>
            <input value={form.replyTo} onChange={set('replyTo')} dir="ltr" className={FIELD} placeholder="office@…" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              העתק של כל טופס חתום אל <span className="font-normal text-slate-400">(לא חובה)</span>
            </label>
            <input value={form.officeCopy} onChange={set('officeCopy')} dir="ltr" className={FIELD} placeholder="archive@…" />
          </div>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        {done && <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">נשמר ✅ — עכשיו שלחו מייל בדיקה למטה.</p>}

        <button type="submit" disabled={saving || !form.from.trim()} className="btn-primary gap-2 self-start disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          שמירה
        </button>
      </form>

      {/* Does it work? */}
      {on && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200">
          <p className="text-sm font-extrabold text-slate-800">מייל בדיקה</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              dir="ltr"
              className={`${FIELD} min-w-0 flex-1`}
              placeholder="הכתובת שלכם"
            />
            <button
              onClick={sendTest}
              disabled={!testTo.trim() || test.state === 'sending'}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {test.state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              שליחה
            </button>
          </div>
          {test.state === 'sent' && <p className="text-sm font-semibold text-green-700">נשלח ✅ — בדקו את תיבת הדואר (וגם את הספאם).</p>}
          {test.state === 'error' && <p className="text-sm font-semibold text-red-700">{test.text}</p>}
        </div>
      )}
    </div>
  )
}
