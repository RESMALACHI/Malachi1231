import { Navigate, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Inbox,
  Mail,
  MapPin,
  MessageCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Webhook,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isAdminAgent, pinFor } from '../lib/agents'
import AgentsPanel from '../components/AgentsPanel'
import AccessPanel from '../components/AccessPanel'
import AutomationsPanel from '../components/AutomationsPanel'
import BrainPanel from '../components/BrainPanel'
import GoalsPanel from '../components/GoalsPanel'
import OfficePanel from '../components/OfficePanel'
import BotWhatsAppPanel from '../components/BotWhatsAppPanel'
import MailPanel from '../components/MailPanel'
import BackupPanel from '../components/BackupPanel'
import LeadsInbox from '../components/LeadsInbox'
import LeadsPanel from '../components/LeadsPanel'
import PinDialog from '../components/PinDialog'
import SystemPanel from '../components/SystemPanel'

// Each colour is a family of settings, so the home screen reads in four blocks.
const TONES = {
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  green: 'bg-emerald-100 text-emerald-700',
  slate: 'bg-slate-200 text-slate-700',
}

const SECTIONS = {
  users: { label: 'משתמשים', icon: Users, tone: 'violet', desc: 'הוספה, עריכה ומחיקה של אנשי הצוות — תפקיד, קוד כניסה ושם.', panel: AgentsPanel, boxed: true },
  access: { label: 'עמודים והרשאות', icon: ShieldCheck, tone: 'violet', desc: 'מי רואה כל עמוד בתפריט, ומי יכול לבצע פעולות רגישות.', panel: AccessPanel },
  sources: { label: 'מקורות לידים', icon: Webhook, tone: 'amber', desc: 'הכתובות שדרכן נכנסים לידים — מפרסומות, מהאתר ומטפסים.', panel: LeadsPanel },
  leads: { label: 'לידים שנכנסו', icon: Inbox, tone: 'amber', desc: 'כל ליד שהגיע: למי הוא שויך, מה הסטטוס, ויצירת קשר.', panel: LeadsInbox },
  automations: { label: 'אוטומציות', icon: Zap, tone: 'amber', desc: 'כשמשהו קורה, המערכת פועלת לבד — למשל שולחת הודעה.', panel: AutomationsPanel },
  goals: { label: 'יעדים', icon: Target, tone: 'amber', desc: 'כמה פגישות ביום כל סוכן אמור לקבוע.', panel: GoalsPanel },
  botwa: { label: 'ווצאפ הבוט', icon: MessageCircle, tone: 'green', desc: 'המספר של המשרד שדרכו הבוט קובע פגישות ושולח הודעות.', panel: BotWhatsAppPanel },
  mail: { label: 'מייל', icon: Mail, tone: 'green', desc: 'שליחת טפסים, תזכורות ועותקים חתומים ללקוחות במייל.', panel: MailPanel },
  brain: { label: 'מוח ה-AI', icon: Sparkles, tone: 'green', desc: 'מה העוזר החכם יודע על המכללה, ואיך הוא עונה.', panel: BrainPanel },
  system: { label: 'מצב המערכת', icon: Activity, tone: 'slate', desc: 'בדיקה שהכל עובד: סנכרון היומנים, הבוט והשרתים.', panel: SystemPanel },
  backup: { label: 'גיבויים', icon: DatabaseBackup, tone: 'slate', desc: 'גיבוי מלא של כל המידע כל לילה, ועותק שבועי למייל.', panel: BackupPanel },
  office: { label: 'מיקום המשרד', icon: MapPin, tone: 'slate', desc: 'כדי שסיכום היום ייפתח לבד כשיוצאים מהמשרד.', panel: OfficePanel },
}

const GROUPS = [
  { title: 'צוות והרשאות', keys: ['users', 'access'] },
  { title: 'לידים ומכירות', keys: ['sources', 'leads', 'automations', 'goals'] },
  { title: 'חיבורים', keys: ['botwa', 'mail', 'brain'] },
  { title: 'מערכת', keys: ['system', 'backup', 'office'] },
]

/**
 * The management page — everything that runs the app.
 *
 * It opens on a home screen: every setting as a large card with a sentence
 * saying what it is for, in four families. A card opens its section across the
 * whole page, with the same title and sentence on top and a way back. It used
 * to be one row of twelve small tabs over a grey box — everything visible, and
 * none of it explained.
 *
 * The section is in the address (?s=), so the browser's back button returns to
 * the home screen and a section can be linked to.
 *
 * Only the admin has this page, behind their code; the page renders nothing
 * until it is answered — no flash of the roster behind the dialog.
 */
export default function ManagePage() {
  const { selectedAgent, isUnlocked, unlockAgent } = useAuth()

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

  return <ManageScreen />
}

/** The page itself, past the admin check and the code — home screen or a section. */
export function ManageScreen() {
  const [params, setParams] = useSearchParams()
  const key = params.get('s')
  const section = SECTIONS[key]
  const open = (k) => {
    setParams({ s: k })
    window.scrollTo({ top: 0 })
  }
  const home = () => {
    setParams({})
    window.scrollTo({ top: 0 })
  }

  // ── A section ──
  if (section) {
    const Panel = section.panel
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-24">
        <button
          onClick={home}
          className="inline-flex w-fit items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          כל ההגדרות
        </button>

        <header className="flex items-start gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TONES[section.tone]}`}>
            <section.icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900">{section.label}</h1>
            <p className="mt-1 text-base leading-relaxed text-slate-500">{section.desc}</p>
          </div>
        </header>

        <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:p-5">
          {section.boxed ? (
            <div className="rounded-2xl border border-slate-200 bg-white">
              <Panel />
            </div>
          ) : (
            <Panel />
          )}
        </div>
      </div>
    )
  }

  // ── The home screen ──
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-24">
      <header className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-slate-700 to-slate-900 p-6 text-white shadow-lg shadow-slate-900/20 dark:ring-1 dark:ring-white/10 sm:p-7">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
          <Settings className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">ניהול</h1>
          <p className="mt-1 text-sm text-slate-300 sm:text-base">כל ההגדרות של המערכת. שינוי כאן חל על כל מי שמשתמש בה.</p>
        </div>
      </header>

      {GROUPS.map((g) => (
        <section key={g.title} className="flex flex-col gap-3">
          <h2 className="px-1 text-sm font-extrabold tracking-wide text-slate-500">{g.title}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.keys.map((k) => {
              const s = SECTIONS[k]
              return (
                <button
                  key={k}
                  onClick={() => open(k)}
                  className="group flex items-start gap-4 rounded-3xl bg-white p-5 text-start shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300 active:scale-[0.99]"
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TONES[s.tone]}`}>
                    <s.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-lg font-extrabold text-slate-900">
                      {s.label}
                      <ChevronLeft className="h-4 w-4 text-slate-300 transition group-hover:-translate-x-0.5 group-hover:text-slate-500" aria-hidden="true" />
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-500">{s.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
