import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  Eye,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  ACTIONS,
  TRIGGERS,
  createRule,
  deleteRule,
  listLog,
  listRules,
  peekEngine,
  updateRule,
} from '../services/automationsService'
import ConfirmDialog from './ConfirmDialog'
import Spinner from './Spinner'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500'

const blank = () => ({
  triggerType: 'lead_untouched',
  param: 60,
  actions: {}, // type -> true | {message/title/body}
})

/**
 * כאשר X ← אז Y, composed by the admin instead of requested from a developer.
 *
 * Every rule the panel writes is executed by the automation-engine on a
 * 5-minute cron, with a fired-ledger guaranteeing nothing acts twice on the
 * same lead or meeting. The panel's job is honesty: show what each rule DID
 * (the log), and let a rule be tried (בדיקה) before it is trusted.
 */
export default function AutomationsPanel() {
  const [rules, setRules] = useState(null)
  const [log, setLog] = useState([])
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const [peek, setPeek] = useState(null) // null | 'busy' | results
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([listRules(), listLog()])
      setRules(r)
      setLog(l)
      setError('')
    } catch (e) {
      setError(e?.message || 'הטעינה נכשלה')
      setRules([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    const trig = TRIGGERS.find((t) => t.type === editing.triggerType)
    const actions = Object.entries(editing.actions)
      .filter(([, v]) => v)
      .map(([type, v]) => ({ type, ...(typeof v === 'object' ? v : {}) }))
    if (actions.length === 0) return setError('צריך לבחור לפחות פעולה אחת')

    const wa = actions.find((a) => a.type === 'wa_client')
    if (wa && !String(wa.message || '').trim()) {
      return setError('פעולת ווצאפ צריכה נוסח הודעה')
    }

    const name =
      `${trig.label}${trig.paramKey ? ` (${editing.param} ${trig.paramKey === 'minutes' ? 'דק׳' : 'שע׳'})` : ''}` +
      ` ← ${actions.map((a) => ACTIONS.find((x) => x.type === a.type)?.label).join(' + ')}`

    setSaving(true)
    setError('')
    try {
      await createRule({
        name,
        trigger_type: trig.type,
        trigger_params: trig.paramKey ? { [trig.paramKey]: Number(editing.param) || trig.paramDefault } : {},
        actions,
      })
      setEditing(null)
      load()
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  const runPeek = async () => {
    setPeek('busy')
    try {
      const out = await peekEngine()
      setPeek(out?.results || [])
    } catch (e) {
      setPeek([])
      setError(e?.message || 'הבדיקה נכשלה')
    }
  }

  if (rules === null) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  const trig = editing ? TRIGGERS.find((t) => t.type === editing.triggerType) : null

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500">
        כלל = <b>כאשר</b> קורה משהו ← <b>אז</b> המערכת פועלת לבד. המנוע רץ כל 5
        דקות, וכל ליד או פגישה מטופלים <b>פעם אחת בלבד</b> — לעולם לא תישלח אותה
        התראה פעמיים.
      </p>

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                    r.enabled ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Zap className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-bold text-slate-800">{r.name}</span>
                <button
                  role="switch"
                  aria-checked={r.enabled}
                  aria-label={r.enabled ? 'כיבוי הכלל' : 'הפעלת הכלל'}
                  onClick={() => {
                    setRules((list) =>
                      list.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x))
                    )
                    updateRule(r.id, { enabled: !r.enabled }).catch(() => load())
                  }}
                  dir="ltr"
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                    r.enabled ? 'bg-green-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      r.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <button
                  onClick={() => setConfirm(r)}
                  className="btn-ghost shrink-0 px-2 text-red-600"
                  aria-label={`מחיקת הכלל`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1.5 ps-10 text-[11px] text-slate-400">
                הופעל {r.runs} פעמים
                {r.last_run_at &&
                  ` · לאחרונה ${new Date(r.last_run_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Builder */}
      {editing ? (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">כלל חדש</span>
            <button onClick={() => setEditing(null)} className="btn-ghost px-2" aria-label="ביטול">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">כאשר…</label>
            <select
              value={editing.triggerType}
              onChange={(e) => {
                const t = TRIGGERS.find((x) => x.type === e.target.value)
                setEditing((ed) => ({
                  ...ed,
                  triggerType: t.type,
                  param: t.paramDefault ?? '',
                  actions: Object.fromEntries(
                    Object.entries(ed.actions).filter(
                      ([k]) => !(ACTIONS.find((a) => a.type === k)?.leadsOnly && t.type !== 'lead_untouched')
                    )
                  ),
                }))
              }}
              className={FIELD}
            >
              {TRIGGERS.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">{trig.hint}</p>
            {trig.paramKey && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">{trig.paramLabel}:</span>
                <input
                  type="number"
                  min="1"
                  value={editing.param}
                  onChange={(e) => setEditing((ed) => ({ ...ed, param: e.target.value }))}
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600">אז…</label>
            <div className="space-y-1.5">
              {ACTIONS.filter(
                (a) => !a.leadsOnly || editing.triggerType === 'lead_untouched'
              ).map((a) => {
                const on = !!editing.actions[a.type]
                return (
                  <div key={a.type} className={`rounded-xl border bg-white p-2.5 transition ${on ? 'border-amber-400' : 'border-slate-200'}`}>
                    <button
                      onClick={() =>
                        setEditing((ed) => ({
                          ...ed,
                          actions: {
                            ...ed.actions,
                            [a.type]: on ? false : a.hasMessage ? { message: '' } : true,
                          },
                        }))
                      }
                      className="flex w-full items-center gap-2.5 text-right"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                          on ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'
                        }`}
                      >
                        {on && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-800">{a.label}</span>
                        <span className="block text-[11px] text-slate-500">{a.hint}</span>
                      </span>
                    </button>
                    {on && a.hasMessage && (
                      <div className="mt-2">
                        <textarea
                          value={editing.actions[a.type]?.message || ''}
                          onChange={(e) =>
                            setEditing((ed) => ({
                              ...ed,
                              actions: { ...ed.actions, [a.type]: { message: e.target.value } },
                            }))
                          }
                          rows={3}
                          dir="rtl"
                          placeholder={'היי {שם}, מזכירים את הפגישה ב-{תאריך} בשעה {שעה} 🙂'}
                          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
                        />
                        <p className="mt-1 text-[10px] text-slate-400">
                          אפשר להשתמש ב: {'{שם} {תאריך} {שעה} {סוכן}'}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <button onClick={save} disabled={saving} className="btn-primary w-full gap-2">
            {saving ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />}
            שמירת הכלל
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(blank())}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-3 font-bold text-slate-600 transition hover:border-amber-400 hover:text-amber-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          כלל חדש
        </button>
      )}

      {!editing && error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}

      {/* Try before trusting */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Eye className="h-4 w-4 text-slate-400" aria-hidden="true" />
            מה היה קורה עכשיו?
          </span>
          <button onClick={runPeek} disabled={peek === 'busy'} className="btn-ghost text-xs font-bold">
            {peek === 'busy' ? 'בודק…' : 'הרץ בדיקה'}
          </button>
        </div>
        {Array.isArray(peek) && (
          <div className="mt-2 space-y-1.5">
            {peek.length === 0 && <p className="text-xs text-slate-400">אין כללים פעילים.</p>}
            {peek.map((p, i) => (
              <div key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                <span className="font-bold text-slate-700">{p.rule}</span>
                {(p.would_fire || []).length === 0 ? (
                  <span className="text-slate-400"> — שום דבר לא ממתין כרגע</span>
                ) : (
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    {p.would_fire.map((w, j) => (
                      <li key={j}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <p className="text-[10px] text-slate-400">
              בדיקה בלבד — שום התראה לא נשלחה.
            </p>
          </div>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
            הפעלות אחרונות
          </p>
          <div className="space-y-1">
            {log.map((l) => (
              <div key={l.id} className="flex items-baseline gap-2 text-xs">
                <span className={`shrink-0 ${l.ok ? 'text-green-600' : 'text-red-600'}`}>●</span>
                <span className="shrink-0 text-slate-400">
                  {new Date(l.fired_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-700" title={l.detail || ''}>
                  {l.subject}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title="למחוק את הכלל?"
          message={`"${confirm.name}" יימחק ויפסיק לפעול. ההיסטוריה שלו ביומן נשארת.`}
          confirmLabel="מחיקה"
          onConfirm={async () => {
            const id = confirm.id
            setConfirm(null)
            await deleteRule(id).catch(() => {})
            load()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
