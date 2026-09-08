import { useCallback, useEffect, useState } from 'react'
import { Check, Crosshair, Loader2, MapPin } from 'lucide-react'
import { getOffice, saveOffice, DEFAULT_OFFICE } from '../services/settingsService'
import { getPosition } from '../lib/geo'
import Spinner from './Spinner'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:bg-white'

/**
 * Where the office is, for "open my day summary when I leave" (per-agent
 * opt-in, on the סיכום יום page).
 *
 * The coordinates matter more than they look: a radius drawn around the wrong
 * point either never fires or fires while people are still at their desks. So
 * the primary way to set this is the button — stand at the branch, press it.
 */
export default function OfficePanel() {
  const [office, setOffice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getOffice()
      .then(setOffice)
      .catch(() => setOffice({ ...DEFAULT_OFFICE }))
  }, [])

  const set = (patch) => setOffice((o) => ({ ...o, ...patch }))

  const useMyPosition = useCallback(async () => {
    setLocating(true)
    setError('')
    setMsg('')
    const pos = await getPosition({ timeout: 15_000, maximumAge: 0 })
    setLocating(false)
    if (!pos) {
      setError('לא הצלחנו לקרוא את המיקום — צריך לאשר גישה למיקום בדפדפן.')
      return
    }
    set({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) })
    setMsg(`נקבע לפי המיקום הנוכחי (דיוק ±${Math.round(pos.accuracy || 0)} מ׳). לא לשכוח לשמור.`)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMsg('')
    try {
      await saveOffice({
        label: String(office.label || '').trim() || DEFAULT_OFFICE.label,
        lat: Number(office.lat),
        lng: Number(office.lng),
        radiusM: Math.max(50, Number(office.radiusM) || DEFAULT_OFFICE.radiusM),
        afterHour: Math.min(23, Math.max(0, Number(office.afterHour) || 0)),
      })
      setMsg('נשמר ✅')
    } catch (err) {
      setError(err?.message || 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  if (!office) {
    return (
      <div className="p-8">
        <Spinner label="טוען…" />
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-4">
      <p className="flex gap-2 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <span>
          כשסוכן מדליק את האפשרות בעמוד <b>סיכום יום</b>, האפליקציה בודקת בפתיחה
          אם הוא מחוץ לרדיוס הזה אחרי השעה שנקבעה — ואם כן, פותחת לו את הטופס לבד.
          הבדיקה קורית רק כשהאפליקציה פתוחה, והמיקום לא נשמר בשום מקום.
        </span>
      </p>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">שם הסניף</label>
        <input
          value={office.label}
          onChange={(e) => set({ label: e.target.value })}
          className={FIELD}
          placeholder="ראש פינה"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-slate-600">מיקום המשרד</label>
        <button
          type="button"
          onClick={useMyPosition}
          disabled={locating}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-800 transition hover:border-amber-400 disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          )}
          קבע לפי המיקום שלי עכשיו
        </button>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={office.lat}
            onChange={(e) => set({ lat: e.target.value })}
            inputMode="decimal"
            dir="ltr"
            className={`${FIELD} text-center`}
            placeholder="lat"
          />
          <input
            value={office.lng}
            onChange={(e) => set({ lng: e.target.value })}
            inputMode="decimal"
            dir="ltr"
            className={`${FIELD} text-center`}
            placeholder="lng"
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          עמוד בסניף ולחץ על הכפתור — זה מדויק בהרבה מלהקליד קואורדינטות.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">רדיוס (מטרים)</label>
          <input
            value={office.radiusM}
            onChange={(e) => set({ radiusM: e.target.value })}
            inputMode="numeric"
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-slate-500">300 מ׳ מכסה את המשרד והחניה.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">לא לפני השעה</label>
          <input
            value={office.afterHour}
            onChange={(e) => set({ afterHour: e.target.value })}
            inputMode="numeric"
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            כדי שיציאה להפסקת צהריים לא תיחשב סוף יום.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}
      {msg && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
          {msg}
        </p>
      )}

      <button type="submit" disabled={saving} className="btn-primary gap-2 self-start">
        {saving ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />}
        שמירה
      </button>
    </form>
  )
}
