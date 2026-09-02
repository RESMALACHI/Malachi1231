import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, ShieldCheck, HelpCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import PatternBackground from '../components/PatternBackground'
import { LogoMark } from '../components/Logo'

// The gate is knowledge, not a secret string: anyone who works here answers it
// instantly, and nobody outside can. The answer itself is only ever checked on
// the server — see the `team-login` Edge Function.
const QUESTION = 'איך קוראים ל-CRM שאנחנו עובדים איתו?'

export default function LoginPage() {
  const { user, loading, signInWithPin, isSupabaseConfigured } = useAuth()
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    if (!answer.trim() || submitting) return
    setError(null)
    setSubmitting(true)
    const { ok } = await signInWithPin(answer)
    if (!ok) {
      setError('תשובה שגויה — נסו שוב')
      setSubmitting(false)
    }
    // On success the session lands and the route guard takes over.
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <PatternBackground />
      <div className="glass w-full max-w-md rounded-3xl p-8 text-center animate-pop-in">
        <span className="mx-auto mb-5 inline-flex animate-float">
          <LogoMark className="h-20 w-20" rounded="rounded-3xl" />
        </span>

        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 animate-fade-up [animation-delay:80ms]">
          מכללת{' '}
          <span className="bg-gradient-to-l from-amber-600 via-amber-500 to-yellow-400 bg-clip-text text-transparent">
            R.E.S
          </span>
        </h1>
        <p className="mt-1.5 text-sm font-semibold tracking-[0.18em] text-amber-600/90 animate-fade-up [animation-delay:120ms]">
          למידה · עשייה · הגשמה
        </p>

        {!isSupabaseConfigured && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-right text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              החיבור ל-Supabase אינו מוגדר. יש להעתיק את <code>.env.example</code> ל-
              <code>.env</code> ולמלא את מפתחות ה-API.
            </span>
          </div>
        )}

        <form onSubmit={submit} className="mt-7 animate-fade-up [animation-delay:200ms]">
          <div className="flex items-center justify-center gap-2 text-slate-700">
            <HelpCircle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-base font-bold">{QUESTION}</p>
          </div>

          <div className="relative mt-4">
            <input
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value)
                setError(null)
              }}
              disabled={submitting || !isSupabaseConfigured}
              autoFocus
              autoComplete="off"
              aria-label="התשובה"
              placeholder="הקלידו כאן…"
              className={`w-full rounded-2xl border-2 bg-white px-4 py-3.5 pe-12 text-center text-lg font-bold outline-none transition ${
                error ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-amber-400'
              }`}
            />
            <button
              type="submit"
              disabled={submitting || !answer.trim() || !isSupabaseConfigured}
              aria-label="כניסה"
              className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800 active:scale-95 disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 h-5">
            {submitting ? (
              <Spinner label="נכנס…" />
            ) : error ? (
              <p className="text-sm font-semibold text-red-600 animate-pop">{error}</p>
            ) : null}
          </div>
        </form>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          תשובה אחת במכשיר — לא תישאלו שוב
        </p>
      </div>
    </div>
  )
}
