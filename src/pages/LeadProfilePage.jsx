import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckSquare,
  Flag,
  Loader2,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  Send,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { REAL_AGENTS } from '../lib/agents'
import { toWaNumber } from '../lib/waTemplates'
import { supabase } from '../lib/supabaseClient'
import {
  addActivity,
  deleteActivity,
  getLead,
  listActivities,
  setActivityDone,
  setLeadAgent,
  setLeadHandled,
  setLeadRelevant,
} from '../services/leadsService'
import { searchMeetings } from '../services/meetingsService'
import Spinner from '../components/Spinner'

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400'

const MEETING_KINDS = [
  { key: 'zoom', label: 'זום' },
  { key: 'ramatgan', label: 'פרונטלי רמת גן' },
  { key: 'haifa', label: 'פרונטלי חיפה' },
  { key: 'zahar', label: 'פרונטלי צח״ר' },
]

const pad = (n) => String(n).padStart(2, '0')
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`
const dmyhm = (d) => `${dmy(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * The lead's file — BMBY's תיק מתעניין, over our data.
 *
 * Top to bottom exactly as the office reads it there: the header band with the
 * phone as a green chip, an "יש פגישה במערכת" card when the calendar already
 * holds one, the detail fields, the auto-computed תמצית strip, and one unified
 * הערות/פגישות/משימות table — notes, dated tasks and real calendar meetings
 * interleaved, newest first.
 */
export default function LeadProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { selectedAgent } = useAuth()

  const [lead, setLead] = useState(null)
  const [missing, setMissing] = useState(false)
  const [activities, setActivities] = useState([])
  const [meetings, setMeetings] = useState([])
  const [composer, setComposer] = useState(null) // null | 'note' | 'task' | 'meeting'
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    const row = await getLead(id).catch(() => null)
    if (!row) {
      setMissing(true)
      return
    }
    setLead(row)
    listActivities(id).then(setActivities).catch(() => {})
    if (row.phone) {
      searchMeetings(null, row.phone, { allAgents: true })
        .then(setMeetings)
        .catch(() => setMeetings([]))
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  /** One table out of three streams — the BMBY grid. */
  const tableRows = useMemo(() => {
    const acts = activities.map((a) => ({
      id: `a-${a.id}`,
      raw: a,
      kind: a.kind, // note | task
      when: new Date(a.created_at),
      agent: a.author || '',
      content: a.content,
      due: a.kind === 'task' && a.due_date ? new Date(a.due_date + 'T00:00') : null,
      done: a.done,
    }))
    const meets = meetings.map((m) => ({
      id: `m-${m.id}`,
      raw: m,
      kind: 'meeting',
      when: new Date(m.meeting_date),
      agent: m.agent_name || '',
      content: m.title,
      due: new Date(m.meeting_date),
      status: m.status,
    }))
    return [...acts, ...meets].sort((x, y) => y.when - x.when)
  }, [activities, meetings])

  /** The תמצית chips — computed, not typed. */
  const summary = useMemo(() => {
    if (!lead) return []
    const chips = []
    const openTasks = activities.filter((a) => a.kind === 'task' && !a.done).length
    if (openTasks > 0) chips.push({ text: openTasks === 1 ? 'משימה פתוחה' : `${openTasks} משימות פתוחות`, tone: 'amber' })

    const lastTouch = tableRows[0]?.when || new Date(lead.created_at)
    const quiet = Math.floor((Date.now() - lastTouch.getTime()) / 86_400_000)
    if (quiet >= 3) chips.push({ text: `שקט ${quiet} ימים`, tone: 'red' })

    const since = new Date(lead.created_at)
    chips.push({
      text: `${tableRows.length} פעילויות · מאז ${pad(since.getMonth() + 1)}/${since.getFullYear()}`,
      tone: 'slate',
    })
    const noShows = meetings.filter((m) => m.status === 'no_show').length
    if (noShows > 0) chips.push({ text: `${noShows} אי-הגעות`, tone: 'red' })
    return chips
  }, [lead, activities, meetings, tableRows])

  const lastLine = tableRows.find((r) => r.kind === 'note')?.content || tableRows[0]?.content || ''

  const upcomingMeeting = useMemo(
    () => meetings.filter((m) => new Date(m.meeting_date) > new Date()).sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))[0] || null,
    [meetings]
  )

  if (missing) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="font-bold text-slate-700">הליד הזה לא נמצא — ייתכן שנמחק.</p>
        <Link to="/leads" className="mt-3 inline-block text-sm font-bold text-amber-600 hover:underline">
          חזרה למתעניינים
        </Link>
      </div>
    )
  }
  if (!lead) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const done = lead.status === 'done'

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 self-start text-sm font-bold text-slate-500 transition hover:text-slate-800"
      >
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
        חזרה
      </button>

      {/* ── Header band ── */}
      <header className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-gradient">{lead.name || 'ליד ללא שם'}</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              שלב מכירה: <b className={done ? 'text-green-700' : 'text-slate-700'}>{done ? 'טופל' : upcomingMeeting ? 'לפני פגישה' : 'מתעניין'}</b>
              <span className="mx-1.5 text-slate-300">·</span>
              בטיפול של: <b className="text-slate-700">{lead.agent_name || 'ללא שיוך'}</b>
            </p>
          </div>

          {lead.phone && (
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-2 rounded-full bg-green-500 px-4 py-1.5 font-mono text-sm font-bold text-white shadow-sm transition hover:bg-green-600 active:scale-95"
                dir="ltr"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {lead.phone}
              </a>
              <a
                href={`https://wa.me/${toWaNumber(lead.phone)}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25d366] text-white transition hover:brightness-105 active:scale-95"
                aria-label="ווצאפ"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        {/* The BMBY meeting card — shown when the calendar already has one */}
        {upcomingMeeting && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50/60 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
              <Check className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-green-700">פגישה במערכת</p>
              <p className="truncate text-sm font-bold text-slate-800">
                {lead.name || upcomingMeeting.title}
                <span className="ms-2 font-mono text-xs text-slate-500" dir="ltr">
                  {pad(new Date(upcomingMeeting.meeting_date).getHours())}:
                  {pad(new Date(upcomingMeeting.meeting_date).getMinutes())} ·{' '}
                  {dmy(new Date(upcomingMeeting.meeting_date))}
                </span>
              </p>
            </div>
            <Link
              to={`/?meeting=${upcomingMeeting.id}`}
              className="shrink-0 rounded-xl bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-green-700 active:scale-95"
            >
              פתח ביומן
            </Link>
          </div>
        )}

        {/* Detail fields — the labeled pairs of the תיק */}
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
          <Field label='דוא"ל' value={lead.email} dir="ltr" />
          <Field label="מקור הגעה" value={lead.source_name} />
          <Field label="הערות" value={lead.note} />
          <Field label="תאריך כניסה" value={dmyhm(new Date(lead.created_at))} dir="ltr" />
        </dl>

        {/* Verdicts + owner */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <button
            onClick={() => {
              setLead((l) => ({ ...l, status: done ? 'new' : 'done' }))
              setLeadHandled(lead.id, !done).catch(load)
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition active:scale-95 ${
              done ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
            }`}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {done ? 'טופל' : 'ממתין לטיפול'}
          </button>
          <button
            onClick={() => {
              setLead((l) => ({ ...l, relevant: !l.relevant }))
              setLeadRelevant(lead.id, !lead.relevant).catch(load)
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition active:scale-95 ${
              lead.relevant ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-700'
            }`}
          >
            {lead.relevant ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
            {lead.relevant ? 'רלוונטי' : 'לא רלוונטי'}
          </button>

          <label className="ms-auto flex items-center gap-2 text-xs font-semibold text-slate-500">
            שייך ל:
            <select
              value={lead.agent_name || ''}
              onChange={(e) => {
                setLead((l) => ({ ...l, agent_name: e.target.value || null }))
                setLeadAgent(lead.id, e.target.value || null).catch(load)
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500"
            >
              <option value="">ללא שיוך</option>
              {REAL_AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* ── תמצית הליד ── */}
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-extrabold text-slate-900">תמצית הליד</h2>
          <span className="text-[10px] font-bold tracking-wide text-amber-600">מכללת R.E.S</span>
          <div className="ms-auto flex flex-wrap gap-1.5">
            {summary.map((c, i) => (
              <span
                key={i}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  c.tone === 'red'
                    ? 'bg-red-50 text-red-700'
                    : c.tone === 'amber'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {c.text}
              </span>
            ))}
          </div>
        </div>
        {lastLine && (
          <p className="mt-2 truncate text-sm text-slate-600">
            <b>אחרון:</b> {lastLine}
          </p>
        )}
      </section>

      {/* ── הערות/פגישות/משימות ── */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="font-extrabold text-slate-900">הערות/פגישות/משימות</h2>
          <div className="flex gap-1.5">
            {[
              { key: 'note', label: 'הערה', icon: StickyNote },
              { key: 'task', label: 'משימה', icon: CheckSquare },
              { key: 'meeting', label: 'פגישה', icon: CalendarPlus },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setComposer(composer === t.key ? null : t.key)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition active:scale-95 ${
                  composer === t.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {composer && (
          <div className="border-b border-slate-100 bg-slate-50/70 p-4">
            {composer === 'note' && (
              <NoteForm
                onAdd={async (content) => {
                  const row = await addActivity(lead.id, { kind: 'note', content, author: selectedAgent })
                  setActivities((a) => [row, ...a])
                  setComposer(null)
                }}
              />
            )}
            {composer === 'task' && (
              <TaskForm
                onAdd={async (content, due) => {
                  const row = await addActivity(lead.id, { kind: 'task', content, due_date: due, author: selectedAgent })
                  setActivities((a) => [row, ...a])
                  setComposer(null)
                }}
              />
            )}
            {composer === 'meeting' && (
              <MeetingForm
                lead={lead}
                agent={lead.agent_name || selectedAgent}
                onBooked={async (title) => {
                  setToast(`✅ הפגישה נוצרה ביומן (${title}) — תופיע כאן תוך רגע`)
                  setComposer(null)
                  const row = await addActivity(lead.id, {
                    kind: 'note',
                    content: `נקבעה פגישה: ${title}`,
                    author: selectedAgent,
                  }).catch(() => null)
                  if (row) setActivities((a) => [row, ...a])
                  setTimeout(load, 12_000)
                }}
              />
            )}
          </div>
        )}
        {toast && (
          <p className="border-b border-slate-100 bg-green-50 px-4 py-2 text-sm font-semibold text-green-800">
            {toast}
          </p>
        )}

        {tableRows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            עדיין אין רשומות — ההערה, המשימה או הפגישה הראשונה תופיע כאן.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">
                  <th className="w-9 px-2 py-2 text-center">#</th>
                  <th className="w-9 px-1 py-2" aria-label="סטטוס" />
                  <th className="px-3 py-2 text-start">תאריך</th>
                  <th className="w-10 px-1 py-2 text-center">סוג</th>
                  <th className="px-3 py-2 text-start">נציג</th>
                  <th className="px-3 py-2 text-start">תוכן</th>
                  <th className="px-3 py-2 text-start">תאריך יעד</th>
                  <th className="w-9 px-1 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableRows.map((r, i) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-2 py-2.5 text-center text-slate-400">{i + 1}</td>
                    <td className="px-1 py-2.5 text-center">
                      {r.kind === 'task' ? (
                        <button
                          onClick={() => {
                            setActivities((list) =>
                              list.map((x) => (x.id === r.raw.id ? { ...x, done: !x.done } : x))
                            )
                            setActivityDone(r.raw.id, !r.done).catch(load)
                          }}
                          aria-pressed={r.done}
                          aria-label={r.done ? 'החזרת המשימה לפתוחה' : 'סימון המשימה כבוצעה'}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-md border-2 transition active:scale-90 ${
                            r.done
                              ? 'border-green-600 bg-green-600 text-white'
                              : 'border-slate-300 text-transparent hover:border-green-400'
                          }`}
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : r.kind === 'meeting' ? (
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            r.status === 'attended'
                              ? 'bg-green-500'
                              : r.status === 'no_show'
                                ? 'bg-red-500'
                                : 'bg-slate-300'
                          }`}
                          title={r.status === 'attended' ? 'הגיע' : r.status === 'no_show' ? 'לא הגיע' : 'טרם עודכן'}
                        />
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500" dir="ltr">
                      {dmy(r.when)}
                    </td>
                    <td className="px-1 py-2.5 text-center">
                      {r.kind === 'meeting' ? (
                        <CalendarDays className="inline h-4 w-4 text-indigo-500" aria-label="פגישה" />
                      ) : r.kind === 'task' ? (
                        <Flag className="inline h-4 w-4 text-red-500" aria-label="משימה" />
                      ) : (
                        <MessageSquare className="inline h-4 w-4 text-emerald-500" aria-label="הערה" />
                      )}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 text-xs text-slate-600">
                      {r.agent || '—'}
                    </td>
                    <td className="max-w-[340px] px-3 py-2.5">
                      <span
                        className={`block truncate ${
                          r.kind === 'task' && r.done ? 'text-slate-400 line-through' : 'text-slate-700'
                        }`}
                        title={r.content}
                      >
                        {r.content}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs" dir="ltr">
                      {r.due ? (
                        <span
                          className={
                            r.kind === 'task' && !r.done && r.raw.due_date <= todayKey()
                              ? 'font-bold text-red-600'
                              : 'text-slate-500'
                          }
                        >
                          {r.kind === 'meeting' ? dmyhm(r.due) : dmy(r.due)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-1 py-2.5 text-center">
                      {r.kind !== 'meeting' && (
                        <button
                          onClick={() => {
                            setActivities((list) => list.filter((x) => x.id !== r.raw.id))
                            deleteActivity(r.raw.id).catch(load)
                          }}
                          className="rounded-md p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                          aria-label="מחיקת הרשומה"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, value, dir }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-xs font-bold text-slate-400">{label}:</dt>
      <dd className="min-w-0 truncate text-slate-700" dir={dir}>
        {value || '—'}
      </dd>
    </div>
  )
}

function NoteForm({ onAdd }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim() || busy) return
        setBusy(true)
        await onAdd(text.trim()).catch(() => {})
        setBusy(false)
      }}
      className="flex gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        placeholder="מה חדש עם הליד הזה?"
        className={FIELD}
      />
      <button type="submit" disabled={busy || !text.trim()} className="btn-primary shrink-0 px-3" aria-label="הוספת הערה">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -scale-x-100" aria-hidden="true" />}
      </button>
    </form>
  )
}

function TaskForm({ onAdd }) {
  const [text, setText] = useState('')
  const [due, setDue] = useState(todayKey())
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim() || !due || busy) return
        setBusy(true)
        await onAdd(text.trim(), due).catch(() => {})
        setBusy(false)
      }}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        placeholder="מה לעשות? (לדוגמה: לחזור אליו אחרי 17:00)"
        className={FIELD}
      />
      <input
        type="date"
        value={due}
        min={todayKey()}
        onChange={(e) => setDue(e.target.value)}
        className={`${FIELD} sm:w-44`}
        aria-label="תאריך יעד"
      />
      <button type="submit" disabled={busy || !text.trim()} className="btn-primary shrink-0 px-4">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'הוספה'}
      </button>
    </form>
  )
}

/**
 * Books a REAL meeting — through the same path the WhatsApp bot uses, so it
 * lands in the office's actual Google calendar with the same title format,
 * attribution and bonus behavior as any booking.
 */
function MeetingForm({ lead, agent, onBooked }) {
  const [form, setForm] = useState({ date: todayKey(), time: '', kind: 'zoom', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canSubmit = lead.phone && form.date && form.time && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setErr('')
    try {
      const { data, error } = await supabase.functions.invoke('lead-meeting', {
        body: {
          name: lead.name || 'ללא שם',
          phone: lead.phone,
          date: form.date,
          time: form.time,
          kind: form.kind,
          agent,
          note: form.note,
        },
      })
      if (error || !data?.ok) {
        throw new Error(
          (data?.errors && data.errors.join(' · ')) || data?.error || error?.message || 'נכשל'
        )
      }
      onBooked(data.title)
    } catch (e2) {
      setErr(String(e2?.message || 'הקביעה נכשלה'))
    } finally {
      setBusy(false)
    }
  }

  if (!lead.phone) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
        לליד הזה אין מספר טלפון — אי אפשר לקבוע פגישה בלעדיו.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-600">תאריך</span>
          <input
            type="date"
            value={form.date}
            min={todayKey()}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-600">שעה</span>
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
            className={FIELD}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-xs font-bold text-slate-600">סוג</span>
          <select
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            className={FIELD}
          >
            {MEETING_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        value={form.note}
        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        placeholder="הערה לפגישה (לא חובה)"
        className={FIELD}
      />

      <p className="text-[11px] leading-relaxed text-slate-400">
        הפגישה תיווצר <b>ביומן גוגל האמיתי</b> על שם {agent}, בדיוק כמו קביעה דרך
        הבוט בווצאפ, ותופיע ביומן שבאפליקציה תוך רגעים.
      </p>

      {err && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>
      )}

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" aria-hidden="true" />}
        {busy ? 'קובע…' : 'קביעת הפגישה ביומן'}
      </button>
    </form>
  )
}
