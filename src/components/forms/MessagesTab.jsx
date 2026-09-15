import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Mail, MessageCircle, Palette, RotateCcw, Save } from 'lucide-react'
import { getFormMessages, saveFormMessages } from '../../services/formsService'
import { mailMessages, previewMail } from '../../services/mailService'
import { PLACEHOLDERS, WA_DEFAULTS, waText } from '../../lib/formMessages'
import { INPUT, useDebounced } from './ui'

// The messages a client gets, in the order a form meets them.
const KINDS = [
  { key: 'link', label: 'טופס לחתימה', channel: 'mail', hint: 'המייל שהלקוח מקבל כששולחים לו טופס.' },
  { key: 'reminder', label: 'תזכורת', channel: 'mail', hint: 'המייל שנשלח בלחיצה על הפעמון, לטופס שעוד לא נחתם.' },
  { key: 'copy', label: 'עותק חתום', channel: 'mail', hint: 'המייל שהלקוח מקבל אחרי שחתם, עם הקובץ החתום מצורף.' },
  { key: 'wa_link', label: 'ווצאפ — טופס', channel: 'wa', hint: 'ההודעה שנפתחת בווצאפ של הנציג כששולחים טופס.' },
  { key: 'wa_reminder', label: 'ווצאפ — תזכורת', channel: 'wa', hint: 'ההודעה שנפתחת בווצאפ בשליחה חוזרת.' },
]

// Header colours that read well with white text in any mail app.
const COLORS = [
  { hex: '#0369a1', name: 'תכלת' },
  { hex: '#0f172a', name: 'כהה' },
  { hex: '#b45309', name: 'זהב' },
  { hex: '#047857', name: 'ירוק' },
  { hex: '#6d28d9', name: 'סגול' },
  { hex: '#be123c', name: 'אדום' },
]

const SAMPLE = { name: 'דני כהן', templateName: 'הסכם התקשרות', link: 'https://sign.res-nadlan.co.il/sign/…' }

/**
 * עיצוב הודעות — the words and colour of everything a client receives: three
 * emails and two WhatsApp texts. Edited on the right, seen on the left exactly
 * as the client will — the email preview is rendered by the same server code
 * that sends it. Saved to app_settings 'form_messages'.
 */
export default function MessagesTab({ agent, notify }) {
  const [draft, setDraft] = useState(null)
  const [defaults, setDefaults] = useState(null)
  const [kind, setKind] = useState('link')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState({ subject: '', html: '', loading: true })
  const focused = useRef(null) // { path, el } — where a placeholder chip inserts

  // What is in force now: the server's email texts over their defaults, plus
  // the WhatsApp texts saved here.
  useEffect(() => {
    let alive = true
    Promise.all([mailMessages(), getFormMessages({ fresh: true })])
      .then(([m, saved]) => {
        if (!alive) return
        setDefaults({ ...m.defaults, ...WA_DEFAULTS })
        setDraft({ ...m.messages, wa_link: saved.wa_link || WA_DEFAULTS.wa_link, wa_reminder: saved.wa_reminder || WA_DEFAULTS.wa_reminder })
      })
      .catch((e) => notify({ type: 'error', text: e.message || 'טעינת ההודעות נכשלה' }))
    return () => {
      alive = false
    }
  }, [notify])

  const current = KINDS.find((k) => k.key === kind)

  // ── The email preview, from the server, a moment after typing stops ──
  const settled = useDebounced(draft, 400)
  useEffect(() => {
    if (!settled || current.channel !== 'mail') return
    let alive = true
    setPreview((p) => ({ ...p, loading: true }))
    previewMail(kind, settled, agent)
      .then((r) => alive && setPreview({ subject: r.subject, html: r.html, loading: false }))
      .catch(() => alive && setPreview((p) => ({ ...p, loading: false })))
    return () => {
      alive = false
    }
  }, [settled, kind, current.channel, agent])

  const get = (path) => path.split('.').reduce((o, k) => (o ? o[k] : ''), draft) ?? ''
  const set = useCallback((path, value) => {
    setDraft((d) => {
      const [a, b] = path.split('.')
      return b ? { ...d, [a]: { ...d[a], [b]: value } } : { ...d, [a]: value }
    })
    setDirty(true)
  }, [])

  // A chip goes where the cursor was — or, before any field was touched, at the
  // end of the message itself, so a click is never lost.
  const insert = (key) => {
    const f = focused.current || { path: current.channel === 'wa' ? kind : `${kind}.body`, el: null }
    const token = `{${key}}`
    const el = f.el
    const value = get(f.path)
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    set(f.path, value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const resetKind = () => {
    if (!defaults) return
    if (current.channel === 'wa') set(kind, defaults[kind])
    else setDraft((d) => ({ ...d, [kind]: { ...defaults[kind] } }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveFormMessages(draft)
      setDirty(false)
      notify({ type: 'success', text: 'ההודעות נשמרו — מעכשיו הן נשלחות כך' })
    } catch (e) {
      notify({ type: 'error', text: e.message || 'השמירה נכשלה' })
    } finally {
      setSaving(false)
    }
  }

  if (!draft) {
    return (
      <div className="card flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const field = (path, props = {}) => ({
    value: get(path),
    onChange: (e) => set(path, e.target.value),
    onFocus: (e) => (focused.current = { path, el: e.target }),
    ...props,
  })
  const chips = PLACEHOLDERS.filter((p) => !p.only || p.only.includes(kind))

  return (
    <div className="flex flex-col gap-4">
      {/* Kind picker + save */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const on = k.key === kind
            const Icon = k.channel === 'wa' ? MessageCircle : Mail
            return (
              <button
                key={k.key}
                onClick={() => {
                  focused.current = null // the fields of the last kind are gone
                  setKind(k.key)
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                  on ? 'bg-sky-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {k.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {dirty ? 'שמירה' : 'נשמר'}
        </button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* ── Editor ── */}
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-4 p-5">
            <div>
              <p className="text-lg font-extrabold text-slate-900">{current.label}</p>
              <p className="text-sm text-slate-500">{current.hint}</p>
            </div>

            {current.channel === 'mail' ? (
              <>
                <Field label="נושא המייל">
                  <input {...field(`${kind}.subject`)} maxLength={200} className={INPUT} />
                </Field>
                <Field label="התוכן" hint="כל שורה היא פסקה. השורה הראשונה מודגשת בצבע כהה.">
                  <textarea {...field(`${kind}.body`)} rows={6} maxLength={3000} className={`${INPUT} resize-y leading-relaxed`} />
                </Field>
                {kind !== 'copy' && (
                  <Field label="הטקסט על הכפתור">
                    <input {...field(`${kind}.button`)} maxLength={60} className={INPUT} />
                  </Field>
                )}
              </>
            ) : (
              <Field label="ההודעה" hint="אם תמחקו את {קישור}, הקישור יתווסף לבד בסוף ההודעה.">
                <textarea {...field(kind)} rows={7} maxLength={1500} className={`${INPUT} resize-y leading-relaxed`} />
              </Field>
            )}

            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-500">הוספת פרט אישי — לוחצים והוא נכנס במקום הסמן:</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(p.key)}
                    className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200 transition-colors hover:bg-sky-100"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={resetKind} className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">
              <RotateCcw className="h-3.5 w-3.5" />
              חזרה לנוסח המקורי של ההודעה הזו
            </button>
          </div>

          {/* The look of every email */}
          {current.channel === 'mail' && (
            <div className="card flex flex-col gap-4 p-5">
              <p className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                <Palette className="h-5 w-5 text-sky-700" />
                העיצוב של כל המיילים
              </p>
              <Field label="השם בראש המייל">
                <input {...field('brand')} maxLength={60} className={INPUT} />
              </Field>
              <Field label="צבע">
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => {
                    const on = draft.color === c.hex
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => set('color', c.hex)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                          on ? 'ring-2 ring-slate-900 ring-offset-2' : 'ring-1 ring-slate-200 hover:ring-slate-300'
                        }`}
                      >
                        <span className="h-5 w-5 rounded-md" style={{ background: c.hex }} />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field label="פתיחה">
                <input {...field('greeting')} maxLength={200} className={INPUT} />
              </Field>
              <Field label="שורה בתחתית המייל">
                <input {...field('footer')} maxLength={500} className={INPUT} />
              </Field>
            </div>
          )}
        </div>

        {/* ── Preview ── */}
        <div className="flex flex-col gap-2 lg:sticky lg:top-20">
          <p className="px-1 text-xs font-extrabold text-slate-500">כך הלקוח יראה את זה (עם שם לדוגמה)</p>
          {current.channel === 'mail' ? (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm">
                <span className="font-bold text-slate-400">נושא:</span>
                <span className="min-w-0 flex-1 truncate font-bold text-slate-800">{preview.subject}</span>
                {preview.loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />}
              </div>
              <iframe title="תצוגה מקדימה של המייל" srcDoc={preview.html} sandbox="" className="h-[560px] w-full bg-slate-100" />
            </div>
          ) : (
            <div className="card flex min-h-[320px] flex-col justify-end gap-2 bg-[#e5ddd5] p-4">
              <div className="ms-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-se-sm bg-[#d9fdd3] px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm">
                {waText(kind, draft, { ...SAMPLE, initiator: agent })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
