import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
} from 'lucide-react'
import { REAL_AGENTS } from '../lib/agents'
import {
  createSource,
  deleteSource,
  hookUrl,
  listSources,
  rotateToken,
  updateSource,
} from '../services/leadsService'
import ConfirmDialog from './ConfirmDialog'
import Spinner from './Spinner'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500'

const MAPPABLE = [
  { key: 'name', label: 'שם' },
  { key: 'phone', label: 'טלפון' },
  { key: 'email', label: 'אימייל' },
  { key: 'note', label: 'הערה' },
]

/**
 * The webhooks leads arrive on.
 *
 * Each source is one integration — a landing page, a lead form, an affiliate —
 * with its own URL. The URL is the whole authentication, so it is treated as a
 * secret: shown on demand, copied rather than read aloud, and replaceable
 * without touching the other sources.
 */
export default function LeadsPanel() {
  const [sources, setSources] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null) // id being configured
  const [confirm, setConfirm] = useState(null)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      setSources(await listSources())
      setError('')
    } catch (e) {
      setError(e?.message || 'טעינת המקורות נכשלה')
      setSources([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const add = async () => {
    setBusy(true)
    try {
      await createSource({ name: 'מקור חדש' })
      await load()
    } catch (e) {
      setError(e?.message || 'היצירה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id, p) => {
    setSources((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)))
    try {
      await updateSource(id, p)
    } catch (e) {
      setError(e?.message || 'השמירה נכשלה')
      load()
    }
  }

  const copy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      setError('הדפדפן לא איפשר העתקה — סמן את הכתובת והעתק ידנית')
    }
  }

  if (sources === null) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-500">
        כל מקור מקבל כתובת משלו. מי שמפעיל אותו — דף נחיתה, טופס לידים, מפרסם —
        שולח אליה את הליד, והוא נכנס למערכת ומשויך לסוכן. אפשר לכבות מקור בלי
        לגעת באחרים.
      </p>

      {sources.map((s) => (
        <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          {/* Header row */}
          <div className="flex items-center gap-2">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                s.active ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Webhook className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              value={s.name}
              onChange={(e) => patch(s.id, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-bold text-slate-900 outline-none transition hover:border-slate-200 focus:border-slate-400 focus:bg-white"
              aria-label="שם המקור"
            />
            <button
              role="switch"
              aria-checked={s.active}
              aria-label={s.active ? 'כיבוי המקור' : 'הפעלת המקור'}
              onClick={() => patch(s.id, { active: !s.active })}
              dir="ltr"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                s.active ? 'bg-green-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  s.active ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* The URL */}
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 p-2">
            <Link2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate text-[11px] text-slate-500"
              title={hookUrl(s.token)}
            >
              {hookUrl(s.token)}
            </code>
            <button
              onClick={() => copy(s.id, hookUrl(s.token))}
              className="btn-ghost shrink-0 gap-1.5 px-2 text-xs"
            >
              {copied === s.id ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                  הועתק
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  העתקה
                </>
              )}
            </button>
          </div>

          {/* Stats */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500">
            <span>
              נקלטו: <b className="text-slate-700">{s.received}</b>
            </span>
            <span>
              אחרון:{' '}
              <b className="text-slate-700">
                {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString('he-IL') : 'עדיין כלום'}
              </b>
            </span>
            <span>
              משויך ל־<b className="text-slate-700">{s.assign_to || 'סבב בין הסוכנים'}</b>
            </span>
            <button
              onClick={() => setOpen(open === s.id ? null : s.id)}
              className="ms-auto font-bold text-slate-600 underline-offset-2 hover:underline"
            >
              {open === s.id ? 'סגירה' : 'הגדרות'}
            </button>
          </div>

          {open === s.id && (
            <SourceSettings
              source={s}
              onPatch={(p) => patch(s.id, p)}
              onRotate={async () => {
                const token = await rotateToken(s.id)
                setSources((list) => list.map((x) => (x.id === s.id ? { ...x, token } : x)))
              }}
              onDelete={() => setConfirm(s)}
            />
          )}
        </div>
      ))}

      <button
        onClick={add}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-3 font-bold text-slate-600 transition hover:border-slate-500 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        מקור לידים חדש
      </button>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}

      {confirm && (
        <ConfirmDialog
          title={`למחוק את "${confirm.name}"?`}
          message="הכתובת תפסיק לעבוד מיד, ומי שמשתמש בה יקבל שגיאה. הלידים שכבר נקלטו נשארים במערכת."
          confirmLabel="מחיקה"
          onConfirm={async () => {
            const id = confirm.id
            setConfirm(null)
            await deleteSource(id)
            load()
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

/**
 * Routing and field mapping for one source.
 *
 * The mapping is written FROM the last body the source actually sent, shown
 * here as clickable keys. Guessing at field names from a provider's
 * documentation is how a webhook silently stores blank leads for a month.
 */
function SourceSettings({ source, onPatch, onRotate, onDelete }) {
  const map = source.field_map || {}
  const keys = source.last_payload ? flatKeys(source.last_payload) : []

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">שיוך לסוכן</label>
        <select
          value={source.assign_to || ''}
          onChange={(e) => onPatch({ assign_to: e.target.value || null })}
          className={FIELD}
        >
          <option value="">סבב — לסוכן שהכי מזמן לא קיבל ליד</option>
          {REAL_AGENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <label className="text-xs font-bold text-slate-600">התאמת שדות</label>
          <span className="text-[11px] text-slate-400">ריק = זיהוי אוטומטי</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MAPPABLE.map((f) => (
            <div key={f.key}>
              <input
                value={map[f.key] || ''}
                onChange={(e) =>
                  onPatch({ field_map: { ...map, [f.key]: e.target.value.trim() || undefined } })
                }
                placeholder={f.label}
                dir="ltr"
                className={`${FIELD} text-[13px]`}
                aria-label={`השדה שמכיל ${f.label}`}
              />
            </div>
          ))}
        </div>
      </div>

      {keys.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-bold text-slate-600">
            השדות שהגיעו בפועל בפנייה האחרונה
          </p>
          <div className="flex flex-wrap gap-1">
            {keys.map((k) => (
              <span
                key={k}
                dir="ltr"
                className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200"
              >
                {k}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            העתק שם שדה מכאן לתיבה המתאימה למעלה. אם השארת ריק — המערכת מזהה
            לבד את השמות הנפוצים בעברית ובאנגלית.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-500 ring-1 ring-slate-200">
          עדיין לא הגיעה פנייה למקור הזה. שלח אליו ליד אחד לבדיקה — השדות שהגיעו
          יופיעו כאן, ואז אפשר להתאים אותם בוודאות במקום לנחש.
        </p>
      )}

      <div className="flex gap-2 border-t border-slate-200 pt-3">
        <button onClick={onRotate} className="btn-ghost gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          כתובת חדשה
        </button>
        <button onClick={onDelete} className="btn-ghost gap-1.5 text-xs text-red-600">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          מחיקת המקור
        </button>
      </div>
    </div>
  )
}

/** Every key in a payload, nested ones as "parent.child". */
function flatKeys(obj, prefix = '', out = []) {
  if (!obj || typeof obj !== 'object') return out
  if (Array.isArray(obj)) {
    obj.forEach((v) => flatKeys(v, prefix, out))
    return out
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatKeys(v, key, out)
    else if (!out.includes(key)) out.push(key)
  }
  return out.slice(0, 40)
}
