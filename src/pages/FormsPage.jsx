import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileSignature, History, Send, Users, Settings2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isAdminAgent, isManagerAgent } from '../lib/agents'
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
  { key: 'history', label: 'היסטוריית טפסים', icon: History },
  { key: 'send', label: 'שליחת טפסים', icon: Send },
  { key: 'contacts', label: 'אנשי קשר', icon: Users },
  { key: 'templates', label: 'ניהול טפסים', icon: Settings2, managers: true },
]

export default function FormsPage() {
  const { selectedAgent } = useAuth()
  const isManager = isManagerAgent(selectedAgent) || isAdminAgent(selectedAgent)
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab') && (!t.managers || isManager)) ? params.get('tab') : 'history'
  const [templates, setTemplates] = useState([])
  const [toast, setToast] = useState(null)
  const [contact, setContact] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

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
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">טפסים</h1>
          <p className="text-sm text-slate-500">שליחת טפסים ללקוחות, מילוי וחתימה דיגיטלית.</p>
        </div>
      </div>

      {/* The iForms bar, in the app's own colours. */}
      <nav className="flex overflow-x-auto rounded-2xl bg-sky-800 p-1 shadow-sm" aria-label="טפסים">
        {TABS.filter((t) => !t.managers || isManager).map((t) => {
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

      {tab === 'history' && <HistoryTab templates={templates} agent={selectedAgent} notify={notify} refreshKey={refreshKey} />}
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
          onSendTo={(c) => {
            setContact(c)
            go('send')
          }}
        />
      )}
      {tab === 'templates' && isManager && <TemplatesTab templates={templates} agent={selectedAgent} notify={notify} reload={reload} />}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
