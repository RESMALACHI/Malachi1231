/**
 * KPI metric card — soft, airy style: pastel icon badge, large coloured metric,
 * and a gentle accent wave along the bottom.
 * @param {string} title
 * @param {string|number|node} value
 * @param {string} subtitle
 * @param {React.Component} icon  lucide icon
 * @param {string} accent  color key (see ACCENTS)
 * @param {React.ReactNode} children  optional extra content (e.g. a mini bar)
 */

// Per-accent palette: soft icon badge, icon colour, metric colour, wave fill.
// Full class strings so Tailwind's JIT keeps them.
const ACCENTS = {
  indigo: { iconBg: 'bg-indigo-100', icon: 'text-indigo-500', value: 'text-indigo-600', wave: '#6366f1' },
  brand: { iconBg: 'bg-indigo-100', icon: 'text-indigo-500', value: 'text-indigo-600', wave: '#6366f1' },
  green: { iconBg: 'bg-green-100', icon: 'text-green-500', value: 'text-green-600', wave: '#22c55e' },
  red: { iconBg: 'bg-red-100', icon: 'text-red-500', value: 'text-red-600', wave: '#ef4444' },
  blue: { iconBg: 'bg-blue-100', icon: 'text-blue-500', value: 'text-blue-600', wave: '#3b82f6' },
  sky: { iconBg: 'bg-sky-100', icon: 'text-sky-500', value: 'text-sky-600', wave: '#0ea5e9' },
  orange: { iconBg: 'bg-orange-100', icon: 'text-orange-500', value: 'text-orange-600', wave: '#f97316' },
  amber: { iconBg: 'bg-amber-100', icon: 'text-amber-500', value: 'text-amber-600', wave: '#f59e0b' },
  slate: { iconBg: 'bg-slate-100', icon: 'text-slate-600', value: 'text-slate-800', wave: '#64748b' },
}

export default function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'indigo',
  children,
}) {
  const a = ACCENTS[accent] || ACCENTS.indigo

  return (
    <div className="card card-interactive group relative h-full overflow-hidden rounded-3xl border-slate-100 p-6 shadow-md shadow-slate-200/50 animate-pop-in">
      {/* Soft accent waves along the bottom */}
      <svg
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full"
      >
        <path fill={a.wave} opacity="0.08" d="M0 70 C110 25 300 105 400 55 L400 120 L0 120 Z" />
        <path fill={a.wave} opacity="0.15" d="M0 92 C130 52 280 116 400 78 L400 120 L0 120 Z" />
      </svg>

      <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <div className="kpi-title text-sm font-medium text-slate-500">{title}</div>
          <div className={`kpi-value mt-1 text-4xl font-extrabold ${a.value}`}>{value}</div>
          {subtitle && (
            <div className="kpi-subtitle mt-2 inline-block rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
              {subtitle}
            </div>
          )}
        </div>
        {Icon && (
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${a.iconBg} transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6`}
          >
            <Icon className={`h-7 w-7 ${a.icon}`} aria-hidden="true" />
          </span>
        )}
      </div>

      {children && <div className="relative z-10 mt-4">{children}</div>}
    </div>
  )
}
