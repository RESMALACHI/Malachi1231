import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Share, PlusSquare, Loader2, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  getPushState,
  enablePush,
  disablePush,
  sendTestPush,
  isIOS,
} from '../services/pushService'

/**
 * Turn phone notifications on for this device.
 *
 * "This device" is the whole idea: a subscription belongs to one browser on one
 * phone, so the card reports the state of the thing you're holding rather than
 * a global setting — an agent who enabled it on their phone should still see
 * the offer on the office desktop.
 */
export default function PushCard() {
  const { selectedAgent } = useAuth()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(null) // 'enabling' | 'disabling' | 'testing'
  const [note, setNote] = useState(null) // { type, text }

  const refresh = useCallback(async () => setState(await getPushState()), [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!state) return null

  const { supported, needsInstall, permission, subscribed } = state

  // ── iPhone, not installed: permission can't even be asked for yet ──
  if (needsInstall) {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Bell className="h-4 w-4 text-amber-500" aria-hidden="true" />
          התראות לטלפון
        </span>
        <p className="text-sm text-slate-600">
          באייפון צריך קודם להוסיף את המערכת למסך הבית — רק אז אפשר לקבל התראות.
        </p>
        <ol className="flex flex-col gap-1.5 text-sm text-slate-700">
          <li className="flex items-center gap-2">
            <Share className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            לחצו על כפתור השיתוף בסרגל התחתון
          </li>
          <li className="flex items-center gap-2">
            <PlusSquare className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            בחרו «הוספה למסך הבית»
          </li>
        </ol>
        <p className="text-xs text-slate-500">פתחו את המערכת מהאייקון החדש וחזרו לכאן.</p>
      </div>
    )
  }

  if (!supported) {
    return (
      <div className="card p-4">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <BellOff className="h-4 w-4 text-slate-400" aria-hidden="true" />
          התראות לא נתמכות בדפדפן הזה
        </span>
        <p className="mt-1 text-sm text-slate-600">
          נסו מהטלפון, או מדפדפן Chrome / Edge מעודכן.
        </p>
      </div>
    )
  }

  const run = async (kind, fn, ok) => {
    setBusy(kind)
    setNote(null)
    try {
      await fn()
      setNote({ type: 'ok', text: ok })
    } catch (err) {
      const code = err?.message
      setNote({
        type: 'err',
        text:
          code === 'denied'
            ? 'ההתראות חסומות בהגדרות הדפדפן. יש לאפשר אותן ידנית עבור האתר ולנסות שוב.'
            : code === 'dismissed'
              ? 'הבקשה נסגרה. אפשר לנסות שוב.'
              : 'ההפעלה נכשלה. נסו שוב, ואם זה חוזר — פנו למלאכי.',
      })
    } finally {
      setBusy(null)
      refresh()
    }
  }

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {subscribed ? (
            <Bell className="h-4 w-4 text-amber-500" aria-hidden="true" />
          ) : (
            <BellOff className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
          התראות לטלפון
        </span>
        {subscribed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
            <Check className="h-3 w-3" aria-hidden="true" />
            פעיל במכשיר הזה
          </span>
        )}
      </div>

      <p className="text-sm text-slate-600">
        {subscribed
          ? 'תקבלו תזכורת לפני פגישה, ותזכורת בערב על פגישות שלא סומנו.'
          : 'הפעילו כדי לקבל תזכורת לפני פגישה ותזכורת בערב על פגישות שלא סומנו.'}
      </p>

      {permission === 'denied' && !subscribed && (
        <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
          הדפדפן חוסם התראות עבור האתר. יש לאפשר אותן בהגדרות האתר ואז לנסות שוב.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {subscribed ? (
          <>
            <button
              onClick={() =>
                run(
                  'testing',
                  () =>
                    sendTestPush(selectedAgent, {
                      title: 'בדיקת התראות',
                      body: 'ההתראות עובדות. כך תיראה תזכורת מהמערכת.',
                    }),
                  'נשלחה התראת בדיקה למכשיר.'
                )
              }
              disabled={!!busy}
              className="btn-primary flex-1 justify-center"
            >
              {busy === 'testing' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              שליחת התראת בדיקה
            </button>
            <button
              onClick={() => run('disabling', disablePush, 'ההתראות כובו במכשיר הזה.')}
              disabled={!!busy}
              className="btn-ghost justify-center sm:w-32"
            >
              {busy === 'disabling' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              כיבוי
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              run('enabling', () => enablePush(selectedAgent), 'ההתראות הופעלו במכשיר הזה.')
            }
            disabled={!!busy || permission === 'denied'}
            className="btn-gradient flex-1 justify-center"
          >
            {busy === 'enabling' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            הפעלת התראות
          </button>
        )}
      </div>

      {note && (
        <p
          className={`text-xs font-medium ${
            note.type === 'ok' ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {note.text}
        </p>
      )}

      {!isIOS() && !subscribed && (
        <p className="text-[11px] text-slate-400">
          אפשר להתקין את המערכת כאפליקציה מסרגל הכתובת של הדפדפן.
        </p>
      )}
    </div>
  )
}
