import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  CheckCircle2,
  Info,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import {
  agentRows,
  getFunnelWithPrevious,
  insights,
  leadIntake,
  pct,
  rate,
  shekels,
  stages,
} from '../services/funnelService'
import Spinner from './Spinner'
import WhatIfSimulator from './WhatIfSimulator'

const TONE = {
  good: { icon: CheckCircle2, box: 'border-green-200 bg-green-50', mark: 'text-green-600' },
  bad: { icon: TriangleAlert, box: 'border-red-200 bg-red-50', mark: 'text-red-600' },
  warn: { icon: TriangleAlert, box: 'border-amber-200 bg-amber-50', mark: 'text-amber-600' },
  info: { icon: Info, box: 'border-slate-200 bg-slate-50', mark: 'text-slate-500' },
}

/**
 * The manager's funnel: where people enter, where they fall out, and what the
 * month is telling you to do about it.
 *
 * Every stage is measured against the stage ABOVE it rather than against the
 * top, because that is the number a manager can act on — "half the meetings we
 * booked never happened" is a decision, "0.4% of calls became a sale" is a
 * shrug.
 */
export default function FunnelReport({ year, month, monthLabel }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setData(null)
    setError('')
    try {
      setData(await getFunnelWithPrevious(year, month))
    } catch (e) {
      setError(e?.message || 'טעינת המשפך נכשלה')
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
    )
  }
  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const { current, previous } = data
  const t = current?.totals || {}
  const p = previous?.totals || {}
  const settled = (t.attended || 0) + (t.no_show || 0)
  const rows = agentRows(current)
  const notes = insights(current, previous)
  const steps = stages(current)
  const top = Math.max(...steps.map((s) => s.value), 1)
  const intake = leadIntake(current)

  return (
    <div className="space-y-5">
      {/* Headline */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Head label="פגישות שנקבעו" value={t.booked || 0} prev={p.booked || 0} />
        <Head
          label="אחוז הגעה"
          value={rate(t.attended || 0, settled)}
          prev={rate(p.attended || 0, (p.attended || 0) + (p.no_show || 0))}
          isPct
        />
        <Head label="עסקאות" value={t.deals || 0} prev={p.deals || 0} />
        <Head label="הכנסות" value={Number(t.revenue || 0)} prev={Number(p.revenue || 0)} isMoney />
      </div>

      {/* The funnel */}
      <section className="card p-4">
        <h3 className="mb-1 font-extrabold text-slate-900">המשפך · {monthLabel}</h3>
        <p className="mb-4 text-xs text-slate-500">
          כל שלב נמדד מול השלב שמעליו — שם נמצא מה שאפשר לתקן.
        </p>

        <div className="space-y-0.5">
          {steps.map((s, i) => {
            const conv = s.of && !s.unreliable ? rate(s.value, s.of) : null
            // LOG scale, not linear. Calls are counted in thousands and deals in
            // tens, so on a linear axis the top bar is full and the other four
            // all sit on the minimum — a picture with no shape, and the shape is
            // the only reason to draw bars at all. Log keeps every stage visible
            // and keeps the order true (186 reads wider than 144). The exact
            // figure is printed beside it; the bar is only there to show the
            // narrowing.
            const width = Math.max(4, (Math.log1p(s.value) / Math.log1p(top)) * 100)
            const weak = conv !== null && conv < 40 && s.of >= 10
            return (
              <div key={s.key}>
                {i > 0 && (
                  <div className="flex items-start gap-1.5 py-2 ps-1">
                    <ArrowDown
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300"
                      aria-hidden="true"
                    />
                    {/* min-w-0 so a long explanation wraps inside the card
                        instead of running off the edge of a phone. */}
                    {s.unreliable ? (
                      <span className="min-w-0 text-[11px] leading-snug text-amber-600">
                        {s.unreliableNote}
                      </span>
                    ) : conv !== null ? (
                      <span
                        className={`min-w-0 text-[11px] leading-snug font-bold ${
                          weak ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {pct(conv)} {s.ofLabel || 'מהשלב הקודם'}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300">—</span>
                    )}
                  </div>
                )}
                {/* The label sits ABOVE the bar, not inside it. Inside, its
                    room was the bar's width — so the narrow stages, which are
                    exactly the ones worth reading, came out as "עסק…". */}
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-slate-800">{s.label}</span>
                    <span className="shrink-0 text-lg font-extrabold text-slate-900">
                      {s.value.toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-slate-800 to-slate-500 transition-all duration-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  {s.note && (
                    <div className="mt-0.5 text-[11px] leading-tight text-slate-400">{s.note}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Leads: a different way in, so it stands beside the funnel not inside it */}
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-extrabold text-slate-900">לידים נכנסים</h3>
          <span className="text-2xl font-extrabold text-slate-900">{intake.leads}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          לידים מגיעים מהוובהוקים שבעמוד הניהול — ערוץ נפרד מהשיחות היוצאות, ולכן
          הם לא חלק מהשרשרת שלמעלה.
        </p>
        {intake.bySource.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {intake.bySource.map((x) => (
              <span
                key={x.source}
                className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600"
              >
                {x.source}: {x.leads}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* What to do about it */}
      {notes.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-extrabold text-slate-900">
            <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
            מה לשפר ומה לשמר
          </h3>
          <div className="space-y-2">
            {notes.map((n, i) => {
              const tone = TONE[n.tone] || TONE.info
              const Icon = tone.icon
              return (
                <div key={i} className={`flex gap-3 rounded-2xl border p-3 ${tone.box}`}>
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.mark}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{n.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{n.body}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <WhatIfSimulator funnel={current} />

      {/* Per agent */}
      <section className="card overflow-hidden">
        <h3 className="border-b border-slate-100 p-4 font-extrabold text-slate-900">לפי סוכן</h3>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">אין נתונים לחודש הזה.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] text-slate-500">
                  <Th>סוכן</Th>
                  <Th>שיחות</Th>
                  <Th>ארוכות</Th>
                  <Th>נקבעו</Th>
                  <Th>הגיעו</Th>
                  <Th>% הגעה</Th>
                  <Th>עסקאות</Th>
                  <Th>% סגירה</Th>
                  <Th>הכנסות</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.name} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{a.name}</td>
                    <Td>{a.calls}</Td>
                    <Td>{a.long_calls}</Td>
                    <Td>{a.booked}</Td>
                    <Td>{a.attended}</Td>
                    <Td>
                      <Rate value={a.showRate} sample={a.settled} good={65} bad={45} />
                    </Td>
                    <Td>{a.deals}</Td>
                    <Td>
                      <Rate value={a.closeRate} sample={a.attended} good={30} bad={15} />
                    </Td>
                    <Td>{a.revenue ? shekels(a.revenue) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-relaxed text-slate-400">
          אחוזי הגעה וסגירה מחושבים רק מפגישות שכבר עבר זמנן. אחוז שמבוסס על פחות
          מ-5 פגישות מוצג בהיר — הוא עדיין לא אומר הרבה.
        </p>
      </section>
    </div>
  )
}

function Th({ children }) {
  return <th className="px-3 py-2 text-start font-bold">{children}</th>
}
function Td({ children }) {
  return <td className="px-3 py-2.5 text-slate-700">{children}</td>
}

/**
 * A rate, coloured by whether it is good — but greyed out when it rests on too
 * few meetings to mean anything. One meeting attended is not a 100% agent.
 */
function Rate({ value, sample, good, bad }) {
  if (value === null) return <span className="text-slate-300">—</span>
  const thin = (sample || 0) < 5
  const colour = thin
    ? 'text-slate-400'
    : value >= good
      ? 'text-green-600'
      : value <= bad
        ? 'text-red-600'
        : 'text-slate-700'
  return <span className={`font-bold ${colour}`}>{pct(value, 0)}</span>
}

/** A headline number with the same number from last month under it. */
function Head({ label, value, prev, isPct = false, isMoney = false }) {
  const fmt = (v) =>
    v === null || v === undefined
      ? '—'
      : isPct
        ? pct(v, 0)
        : isMoney
          ? shekels(v)
          : Number(v).toLocaleString('en-US')

  const both = Number.isFinite(value) && Number.isFinite(prev) && prev !== 0
  const change = both ? ((value - prev) / Math.abs(prev)) * 100 : null
  // A percentage that moved from 40 to 50 rose by ten POINTS, not by 25%.
  const delta = isPct && Number.isFinite(value) && Number.isFinite(prev) ? value - prev : change
  const up = delta !== null && delta > 0
  const flat = delta === null || Math.abs(delta) < 1

  return (
    <div className="card p-3">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold text-slate-900">{fmt(value)}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[11px]">
        {flat ? (
          <span className="text-slate-400">ללא שינוי מהחודש שעבר</span>
        ) : (
          <>
            {up ? (
              <TrendingUp className="h-3 w-3 text-green-600" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-600" aria-hidden="true" />
            )}
            <span className={up ? 'font-bold text-green-600' : 'font-bold text-red-600'}>
              {up ? '+' : ''}
              {isPct ? `${Math.round(delta)} נק׳` : `${Math.round(delta)}%`}
            </span>
            <span className="text-slate-400">מול {fmt(prev)}</span>
          </>
        )}
      </p>
    </div>
  )
}
