import { PenLine, Paperclip, Check } from 'lucide-react'
import { displayValue, isEmpty } from '../../lib/formFields'
import { boxStyle } from './PageStack'

/**
 * One box on a page, as the person filling the form sees it.
 *
 *   yours, empty   blue, with its label — iForms' "fill me" look, which the
 *                  office's clients already know
 *   yours, filled  the value in ink blue
 *   not yours      quiet: the other side's box, or its value once filled
 *   error          red ring, after a failed attempt to send or sign
 */
export default function FieldBox({ field, value, boxHeightPx, editable, error, onClick, attachmentName, accent = 'sky' }) {
  const filled = !isEmpty(value)
  const size = Math.max(7, Math.min(boxHeightPx * 0.6, 16))
  const ltr = /^(number|phone|email|idNumber|date)$/.test(field.type)

  // Amber marks the agent's own boxes on the agent's fill screen.
  const tone = !editable
    ? filled
      ? 'bg-transparent'
      : 'border border-dashed border-slate-300 bg-slate-100/60'
    : accent === 'amber'
      ? filled
        ? 'bg-amber-50/80 ring-1 ring-amber-400'
        : 'border border-amber-500 bg-amber-100/90 hover:bg-amber-200/90'
      : filled
        ? 'bg-sky-50/70 ring-1 ring-sky-300'
        : 'border border-sky-500 bg-sky-100/80 hover:bg-sky-200/80'

  const content = () => {
    if (field.type === 'signature') {
      if (filled) return <img src={value} alt="חתימה" className="h-full w-full object-contain" draggable={false} />
      // Capped: sized off a signature box's height it came out at 16px and broke
      // over two lines on a phone.
      const s = Math.max(8, Math.min(size, 12))
      return (
        <span className="flex items-center gap-1 whitespace-nowrap font-bold text-sky-800" style={{ fontSize: s }}>
          <PenLine className="shrink-0" style={{ width: s, height: s }} aria-hidden="true" />
          {editable ? 'לחצו לחתימה' : 'חתימה'}
        </span>
      )
    }
    if (field.type === 'checkbox') {
      return filled ? <Check className="h-full w-full text-[#0b2e6b]" strokeWidth={3.5} aria-hidden="true" /> : null
    }
    if (field.type === 'attachment') {
      return (
        <span className="flex items-center gap-1 truncate font-bold text-sky-800" style={{ fontSize: Math.max(size, 9) }}>
          <Paperclip className="shrink-0" style={{ width: size, height: size }} aria-hidden="true" />
          {filled ? attachmentName || 'צורף ✓' : field.label || 'צירוף קובץ'}
        </span>
      )
    }
    if (filled) {
      return (
        <span
          dir={ltr ? 'ltr' : 'rtl'}
          className={`block w-full truncate font-medium text-[#0b2e6b] ${field.type === 'textarea' ? 'whitespace-pre-wrap' : ''}`}
          style={{ fontSize: size, lineHeight: 1.15, textAlign: ltr ? 'center' : 'right' }}
        >
          {displayValue(field, value)}
        </span>
      )
    }
    return (
      <span className="block w-full truncate px-0.5 font-semibold text-sky-800/80" style={{ fontSize: Math.max(size * 0.85, 7) }}>
        {editable ? field.label : ''}
        {editable && field.required && <span className="text-rose-500"> *</span>}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={editable ? onClick : undefined}
      tabIndex={editable ? 0 : -1}
      aria-label={field.label}
      className={`absolute flex items-center justify-center overflow-hidden rounded-[3px] px-0.5 transition ${tone} ${
        editable ? 'cursor-pointer' : 'cursor-default'
      } ${error ? 'ring-2 ring-rose-500' : ''}`}
      style={boxStyle(field)}
    >
      {content()}
    </button>
  )
}
