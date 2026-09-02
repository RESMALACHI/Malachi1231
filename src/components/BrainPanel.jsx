import { useCallback, useEffect, useState } from 'react'
import { Check, RotateCcw, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Spinner from './Spinner'

/**
 * The assistant's instructions — its "brain" — written by the admin.
 *
 * This text is prepended to every conversation, ahead of the live numbers. It
 * is the one place to teach the assistant things the database cannot know: how
 * the college sells, what the words mean internally, what a good answer looks
 * like.
 *
 * The API key is NOT here and must not be: it lives in `app_auth`, which the
 * browser cannot read at all.
 */
export default function BrainPanel() {
  const [text, setText] = useState(null)
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data, error: e } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_brain')
        .maybeSingle()
      if (e) throw e
      const v = String(data?.value?.text || '')
      setText(v)
      setSaved(v)
    } catch (e) {
      setError(e?.message || 'טעינת ההגדרות נכשלה')
      setText('')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setBusy(true)
    setError('')
    setOk(false)
    try {
      const { error: e } = await supabase.from('app_settings').upsert(
        { key: 'ai_brain', value: { text }, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      if (e) throw e
      setSaved(text)
      setOk(true)
      setTimeout(() => setOk(false), 2500)
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  if (text === null) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  const dirty = text !== saved

  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-indigo-900">
          מה שכתוב כאן נשלח למודל לפני כל שאלה. <b>הנתונים עצמם נשלחים אוטומטית</b> —
          פגישות, עסקאות, שיחות ולידים של החודש הזה והקודם, לפי סוכן. השתמש בשדה
          הזה כדי ללמד אותו את מה שאין במסד: איך אנחנו מוכרים, מה המונחים אצלנו
          אומרים, ואיך נראית תשובה טובה.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={18}
        dir="rtl"
        className="w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-[13px] leading-relaxed outline-none transition focus:border-indigo-400"
        placeholder="אתה העוזר של מכללת R.E.S…"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !dirty} className="btn-primary gap-2">
          {busy ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />}
          שמירה
        </button>
        {dirty && (
          <button onClick={() => setText(saved)} disabled={busy} className="btn-ghost gap-2">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ביטול שינויים
          </button>
        )}
        {ok && <span className="text-sm font-bold text-green-600">נשמר</span>}
        <span className="ms-auto text-[11px] text-slate-400">{text.length} תווים</span>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}
    </div>
  )
}
