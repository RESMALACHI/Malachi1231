import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Activity, Inbox, Layers, Settings, Sparkles, Target, Users, Webhook, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isAdminAgent, pinFor } from '../lib/agents'
import AgentsPanel from '../components/AgentsPanel'
import AutomationsPanel from '../components/AutomationsPanel'
import BrainPanel from '../components/BrainPanel'
import GoalsPanel from '../components/GoalsPanel'
import LeadsInbox from '../components/LeadsInbox'
import LeadsPanel from '../components/LeadsPanel'
import PagesPanel from '../components/PagesPanel'
import PinDialog from '../components/PinDialog'
import SystemPanel from '../components/SystemPanel'

const SECTIONS = [
  { key: 'system', label: 'מצב המערכת', icon: Activity, hint: 'האם הכל עובד' },
  { key: 'users', label: 'משתמשים', icon: Users, hint: 'הוספה, עריכה ומחיקה של סוכנים' },
  { key: 'sources', label: 'מקורות לידים', icon: Webhook, hint: 'כתובות שדרכן נכנסים לידים' },
  { key: 'leads', label: 'לידים שנכנסו', icon: Inbox, hint: 'שיוך, סטטוס ויצירת קשר' },
  { key: 'automations', label: 'אוטומציות', icon: Zap, hint: 'כאשר X קורה — המערכת פועלת לבד' },
  { key: 'goals', label: 'יעדים', icon: Target, hint: 'כמה פגישות ביום כל סוכן אמור לקבוע' },
  { key: 'brain', label: 'מוח ה-AI', icon: Sparkles, hint: 'מה העוזר יודע ואיך הוא עונה' },
  { key: 'pages', label: 'עמודים', icon: Layers, hint: 'מה מופיע בתפריט לכולם' },
]

/**
 * The management page — everything that runs the app, in one grey room.
 *
 * It replaced a hidden control panel that opened by clicking the logo. That was
 * a secret worth keeping while it toggled two menu items; now that it holds the
 * team roster and the doors leads come in through, a thing you have to know
 * about to find is the wrong shape. It is a page, in the menu, behind the PIN.
 *
 * The PIN is asked once per visit, and the page renders nothing until it is
 * answered — no flash of the roster behind the dialog.
 */
export default function ManagePage() {
  const { selectedAgent, isUnlocked, unlockAgent } = useAuth()
  const [section, setSection] = useState('system')

  // Only the admin has this page at all. Anyone else who reaches the URL — by
  // typing it, or from a stale bookmark after a role change — goes home.
  if (!isAdminAgent(selectedAgent)) return <Navigate to="/" replace />

  // The code belongs to the person, not to this page: whoever entered as the
  // admin has already answered it, so there is no second prompt. This only
  // fires on a deep link that skipped the profile picker — or not at all, if
  // the ניהול page gave this admin no code.
  if (!isUnlocked(selectedAgent)) {
    return (
      <PinDialog
        pin={pinFor(selectedAgent)}
        title="ניהול"
        icon={Settings}
        onSuccess={() => unlockAgent(selectedAgent)}
        onCancel={() => window.history.back()}
      />
    )
  }

  const active = SECTIONS.find((s) => s.key === section) || SECTIONS[0]

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 pb-24">
      {/* Header */}
      <header className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-slate-700 to-slate-900 p-5 text-white shadow-lg shadow-slate-900/20 dark:ring-1 dark:ring-white/10">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
          <Settings className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight">ניהול</h1>
          <p className="text-xs text-slate-300">
            שינויים כאן חלים על כל מי שמשתמש במערכת
          </p>
        </div>
      </header>

      {/* Sections */}
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map((s) => {
          const on = s.key === section
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
                on
                  ? 'bg-slate-800 text-white shadow-md shadow-slate-900/20'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800'
              }`}
            >
              <s.icon className="h-4 w-4" aria-hidden="true" />
              {s.label}
            </button>
          )
        })}
      </nav>

      <section className="rounded-3xl bg-slate-100/70 p-3 ring-1 ring-slate-200 sm:p-4">
        <div className="mb-3 px-1">
          <h2 className="font-extrabold text-slate-800">{active.label}</h2>
          <p className="text-xs text-slate-500">{active.hint}</p>
        </div>

        {section === 'system' && <SystemPanel />}
        {section === 'users' && (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <AgentsPanel />
          </div>
        )}
        {section === 'sources' && <LeadsPanel />}
        {section === 'leads' && <LeadsInbox />}
        {section === 'automations' && <AutomationsPanel />}
        {section === 'goals' && <GoalsPanel />}
        {section === 'brain' && <BrainPanel />}
        {section === 'pages' && <PagesPanel />}
      </section>
    </div>
  )
}
