/**
 * Reusable segmented button group.
 *
 * @param {string} value            currently selected option value
 * @param {Array}  options          [{ value, label, icon?, activeClass? }]
 * @param {func}   onChange         (value) => void
 * @param {bool}   disabled
 * @param {string} ariaLabel
 * @param {'md'|'lg'} size
 * @param {bool}   grow             stretch options to fill the row (equal width)
 */
export default function ToggleGroup({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  size = 'md',
  grow = false,
}) {
  // md is taller on phones (≈44px touch target) and compact from `sm:` up —
  // marking attendance is the app's core tap and fingers miss 34px buttons.
  const pad = size === 'lg' ? 'px-4 py-3 text-base' : 'px-3 py-2.5 text-sm sm:py-1.5'
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-1 ${
        grow ? 'flex w-full' : 'flex-wrap'
      }`}
    >
      {options.map((opt) => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            aria-pressed={active}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${
              grow ? 'flex-1' : ''
            } ${
              active
                ? `${opt.activeClass || 'bg-slate-900 text-white shadow-sm'} animate-pop`
                : 'text-slate-500 hover:bg-white hover:text-slate-700'
            }`}
          >
            {Icon && <Icon className={iconSize} aria-hidden="true" />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
