import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Save,
  Loader2,
  Type,
  AlignRight,
  Hash,
  Calendar,
  Phone,
  AtSign,
  IdCard,
  CheckSquare,
  PenLine,
  Paperclip,
  Trash2,
  Copy,
  MousePointer2,
} from 'lucide-react'
import { FIELD_TYPES, FILLERS, PREFILLS, clampField, newField } from '../../lib/formFields'
import { saveTemplate } from '../../services/formsService'
import PageStack, { boxStyle } from './PageStack'

const PROP_INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-sky-500'

const ICONS = {
  text: Type,
  textarea: AlignRight,
  number: Hash,
  date: Calendar,
  phone: Phone,
  email: AtSign,
  idNumber: IdCard,
  checkbox: CheckSquare,
  signature: PenLine,
  attachment: Paperclip,
}

/**
 * Drawing the boxes on a template.
 *
 * Pick a type, click on the page where it goes — the tool stays in hand, so a
 * contract with fifteen boxes is fifteen clicks. Drag a box to move it, pull
 * its corner to resize, Delete to remove, Ctrl+D to duplicate, arrows to nudge.
 * The panel beside the pages edits the selected box: label, type, who fills
 * it (the client, or the agent before sending), required, and prefill.
 */
export default function TemplateEditor({ template, onClose, onSaved }) {
  const [name, setName] = useState(template.name)
  const [fields, setFields] = useState(template.fields || [])
  const [selectedId, setSelectedId] = useState(null)
  const [tool, setTool] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const drag = useRef(null)
  const pageEls = useRef({})

  const selected = fields.find((f) => f.id === selectedId) || null

  const change = useCallback((updater) => {
    setFields((cur) => (typeof updater === 'function' ? updater(cur) : updater))
    setDirty(true)
  }, [])

  const patchSelected = (patch) =>
    change((cur) => cur.map((f) => (f.id === selectedId ? clampField({ ...f, ...patch }) : f)))

  const remove = useCallback(() => {
    if (!selectedId) return
    change((cur) => cur.filter((f) => f.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, change])

  const duplicate = useCallback(() => {
    const f = fields.find((x) => x.id === selectedId)
    if (!f) return
    // Straight below the original — the usual reason to duplicate is the next line.
    const copy = clampField({ ...f, id: newField(f.type, f.page, 0, 0).id, y: f.y + f.h + 0.006 })
    change((cur) => [...cur, copy])
    setSelectedId(copy.id)
  }, [fields, selectedId, change])

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'Escape') {
        setTool(null)
        setSelectedId(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        remove()
      } else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey) && selectedId) {
        e.preventDefault()
        duplicate()
      } else if (selectedId && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 0.01 : 0.002
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        change((cur) => cur.map((f) => (f.id === selectedId ? clampField({ ...f, x: f.x + d[0], y: f.y + d[1] }) : f)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, remove, duplicate, change])

  // ── Unsaved work is not lost to a stray click on "close" ──
  const close = () => {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?')) return
    onClose()
  }

  // ── Dragging and resizing, measured against the page the box is on ──
  useEffect(() => {
    const move = (e) => {
      const d = drag.current
      if (!d) return
      const dx = (e.clientX - d.startX) / d.rect.width
      const dy = (e.clientY - d.startY) / d.rect.height
      setFields((cur) =>
        cur.map((f) => {
          if (f.id !== d.id) return f
          return d.mode === 'move'
            ? clampField({ ...f, x: d.orig.x + dx, y: d.orig.y + dy })
            : clampField({ ...f, w: d.orig.w + dx, h: d.orig.h + dy })
        })
      )
      d.moved = true
    }
    const up = () => {
      if (drag.current?.moved) setDirty(true)
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const startDrag = (e, f, mode) => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(f.id)
    const el = pageEls.current[f.page]
    if (!el) return
    drag.current = { id: f.id, mode, startX: e.clientX, startY: e.clientY, rect: el.getBoundingClientRect(), orig: { ...f } }
  }

  const placeOnPage = (e, pageIndex) => {
    if (!tool) {
      setSelectedId(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const f = newField(tool, pageIndex, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
    change((cur) => [...cur, f])
    setSelectedId(f.id)
  }

  const save = async () => {
    if (!name.trim()) {
      setErr('לטופס צריך שם')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const saved = await saveTemplate(template.id, { name: name.trim(), fields })
      setDirty(false)
      onSaved?.(saved)
    } catch (e) {
      setErr(e.message || 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  const counts = { client: fields.filter((f) => f.filler !== 'sender').length, sender: fields.filter((f) => f.filler === 'sender').length }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-100" dir="rtl">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
          className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1.5 text-lg font-extrabold text-slate-900 outline-none hover:border-slate-200 focus:border-sky-400"
          aria-label="שם הטופס"
        />
        <span className="hidden text-xs font-semibold text-slate-500 sm:inline">
          {counts.client} שדות ללקוח · {counts.sender} לנציג
        </span>
        {err && <span className="text-xs font-bold text-rose-600">{err}</span>}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? 'שמירה' : 'נשמר'}
        </button>
        <button onClick={close} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="סגירה">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Pages ── */}
        <div className={`min-w-0 flex-1 overflow-y-auto p-4 sm:p-8 ${tool ? 'cursor-crosshair' : ''}`}>
          <div className="mx-auto max-w-[900px]">
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-800 md:hidden">
              עריכת שדות נוחה במחשב — כאן אפשר רק לצפות
            </p>
            <PageStack
              pages={template.pages}
              pageRef={(i, el) => (pageEls.current[i] = el)}
              renderOverlay={(pi) => (
                <div className="absolute inset-0" onPointerDown={(e) => e.target === e.currentTarget && placeOnPage(e, pi)}>
                  {fields
                    .filter((f) => f.page === pi)
                    .map((f) => {
                      const Icon = ICONS[f.type] || Type
                      const isSel = f.id === selectedId
                      const sender = f.filler === 'sender'
                      return (
                        <div
                          key={f.id}
                          onPointerDown={(e) => startDrag(e, f, 'move')}
                          className={`absolute flex cursor-move items-center gap-1 overflow-hidden rounded-[3px] border px-1 text-[10px] font-bold ${
                            // On the paper: exact colours, the same by night.
                            sender
                              ? 'border-amber-500 bg-[#fde68a]/60 text-[#78350f]'
                              : 'border-[#0284c7] bg-[#bae6fd]/60 text-[#0c4a6e]'
                          } ${isSel ? 'z-10 ring-2 ring-offset-1 ring-[#0f172a]' : ''}`}
                          style={boxStyle(f)}
                          title={`${f.label} · ${FIELD_TYPES[f.type]?.label}`}
                        >
                          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{f.label}</span>
                          {f.required && <span className="text-[#e11d48]">*</span>}
                          {isSel && (
                            <span
                              onPointerDown={(e) => startDrag(e, f, 'resize')}
                              className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-[#ffffff] bg-[#0f172a]"
                              aria-label="שינוי גודל"
                            />
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            />
          </div>
        </div>

        {/* ── Tools and properties ── */}
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-s border-slate-200 bg-white md:flex">
          <div className="border-b border-slate-100 p-4">
            <p className="mb-2 text-xs font-extrabold text-slate-500">הוספת שדה — בוחרים ולוחצים על הדף</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setTool(null)}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold transition ${
                  !tool ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <MousePointer2 className="h-3.5 w-3.5" />
                בחירה
              </button>
              {Object.entries(FIELD_TYPES).map(([key, t]) => {
                const Icon = ICONS[key]
                return (
                  <button
                    key={key}
                    onClick={() => setTool((cur) => (cur === key ? null : key))}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-bold transition ${
                      tool === key ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
            {tool && <p className="mt-2 text-[11px] font-semibold text-sky-700">לחצו על הדף כדי להוסיף · Esc לסיום</p>}
          </div>

          {selected ? (
            <div className="flex flex-col gap-3 p-4">
              <p className="text-xs font-extrabold text-slate-500">השדה הנבחר</p>
              <Prop label="כותרת השדה">
                <input value={selected.label} onChange={(e) => patchSelected({ label: e.target.value })} className={PROP_INPUT} />
              </Prop>
              <Prop label="סוג">
                <select value={selected.type} onChange={(e) => patchSelected({ type: e.target.value })} className={PROP_INPUT}>
                  {Object.entries(FIELD_TYPES).map(([k, t]) => (
                    <option key={k} value={k}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Prop>
              <Prop label="מי ממלא">
                <select value={selected.filler} onChange={(e) => patchSelected({ filler: e.target.value })} className={PROP_INPUT}>
                  {Object.entries(FILLERS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Prop>
              <Prop label="מילוי אוטומטי">
                <select value={selected.prefill || ''} onChange={(e) => patchSelected({ prefill: e.target.value })} className={PROP_INPUT}>
                  {Object.entries(PREFILLS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Prop>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={!!selected.required}
                  onChange={(e) => patchSelected({ required: e.target.checked })}
                  className="h-4 w-4 accent-sky-700"
                />
                שדה חובה
              </label>
              <div className="mt-1 flex gap-2">
                <button onClick={duplicate} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <Copy className="h-3.5 w-3.5" />
                  שכפול
                </button>
                <button onClick={remove} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" />
                  מחיקה
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                גוררים כדי להזיז · הפינה השחורה משנה גודל · חצים להזזה עדינה (Shift — צעד גדול) · Ctrl+D שכפול · Delete מחיקה
              </p>
            </div>
          ) : (
            <div className="p-4 text-sm leading-relaxed text-slate-500">
              <p className="font-bold text-slate-700">איך בונים טופס</p>
              <ol className="mt-2 list-decimal space-y-1 ps-4 text-xs">
                <li>בוחרים סוג שדה למעלה ולוחצים על המקום בדף.</li>
                <li>לוחצים על שדה כדי לקבוע לו כותרת, ומי ממלא אותו:</li>
                <li className="list-none">
                  <span className="font-bold text-sky-700">כחול</span> — הלקוח ממלא.{' '}
                  <span className="font-bold text-amber-700">כתום</span> — הנציג ממלא לפני השליחה (למשל סכום).
                </li>
                <li>שם, טלפון ומייל יכולים להתמלא לבד מאיש הקשר ("מילוי אוטומטי").</li>
                <li>שומרים — והטופס מופיע ב"שליחת טפסים".</li>
              </ol>

              <p className="mt-4 font-bold text-slate-700">מוכן לשליחה?</p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {[
                  [fields.length > 0, 'סומן לפחות שדה אחד'],
                  [fields.some((f) => f.type === 'signature' && f.filler !== 'sender'), 'יש שדה חתימה של הלקוח'],
                  [!dirty, 'השינויים נשמרו'],
                ].map(([ok, label]) => (
                  <li key={label} className={`flex items-center gap-1.5 font-semibold ${ok ? 'text-green-700' : 'text-amber-700'}`}>
                    <span className="w-4 text-center">{ok ? '✓' : '•'}</span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body
  )
}

function Prop({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      {children}
    </label>
  )
}
