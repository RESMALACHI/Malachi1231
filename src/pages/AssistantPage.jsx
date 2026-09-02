import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, RefreshCw, Send, Sparkles, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { addMessage, clearThread, getThread } from '../services/assistantService'
import Spinner from '../components/Spinner'

// Openers, so the first screen is not an empty box. They are the questions the
// numbers can actually answer — asking for something outside the snapshot would
// teach the first-time user that the assistant does not know anything.
const STARTERS = [
  'איך נראה החודש עד עכשיו לעומת החודש שעבר?',
  'איפה אנחנו מאבדים הכי הרבה אנשים במשפך?',
  'מי הסוכן עם אחוז ההגעה הכי גבוה ומה הוא עושה אחרת?',
  'תן לי שלושה דברים לשפר השבוע',
]

/**
 * A chat that knows the college — one PRIVATE thread per agent.
 *
 * The instructions it works from are written by the admin in the ניהול page,
 * and the numbers come from the same funnel the reports draw — so this is not a
 * general chatbot bolted on, it is the company's own data with language over it.
 *
 * The thread lives in the database, keyed by agent_name — the same way a
 * meeting or a deal belongs to an agent. Switching profiles on a shared office
 * machine switches conversations too; nobody reads what somebody else asked.
 */
export default function AssistantPage() {
  const { selectedAgent } = useAuth()
  const [messages, setMessages] = useState(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  // Reload the thread whenever the signed-in agent changes — the whole point
  // of moving this off sessionStorage.
  useEffect(() => {
    let alive = true
    setMessages(null)
    getThread(selectedAgent)
      .then((rows) => alive && setMessages(rows))
      .catch(() => alive && setMessages([]))
    return () => {
      alive = false
    }
  }, [selectedAgent])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const ask = useCallback(
    async (text) => {
      const question = String(text || '').trim()
      if (!question || busy) return

      setInput('')
      setBusy(true)
      setError('')

      // Written to the agent's own row immediately, so a page reload mid-chat
      // never loses the question even if the reply fails.
      let userRow
      try {
        userRow = await addMessage(selectedAgent, 'user', question)
      } catch {
        setError('לא הצלחתי לשמור את השאלה. נסה שוב.')
        setBusy(false)
        return
      }
      const next = [...(messages || []), userRow]
      setMessages(next)

      try {
        const { data, error: fnErr } = await supabase.functions.invoke('ai-chat', {
          // Who is asking travels with the thread: without it "כמה קבעתי"
          // has no antecedent and the model answers that it cannot know.
          body: {
            agentName: selectedAgent,
            messages: next.map((m) => ({ role: m.role, content: m.content })),
          },
        })
        if (fnErr || !data?.reply) throw new Error(data?.error || fnErr?.message || 'no_reply')

        const replyRow = await addMessage(selectedAgent, 'assistant', data.reply)
        setMessages((m) => [...m, replyRow])
      } catch (e) {
        setError(
          e?.message === 'no_api_key'
            ? 'לא הוגדר מפתח למודל. אפשר להגדיר אותו בעמוד הניהול.'
            : 'לא הצלחתי לקבל תשובה. נסה שוב בעוד רגע.'
        )
      } finally {
        setBusy(false)
      }
    },
    [messages, busy, selectedAgent]
  )

  const loading = messages === null

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col gap-3">
      <header className="flex items-center gap-3 rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-4 text-white shadow-lg shadow-indigo-900/20">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold tracking-tight">העוזר של R.E.S</h1>
          <p className="text-xs text-indigo-100">השיחה הפרטית שלך · {selectedAgent}</p>
        </div>
        {messages?.length > 0 && (
          <button
            onClick={async () => {
              const prev = messages
              setMessages([])
              setError('')
              try {
                await clearThread(selectedAgent)
              } catch {
                setMessages(prev)
                setError('לא הצלחתי למחוק את השיחה.')
              }
            }}
            className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold transition hover:bg-white/20"
          >
            שיחה חדשה
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-200">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Bot className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="max-w-sm text-sm text-slate-500">
              שאל כל דבר על הביצועים של המכללה. התשובות מבוססות על הנתונים
              האמיתיים במערכת — פגישות, עסקאות, שיחות ולידים. השיחה כאן שלך
              בלבד.
            </p>
            <div className="grid w-full max-w-md gap-2">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start text-sm text-slate-700 transition hover:border-indigo-300 hover:text-indigo-800"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)
        )}

        {busy && (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-slate-400">
            <Spinner />
            חושב…
          </div>
        )}
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שאל על הנתונים…"
          disabled={busy || loading}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || loading || !input.trim()}
          className="btn-primary shrink-0 px-4"
          aria-label="שליחה"
        >
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>
    </div>
  )
}

/**
 * Markdown leftovers → readable text.
 *
 * The model is asked for plain text and mostly complies, but it still reaches
 * for ** and ### out of habit, and those render as literal rubbish. Stripping
 * the markers here is safer than rendering the markdown: this string is model
 * output built partly from names strangers typed into web forms, and nothing
 * on this screen needs to run any of it.
 */
function plain(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, (row) =>
      row.replace(/\s*\|\s*/g, '  ').trim()
    )
    .replace(/^[-–]{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * One turn.
 *
 * The reply is rendered as PLAIN TEXT with its line breaks kept — never as
 * markup.
 */
function Bubble({ role, content }) {
  const mine = role === 'user'
  return (
    <div className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          mine ? 'bg-slate-800 text-white' : 'bg-indigo-100 text-indigo-700'
        }`}
      >
        {mine ? <User className="h-4 w-4" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}
      </span>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          mine ? 'bg-slate-800 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'
        }`}
      >
        {mine ? content : plain(content)}
      </div>
    </div>
  )
}
