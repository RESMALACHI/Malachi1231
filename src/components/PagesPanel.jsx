import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import { CONTROLLABLE_PAGES } from '../lib/navPages'

/**
 * Which pages the app shows, for everyone.
 *
 * Saved to Supabase and read by every device on the settings poll, so a page
 * switched off here disappears from the team's menu without a deploy.
 */
export default function PagesPanel() {
  const { hiddenPages, setHidden } = useSettings()
  const [saving, setSaving] = useState(null)

  const toggle = async (key) => {
    setSaving(key)
    const next = hiddenPages.includes(key)
      ? hiddenPages.filter((k) => k !== key)
      : [...hiddenPages, key]
    try {
      await setHidden(next)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {CONTROLLABLE_PAGES.map((p) => {
        const on = !hiddenPages.includes(p.key)
        return (
          <div key={p.key} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2.5 font-semibold text-slate-800">
              {on ? (
                <Eye className="h-4 w-4 text-green-600" aria-hidden="true" />
              ) : (
                <EyeOff className="h-4 w-4 text-slate-400" aria-hidden="true" />
              )}
              {p.label}
            </span>
            <button
              role="switch"
              aria-checked={on}
              aria-label={`${on ? 'הסתר' : 'הצג'} ${p.label}`}
              disabled={saving === p.key}
              onClick={() => toggle(p.key)}
              dir="ltr"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-200 disabled:opacity-60 ${
                on ? 'bg-green-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  on ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}
