import { useState } from 'react'
import { ChevronLeft, UserPlus, Loader2, FileSignature, Check, Mail, MessageCircle, TriangleAlert } from 'lucide-react'
import { addContact, pageUrls } from '../../services/formsService'
import { INPUT, ContactPicker, useMailReady } from './ui'
import FormFiller from './FormFiller'
import SentDialog from './SentDialog'

/** One numbered step of the send screen; the number turns into a tick once done. */
function Step({ n, title, hint, done = false, children }) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white transition ${
          done ? 'bg-green-600' : 'bg-sky-700'
        }`}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold text-slate-900">{title}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  )
}

/**
 * שליחת טפסים — iForms' send screen: pick the form, pick (or add) the
 * contact, continue to fill the agent's part, send. Numbered, and it says
 * before the agent presses on how the link will reach the client.
 */
export default function SendTab({ templates, agent, notify, contact, setContact, onSent }) {
  const mailReady = useMailReady()
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
    if (!phone && !newC.email.trim()) return setAddErr('צריך טלפון או מייל — אחרת אין לאן לשלוח את הטופס')
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

  // How the link will reach the client once sent — said before they press on.
  const emails = [contact?.email, extraEmail.trim()].filter(Boolean)
  const delivery = !contact
    ? null
    : mailReady && emails.length
      ? { tone: 'text-green-700', icon: Mail, text: `הקישור יישלח אוטומטית למייל ${emails.join(', ')}${contact.phone ? ', ואפשר גם בווצאפ' : ''}` }
      : contact.phone
        ? { tone: 'text-slate-600', icon: MessageCircle, text: `${mailReady ? 'אין מייל — ' : ''}הקישור יישלח בווצאפ ל-${contact.phone} (הווצאפ שלכם ייפתח עם הודעה מוכנה)` }
        : { tone: 'text-amber-700', icon: TriangleAlert, text: 'אין לאיש הקשר טלפון או מייל — תוכלו רק להעתיק את הקישור, או להחתים אותו במכשיר הזה' }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="card flex flex-col gap-6 p-5 sm:p-6">
        <Step n={1} done={!!template} title="בוחרים טופס" hint="מופיעים כאן הטפסים שמנהל כבר הכין בלשונית ניהול טפסים.">
          {active.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">
              עוד אין טפסים פעילים. מנהל מעלה טופס בלשונית "ניהול טפסים".
            </p>
          ) : (
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={INPUT}>
              <option value="">בחרו טופס…</option>
              {active.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </Step>

        <Step n={2} done={!!contact} title="בוחרים למי לשלוח" hint="מחפשים לפי שם, טלפון או מייל. לקוח שלא ברשימה — מוסיפים בתיבה למטה.">
          <div className="grid gap-2 sm:grid-cols-2">
            <ContactPicker value={contact} onChange={setContact} />
            <input
              value={extraEmail}
              onChange={(e) => setExtraEmail(e.target.value)}
              placeholder="מייל נוסף לקבלת הטופס — לא חובה"
              dir="ltr"
              className={`${INPUT} text-right`}
            />
          </div>
          {delivery && (
            <p className={`mt-2 flex items-start gap-1.5 text-xs font-semibold ${delivery.tone}`}>
              <delivery.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {delivery.text}
            </p>
          )}
        </Step>

        <Step n={3} title="ממלאים את החלק שלכם ושולחים" hint='בעמוד הבא: ממלאים את התיבות הכתומות (למשל סכום), ולוחצים "שלח טופס".'>
          <button
            onClick={proceed}
            disabled={!template || !contact || opening}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-6 py-3 text-base font-bold text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-40"
          >
            {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSignature className="h-5 w-5" />}
            המשך למילוי הטופס
            <ChevronLeft className="h-4 w-4" />
          </button>
          {(!template || !contact) && (
            <p className="mt-1.5 text-xs text-slate-400">{!template ? 'קודם בוחרים טופס (שלב 1)' : 'קודם בוחרים איש קשר (שלב 2)'}</p>
          )}
        </Step>
      </div>

      <div className="card flex flex-col gap-3 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <UserPlus className="h-5 w-5 text-sky-700" />
          לקוח חדש שלא ברשימה
        </p>
        <p className="-mt-1 text-sm text-slate-500">ממלאים שם ולפחות טלפון או מייל — הלקוח נשמר באנשי הקשר ונבחר לשליחה.</p>
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
          הוספה ובחירה
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
