import { useState } from 'react'
import { ChevronLeft, UserPlus, Loader2, FileSignature } from 'lucide-react'
import { addContact, pageUrls } from '../../services/formsService'
import { INPUT, ContactPicker } from './ui'
import FormFiller from './FormFiller'
import SentDialog from './SentDialog'

/**
 * שליחת טפסים — iForms' send screen: pick the form, pick (or add) the
 * contact, continue to fill the agent's part, send.
 */
export default function SendTab({ templates, agent, notify, contact, setContact, onSent }) {
  const [templateId, setTemplateId] = useState('')
  const [extraEmail, setExtraEmail] = useState('')
  const [opening, setOpening] = useState(false)
  const [filling, setFilling] = useState(null) // template with page urls
  const [sent, setSent] = useState(null)
  const [newC, setNewC] = useState({ name: '', email: '', phone: '' })
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState('')

  const active = templates.filter((t) => t.active)
  const template = active.find((t) => t.id === templateId)

  const proceed = async () => {
    if (!template || !contact) return
    setOpening(true)
    try {
      setFilling({ ...template, pages: await pageUrls(template.pages) })
    } catch (e) {
      notify({ type: 'error', text: e.message || 'פתיחת הטופס נכשלה' })
    } finally {
      setOpening(false)
    }
  }

  const add = async () => {
    setAddErr('')
    const phone = newC.phone.replace(/\D/g, '')
    if (!newC.name.trim()) return setAddErr('חסר שם מלא')
    if (phone && phone.length !== 10) return setAddErr('נייד — 10 ספרות')
    if (newC.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newC.email.trim())) return setAddErr('מייל לא תקין')
    setAdding(true)
    try {
      const c = await addContact({ ...newC, createdBy: agent })
      setContact(c)
      setNewC({ name: '', email: '', phone: '' })
      notify({ type: 'success', text: `${c.name} נוסף/ה ונבחר/ה` })
    } catch (e) {
      setAddErr(e.message || 'ההוספה נכשלה')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <p className="mb-2 text-lg font-extrabold text-slate-900">בחירת טופס</p>
          {active.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">
              עוד אין טפסים פעילים. מעלים טופס בלשונית "ניהול טפסים".
            </p>
          ) : (
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={INPUT}>
              <option value="">נא בחרו</option>
              {active.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <p className="mb-2 text-lg font-extrabold text-slate-900">בחירת איש קשר (לקוח/עובד)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ContactPicker value={contact} onChange={setContact} />
            <input
              value={extraEmail}
              onChange={(e) => setExtraEmail(e.target.value)}
              placeholder="מייל נוסף של איש הקשר — לא חובה"
              dir="ltr"
              className={`${INPUT} text-right`}
            />
          </div>
        </div>

        <button
          onClick={proceed}
          disabled={!template || !contact || opening}
          className="mx-auto inline-flex items-center gap-2 rounded-xl bg-sky-700 px-8 py-3 text-base font-bold text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-40"
        >
          {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSignature className="h-5 w-5" />}
          המשך
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="card flex flex-col gap-3 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <UserPlus className="h-5 w-5 text-sky-700" />
          הוספת איש קשר
        </p>
        <p className="-mt-1 text-sm text-slate-500">איש קשר חדש שאינו קיים ברשימה</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input value={newC.name} onChange={(e) => setNewC({ ...newC, name: e.target.value })} placeholder="שם מלא" className={INPUT} />
          <input value={newC.email} onChange={(e) => setNewC({ ...newC, email: e.target.value })} placeholder="אימייל" dir="ltr" className={`${INPUT} text-right`} />
          <input
            value={newC.phone}
            onChange={(e) => setNewC({ ...newC, phone: e.target.value })}
            placeholder="נייד (10 ספרות)"
            inputMode="tel"
            dir="ltr"
            className={`${INPUT} text-right`}
          />
        </div>
        {addErr && <p className="text-sm font-bold text-rose-600">{addErr}</p>}
        <button
          onClick={add}
          disabled={adding}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
        >
          {adding && <Loader2 className="h-4 w-4 animate-spin" />}
          הוסף לקוח
        </button>
      </div>

      {filling && (
        <FormFiller
          template={filling}
          contact={contact}
          extraEmail={extraEmail}
          agent={agent}
          onClose={() => setFilling(null)}
          onFinished={(req, mode) => {
            setFilling(null)
            onSent?.()
            if (mode === 'send') setSent(req)
            else notify({ type: 'success', text: mode === 'draft' ? 'הטיוטה נשמרה בהיסטוריה' : 'עמוד החתימה נפתח בלשונית חדשה' })
            if (mode !== 'draft') {
              setTemplateId('')
              setContact(null)
              setExtraEmail('')
            }
          }}
        />
      )}
      {sent && <SentDialog request={sent} agent={agent} onClose={() => setSent(null)} />}
    </div>
  )
}
