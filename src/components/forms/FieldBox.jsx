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
export default function FieldBox({ field, value, boxHeightPx, editable, error, highlight = false, onClick, attachmentName, accent = 'sky' }) {
  const filled = !isEmpty(value)
  const size = Math.max(7, Math.min(boxHeightPx * 0.6, 16))
  const ltr = /^(number|phone|email|idNumber|date)$/.test(field.type)

  // Amber marks the agent's own boxes on the agent's fill screen.
  // The boxes sit on the paper, so their colours are exact values the night
  // mode remap leaves alone — a light-blue label on a white page is unreadable.
  const tone = !editable
    ? filled
      ? 'bg-transparent'
      : 'border border-dashed border-[#cbd5e1] bg-[#f1f5f9]/60'
    : accent === 'amber'
      ? filled
        ? 'bg-[#fffbeb]/80 ring-1 ring-amber-400'
        : 'border border-amber-500 bg-[#fef3c7]/90 hover:bg-[#fde68a]/90'
      : filled
        ? 'bg-[#f0f9ff]/70 ring-1 ring-[#7dd3fc]'
        : 'border border-sky-500 bg-[#e0f2fe]/80 hover:bg-[#bae6fd]/80'

  const content = () => {
    if (field.type === 'signature') {
      if (filled) return <img src={value} alt="חתימה" className="h-full w-full object-contain" draggable={false} />
      // Capped: sized off a signature box's height it came out at 16px and broke
      // over two lines on a phone.
      const s = Math.max(8, Math.min(size, 12))
      return (
        <span className="flex items-center gap-1 whitespace-nowrap font-bold text-[#075985]" style={{ fontSize: s }}>
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
        <span className="flex items-center gap-1 truncate font-bold text-[#075985]" style={{ fontSize: Math.max(size, 9) }}>
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
      <span className="block w-full truncate px-0.5 font-semibold text-[#075985]/80" style={{ fontSize: Math.max(size * 0.85, 7) }}>
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
      aria-pressed={field.type === 'checkbox' ? filled : undefined}
      className={`absolute flex items-center justify-center overflow-hidden rounded-[3px] px-0.5 transition ${tone} ${
        editable ? 'cursor-pointer' : 'cursor-default'
      } ${error ? 'ring-2 ring-rose-500' : ''} ${highlight ? 'z-10 animate-pulse ring-4 ring-amber-400' : ''}`}
      style={boxStyle(field)}
    >
      {content()}
    </button>
  )
}
