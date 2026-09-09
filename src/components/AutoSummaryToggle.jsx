import { useEffect, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { autoSummaryEnabled, setAutoSummaryEnabled } from '../lib/useAutoDaySummary'
import { getPosition } from '../lib/geo'
import { askNotifyPermission, notifyPermission } from '../lib/notify'

/**
 * "Remind me to file the summary when I leave the office."
 *
 * Per DEVICE, not per agent — it is this phone's location that answers the
 * question, and the same person on the office desktop should not be asked.
 *
 * Turning it on is what triggers the two browser prompts, deliberately: a
 * permission dialog that appears out of nowhere gets denied, and a denial is
 * permanent until the person digs through site settings to undo it. Here they
 * have just read the sentence explaining why. Location is the one that matters
 * — without notifications the feature degrades to opening the form instead, so
 * a refusal there is not fatal and is not treated as one.
 */
export default function AutoSummaryToggle() {
  const [on, setOn] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [noNotify, setNoNotify] = useState(false)

  useEffect(() => {
    setOn(autoSummaryEnabled())
    setNoNotify(autoSummaryEnabled() && notifyPermission() !== 'granted')
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
    // Second, and only now that the location prompt is behind us: permission to
    // actually reach them. Both prompts in one gesture is what the browsers allow.
    const perm = await askNotifyPermission()
    setNoNotify(perm !== 'granted')

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
        <p className="text-sm font-bold text-slate-800">תזכורת ביציאה מהמשרד</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {on
            ? 'בכל יציאה מהמשרד — בכל שעה — תגיע התראה לסכם את היום. לחיצה עליה פותחת את הטופס מלא במה שהמערכת כבר יודעת.'
            : 'הטלפון ייבדק רק כשהאפליקציה פתוחה, והמיקום לא נשמר בשום מקום — רק נבדק מול המשרד ונמחק.'}
        </p>
        {on && noNotify && (
          <p className="mt-1 text-[11px] font-semibold text-amber-700">
            ההתראות חסומות בדפדפן — במקום התראה, הטופס פשוט ייפתח לבד. אפשר לאשר
            התראות בהגדרות האתר.
          </p>
        )}
        {error && <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p>}
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={asking}
        role="switch"
        aria-checked={on}
        aria-label="תזכורת ביציאה מהמשרד"
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
