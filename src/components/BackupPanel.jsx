import { useCallback, useEffect, useState } from 'react'
import { Check, CloudDownload, DatabaseBackup, Loader2, Mail, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { backupDownloadUrl, backupStatus, runBackup, saveBackupSettings } from '../services/backupService'
import Spinner from './Spinner'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:bg-white'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const mb = (bytes) => `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)}MB`
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''
/** "2026-09-15_1624.zip" → "15/09/2026 16:24" (Israel time — the name is). */
const nameLabel = (name) => {
  const m = String(name).match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : name
}

/**
 * גיבויים — every night the whole app goes into one zip (all data, the
 * schema, every stored file), kept 30 days; on the night into Sunday a copy is
 * emailed to the address set here. The run itself is the `backup` function.
 */
export default function BackupPanel() {
  const { selectedAgent } = useAuth()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(null) // 'plain' | 'email'
  const [notice, setNotice] = useState(null) // { ok, text }
  const [email, setEmail] = useState('')
  const [weekly, setWeekly] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [downloading, setDownloading] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const s = await backupStatus()
      setStatus(s)
      setEmail(s.settings?.email || '')
      setWeekly(s.settings?.weekly !== false)
    } catch (e) {
      setError(e.message)
      setStatus({ last: null, list: [], settings: {} })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (withEmail) => {
    setRunning(withEmail ? 'email' : 'plain')
    setNotice(null)
    try {
      const r = await runBackup({ email: withEmail, agent: selectedAgent })
      setNotice(
        r.email_error
          ? { ok: false, text: `הגיבוי נשמר, אבל המייל לא נשלח: ${r.email_error}` }
          : { ok: true, text: withEmail ? `הגיבוי נשמר ונשלח ל-${r.emailed}` : 'הגיבוי נשמר' }
      )
    } catch (e) {
      setNotice({ ok: false, text: `הגיבוי נכשל: ${e.message}` })
    } finally {
      setRunning(null)
      load()
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setSaved(false)
    if (email.trim() && !EMAIL.test(email.trim())) {
      setNotice({ ok: false, text: 'כתובת המייל לא תקינה' })
      return
    }
    setSaving(true)
    try {
      await saveBackupSettings({ email, weekly })
      setSaved(true)
      load()
    } catch (err) {
      setNotice({ ok: false, text: err.message || 'השמירה נכשלה' })
    } finally {
      setSaving(false)
    }
  }

  const download = async (name) => {
    setDownloading(name)
    try {
      window.location.assign(await backupDownloadUrl(name))
    } catch (e) {
      setNotice({ ok: false, text: e.message || 'ההורדה נכשלה' })
    } finally {
      setDownloading(null)
    }
  }

  if (status === null) {
    return (
      <div className="py-6">
        <Spinner label="בודק גיבויים…" />
      </div>
    )
  }

  const last = status.last
  const good = last?.ok === true
  const hasEmail = EMAIL.test(status.settings?.email || '')

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* The last run */}
      <div
        className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
          good ? 'border-green-200 bg-green-50' : last ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${
            good ? 'bg-green-600' : last ? 'bg-red-600' : 'bg-amber-500'
          }`}
        >
          <DatabaseBackup className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${good ? 'text-green-900' : last ? 'text-red-900' : 'text-amber-900'}`}>
            {good ? 'הגיבוי האחרון הצליח' : last ? 'הגיבוי האחרון נכשל' : 'עוד לא היה גיבוי'}
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            {good ? (
              <>
                {when(last.at)} · {last.rows?.toLocaleString('en-US')} רשומות · {last.files} קבצים · {mb(last.size)}
                {last.emailed && <> · נשלח ל-<span dir="ltr">{last.emailed}</span></>}
              </>
            ) : last ? (
              <>
                {when(last.at)} · {last.error}
              </>
            ) : (
              'הגיבוי הראשון ירוץ הלילה, או עכשיו בכפתור למטה.'
            )}
          </p>
          {good && last.email_error && <p className="mt-0.5 text-xs font-semibold text-amber-700">המייל לא נשלח: {last.email_error}</p>}
        </div>
        <button onClick={load} className="btn-ghost shrink-0 px-2" aria-label="רענון">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

      {/* Now */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(false)} disabled={!!running} className="btn-primary gap-2 disabled:opacity-50">
          {running === 'plain' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
          גיבוי עכשיו
        </button>
        <button
          onClick={() => run(true)}
          disabled={!!running || !hasEmail}
          title={hasEmail ? '' : 'קודם שומרים כתובת מייל למטה'}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:opacity-50"
        >
          {running === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          גיבוי ושליחה למייל
        </button>
      </div>
      {running && <p className="-mt-2 text-xs text-slate-500">מגבה את כל המידע והקבצים — כמה שניות…</p>}
      {notice && (
        <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${notice.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {notice.text}
        </p>
      )}

      {/* The weekly copy */}
      <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl bg-slate-50/80 p-3">
        <p className="text-sm font-extrabold text-slate-800">עותק שבועי במייל</p>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">לאיזה מייל לשלוח</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={FIELD} placeholder="office@…" />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className="h-4 w-4 accent-slate-800" />
          לשלוח עותק כל שבוע, בלילה שבין שבת לראשון
        </label>
        <p className="flex gap-2 text-[11px] leading-relaxed text-slate-500">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span>יש בגיבוי פרטים של לקוחות. שולחים רק למייל של המשרד שרק אנשים מורשים נכנסים אליו.</span>
        </p>
        <button type="submit" disabled={saving} className="btn-primary gap-2 self-start disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          שמירה
        </button>
        {saved && <p className="text-sm font-semibold text-green-700">נשמר ✅</p>}
      </form>

      {/* Saved backups */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200">
        <p className="border-b border-slate-100 px-3.5 py-2.5 text-sm font-extrabold text-slate-800">
          הגיבויים השמורים <span className="font-semibold text-slate-400">· נשמרים 30 יום</span>
        </p>
        {status.list.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-sm text-slate-400">עוד אין גיבויים שמורים</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {status.list.map((b) => (
              <li key={b.name} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <span className="font-semibold tabular-nums text-slate-800">{nameLabel(b.name)}</span>
                <span className="text-xs tabular-nums text-slate-400">{mb(b.size)}</span>
                <button
                  onClick={() => download(b.name)}
                  disabled={downloading === b.name}
                  className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-50 disabled:opacity-50"
                >
                  {downloading === b.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
                  הורדה למחשב
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* What is in it */}
      <div className="rounded-2xl bg-white p-3.5 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
        <p className="mb-1 font-extrabold text-slate-800">מה יש בגיבוי</p>
        <p>• כל המידע: פגישות, עסקאות, לידים, טפסים, אנשי קשר, סיכומים ועוד.</p>
        <p>• כל הקבצים: הטפסים החתומים, תבניות הטפסים והצירופים.</p>
        <p>• המבנה של המערכת, כדי שאפשר יהיה לבנות אותה מחדש.</p>
        <p className="mt-1.5 flex gap-1.5 text-slate-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>סיסמאות ומפתחות לא נכנסים לגיבוי בכוונה. הגיבוי רץ כל לילה בסביבות 02:30.</span>
        </p>
      </div>
    </div>
  )
}
