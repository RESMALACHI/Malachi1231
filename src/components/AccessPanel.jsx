import { useState } from 'react'
import { Check, EyeOff, Loader2, ShieldCheck, Users } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import { ACTION_ITEMS, LEVELS, PAGE_ITEMS } from '../lib/access'
import { currentRoster } from '../lib/agents'

const roleOf = (p) => ((p.roles || []).includes('admin') ? 'מנהל מערכת' : (p.roles || []).includes('manager') ? 'מנהל' : 'סוכן')

/**
 * One page or action: who may see it, and — for "these people" — which people.
 * Module-level, not declared inside AccessPanel: a component made in a render
 * is rebuilt on every render, which drops focus and restarts spinners.
 */
function AccessRow({ item, rule, allowHide, people, saving, saved, onChange }) {
  const levels = allowHide ? LEVELS : LEVELS.filter((l) => l.key !== 'nobody')
  const togglePerson = (name) => {
    const list = rule.people.includes(name) ? rule.people.filter((n) => n !== name) : [...rule.people, name]
    onChange({ level: 'people', people: list })
  }
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-base font-bold text-slate-900">
          {rule.level === 'nobody' && <EyeOff className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
          {item.label}
        </p>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600">
              <Check className="h-3.5 w-3.5" /> נשמר
            </span>
          )}
          <select
            value={rule.level}
            onChange={(e) => onChange({ level: e.target.value, people: rule.people })}
            aria-label={`מי רואה: ${item.label}`}
            className={`min-w-[12rem] rounded-xl border px-3 py-2.5 text-sm font-bold outline-none transition focus:ring-2 focus:ring-slate-200 ${
              rule.level === 'nobody'
                ? 'border-slate-200 bg-slate-100 text-slate-500'
                : rule.level === 'everyone'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-violet-200 bg-violet-50 text-violet-800'
            }`}
          >
            {levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rule.level === 'people' && (
        <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">בוחרים מי רואה (מנהלי מערכת תמיד כלולים):</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const admin = (p.roles || []).includes('admin')
              const on = admin || rule.people.includes(p.name)
              return (
                <button
                  key={p.name}
                  type="button"
                  disabled={admin}
                  onClick={() => togglePerson(p.name)}
                  title={admin ? 'מנהל מערכת — תמיד רואה' : ''}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                    on ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                  } ${admin ? 'cursor-default opacity-70' : ''}`}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                  {p.name}
                  <span className={`text-[10px] font-semibold ${on ? 'text-slate-300' : 'text-slate-400'}`}>{roleOf(p)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * עמודים והרשאות — who sees each page of the menu, and who may use each action
 * inside a page. One row per item: "everyone / managers / admins / these
 * people", and for pages also "hidden from everyone". Saved at once, and on
 * every device within two minutes (SettingsContext's poll). The rules live in
 * lib/access.js.
 */
export default function AccessPanel() {
  const { access, ruleOf, saveAccess } = useSettings()
  const [savingKey, setSavingKey] = useState(null)
  const [savedKey, setSavedKey] = useState(null)
  const [error, setError] = useState('')
  const people = currentRoster()

  const update = async (key, rule) => {
    setError('')
    setSavingKey(key)
    setSavedKey(null)
    try {
      await saveAccess({ ...access, [key]: rule })
      setSavedKey(key)
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1800)
    } catch (e) {
      setError(e.message || 'השמירה נכשלה')
    } finally {
      setSavingKey(null)
    }
  }

  const row = (item, allowHide = false) => (
    <AccessRow
      key={item.key}
      item={item}
      rule={ruleOf(item.key)}
      allowHide={allowHide}
      people={people}
      saving={savingKey === item.key}
      saved={savedKey === item.key}
      onChange={(rule) => update(item.key, rule)}
    />
  )

  const actionPages = [...new Set(ACTION_ITEMS.map((a) => a.page))]

  return (
    <div className="flex flex-col gap-6">
      {/* How it works */}
      <div className="flex gap-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-slate-600">
          <p className="text-base font-extrabold text-slate-900">איך זה עובד</p>
          <p>לכל עמוד ולכל פעולה בוחרים מי רואה אותם: כולם, רק מנהלים, רק מנהלי מערכת, או אנשים מסוימים.</p>
          <p>השינוי נשמר מיד, ומגיע לכל המכשירים תוך שתי דקות.</p>
          <p className="text-slate-500">
            מנהלי מערכת תמיד רואים הכל, חוץ מעמוד שסומן "מוסתר מכולם". עמוד ניהול תמיד שייך רק למנהלי מערכת.
          </p>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      <section className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200">
        <header className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-extrabold text-slate-900">עמודים בתפריט</h3>
          <p className="text-sm text-slate-500">
            מי רואה כל עמוד. עמוד שמישהו לא רשאי לראות לא מופיע לו בתפריט, וגם לא נפתח לו מקישור.
          </p>
        </header>
        <div className="divide-y divide-slate-100">{PAGE_ITEMS.map((item) => row(item, true))}</div>
      </section>

      <section className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200">
        <header className="border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Users className="h-5 w-5 text-slate-400" aria-hidden="true" />
            פעולות בתוך עמודים
          </h3>
          <p className="text-sm text-slate-500">מי יכול לבצע פעולות רגישות. מי שלא רשאי פשוט לא רואה את הכפתור.</p>
        </header>
        {actionPages.map((page) => (
          <div key={page}>
            <p className="bg-slate-50 px-5 py-2 text-xs font-extrabold tracking-wide text-slate-500">בעמוד {page}</p>
            <div className="divide-y divide-slate-100">{ACTION_ITEMS.filter((a) => a.page === page).map((item) => row(item))}</div>
          </div>
        ))}
      </section>
    </div>
  )
}
