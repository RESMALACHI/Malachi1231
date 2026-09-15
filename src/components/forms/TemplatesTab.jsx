import { useRef, useState } from 'react'
import { FilePlus2, Pencil, Loader2, FileText, Eye, EyeOff } from 'lucide-react'
import { renderPdfPages } from '../../lib/pdfPages'
import { createTemplate, pageUrls, saveTemplate } from '../../services/formsService'
import { INPUT } from './ui'
import TemplateEditor from './TemplateEditor'

/**
 * ניהול טפסים — upload the office's PDFs and draw their boxes. What iForms'
 * staff used to set up for the office is now in the office's own hands.
 */
export default function TemplatesTab({ templates, agent, notify, reload }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)
  const [editing, setEditing] = useState(null)
  const fileRef = useRef(null)

  const upload = async () => {
    if (!file || !name.trim()) return
    setProgress('קורא את הקובץ…')
    try {
      const rendered = await renderPdfPages(file, { onProgress: (n, total) => setProgress(`מכין עמוד ${n} מתוך ${total}…`) })
      setProgress('מעלה…')
      const t = await createTemplate({ name: name.trim(), file, rendered, createdBy: agent })
      setName('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await reload()
      setEditing({ ...t, pages: await pageUrls(t.pages) })
    } catch (e) {
      notify({ type: 'error', text: e.message || 'העלאת הטופס נכשלה' })
    } finally {
      setProgress(null)
    }
  }

  const edit = async (t) => {
    try {
      setEditing({ ...t, pages: await pageUrls(t.pages) })
    } catch (e) {
      notify({ type: 'error', text: e.message || 'פתיחת הטופס נכשלה' })
    }
  }

  const toggle = async (t) => {
    try {
      await saveTemplate(t.id, { active: !t.active })
      reload()
    } catch (e) {
      notify({ type: 'error', text: e.message || 'העדכון נכשל' })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-5">
        <p className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
          <FilePlus2 className="h-5 w-5 text-sky-700" />
          העלאת טופס חדש
        </p>
        <p className="-mt-1 text-sm text-slate-500">
          נותנים לטופס שם, בוחרים את קובץ ה-PDF שלו, ולוחצים "העלאה ועריכת שדות". בעורך מסמנים על הדף איפה הלקוח ממלא וחותם.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הטופס — למשל: הסכם התקשרות פרויקט הגשמה" className={INPUT} />
          <label className={`${INPUT} flex cursor-pointer items-center gap-2 truncate text-slate-500`}>
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{file ? file.name : 'בחירת קובץ PDF'}</span>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button
            onClick={upload}
            disabled={!file || !name.trim() || !!progress}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:opacity-40"
          >
            {progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
            העלאה ועריכת שדות
          </button>
        </div>
        {progress && <p className="text-sm font-semibold text-sky-700">{progress}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const client = (t.fields || []).filter((f) => f.filler !== 'sender').length
          const sender = (t.fields || []).filter((f) => f.filler === 'sender').length
          const hasSig = (t.fields || []).some((f) => f.type === 'signature')
          return (
            <div key={t.id} className={`card flex flex-col gap-2 p-4 ${t.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                <p className="min-w-0 flex-1 text-sm font-extrabold leading-snug text-slate-900">{t.name}</p>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {(t.pages || []).length} עמודים · {client} שדות ללקוח · {sender} לנציג
              </p>
              {!hasSig && (t.fields || []).length > 0 && <p className="text-xs font-bold text-amber-700">חסר שדה חתימה</p>}
              {(t.fields || []).length === 0 && <p className="text-xs font-bold text-amber-700">עוד לא סומנו שדות</p>}
              <div className="mt-auto flex gap-2 pt-1">
                <button onClick={() => edit(t)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-xs font-bold text-white hover:bg-black">
                  <Pencil className="h-3.5 w-3.5" />
                  עריכת שדות
                </button>
                <button
                  onClick={() => toggle(t)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  title={t.active ? 'הסתרה מרשימת השליחה' : 'החזרה לרשימת השליחה'}
                >
                  {t.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {t.active ? 'פעיל' : 'מוסתר'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {templates.length === 0 && <p className="py-6 text-center text-sm font-semibold text-slate-400">עוד אין טפסים — מעלים את הראשון למעלה</p>}

      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            notify({ type: 'success', text: 'הטופס נשמר' })
            reload()
          }}
        />
      )}
    </div>
  )
}
