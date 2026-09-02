import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Last line of defence against the blank white screen.
 *
 * React unmounts the entire tree when a render throws, so without a boundary
 * ANY error — a bad chunk, a null field, a typo — leaves the user staring at a
 * white page with nothing to click and no idea what happened.
 *
 * This catches it and offers the one action that actually helps, instead of
 * making people discover "refresh" for themselves.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[app] crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card w-full max-w-md p-6 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </span>

          <h1 className="text-xl font-extrabold text-slate-900">משהו השתבש</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            העמוד לא נטען כמו שצריך. לרוב טעינה מחדש פותרת את זה — הנתונים שלכם
            שמורים ולא הלך שום דבר לאיבוד.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="btn-gradient mt-5 w-full justify-center !py-3"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            טעינה מחדש
          </button>

          <p className="mt-3 text-[11px] text-slate-400">
            אם זה חוזר שוב ושוב — צלמו מסך ושלחו למנהל המערכת.
          </p>
        </div>
      </div>
    )
  }
}
