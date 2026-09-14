import { useMemo } from 'react'
import { Swords, Mic, MicOff, Volume2, VolumeX, Phone, Trophy, CalendarCheck2, Flame, Users, ChevronLeft } from 'lucide-react'
import { PERSONAS, personaById } from '../../lib/simPersonas'
import { useMediaQuery } from '../../lib/useViewport'
import { PersonaAvatar, LevelChip, OutcomeBadge, AR_FONT, scoreHue } from './parts'

const DAY = 86_400_000

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60_000) return 'עכשיו'
  if (d < 3_600_000) return `לפני ${Math.round(d / 60_000)} דק׳`
  if (d < DAY) return `לפני ${Math.round(d / 3_600_000)} שע׳`
  const days = Math.round(d / DAY)
  return days === 1 ? 'אתמול' : `לפני ${days} ימים`
}

function ScorePill({ score }) {
  if (typeof score !== 'number') return <span className="text-[11px] font-bold text-slate-100/35">—</span>
  const h = scoreHue(score)
  return (
    <span
      className="inline-flex min-w-[2.4rem] justify-center rounded-full px-2 py-0.5 text-[11.5px] font-black tabular-nums"
      style={{ background: `hsl(${h} 80% 55% / .18)`, color: `hsl(${h} 90% 72%)` }}
    >
      {score}
    </span>
  )
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 sm:gap-2 sm:px-3">
      <Icon className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      <span className="text-lg font-black tabular-nums text-white">{value}</span>
      <span className="truncate text-[11px] font-bold text-slate-100/50">{label}</span>
    </div>
  )
}

export default function Lobby({ agentName, sessions, team, voiceInfo, onStart, onOpen }) {
  const phone = useMediaQuery('(max-width: 639px)')
  const week = sessions.filter((s) => Date.now() - new Date(s.created_at).getTime() < 7 * DAY)
  const scored = sessions.filter((s) => typeof s.score === 'number')
  const best = scored.reduce((mx, s) => Math.max(mx, s.score), 0)
  const bestBy = useMemo(() => {
    const b = {}
    for (const s of scored) b[s.persona] = Math.max(b[s.persona] ?? 0, s.score)
    return b
  }, [scored])

  const teamRows = useMemo(() => {
    if (!team) return null
    const by = {}
    for (const s of team) {
      const r = (by[s.agent_name] ||= { name: s.agent_name, n: 0, sum: 0, scored: 0, booked: 0, last: s.created_at })
      r.n += 1
      if (typeof s.score === 'number') {
        r.sum += s.score
        r.scored += 1
      }
      if (s.outcome === 'booked') r.booked += 1
      if (s.created_at > r.last) r.last = s.created_at
    }
    return Object.values(by).sort((a, b) => b.n - a.n)
  }, [team])

  return (
    // Scrolls inside the stage on a desktop; on a phone the stage grows and the
    // page itself scrolls — one scroll, not two nested ones.
    <div className="sm:h-full sm:overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-4">
        {/* ── Title ── */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-black text-white sm:text-3xl">
              <Swords className="h-7 w-7 text-amber-300" aria-hidden="true" />
              זירת אימון
            </h1>
            <p className="mt-1 max-w-xl text-[13px] font-semibold leading-relaxed text-slate-100/55">
              שיחות קביעה מול לקוחות וירטואליים. כל אחד מסתיר דאגה אמיתית — מי ששואל מגלה אותה, מי שנואם מאבד אותו.
              אף ליד אמיתי לא נשרף.
            </p>
          </div>
          {/* Three equal tiles across a phone; a loose row beside the title above it. */}
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Stat icon={Flame} value={week.length} label="השבוע" />
            <Stat icon={Trophy} value={scored.length ? best : '—'} label="שיא" />
            <Stat icon={CalendarCheck2} value={sessions.filter((s) => s.outcome === 'booked').length} label="נקבעו" />
          </div>
        </div>

        {/* ── Device check — said up front, not discovered mid-call ── */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11.5px] font-bold">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              voiceInfo.listen ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-100/60'
            }`}
          >
            {voiceInfo.listen ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
            {voiceInfo.listen ? 'זיהוי דיבור פעיל' : 'הדפדפן לא מזהה דיבור — מקלידים'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              voiceInfo.natural
                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                : 'border-amber-300/25 bg-amber-300/10 text-amber-100'
            }`}
          >
            {voiceInfo.anyVoice ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {voiceInfo.natural
              ? 'קול טבעי'
              : voiceInfo.anyVoice
                ? phone
                  ? 'קול רובוטי · ב-Edge נשמע טבעי'
                  : 'קול רובוטי — ב-Microsoft Edge הלקוחות נשמעים כמו אנשים'
                : 'אין קול במכשיר — הלקוח יופיע כטקסט'}
          </span>
        </div>

        {/* ── The prospects ── */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((p) => {
            const ar = p.lang === 'ar'
            const arStyle = ar ? { fontFamily: AR_FONT } : undefined
            return (
              <button
                key={p.id}
                onClick={() => onStart(p)}
                aria-label={`להתקשר ל${p.name}`}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-3.5 text-start sm:p-4 transition duration-200 hover:-translate-y-0.5 hover:border-amber-300/40 hover:shadow-2xl hover:shadow-black/40 active:scale-[0.99]"
              >
                <span
                  className="pointer-events-none absolute -end-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl transition group-hover:opacity-45"
                  style={{ background: `hsl(${p.hue} 90% 55%)` }}
                  aria-hidden="true"
                />
                {/* A phone gets a dense row — face, who, the line they open with,
                    and a round call button — so six prospects fit in two
                    screens instead of four. Wider screens get the full card. */}
                <div className="relative flex items-center gap-3">
                  <PersonaAvatar persona={p} size={phone ? 46 : 52} />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-extrabold text-white">
                      <span style={arStyle}>{p.name}</span>
                      <span className="ms-1.5 text-xs font-bold text-slate-100/45">{p.age}</span>
                    </p>
                    <p className="truncate text-[12px] font-semibold text-slate-100/55" style={arStyle}>
                      {p.job} · {p.city}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[12.5px] font-bold leading-snug text-slate-100/80 sm:hidden" style={arStyle}>
                      ״{p.teaser}״
                    </p>
                  </div>
                  {bestBy[p.id] != null && (
                    <span className="hidden flex-col items-center sm:flex" title="השיא שלך מולו">
                      <ScorePill score={bestBy[p.id]} />
                      <span className="mt-0.5 text-[9px] font-bold text-slate-100/35">שיא</span>
                    </span>
                  )}
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-slate-900 shadow-lg shadow-amber-500/25 sm:hidden"
                    aria-hidden="true"
                  >
                    <Phone className="h-5 w-5" />
                  </span>
                </div>
                <p
                  className="relative mt-3 hidden rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-[13.5px] font-bold leading-relaxed text-slate-100/85 sm:block"
                  style={arStyle}
                >
                  ״{p.teaser}״
                </p>
                <div className="relative mt-2.5 flex items-center gap-2 sm:mt-3">
                  <LevelChip level={p.level} />
                  {ar && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10.5px] font-bold text-slate-100/70">
                      ערבית
                    </span>
                  )}
                  {bestBy[p.id] != null && (
                    <span className="flex items-center gap-1 text-[10.5px] font-bold text-slate-100/45 sm:hidden">
                      שיא <ScorePill score={bestBy[p.id]} />
                    </span>
                  )}
                  <span className="ms-auto hidden items-center gap-1.5 rounded-full bg-gradient-to-l from-amber-500 to-yellow-400 px-3 py-1.5 text-[12px] font-extrabold text-slate-900 shadow-lg shadow-amber-500/20 transition group-hover:brightness-105 sm:inline-flex">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    להתקשר
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* ── My calls ── */}
        {sessions.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-[10.5px] font-extrabold tracking-wide text-amber-300/80">השיחות האחרונות שלך</p>
            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {sessions.slice(0, 8).map((s) => {
                const p = personaById(s.persona)
                if (!p) return null
                return (
                  <button
                    key={s.id}
                    onClick={() => onOpen(s)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-white/[0.05]"
                  >
                    <PersonaAvatar persona={p} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-white" style={p.lang === 'ar' ? { fontFamily: AR_FONT } : undefined}>
                        {p.name}
                      </span>
                      <span className="block text-[10.5px] font-semibold text-slate-100/40">{timeAgo(s.created_at)}</span>
                    </span>
                    <OutcomeBadge outcome={s.outcome} small />
                    <ScorePill score={s.score} />
                    <ChevronLeft className="h-4 w-4 text-slate-100/30" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── The team (managers) ── */}
        {teamRows && teamRows.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-wide text-amber-300/80">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              הצוות · 30 הימים האחרונים
            </p>
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
              <table className="w-full min-w-[420px] text-[12.5px]">
                <thead>
                  <tr className="text-[10.5px] font-bold text-slate-100/45">
                    <th className="px-3 py-2 text-start">סוכן</th>
                    <th className="px-3 py-2">שיחות</th>
                    <th className="px-3 py-2">ציון ממוצע</th>
                    <th className="px-3 py-2">נקבעו</th>
                    <th className="px-3 py-2">אחרונה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {teamRows.map((r) => (
                    <tr key={r.name} className={r.name === agentName ? 'bg-amber-300/[0.06]' : ''}>
                      <td className="px-3 py-2 font-bold text-white">{r.name}</td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-slate-100/80">{r.n}</td>
                      <td className="px-3 py-2 text-center">
                        <ScorePill score={r.scored ? Math.round(r.sum / r.scored) : null} />
                      </td>
                      <td className="px-3 py-2 text-center font-bold tabular-nums text-slate-100/80">{r.booked}</td>
                      <td className="px-3 py-2 text-center text-[11px] font-semibold text-slate-100/45">{timeAgo(r.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
