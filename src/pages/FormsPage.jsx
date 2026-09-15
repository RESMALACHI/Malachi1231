import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileSignature, History, Send, Users, Settings2, MailCheck, FileCheck2, HelpCircle, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { listTemplates } from '../services/formsService'
import HistoryTab from '../components/forms/HistoryTab'
import SendTab from '../components/forms/SendTab'
import ContactsTab from '../components/forms/ContactsTab'
import TemplatesTab from '../components/forms/TemplatesTab'
import Toast from '../components/Toast'

/**
 * טפסים — the office's own iForms: forms clients fill and sign.
 *
 * The same four places iForms has, in the same order and words, so moving over
 * costs the team nothing to learn: היסטוריית טפסים, שליחת טפסים, אנשי קשר —
 * and ניהול טפסים, which in iForms was the vendor's job and is now the office's.
 */
const TABS = [
  { key: 'history', label: 'היסטוריית טפסים', icon: History, hint: 'כל הטפסים שנשלחו — מי חתם, מי עוד ממתין, ומה אפשר לעשות עם כל אחד.' },
  { key: 'send', label: 'שליחת טפסים', icon: Send, hint: 'בוחרים טופס ולקוח, ממלאים את החלק שלכם, ושולחים ללקוח לחתימה.' },
  { key: 'contacts', label: 'אנשי קשר', icon: Users, hint: 'הלקוחות שאפשר לשלוח אליהם טפסים, והוספת לקוח חדש.' },
  { key: 'templates', label: 'ניהול טפסים', icon: Settings2, admins: true, hint: 'מעלים קובץ PDF של טופס ומסמנים עליו איפה הלקוח ממלא וחותם.' },
]

/** The whole path of a form, once — for whoever opens טפסים for the first time. */
const STEPS = [
  { icon: Settings2, title: 'מכינים טופס', text: 'מנהל מערכת מעלה PDF ומסמן עליו שדות: כחול ללקוח, כתום לנציג.', tab: 'templates' },
  { icon: Send, title: 'שולחים ללקוח', text: 'בוחרים טופס ולקוח, ממלאים את השדות הכתומים (למשל סכום) ולוחצים "שלח טופס".', tab: 'send' },
  { icon: MailCheck, title: 'הלקוח חותם', text: 'הוא מקבל קישור במייל או בווצאפ, ממלא וחותם מהטלפון. בלי הדפסה וסריקה.' },
  { icon: FileCheck2, title: 'הקובץ החתום אצלכם', text: 'נשמר בהיסטוריה לצמיתות, ועותק נשלח ללקוח במייל.', tab: 'history' },
]
const GUIDE_KEY = 'forms.guide.hidden'

export default function FormsPage() {
  const { selectedAgent } = useAuth()
  // Who may do what here is set in ניהול → עמודים והרשאות (lib/access.js).
  const { can } = useSettings()
  const canTemplates = can('forms.templates')
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab') && (!t.admins || canTemplates)) ? params.get('tab') : 'history'
  const [templates, setTemplates] = useState([])
  const [toast, setToast] = useState(null)
  const [contact, setContact] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [guide, setGuide] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_KEY) !== '1'
    } catch {
      return true
    }
  })
  const showGuide = (on) => {
    setGuide(on)
    try {
      localStorage.setItem(GUIDE_KEY, on ? '0' : '1')
    } catch {
      /* private window — the guide just shows again next time */
    }
  }

  const notify = useCallback((t) => setToast(t), [])
  const go = (key) => setParams(key === 'history' ? {} : { tab: key }, { replace: true })

  const reload = useCallback(async () => {
    try {
      setTemplates(await listTemplates())
    } catch (e) {
      setToast({ type: 'error', text: e.message || 'טעינת הטפסים נכשלה' })
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-700 text-white shadow-md">
          <FileSignature className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-gradient">טפסים</h1>
          <p className="text-sm text-slate-500">שליחת טפסים ללקוחות, מילוי וחתימה דיגיטלית.</p>
        </div>
        {!guide && (
          <button
            onClick={() => showGuide(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-50"
          >
            <HelpCircle className="h-4 w-4" />
            איך זה עובד?
          </button>
        )}
      </div>

      {guide && (
        <div className="card relative p-4 sm:p-5">
          <button
            onClick={() => showGuide(false)}
            className="absolute end-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
            aria-label="הסתרת ההסבר"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="mb-3 text-sm font-extrabold text-slate-900">איך זה עובד — ארבעה שלבים</p>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-2xl bg-sky-50/70 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-700 text-sm font-extrabold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                    <s.icon className="h-4 w-4 text-sky-700" aria-hidden="true" />
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{s.text}</p>
                  {s.tab && (s.tab !== 'templates' || canTemplates) && s.tab !== tab && (
                    <button onClick={() => go(s.tab)} className="mt-1 text-xs font-bold text-sky-700 hover:underline">
                      {TABS.find((t) => t.key === s.tab).label} ←
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <button onClick={() => showGuide(false)} className="mt-3 text-xs font-bold text-slate-500 hover:text-slate-800">
            הבנתי, אפשר להסתיר
          </button>
        </div>
      )}

      {/* The iForms bar, in the app's own colours. */}
      <nav className="flex overflow-x-auto rounded-2xl bg-sky-800 p-1 shadow-sm" aria-label="טפסים">
        {TABS.filter((t) => !t.admins || canTemplates).map((t) => {
          const Icon = t.icon
          const on = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => go(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                on ? 'bg-white text-sky-900 shadow' : 'text-sky-100 hover:bg-white/10'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          )
        })}
      </nav>
      <p className="-mt-2 px-1 text-sm font-semibold text-slate-500">{TABS.find((t) => t.key === tab).hint}</p>

      {tab === 'history' && (
        <HistoryTab
          templates={templates}
          agent={selectedAgent}
          notify={notify}
          refreshKey={refreshKey}
          canCancel={can('forms.cancel')}
          canTransfer={can('forms.transfer')}
          onGoSend={() => go('send')}
        />
      )}
      {tab === 'send' && (
        <SendTab
          templates={templates}
          agent={selectedAgent}
          notify={notify}
          contact={contact}
          setContact={setContact}
          onSent={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {tab === 'contacts' && (
        <ContactsTab
          agent={selectedAgent}
          notify={notify}
          canEdit={can('forms.contacts')}
          canTransfer={can('forms.transfer')}
          onSendTo={(c) => {
            setContact(c)
            go('send')
          }}
        />
      )}
      {tab === 'templates' && canTemplates && <TemplatesTab templates={templates} agent={selectedAgent} notify={notify} reload={reload} />}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
