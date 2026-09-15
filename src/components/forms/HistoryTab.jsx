import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search,
  FileDown,
  ShieldCheck,
  Link2,
  ExternalLink,
  Ban,
  Pencil,
  Trash2,
  Paperclip,
  FileSpreadsheet,
  Loader2,
  Upload,
  Mail,
  Send,
  BellRing,
} from 'lucide-react'
import { parseCsv } from '../../lib/contactImport'
import { rowsToHistory } from '../../lib/historyImport'
import {
  STATUS,
  allRequests,
  cancelRequest,
  deleteRequest,
  downloadCsv,
  fileUrl,
  getRequest,
  importHistory,
  listRequests,
  pageUrls,
  signLink,
} from '../../services/formsService'
import { emailSignLink, emailSignedCopy } from '../../services/mailService'
import { INPUT, Pager, dateFmt, useDebounced, useMailReady } from './ui'
import SentDialog from './SentDialog'
import AuditDialog from './AuditDialog'
import FormFiller from './FormFiller'
import ConfirmDialog from '../ConfirmDialog'

/**
 * A spinner that turns inside a fixed box. The box clips the turning corners,
 * so the spin can never nudge the table's layout — a bare spinning icon at the
 * edge of a scrolling table shook on hover.
 */
function Spin({ size = 'h-4 w-4' }) {
  return (
    <span className={`inline-flex shrink-0 overflow-hidden ${size}`} aria-hidden="true">
      <Loader2 className={`${size} animate-spin`} style={{ willChange: 'transform' }} />
    </span>
  )
}

const hasEmail = (r) => !!(r.contact_email || r.extra_email)

// Declared out here, not inside HistoryTab: a component defined in a render is
// a new component every render, so each refresh (a toast, a reload) rebuilt the
// button and restarted its spinner mid-turn.
function Act({ icon: Icon, label, onClick, tone = 'text-slate-500 hover:text-slate-900', busy = false }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-busy={busy || undefined}
      className={`rounded-lg p-1.5 transition-colors ${busy ? 'cursor-wait' : 'hover:bg-slate-100'} ${tone}`}
    >
      {busy ? <Spin /> : <Icon className="h-4 w-4" />}
    </button>
  )
}

/** The one thing a row most likely needs, in words — the rest as icons. */
function Main({ icon: Icon, label, onClick, cls, busy = false }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`me-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${cls}`}
    >
      {busy ? <Spin size="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

/** היסטוריית טפסים — every form sent, where it stands, and what to do next. */
export default function HistoryTab({ templates, agent, notify, refreshKey, isAdmin, onGoSend }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [data, setData] = useState({ rows: [], count: 0 })
  const [loading, setLoading] = useState(true)
  const [resend, setResend] = useState(null)
  const [audit, setAudit] = useState(null)
  const [draft, setDraft] = useState(null) // { request, template }
  const [confirm, setConfirm] = useState(null) // { kind, request }
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [mailing, setMailing] = useState(null) // request id
  const fileRef = useRef(null)
  const dsearch = useDebounced(search)
  const mailReady = useMailReady()

  // iForms' own "ייצוא לאקסל" from its history screen — the office's past
  // forms, kept here as records beside the ones sent from the app.
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
      const history = rowsToHistory(rows)
      const r = await importHistory(history)
      notify({
        type: 'success',
        text: `יובאו ${r.added} טפסים מ-iForms${r.updated ? ` · ${r.updated} עודכנו לנחתם` : ''}${r.unchanged ? ` · ${r.unchanged} כבר היו` : ''}`,
      })
      load()
    } catch (e) {
      notify({ type: 'error', text: e.message || 'הייבוא נכשל' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listRequests({ search: dsearch, status, templateId, page, pageSize }))
    } catch (e) {
      notify({ type: 'error', text: e.message || 'טעינת ההיסטוריה נכשלה' })
    } finally {
      setLoading(false)
    }
  }, [dsearch, status, templateId, page, pageSize, notify])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => setPage(0), [dsearch, status, templateId, pageSize])

  const openPdf = async (r) => {
    const w = window.open('about:blank', '_blank')
    try {
      w.location.href = await fileUrl(r.signed_pdf_path)
    } catch {
      w?.close()
      notify({ type: 'error', text: 'פתיחת הקובץ נכשלה' })
    }
  }

  const copyLink = async (r) => {
    try {
      await navigator.clipboard.writeText(signLink(r.token))
      notify({ type: 'success', text: 'הקישור הועתק' })
    } catch {
      notify({ type: 'error', text: 'ההעתקה נחסמה' })
    }
  }

  const continueDraft = async (r) => {
    try {
      const full = await getRequest(r.id)
      const snap = full.template_snapshot
      setDraft({ request: full, template: { ...snap, id: full.template_id, pages: await pageUrls(snap.pages) } })
    } catch (e) {
      notify({ type: 'error', text: e.message || 'פתיחת הטיוטה נכשלה' })
    }
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const rows = await allRequests({ search: dsearch, status, templateId })
      downloadCsv(
        `היסטוריית-טפסים-${new Date().toISOString().slice(0, 10)}.csv`,
        ['טופס', 'סטטוס', 'איש קשר', 'מייל', 'טלפון', 'יוזם', 'נוצר', 'נחתם בתאריך', 'SHA-256'],
        rows.map((r) => [
          r.template_name,
          STATUS[r.status]?.label || r.status,
          r.contact_name,
          r.contact_email,
          r.contact_phone,
          r.initiator,
          dateFmt(r.created_at),
          dateFmt(r.signed_at),
          r.signed_pdf_sha256 || '',
        ])
      )
    } catch (e) {
      notify({ type: 'error', text: e.message || 'הייצוא נכשל' })
    } finally {
      setExporting(false)
    }
  }

  /** Mail to the client about one form — the signed copy again, or a reminder to sign. */
  const mailOne = async (r, send, done) => {
    if (mailing) return
    setMailing(r.id)
    try {
      const res = await send()
      notify({ type: 'success', text: `${done} ל-${(res?.to || []).join(', ')}` })
    } catch (e) {
      notify({ type: 'error', text: e.message })
    } finally {
      setMailing(null)
    }
  }
  const remind = (r) => mailOne(r, () => emailSignLink(r.id, { agent, again: true, reminder: true }), 'התזכורת נשלחה')

  const actions = (r) => (
    <div className="flex items-center justify-end gap-0.5">
      {/* A record from iForms: the form and its file live there. */}
      {r.source === 'iforms' && r.status === 'signed' && (
        <span className="px-1.5 text-[11px] font-semibold text-slate-400" title="הקובץ החתום נמצא ב-iForms">
          הקובץ ב-iForms
        </span>
      )}
      {/* Cancelling and deleting are for system admins only (as are import and export). */}
      {isAdmin && r.source === 'iforms' && r.status !== 'signed' && (
        <Act icon={Trash2} label="מחיקת הרשומה" onClick={() => setConfirm({ kind: 'delete', request: r })} tone="text-rose-500 hover:text-rose-700" />
      )}
      {r.source !== 'iforms' && r.status === 'signed' && (
        <>
          <Main icon={FileDown} label="הקובץ החתום" onClick={() => openPdf(r)} cls="bg-green-600 text-white hover:bg-green-700" />
          {mailReady && hasEmail(r) && (
            <Act
              icon={Mail}
              busy={mailing === r.id}
              label="שליחת העותק החתום שוב במייל"
              onClick={() => mailOne(r, () => emailSignedCopy(r.id, agent), 'העותק החתום נשלח')}
              tone="text-sky-700 hover:text-sky-900"
            />
          )}
          <Act icon={ShieldCheck} label="פרטי החתימה — מתי, מאיזה מכשיר, טביעת אצבע" onClick={() => setAudit(r)} />
        </>
      )}
      {['sent', 'opened'].includes(r.status) && (
        <>
          <Main icon={Send} label="שליחה חוזרת" onClick={() => setResend(r)} cls="bg-sky-700 text-white hover:bg-sky-800" />
          {/* One click: "just reminding you — it's still waiting for your signature". */}
          {mailReady && hasEmail(r) && (
            <Act
              icon={BellRing}
              busy={mailing === r.id}
              label="תזכורת במייל — הטופס עדיין ממתין לחתימה"
              onClick={() => remind(r)}
              tone="text-sky-700 hover:text-sky-900"
            />
          )}
          <Act icon={Link2} label="העתקת הקישור לחתימה" onClick={() => copyLink(r)} />
          <Act icon={ExternalLink} label="פתיחת עמוד החתימה (כמו שהלקוח רואה)" onClick={() => window.open(signLink(r.token), '_blank')} />
          <Act icon={ShieldCheck} label="מעקב — מתי נשלח ומתי נפתח" onClick={() => setAudit(r)} />
          {isAdmin && (
            <Act icon={Ban} label="ביטול הטופס — הקישור יפסיק לעבוד" onClick={() => setConfirm({ kind: 'cancel', request: r })} tone="text-rose-500 hover:text-rose-700" />
          )}
        </>
      )}
      {r.status === 'draft' && (
        <>
          <Main icon={Pencil} label="המשך ושליחה" onClick={() => continueDraft(r)} cls="bg-sky-50 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100" />
          {isAdmin && (
            <Act icon={Trash2} label="מחיקת הטיוטה" onClick={() => setConfirm({ kind: 'delete', request: r })} tone="text-rose-500 hover:text-rose-700" />
          )}
        </>
      )}
      {r.status === 'cancelled' && r.source !== 'iforms' && (
        <>
          <Act icon={ShieldCheck} label="מעקב" onClick={() => setAudit(r)} />
          {isAdmin && (
            <Act icon={Trash2} label="מחיקה" onClick={() => setConfirm({ kind: 'delete', request: r })} tone="text-rose-500 hover:text-rose-700" />
          )}
        </>
      )}
    </div>
  )

  const badge = (s, source) => (
    <span className="inline-flex items-center gap-1">
      <span title={STATUS[s]?.hint} className={`inline-flex cursor-help whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-bold ${STATUS[s]?.cls || 'bg-slate-100'}`}>
        {STATUS[s]?.label || s}
      </span>
      {source === 'iforms' && s === 'signed' && (
        <span className="rounded bg-sky-50 px-1 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200" title="יובא מ-iForms">
          iForms
        </span>
      )}
    </span>
  )

  return (
    <div className="card flex flex-col gap-4 p-4 sm:p-5">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש חופשי" className={`${INPUT} ps-9`} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${INPUT} w-auto`}>
          <option value="">סטטוס — הכל</option>
          <option value="waiting">ממתין לחתימה</option>
          <option value="signed">נחתם</option>
          <option value="draft">טיוטה</option>
          <option value="cancelled">בוטל</option>
        </select>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={`${INPUT} w-auto max-w-[16rem]`}>
          <option value="">טופס — הכל</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setSearch('')
            setStatus('')
            setTemplateId('')
          }}
          className="rounded-xl border border-sky-600 px-3 py-2.5 text-sm font-bold text-sky-700 transition hover:bg-sky-50"
        >
          הצג הכל
        </button>
        {/* Moving data in and out — the whole client list at once — is for
            system admins only. */}
        {isAdmin && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="ms-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              title="קובץ 'ייצוא לאקסל' ממסך היסטוריית הטפסים של iForms. אפשר לייבא שוב קובץ חדש יותר — אין כפילויות."
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              ייבוא מ-iForms
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
          </>
        )}
      </div>

      {/* ── Table (desktop) ── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[12px] font-extrabold text-slate-700">
              <th className="px-2 py-2.5 text-start">טופס</th>
              <th className="px-2 py-2.5 text-start">סטטוס</th>
              <th className="px-2 py-2.5 text-start">איש קשר</th>
              <th className="px-2 py-2.5 text-start">מייל</th>
              <th className="px-2 py-2.5 text-start">טלפון</th>
              <th className="px-2 py-2.5 text-start">יוזם</th>
              <th className="px-2 py-2.5 text-start">נוצר</th>
              <th className="px-2 py-2.5 text-start">נחתם בתאריך</th>
              <th className="px-2 py-2.5 text-center">נספחים</th>
              <th className="px-2 py-2.5 text-end">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="max-w-[16rem] truncate px-2 py-3 font-semibold text-slate-800" title={r.template_name}>
                  {r.template_name}
                </td>
                <td className="px-2 py-3">{badge(r.status, r.source)}</td>
                <td className="px-2 py-3 font-semibold text-slate-800">{r.contact_name}</td>
                <td className="max-w-[12rem] truncate px-2 py-3 text-slate-600" dir="ltr" style={{ textAlign: 'right' }}>
                  {r.contact_email}
                </td>
                <td className="px-2 py-3 tabular-nums text-slate-600">{r.contact_phone}</td>
                <td className="px-2 py-3 text-slate-600">{r.initiator}</td>
                <td className="px-2 py-3 tabular-nums text-slate-600">{dateFmt(r.created_at)}</td>
                <td className="px-2 py-3 tabular-nums text-slate-600">{dateFmt(r.signed_at)}</td>
                <td className="px-2 py-3 text-center">
                  {r.attachments?.length ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                      <Paperclip className="h-3.5 w-3.5" />
                      {r.attachments.length}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2">{actions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Cards (phone) ── */}
      <div className="flex flex-col divide-y divide-slate-100 md:hidden">
        {data.rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{r.contact_name}</span>
              {badge(r.status, r.source)}
            </div>
            <p className="truncate text-xs font-semibold text-slate-500">{r.template_name}</p>
            {/* The buttons drop to a line of their own when they don't fit beside the date. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] font-semibold text-slate-400">
              <span className="whitespace-nowrap tabular-nums">{dateFmt(r.created_at)}</span>
              {r.initiator && <span className="whitespace-nowrap">· {r.initiator}</span>}
              <span className="ms-auto">{actions(r)}</span>
            </div>
          </div>
        ))}
      </div>

      {!loading && data.rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          {search || status || templateId ? (
            <p className="text-sm font-semibold text-slate-400">אין טפסים שמתאימים לסינון</p>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-600">עוד לא נשלחו טפסים</p>
              <p className="text-xs text-slate-500">כל טופס שתשלחו ללקוח יופיע כאן, עם הסטטוס שלו ומה אפשר לעשות איתו.</p>
              {onGoSend && (
                <button onClick={onGoSend} className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800">
                  <Send className="h-4 w-4" />
                  לשליחת טופס ראשון
                </button>
              )}
            </>
          )}
        </div>
      )}
      {loading && data.rows.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      <Pager page={page} pageSize={pageSize} count={data.count} onPage={setPage} onPageSize={setPageSize} />

      {resend && <SentDialog request={resend} agent={agent} resend onClose={() => setResend(null)} />}
      {audit && <AuditDialog request={audit} onClose={() => setAudit(null)} />}
      {draft && (
        <FormFiller
          template={draft.template}
          contact={{ id: draft.request.contact_id, name: draft.request.contact_name, phone: draft.request.contact_phone, email: draft.request.contact_email }}
          extraEmail={draft.request.extra_email}
          draft={draft.request}
          agent={agent}
          onClose={() => setDraft(null)}
          onFinished={(req, mode) => {
            setDraft(null)
            load()
            if (mode === 'send') setResend({ ...req })
            else notify({ type: 'success', text: mode === 'draft' ? 'הטיוטה נשמרה' : 'עמוד החתימה נפתח בלשונית חדשה' })
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'cancel' ? 'לבטל את הטופס?' : 'למחוק את הטופס?'}
          message={
            confirm.kind === 'cancel'
              ? `הקישור של ${confirm.request.contact_name} יפסיק לעבוד. הרשומה נשארת בהיסטוריה.`
              : 'הטופס יימחק מההיסטוריה.'
          }
          confirmLabel={confirm.kind === 'cancel' ? 'ביטול הטופס' : 'מחיקה'}
          onConfirm={async () => {
            try {
              if (confirm.kind === 'cancel') await cancelRequest(confirm.request.id, agent)
              else await deleteRequest(confirm.request.id)
              notify({ type: 'success', text: confirm.kind === 'cancel' ? 'הטופס בוטל' : 'הטופס נמחק' })
              load()
            } catch (e) {
              notify({ type: 'error', text: e.message || 'הפעולה נכשלה' })
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
