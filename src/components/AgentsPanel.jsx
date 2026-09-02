import { useCallback, useEffect, useState } from 'react'
import { Check, Crown, Pencil, Plus, Shield, Trash2, TriangleAlert, User, X } from 'lucide-react'
import { currentRoster, ROLES, ROLE_KEYS } from '../lib/agents'
import { agentFootprint, renameAgent, saveRoster } from '../services/rosterService'
import ConfirmDialog from './ConfirmDialog'
import Spinner from './Spinner'

const ROLE_ICON = { agent: User, manager: Crown, admin: Shield }
const ROLE_STYLE = {
  agent: 'bg-slate-100 text-slate-600',
  manager: 'bg-indigo-100 text-indigo-700',
  admin: 'bg-amber-100 text-amber-700',
}

// Form fields are styled inline throughout this app rather than by a class.
const FIELD =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:bg-white'

const blank = () => ({ name: '', aliases: [], gender: 'm', arabic: '', roles: ['agent'], pin: '' })

/**
 * Add, edit and remove the people in the app.
 *
 * Roles STACK — ויטלי sells and also sees everyone's numbers; מלאכי sells and
 * also runs this page. So they are checkboxes, not a dropdown: an earlier
 * version had one role per person and could not describe either of them.
 *
 * The roster is the app's identity model — everyone picks their name off this
 * list on the welcome screen — so the ways to lock the team out of their own
 * system are guarded here rather than left to care:
 *
 *   · at least one מנהל מערכת, or nobody can open this page again;
 *   · at least one סוכן, or there is no app to open;
 *   · renaming moves the agent's whole history with them, in one transaction.
 *
 * Saving reloads the page. Half the app reads the agent list at module load, so
 * a roster change is one of the few things a re-render genuinely cannot carry.
 */
export default function AgentsPanel() {
  const [roster] = useState(currentRoster)
  const [editing, setEditing] = useState(null) // index, or 'new'
  const [draft, setDraft] = useState(blank)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null) // { index, footprint }

  const startEdit = (i) => {
    setError('')
    setEditing(i)
    setDraft(
      i === 'new'
        ? blank()
        : { ...roster[i], aliases: [...roster[i].aliases], roles: [...roster[i].roles] }
    )
  }
  const cancel = () => {
    setEditing(null)
    setError('')
  }

  /** Write the roster, then reload so every screen reads the new team. */
  const persist = useCallback(async (next, { rename } = {}) => {
    setSaving(true)
    setError('')
    try {
      // The rename goes FIRST and on its own. If it fails, the roster is left
      // untouched — better a name that did not change than a name that changed
      // in the list while a year of meetings stayed behind under the old one.
      if (rename) await renameAgent(rename.from, rename.to)
      await saveRoster(next)
      window.location.reload()
    } catch (e) {
      setSaving(false)
      setError(e?.message || 'השמירה נכשלה')
    }
  }, [])

  const submit = (e) => {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) return setError('צריך שם')
    if (roster.some((a, i) => a.name === name && i !== editing)) {
      return setError('כבר יש משתמש בשם הזה')
    }
    if (draft.roles.length === 0) return setError('צריך לבחור לפחות הרשאה אחת')
    if (draft.pin && !/^\d{4}$/.test(draft.pin)) return setError('קוד כניסה חייב להיות 4 ספרות')
    if (draft.roles.includes('admin') && !/^\d{4}$/.test(draft.pin || '')) {
      // The admin can add and delete people and holds the lead webhooks. On an
      // app where identity is "pick your name off a list", leaving that with no
      // code at all means anyone at any desk can open it.
      return setError('למנהל מערכת חייב להיות קוד כניסה')
    }

    const entry = {
      name,
      aliases: draft.aliases.map((x) => x.trim()).filter(Boolean),
      gender: draft.gender === 'f' ? 'f' : 'm',
      arabic: draft.arabic.trim(),
      roles: ROLE_KEYS.filter((k) => draft.roles.includes(k)),
      // Four digits or nothing. A two-digit typo must not become a lock.
      pin: /^\d{4}$/.test(draft.pin || '') ? draft.pin : '',
    }
    // No aliases means the name itself is the only thing a calendar event can
    // be matched on — which is what aliasesFor() falls back to anyway.
    if (entry.aliases.length === 0) entry.aliases = [name]

    const next =
      editing === 'new' ? [...roster, entry] : roster.map((a, i) => (i === editing ? entry : a))

    const problem = wouldBreak(next)
    if (problem) return setError(problem)

    const renamed = editing !== 'new' && roster[editing].name !== name
    persist(next, renamed ? { from: roster[editing].name, to: name } : undefined)
  }

  const askDelete = async (i) => {
    const problem = wouldBreak(roster.filter((_, j) => j !== i))
    if (problem) return setError(problem)

    setConfirm({ index: i, footprint: null })
    try {
      setConfirm({ index: i, footprint: await agentFootprint(roster[i].name) })
    } catch {
      setConfirm({ index: i, footprint: {} })
    }
  }

  return (
    <div className="p-3">
      <div className="divide-y divide-slate-100">
        {roster.map((a, i) =>
          editing === i ? (
            <AgentForm
              key={a.name}
              draft={draft}
              setDraft={setDraft}
              onSubmit={submit}
              onCancel={cancel}
              saving={saving}
              error={error}
            />
          ) : (
            <div key={a.name} className="flex items-start gap-3 px-2 py-3">
              <div className="flex shrink-0 gap-1 pt-0.5">
                {a.roles.map((r) => {
                  const Icon = ROLE_ICON[r] || User
                  return (
                    <span
                      key={r}
                      title={ROLES[r]?.label || r}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                        ROLE_STYLE[r] || ROLE_STYLE.agent
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )
                })}
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900">{a.name}</div>
                <div className="text-[11px] text-slate-500">
                  {a.roles.map((r) => ROLES[r]?.label || r).join(' · ')}
                  {a.pin ? ' · 🔒 קוד כניסה' : ''}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.aliases.map((x) => (
                    <span
                      key={x}
                      className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500"
                    >
                      {x}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => startEdit(i)}
                  className="btn-ghost px-2"
                  aria-label={`עריכת ${a.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => askDelete(i)}
                  className="btn-ghost px-2 text-red-600"
                  aria-label={`מחיקת ${a.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {editing === 'new' ? (
        <div className="border-t border-slate-100">
          <AgentForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={submit}
            onCancel={cancel}
            saving={saving}
            error={error}
          />
        </div>
      ) : (
        <button
          onClick={() => startEdit('new')}
          disabled={saving}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-3 font-bold text-slate-600 transition hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          הוספת משתמש
        </button>
      )}

      {editing === null && error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {confirm && (
        <ConfirmDialog
          title={`למחוק את ${roster[confirm.index].name}?`}
          message={deleteMessage(roster[confirm.index].name, confirm.footprint)}
          confirmLabel="מחיקה"
          onConfirm={() => {
            const i = confirm.index
            setConfirm(null)
            persist(roster.filter((_, j) => j !== i))
          }}
          onCancel={() => setConfirm(null)}
          busy={saving}
        />
      )}
    </div>
  )
}

/**
 * The two rosters that cannot be saved, named in the words of the screen.
 *
 * Both are one-way doors. Without an admin nobody can reach this page to undo
 * it; without an agent the welcome screen has nobody to pick.
 */
function wouldBreak(list) {
  if (!list.some((a) => a.roles.includes('admin'))) {
    return 'חייב להישאר מנהל מערכת אחד לפחות — אחרת אף אחד לא יוכל לפתוח את עמוד הניהול'
  }
  if (!list.some((a) => a.roles.includes('agent'))) {
    return 'חייב להישאר סוכן אחד לפחות'
  }
  return ''
}

/**
 * What deletion actually does, said plainly.
 *
 * Removing someone from the roster removes them from the picker — it does not
 * touch a single meeting, deal or summary. Their history keeps their name and
 * comes straight back if the name is re-added. Saying so is the difference
 * between a reversible edit and one the admin is afraid to make.
 */
function deleteMessage(name, f) {
  if (!f) return 'בודק כמה נתונים רשומים עליו…'
  const rows = [
    ['פגישות', f.meetings],
    ['עסקאות', f.deals],
    ['סיכומי יום', f.day_summaries],
    ['הודעות', f.messages],
  ].filter(([, n]) => n > 0)

  const has = rows.length
    ? `רשומים עליו ${rows.map(([label, n]) => `${n} ${label}`).join(', ')}. `
    : 'לא רשומים עליו נתונים. '

  return `${has}הנתונים לא נמחקים — הם נשארים במערכת עם השם ${name}, ויחזרו להופיע אם תוסיף אותו שוב. מה שקורה עכשיו: הוא יורד מרשימת הבחירה.`
}

/** Add/edit form. Aliases are typed comma-separated — that is how they read. */
function AgentForm({ draft, setDraft, onSubmit, onCancel, saving, error }) {
  const [aliasText, setAliasText] = useState(draft.aliases.join(', '))

  // Keep the text in step when the parent swaps which agent is being edited.
  useEffect(() => {
    setAliasText(draft.aliases.join(', '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.name])

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const toggleRole = (key) =>
    setDraft((d) => ({
      ...d,
      roles: d.roles.includes(key) ? d.roles.filter((r) => r !== key) : [...d.roles, key],
    }))

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl bg-slate-50/80 p-3">
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">שם</label>
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          autoFocus
          className={FIELD}
          placeholder="שם המשתמש"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">שמות לזיהוי ביומן</label>
        <input
          value={aliasText}
          onChange={(e) => {
            setAliasText(e.target.value)
            set({ aliases: e.target.value.split(',') })
          }}
          className={FIELD}
          placeholder="מלאכי אזערי, מלאכי"
          dir="rtl"
        />
        <p className="mt-1 flex gap-1.5 text-[11px] leading-relaxed text-slate-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            כל כתיב שהפגישה עשויה להיכתב בו, מופרד בפסיקים. <b>אל תוסיף שם פרטי
            שגם לקוחות נקראים בו</b> — פגישה של לקוח בשם הזה תשויך לסוכן בטעות.
            זו הסיבה ש"שליו" רשום כ"שליו חסידים" בלבד.
          </span>
        </p>
      </div>

      {/* Roles stack. Someone can be an agent AND a manager AND run the panel. */}
      <div>
        <label className="mb-1.5 block text-xs font-bold text-slate-600">
          הרשאות <span className="font-normal text-slate-400">(אפשר לבחור כמה)</span>
        </label>
        <div className="space-y-1.5">
          {ROLE_KEYS.map((key) => {
            const on = draft.roles.includes(key)
            const Icon = ROLE_ICON[key] || User
            return (
              <button
                type="button"
                key={key}
                onClick={() => toggleRole(key)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-right transition ${
                  on
                    ? 'border-slate-800 bg-white shadow-sm'
                    : 'border-slate-200 bg-white/50 hover:border-slate-300'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                    on ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300'
                  }`}
                >
                  {on && <Check className="h-3 w-3" aria-hidden="true" />}
                </span>
                <Icon
                  className={`h-4 w-4 shrink-0 ${on ? 'text-slate-700' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">{ROLES[key].label}</span>
                  <span className="block text-[11px] leading-tight text-slate-500">
                    {ROLES[key].hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {draft.roles.includes('manager') && draft.roles.includes('agent') && (
          <p className="mt-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-indigo-800">
            סוכן שהוא גם מנהל נכנס למערכת שלו — הפגישות, סיכום היום והמשימות שלו
            נשארים. הוא מקבל <b>בנוסף</b> את נתוני כל הסוכנים, ומעבר בין "שלי"
            ל"כל הסוכנים" בדוחות.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">
          קוד כניסה <span className="font-normal text-slate-400">(4 ספרות · ריק = בלי קוד)</span>
        </label>
        <input
          value={draft.pin || ''}
          onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          inputMode="numeric"
          dir="ltr"
          className={`${FIELD} text-center tracking-[0.4em]`}
          placeholder="––––"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          נשאל פעם אחת בלבד בכל מכשיר — אחרי שהוזן נכון, הפרופיל נפתח ישירות מכאן
          והלאה. {draft.roles.includes('admin') && <b>למנהל מערכת חובה קוד.</b>}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">לשון פנייה</label>
        <select
          value={draft.gender}
          onChange={(e) => set({ gender: e.target.value })}
          className={FIELD}
        >
          <option value="m">זכר</option>
          <option value="f">נקבה</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-600">
          השם בערבית <span className="font-normal text-slate-400">(לספיץ)</span>
        </label>
        <input
          value={draft.arabic}
          onChange={(e) => set({ arabic: e.target.value })}
          className={FIELD}
          placeholder="ملاخي"
          dir="rtl"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1 gap-2">
          {saving ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />}
          שמירה
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost px-3">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}
