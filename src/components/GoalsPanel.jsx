import { useEffect, useState } from 'react'
import { Check, Loader2, Target } from 'lucide-react'
import { getGoals, saveGoals } from '../services/settingsService'
import { DEFAULT_DAILY_GOAL } from '../lib/goals'

/**
 * The team's daily booking target — one number, shared.
 *
 * It drives the ring and the streak on every agent's "היום שלי", so it is a
 * management decision rather than a personal one, and it lives beside the rest
 * of the settings the panel owns.
 */
export default function GoalsPanel() {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getGoals()
      .then((g) => alive && setValue(String(g.dailyBookings || DEFAULT_DAILY_GOAL)))
      .catch(() => alive && setValue(String(DEFAULT_DAILY_GOAL)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const save = async () => {
    const n = Math.round(Number(value))
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      setError('הזינו מספר בין 1 ל-50')
      return
    }
    setError('')
    setSaving(true)
    try {
      await saveGoals({ dailyBookings: n })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Target className="h-4 w-4 text-amber-500" aria-hidden="true" />
        כמה פגישות ביום כל סוכן אמור לקבוע
      </label>
      <p className="mt-1 text-xs text-slate-500">
        המספר הזה מזין את הטבעת ואת רצף הימים בעמוד «היום שלי» של כל סוכן.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min="1"
          max="50"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
          className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-lg font-extrabold tabular-nums outline-none transition focus:border-amber-400"
        />
        <span className="text-sm font-semibold text-slate-500">קביעות ליום</span>
        <button onClick={save} disabled={saving} className="btn-primary ms-auto">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : saved ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : null}
          {saved ? 'נשמר' : 'שמירה'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
        נספר לפי תאריך קביעת הפגישה. שישי ושבת לא נספרים ולא שוברים רצף.
      </p>
    </div>
  )
}
