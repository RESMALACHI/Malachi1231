import { useCallback, useState } from 'react'
import {
  BookOpen,
  Video,
  ExternalLink,
  Copy,
  Check,
  Landmark,
  Link as LinkIcon,
  CalendarRange,
  MapPin,
  GraduationCap,
} from 'lucide-react'
import { ZOOM_ROOMS, LINKS, BANK_ACCOUNTS, accountAsText } from '../lib/quickInfo'
import PushCard from '../components/PushCard'

const LINK_ICON = {
  hagshama: GraduationCap,
  schedule: CalendarRange,
  branches: MapPin,
}

/** Copy-to-clipboard with a short confirmation — the whole point of this page. */
function useCopy() {
  const [copiedId, setCopiedId] = useState(null)
  const copy = useCallback(async (id, text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Older/permission-blocked browsers: fall back to a temporary textarea.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* nothing else to try */
      }
      document.body.removeChild(ta)
    }
    setCopiedId(id)
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1600)
  }, [])
  return { copiedId, copy }
}

function CopyBtn({ id, text, copiedId, onCopy, label = 'העתק' }) {
  const done = copiedId === id
  return (
    <button
      onClick={() => onCopy(id, text)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-200 active:scale-95 ${
        done
          ? 'bg-green-600 text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'הועתק' : label}
    </button>
  )
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 px-1">
        <Icon className="h-4 w-4 text-amber-500" aria-hidden="true" />
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400">· {subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

export default function InfoPage() {
  const { copiedId, copy } = useCopy()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
          <BookOpen className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-gradient">מידע שימושי</h1>
          <p className="text-sm text-slate-500">
            כל הקישורים והפרטים במקום אחד — בלחיצה אחת להעתקה.
          </p>
        </div>
      </div>

      {/* Notifications are per-device, so this belongs on the page an agent
          opens on whichever phone or computer they're using. */}
      <PushCard />

      {/* ── Zoom rooms ── */}
      <Section icon={Video} title="חדרי זום" subtitle="לשליחה ללקוח">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ZOOM_ROOMS.map((r) => (
            <div key={r.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white">
                  <Video className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.hint}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-700 active:scale-95"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  פתח זום
                </a>
                <CopyBtn
                  id={`zoom-${r.id}`}
                  text={r.url}
                  copiedId={copiedId}
                  onCopy={copy}
                  label="העתק קישור"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Links ── */}
      <Section icon={LinkIcon} title="קישורים">
        <div className="flex flex-col gap-3">
          {LINKS.map((l) => {
            const Icon = LINK_ICON[l.id] || LinkIcon
            return (
              <div key={l.id} className="card flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{l.name}</p>
                  <p className="truncate text-xs text-slate-400" dir="ltr">
                    {l.hint}
                  </p>
                </div>
                <CopyBtn id={`link-${l.id}`} text={l.url} copiedId={copiedId} onCopy={copy} />
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`פתיחת ${l.name}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:-translate-y-0.5 hover:bg-slate-800 active:scale-95"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Bank accounts ── */}
      <Section icon={Landmark} title="חשבונות בנק" subtitle="לחיצה על שורה מעתיקה אותה">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BANK_ACCOUNTS.map((acc) => (
            <div key={acc.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <Landmark className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="font-bold text-slate-900">{acc.name}</p>
              </div>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {acc.fields.map((f) => {
                  const id = `${acc.id}-${f.label}`
                  const done = copiedId === id
                  return (
                    <button
                      key={f.label}
                      onClick={() => copy(id, f.value)}
                      title={`העתקת ${f.label}`}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-right transition hover:bg-slate-50"
                    >
                      <span className="text-xs font-semibold text-slate-500">{f.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-bold tabular-nums text-slate-900">{f.value}</span>
                        {done ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

              <CopyBtn
                id={`acc-${acc.id}`}
                text={accountAsText(acc)}
                copiedId={copiedId}
                onCopy={copy}
                label="העתק את כל הפרטים"
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
