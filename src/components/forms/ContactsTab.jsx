import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, UserPlus, FileSpreadsheet, Upload, Send, Pencil, Trash2, Loader2, X, Check } from 'lucide-react'
import {
  addContact,
  allContacts,
  contactCreators,
  deleteContact,
  downloadCsv,
  importContacts,
  listContacts,
  updateContact,
} from '../../services/formsService'
import { parseCsv, rowsToContacts } from '../../lib/contactImport'
import { INPUT, Pager, useDebounced } from './ui'
import ConfirmDialog from '../ConfirmDialog'

/** אנשי קשר — the people forms go to. Imports iForms' Excel export in one go. */
export default function ContactsTab({ agent, notify, onSendTo }) {
  const [search, setSearch] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [creators, setCreators] = useState([])
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [data, setData] = useState({ rows: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // { id?, name, phone, email }
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const fileRef = useRef(null)
  const dsearch = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listContacts({ search: dsearch, createdBy, page, pageSize }))
    } catch (e) {
      notify({ type: 'error', text: e.message || 'טעינת אנשי הקשר נכשלה' })
    } finally {
      setLoading(false)
    }
  }, [dsearch, createdBy, page, pageSize, notify])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => setPage(0), [dsearch, createdBy, pageSize])
  useEffect(() => {
    contactCreators().then(setCreators).catch(() => {})
  }, [data.count])

  const save = async () => {
    if (!form.name?.trim()) return notify({ type: 'error', text: 'חסר שם' })
    setSaving(true)
    try {
      if (form.id) await updateContact(form.id, form)
      else await addContact({ ...form, createdBy: agent })
      setForm(null)
      load()
    } catch (e) {
      notify({ type: 'error', text: e.message || 'השמירה נכשלה' })
    } finally {
      setSaving(false)
    }
  }

  const importFile = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      let rows
      if (/\.xlsx?$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file')
        rows = await readXlsxFile(file)
      } else {
        rows = parseCsv(await file.text())
      }
      const contacts = rowsToContacts(rows)
      const { added, skipped } = await importContacts(contacts, agent)
      notify({ type: 'success', text: `נוספו ${added.toLocaleString('en-US')} אנשי קשר · ${skipped.toLocaleString('en-US')} דולגו (כבר קיימים או ללא שם)` })
      load()
    } catch (e) {
      notify({ type: 'error', text: e.message || 'הייבוא נכשל' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const rows = await allContacts({ search: dsearch, createdBy })
      downloadCsv(`אנשי-קשר-${new Date().toISOString().slice(0, 10)}.csv`, ['שם', 'טלפון', 'אימייל', 'יוצר'], rows.map((r) => [r.name, r.phone, r.email, r.created_by]))
    } catch (e) {
      notify({ type: 'error', text: e.message || 'הייצוא נכשל' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש חופשי" className={`${INPUT} ps-9`} />
        </div>
        <select value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="">יוצר — הכל</option>
          {creators.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setSearch('')
            setCreatedBy('')
          }}
          className="rounded-xl border border-sky-600 px-3 py-2.5 text-sm font-bold text-sky-700 transition hover:bg-sky-50"
        >
          הצג הכל
        </button>
        <div className="ms-auto flex flex-wrap gap-2">
          <button
            onClick={() => setForm({ name: '', phone: '', email: '' })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800"
          >
            <UserPlus className="h-4 w-4" />
            הוספת איש קשר
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            title="קובץ אקסל או CSV — למשל הייצוא מ-iForms"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            ייבוא מאקסל
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
          <button
            onClick={exportAll}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            ייצוא לאקסל
          </button>
        </div>
      </div>

      {form && (
        <div className="grid gap-2 rounded-2xl border border-sky-200 bg-sky-50/60 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="שם מלא" className={INPUT} />
          <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="נייד" dir="ltr" inputMode="tel" className={`${INPUT} text-right`} />
          <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="אימייל" dir="ltr" className={`${INPUT} text-right`} />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {form.id ? 'שמירה' : 'הוספה'}
            </button>
            <button onClick={() => setForm(null)} className="rounded-xl p-2.5 text-slate-500 hover:bg-white" aria-label="ביטול">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[12px] font-extrabold text-slate-700">
              <th className="px-2 py-2.5 text-start">שם</th>
              <th className="px-2 py-2.5 text-start">טלפון</th>
              <th className="px-2 py-2.5 text-start">אימייל</th>
              <th className="px-2 py-2.5 text-start">יוצר</th>
              <th className="px-2 py-2.5 text-end">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/70">
                <td className="px-2 py-3 font-semibold text-slate-800">{c.name}</td>
                <td className="px-2 py-3 tabular-nums text-slate-600">{c.phone}</td>
                <td className="max-w-[16rem] truncate px-2 py-3 text-slate-600" dir="ltr" style={{ textAlign: 'right' }}>
                  {c.email}
                </td>
                <td className="px-2 py-3 text-slate-600">{c.created_by}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <button onClick={() => onSendTo(c)} title="שליחת טופס" className="rounded-lg p-1.5 text-sky-700 hover:bg-sky-50">
                      <Send className="h-4 w-4" />
                    </button>
                    <button onClick={() => setForm({ id: c.id, name: c.name, phone: c.phone || '', email: c.email || '' })} title="עריכה" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setConfirm(c)} title="מחיקה" className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && data.rows.length === 0 && (
        <p className="py-10 text-center text-sm font-semibold text-slate-400">
          אין אנשי קשר עדיין — אפשר לייבא את הייצוא מ-iForms בכפתור "ייבוא מאקסל"
        </p>
      )}
      <Pager page={page} pageSize={pageSize} count={data.count} onPage={setPage} onPageSize={setPageSize} />

      {confirm && (
        <ConfirmDialog
          title="למחוק את איש הקשר?"
          message={`${confirm.name} יימחק מהרשימה. טפסים שכבר נשלחו אליו נשארים בהיסטוריה.`}
          confirmLabel="מחיקה"
          onConfirm={async () => {
            try {
              await deleteContact(confirm.id)
              load()
            } catch (e) {
              notify({ type: 'error', text: e.message || 'המחיקה נכשלה' })
            } finally {
              setConfirm(null)
            }
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
