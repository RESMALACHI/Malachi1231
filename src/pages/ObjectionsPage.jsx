import { useEffect, useMemo, useState } from 'react'
import {
  BookOpenCheck,
  Check,
  Copy,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { callingName, genderOf } from '../lib/agents'
import { applyVars, DEFAULT_SPEECH, LANGS, parseSpeech } from '../lib/speechScript'
import { getSpeech } from '../services/settingsService'

const LANG_KEY = 'mt_speech_lang'

const WORD_GROUPS = [
  ['יקר', 'מחיר', 'עולה', 'עלות', 'כסף', 'תקציב', 'תשלום', 'مصاري', 'غالي', 'سعر', 'تكلفة'],
  ['זמן', 'עסוק', 'עבודה', 'פנוי', 'אחר כך', 'وقت', 'شغل', 'مشغول'],
  ['חומר', 'פרטים', 'מידע', 'לשלוח', 'ווטסאפ', 'مواد', 'تفاصيل', 'معلومات', 'واتساب'],
  ['אשתי', 'אישה', 'בעלי', 'להתייעץ', 'שותף', 'مرتي', 'جوزي', 'استشير'],
  ['רחוק', 'להגיע', 'זום', 'סניף', 'بعيد', 'أوصل', 'زوم', 'فرع'],
  ['קורס', 'לימודים', 'תעודה', 'ליווי', 'دورة', 'تعليم', 'شهادة', 'مرافقة'],
]

const UI = {
  he: {
    title: 'ספריית התנגדויות',
    eyebrow: 'כל תשובה במקום אחד',
    subtitle: 'כותבים מה הלקוח אמר ומקבלים מיד את התשובה המאושרת מתוך הספיץ׳ של R.E.S.',
    placeholder: 'מה הלקוח אמר? לדוגמה: יקר לי, אין לי זמן…',
    approved: 'תשובות מאושרות',
    best: 'הכי מתאים',
    stage: 'שלב בשיחה',
    copy: 'העתקת תשובה',
    copied: 'הועתק',
    empty: 'לא נמצאה תשובה קרובה. מנהל יכול להוסיף אותה דרך עריכת הספיץ׳.',
    hint: 'החיפוש מזהה את הרעיון גם כשהלקוח משתמש במילים אחרות.',
    customer: 'ניסוח עבור',
    male: 'לקוח',
    female: 'לקוחה',
    suggestions: ['יקר לי', 'אין לי זמן', 'תשלחו חומר', 'צריך להתייעץ', 'זה כמו קורס רגיל'],
  },
  ar: {
    title: 'مكتبة الاعتراضات',
    eyebrow: 'كل ردّ بمكان واحد',
    subtitle: 'اكتب شو حكى الزبون وخذ فوراً الردّ المعتمد من سبيتش R.E.S.',
    placeholder: 'شو حكى الزبون؟ مثلاً: غالي عليّ، ما عندي وقت…',
    approved: 'ردود معتمدة',
    best: 'الأنسب',
    stage: 'مرحلة بالمكالمة',
    copy: 'نسخ الردّ',
    copied: 'اننسخ',
    empty: 'ما لقينا ردّ قريب. المدير بقدر يضيفه من تعديل السبيتش.',
    hint: 'البحث بفهم الفكرة حتى لو الزبون استعمل كلمات ثانية.',
    customer: 'صياغة لـ',
    male: 'زبون',
    female: 'زبونة',
    suggestions: ['غالي عليّ', 'ما عندي وقت', 'ابعتلي مواد', 'لازم أستشير', 'زي أي دورة'],
  },
}

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/["'״׳.,!?؟:;()\[\]{}־–—/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(value) {
  const text = normalize(value).replace(/\s/g, '')
  const out = new Set()
  for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2))
  return out
}

function similarity(a, b) {
  const aa = bigrams(a)
  const bb = bigrams(b)
  if (!aa.size || !bb.size) return 0
  let shared = 0
  aa.forEach((part) => bb.has(part) && (shared += 1))
  return (2 * shared) / (aa.size + bb.size)
}

function score(item, rawQuery) {
  const query = normalize(rawQuery)
  if (!query) return item.order === 0 ? 1 : 0

  const question = normalize(item.question)
  const answer = normalize(item.answer)
  const stage = normalize(item.stage)
  const terms = query.split(' ').filter((term) => term.length > 1)
  let points = similarity(query, question) * 60

  if (question.includes(query)) points += 80
  if (answer.includes(query)) points += 20
  for (const term of terms) {
    if (question.includes(term)) points += 18
    if (answer.includes(term)) points += 7
    if (stage.includes(term)) points += 3
  }

  for (const group of WORD_GROUPS) {
    const queryInGroup = group.some((word) => query.includes(word))
    const itemInGroup = group.some((word) => question.includes(word) || answer.includes(word))
    if (queryInGroup && itemInGroup) points += 28
  }

  return points
}

export default function ObjectionsPage() {
  const { selectedAgent } = useAuth()
  const [scripts, setScripts] = useState(DEFAULT_SPEECH)
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY)
    return LANGS.some((item) => item.key === saved) ? saved : 'he'
  })
  const [leadGender, setLeadGender] = useState('m')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(null)
  const t = UI[lang] || UI.he
  const langMeta = LANGS.find((item) => item.key === lang) || LANGS[0]

  useEffect(() => {
    let alive = true
    getSpeech()
      .then((saved) => alive && setScripts((current) => ({ ...current, ...saved })))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const steps = useMemo(
    () =>
      parseSpeech(
        applyVars(scripts[lang], {
          agentName: callingName(selectedAgent, lang),
          agentGender: genderOf(selectedAgent),
          leadGender,
          leadFallback: langMeta.leadFallback,
        })
      ),
    [scripts, lang, selectedAgent, leadGender, langMeta.leadFallback]
  )

  const items = useMemo(
    () =>
      steps.flatMap((step, stepIndex) =>
        (step.objections || [])
          .filter((item) => item.q && item.a)
          .map((item, objectionIndex) => ({
            key: `${stepIndex}-${objectionIndex}`,
            order: stepIndex * 20 + objectionIndex,
            stage: step.stage,
            question: item.q,
            answer: item.a,
          }))
      ),
    [steps]
  )

  const matches = useMemo(() => {
    const ranked = items
      .map((item) => ({ ...item, rank: score(item, query) }))
      .sort((a, b) => b.rank - a.rank || a.order - b.order)
    return query.trim() ? ranked.filter((item) => item.rank > 8).slice(0, 8) : ranked
  }, [items, query])

  const pickLang = (key) => {
    localStorage.setItem(LANG_KEY, key)
    setLang(key)
    setQuery('')
  }

  const copy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.answer)
      setCopied(item.key)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="relative overflow-hidden rounded-[28px] bg-slate-950 px-5 pb-6 pt-5 text-white shadow-2xl shadow-slate-950/20 sm:px-7 sm:py-7">
        <span
          className="pointer-events-none absolute -start-20 -top-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl"
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute -bottom-32 end-0 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-wrap items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
            <BookOpenCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black tracking-[0.22em] text-amber-300">{t.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{t.title}</h1>
            <p className="mt-1.5 max-w-2xl text-sm font-medium leading-relaxed text-slate-300">
              {t.subtitle}
            </p>
          </div>

          <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
            {LANGS.map((item) => (
              <button
                key={item.key}
                onClick={() => pickLang(item.key)}
                aria-pressed={lang === item.key}
                className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition-[transform,background-color,color] duration-150 active:scale-[0.97] ${
                  lang === item.key
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            aria-label={t.title}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.placeholder}
            className="w-full rounded-2xl border border-white/10 bg-white px-12 py-4 text-base font-bold text-slate-900 shadow-xl outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-medium placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/15"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute end-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[0.97]"
              aria-label="נקה חיפוש"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="relative mt-3 flex flex-wrap gap-2">
          {t.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setQuery(suggestion)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition-[transform,background-color,color,border-color] duration-150 hover:border-amber-300/40 hover:bg-white/10 hover:text-white active:scale-[0.97]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      <section className="card flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
          <ShieldCheck className="h-4 w-4 text-green-600" aria-hidden="true" />
          {items.length} {t.approved}
        </span>
        <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <span className="hidden text-[11px] font-medium text-slate-500 md:block">{t.hint}</span>

        <div className="ms-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[11px] font-bold text-slate-500 sm:flex">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            {t.customer}
          </span>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {[
              { key: 'm', label: t.male },
              { key: 'f', label: t.female },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setLeadGender(item.key)}
                aria-pressed={leadGender === item.key}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-extrabold transition-[transform,background-color,color,box-shadow] duration-150 active:scale-[0.97] ${
                  leadGender === item.key
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {matches.length === 0 ? (
        <div className="card flex min-h-64 flex-col items-center justify-center gap-3 border-dashed px-6 text-center">
          <Search className="h-9 w-9 text-slate-300" aria-hidden="true" />
          <p className="max-w-md text-sm font-bold leading-relaxed text-slate-500">{t.empty}</p>
        </div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {matches.map((item, index) => (
            <article
              key={item.key}
              className={`card relative flex flex-col p-4 transition-[border-color,box-shadow] duration-150 hover:shadow-lg ${
                query && index === 0 ? 'border-amber-400 ring-1 ring-amber-300' : ''
              }`}
            >
              {query && index === 0 && (
                <span className="absolute -top-2.5 end-4 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black text-slate-950 shadow-sm">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {t.best}
                </span>
              )}
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-black text-red-600">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-extrabold leading-relaxed text-slate-900">
                    ״{item.question}״
                  </h2>
                  <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    {t.stage}: {item.stage}
                  </span>
                </div>
              </div>

              <div className="my-3 h-px bg-slate-100" />
              <p className="flex-1 whitespace-pre-line text-sm font-semibold leading-7 text-slate-800">
                {item.answer}
              </p>
              <button
                onClick={() => copy(item)}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold transition-[transform,background-color,color] duration-150 active:scale-[0.97] ${
                  copied === item.key
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-950 text-white hover:bg-black'
                }`}
              >
                {copied === item.key ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied === item.key ? t.copied : t.copy}
              </button>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
