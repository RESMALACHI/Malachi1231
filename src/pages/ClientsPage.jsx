import { useEffect, useMemo, useState } from 'react'
import {
  Contact,
  Search,
  Loader2,
  Plus,
  Check,
  Mail,
  Phone,
  ClipboardList,
  X,
  AlertTriangle,
  Link2Off,
} from 'lucide-react'
import {
  crmStatus,
  searchClients,
  getClientTasks,
  insertTask,
  setTaskCompleted,
} from '../services/crmService'

/* ── "New task" modal ─────────────────────────────────────────────── */
function NewTaskModal({ client, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!title.trim()) return
    setBusy(true)
    setErr('')
    try {
      await insertTask(client.id, { title: title.trim(), dueDate: due || null })
      onSaved()
    } catch (e) {
      setErr(e.message || 'שמירה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl animate-slide-up sm:rounded-2xl sm:pb-5 sm:animate-scale-in">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ClipboardList className="h-5 w-5 text-amber-500" /> משימה חדשה — {client.name}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">תיאור המשימה</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="לדוגמה: לחזור ללקוח לגבי הצעת מחיר"
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-amber-400 focus:bg-white"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">תאריך יעד (אופציונלי)</span>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-amber-400 focus:bg-white"
            />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            onClick={save}
            disabled={busy || !title.trim()}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-amber-600 active:scale-95 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            הוסף משימה
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Client card (with tasks) ─────────────────────────────────────── */
function ClientCard({ client }) {
  const [tasks, setTasks] = useState(null)
  const [openTasks, setOpenTasks] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const loadTasks = async () => {
    setLoadingTasks(true)
    try {
      const res = await getClientTasks(client.id)
      setTasks(res.tasks || [])
    } catch {
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  const toggleTasks = () => {
    const next = !openTasks
    setOpenTasks(next)
    if (next && tasks === null) loadTasks()
  }

  const complete = async (taskId) => {
    try {
      await setTaskCompleted(taskId)
      setTasks((t) => t.map((x) => (x.id === taskId ? { ...x, status: 'done' } : x)))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{client.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            {client.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {client.phone}
              </span>
            )}
            {client.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {client.email}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-600 active:scale-95"
        >
          <Plus className="h-4 w-4" /> משימה חדשה
        </button>
        <button
          onClick={toggleTasks}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
        >
          <ClipboardList className="h-4 w-4" /> משימות
        </button>
      </div>

      {openTasks && (
        <div className="rounded-xl bg-slate-50 p-3">
          {loadingTasks ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> טוען משימות…
            </div>
          ) : tasks && tasks.length ? (
            <ul className="flex flex-col gap-2">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                >
                  <span
                    className={
                      t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'
                    }
                  >
                    {t.title}
                  </span>
                  {t.status !== 'done' && (
                    <button
                      onClick={() => complete(t.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-200"
                    >
                      <Check className="h-3.5 w-3.5" /> בוצע
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">אין משימות ללקוח זה.</p>
          )}
        </div>
      )}

      {showNew && (
        <NewTaskModal
          client={client}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false)
            if (openTasks) loadTasks()
          }}
        />
      )}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function ClientsPage() {
  const [configured, setConfigured] = useState(null) // null=loading
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState([])
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    crmStatus()
      .then((r) => setConfigured(Boolean(r.configured)))
      .catch(() => setConfigured(false))
  }, [])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    setErr('')
    setSearched(true)
    try {
      const res = await searchClients(query.trim())
      setClients(res.clients || [])
    } catch (e) {
      setErr(e.message || 'החיפוש נכשל')
      setClients([])
    } finally {
      setSearching(false)
    }
  }

  const onKey = (e) => e.key === 'Enter' && search()

  const body = useMemo(() => {
    if (configured === null)
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" /> טוען…
        </div>
      )
    if (!configured)
      return (
        <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Link2Off className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">ה-CRM עדיין לא מחובר</h2>
          {/* The CRM is deliberately unnamed: its name is the answer to the
              sign-in question, and this string ships in the public bundle. */}
          <p className="text-sm text-slate-500">
            כדי להפעיל את עמוד הלקוחות צריך לחבר את ה-API של ה-CRM (LOGIN, Password, ProjectID).
            אחרי שיוגדרו — החיפוש והפעולות יעבדו כאן אוטומטית.
          </p>
        </div>
      )
    return (
      <>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="חפש לפי טלפון, שם או אימייל…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pe-11 text-sm outline-none transition focus:border-amber-400"
            />
          </div>
          <button
            onClick={search}
            disabled={searching || !query.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            חפש
          </button>
        </div>

        {err && (
          <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
          </p>
        )}

        {searching ? null : clients.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {clients.map((c) => (
              <ClientCard key={c.id} client={c} />
            ))}
          </div>
        ) : searched ? (
          <p className="py-10 text-center text-sm text-slate-400">לא נמצאו לקוחות תואמים.</p>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">
            הקלד טלפון או שם כדי לחפש לקוח ב-CRM.
          </p>
        )}
      </>
    )
  }, [configured, query, clients, searching, err, searched])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
          <Contact className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">לקוחות</h1>
          <p className="text-sm text-slate-500">חיפוש לקוחות מה-CRM, פתיחת משימות וחיוג — במקום אחד.</p>
        </div>
      </div>
      {body}
    </div>
  )
}
