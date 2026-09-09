// The follow-up sequence, as a screen you can see all of at once.
//
// A flow is a story that happens to one client over days, so it is drawn as a
// timeline rather than a list of settings: the rail on the right is time, and
// reading downwards is what the client actually receives. The order is derived
// from each stage's timing (see orderedStages) and never from the order they
// were typed — a stage moved from "an hour before" to "two days before" jumps
// up the page by itself, which is the whole point of anchoring to the meeting.
//
// Editing happens IN PLACE, expanding the card. A modal would work on a desk
// and be miserable on the phone this is mostly read on.
//
// NOTHING IS SAVED AND NOTHING IS SENT. This is the interface only; the state
// lives in this component for now. The header says so plainly — a mock that
// quietly implies it is live is how someone ends up trusting a sequence that
// was never running.

import { useRef, useState } from 'react'
import {
  AlarmClock,
  CalendarCheck,
  ChevronDown,
  Clock3,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  ANCHORS,
  UNITS,
  anchorByKey,
  blankStage,
  defaultFlow,
  describeWhen,
  describeWhenShort,
  orderedStages,
  sampleValues,
  splitOffset,
  toMinutes,
} from '../../lib/waFlow'
import { PLACEHOLDERS, renderBody } from '../../services/waCustomTemplates'

const TONE = {
  green: {
    dot: 'bg-green-500 text-white ring-green-100',
    pill: 'bg-green-100 text-green-800',
    edge: 'border-green-300',
  },
  amber: {
    dot: 'bg-amber-500 text-white ring-amber-100',
    pill: 'bg-amber-100 text-amber-800',
    edge: 'border-amber-300',
  },
  slate: {
    dot: 'bg-slate-500 text-white ring-slate-100',
    pill: 'bg-slate-100 text-slate-700',
    edge: 'border-slate-300',
  },
}
const ICON = { booking: CalendarCheck, before: AlarmClock, after: MessageSquare }

const FIELD =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-green-400'

/* ── The green bubble, so the wording is judged as a message ────────── */
function Bubble({ text, muted, clamp }) {
  if (!String(text || '').trim()) {
    return (
      <p className="rounded-2xl bg-slate-50 px-3.5 py-3 text-xs italic text-slate-400">
        עדיין לא נכתבה הודעה לשלב הזה.
      </p>
    )
  }
  return (
    <div
      className={`max-w-full rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
        muted ? 'bg-slate-100 text-slate-400' : 'bg-[#dcf8c6] text-slate-800'
      }`}
    >
      <span className={`block whitespace-pre-wrap break-words ${clamp ? 'line-clamp-4' : ''}`}>
        {text}
      </span>
    </div>
  )
}

/* ── On / off ───────────────────────────────────────────────────────── */
function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        on ? 'bg-green-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
          // RTL: "on" sits at the start, which is the right-hand side.
          on ? '-translate-x-0.5' : '-translate-x-[1.375rem]'
        }`}
      />
    </button>
  )
}

/* ── When does this stage go out ────────────────────────────────────── */
function WhenPicker({ stage, onChange }) {
  const { amount, unit } = splitOffset(stage.offsetMin)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_6rem]">
      <select
        value={stage.anchor}
        onChange={(e) => onChange({ anchor: e.target.value })}
        className={`${FIELD} col-span-2 sm:col-span-1`}
      >
        {ANCHORS.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
      <input
        value={amount}
        onChange={(e) => onChange({ offsetMin: toMinutes(e.target.value, unit) })}
        inputMode="numeric"
        aria-label="כמה"
        className={`${FIELD} text-center`}
      />
      <select
        value={unit}
        onChange={(e) => onChange({ offsetMin: toMinutes(amount, e.target.value) })}
        aria-label="יחידת זמן"
        className={FIELD}
      >
        {UNITS.map((u) => (
          <option key={u.key} value={u.key}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ── One stage ──────────────────────────────────────────────────────── */
function StageCard({ stage, agentName, open, onToggleOpen, onChange, onRemove }) {
  const anchor = anchorByKey(stage.anchor)
  const tone = TONE[anchor.tone]
  const Icon = ICON[stage.anchor] || MessageSquare
  const bodyRef = useRef(null)

  const preview = renderBody(stage.body, sampleValues(agentName))

  const insert = (token) => {
    const el = bodyRef.current
    const body = stage.body || ''
    if (!el) return onChange({ body: body + token })
    const at = el.selectionStart ?? body.length
    onChange({ body: body.slice(0, at) + token + body.slice(el.selectionEnd ?? at) })
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = at + token.length
    })
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition ${
        open ? `${tone.edge} shadow-md` : 'border-slate-200 hover:border-slate-300'
      } ${stage.enabled ? '' : 'opacity-60'}`}
    >
      {/* Head: always visible, and tapping it opens the editor */}
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-right"
        >
          <span className="min-w-0 flex-1">
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold ${tone.pill}`}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {describeWhen(stage)}
            </span>
            <span className="mt-1 block truncate text-sm font-bold text-slate-800">
              {stage.title || 'ללא שם'}
            </span>
          </span>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
        <Switch
          on={stage.enabled}
          onChange={() => onChange({ enabled: !stage.enabled })}
          label={`הפעלת השלב ${stage.title}`}
        />
      </div>

      {/* Collapsed: the message itself, because that is what is being judged */}
      {!open && (
        <div className="px-3 pb-3">
          <Bubble text={preview} muted={!stage.enabled} clamp />
        </div>
      )}

      {/* Open: the editor */}
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/60 p-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">שם השלב</label>
            <input
              value={stage.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className={FIELD}
              placeholder="לדוגמה: תזכורת יום לפני"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">מתי נשלח</label>
            <WhenPicker stage={stage} onChange={onChange} />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">ההודעה</label>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insert(p.token)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-green-300 hover:text-green-700 active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              ref={bodyRef}
              value={stage.body}
              onChange={(e) => onChange({ body: e.target.value })}
              rows={7}
              className={`${FIELD} min-h-[9rem] resize-y leading-relaxed`}
              placeholder="מה נשלח ללקוח בשלב הזה…"
            />
          </div>

          <div>
            <p className="mb-1 text-[11px] font-bold text-slate-500">כך זה ייראה אצל הלקוח</p>
            <Bubble text={preview} />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> מחיקת השלב
            </button>
            <button
              type="button"
              onClick={onToggleOpen}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition active:scale-95"
            >
              סיום עריכה
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── The screen ─────────────────────────────────────────────────────── */
export default function FlowBuilder({ agentName }) {
  const [stages, setStages] = useState(defaultFlow)
  const [openId, setOpenId] = useState(null)

  const ordered = orderedStages(stages)
  const live = ordered.filter((s) => s.enabled).length

  const patch = (id, p) => setStages((all) => all.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const remove = (id) => {
    setStages((all) => all.filter((s) => s.id !== id))
    setOpenId(null)
  }
  const add = () => {
    const s = blankStage()
    setStages((all) => [...all, s])
    setOpenId(s.id)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* What this is, and honestly what it is not yet */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">התהליך שלי</h2>
              <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                תצוגה בלבד · עדיין לא פעיל
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              רצף ההודעות שהלקוח יקבל מרגע שקבעת לו פגישה. כל שלב נקבע ביחס לפגישה
              — ״יום לפני״, ״שעה לפני״ — ולכן הוא עובד לכל לקוח לבד. אפשר לערוך,
              להוסיף ולכבות שלבים; <b>עדיין לא נשמר ולא נשלח כלום</b>.
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 text-center">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-slate-900">{ordered.length}</p>
            <p className="text-[11px] text-slate-500">שלבים</p>
          </div>
          <div className="w-px bg-slate-100" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-green-600">{live}</p>
            <p className="text-[11px] text-slate-500">פעילים</p>
          </div>
          <div className="w-px bg-slate-100" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-slate-900">
              {ordered.length ? describeWhenShort(ordered[ordered.length - 1]) : '—'}
            </p>
            <p className="text-[11px] text-slate-500">השלב האחרון</p>
          </div>
        </div>
      </div>

      {/* The timeline */}
      <div>
        {ordered.map((stage, i) => (
          <div key={stage.id} className="flex gap-3">
            {/* The rail. The line grows with the card beside it. */}
            <div className="flex shrink-0 flex-col items-center pt-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ring-4 ${
                  TONE[anchorByKey(stage.anchor).tone].dot
                } ${stage.enabled ? '' : 'opacity-50'}`}
              >
                {i + 1}
              </span>
              <span className="my-1 w-px flex-1 bg-slate-200" />
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <StageCard
                stage={stage}
                agentName={agentName}
                open={openId === stage.id}
                onToggleOpen={() => setOpenId((o) => (o === stage.id ? null : stage.id))}
                onChange={(p) => patch(stage.id, p)}
                onRemove={() => remove(stage.id)}
              />
            </div>
          </div>
        ))}

        {/* Add — sits on the rail as the next node, so the sequence reads on */}
        <div className="flex gap-3">
          <div className="flex shrink-0 flex-col items-center pt-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-slate-400">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={add}
              className="mt-3 w-full rounded-2xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-bold text-slate-500 transition hover:border-green-400 hover:bg-green-50/50 hover:text-green-700 active:scale-[0.99]"
            >
              הוספת שלב לתהליך
            </button>
          </div>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
        <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
        הסדר נקבע לפי העיתוי של כל שלב — שינוי העיתוי מזיז אותו במסלול
      </p>
    </div>
  )
}
