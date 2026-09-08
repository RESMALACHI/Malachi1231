import { useEffect, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { autoSummaryEnabled, setAutoSummaryEnabled } from '../lib/useAutoDaySummary'
import { getPosition } from '../lib/geo'

/**
 * "Open this form by itself when I leave the office."
 *
 * Per DEVICE, not per agent — it is this phone's location that answers the
 * question, and the same person on the office desktop should not be asked.
 *
 * Turning it on is what triggers the browser's location prompt, deliberately:
 * a permission dialog that appears out of nowhere gets denied, and a denial is
 * permanent until the person digs through site settings to undo it. Here they
 * have just read the sentence explaining why.
 */
export default function AutoSummaryToggle() {
  const [on, setOn] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setOn(autoSummaryEnabled())
  }, [])

  const toggle = async () => {
    if (on) {
      setAutoSummaryEnabled(false)
      setOn(false)
      setError('')
      return
    }
    setAsking(true)
    setError('')
    // Asking for a fix IS asking for the permission — and it doubles as proof
    // the phone can actually produce one before promising the agent anything.
    const pos = await getPosition({ timeout: 15_000, maximumAge: 0 })
    setAsking(false)
    if (!pos) {
      setError('לא הצלחנו לקרוא את המיקום. צריך לאשר גישה למיקום בהגדרות הדפדפן.')
      return
    }
    setAutoSummaryEnabled(true)
    setOn(true)
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-3.5 transition ${
        on ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <MapPin
        className={`mt-0.5 h-5 w-5 shrink-0 ${on ? 'text-green-600' : 'text-slate-400'}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">פתיחה אוטומטית ביציאה מהמשרד</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {on
            ? 'בפעם הראשונה שתפתח את האפליקציה מחוץ למשרד בסוף היום — הטופס ייפתח לבד, מלא במה שהמערכת כבר יודעת.'
            : 'הטלפון ייבדק רק כשהאפליקציה פתוחה, והמיקום לא נשמר בשום מקום — רק נבדק מול המשרד ונמחק.'}
        </p>
        {error && <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p>}
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={asking}
        role="switch"
        aria-checked={on}
        aria-label="פתיחה אוטומטית ביציאה מהמשרד"
        className={`relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
          on ? 'bg-green-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
            // RTL: "on" sits at the start (right), so it travels leftwards.
            on ? '-translate-x-0.5' : '-translate-x-[1.375rem]'
          }`}
        >
          {asking && <Loader2 className="h-3 w-3 animate-spin text-slate-500" aria-hidden="true" />}
        </span>
      </button>
    </div>
  )
}
