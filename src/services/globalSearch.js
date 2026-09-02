// The top bar's quick search — one query, everything it could mean.
//
// Four sources in parallel: meetings (title+description, which is where names
// and phone numbers live), leads, deals, and the app's own pages. Always
// across ALL agents — the whole point of a global search is answering "does
// anyone here know this person" before the caller finishes their sentence.

import { supabase } from '../lib/supabaseClient'
import { searchMeetings } from './meetingsService'

export const PAGES = [
  { label: 'היומן', path: '/' },
  { label: 'היום שלי', path: '/today' },
  { label: 'לידים', path: '/leads' },
  { label: 'משימות', path: '/tasks' },
  { label: 'סיכום יום', path: '/day-summary' },
  { label: 'דוחות', path: '/reports' },
  { label: 'עסקאות', path: '/reports?tab=deals' },
  { label: 'משפך', path: '/reports?tab=funnel' },
  { label: 'ספיץ', path: '/speech' },
  { label: 'ספריית התנגדויות', path: '/objections' },
  { label: 'לקוחות', path: '/clients' },
  { label: 'ווצאפ', path: '/whatsapp' },
  { label: 'מידע שימושי', path: '/info' },
  { label: 'עוזר AI', path: '/assistant' },
  { label: 'ניהול', path: '/manage' },
  { label: 'פגישות אבודות', path: '/claim-yard' },
  { label: 'נתונים יומיים', path: '/agents-daily' },
]

/** Phone queries arrive as "052-123..." / "972..." — search by bare digits. */
function phoneish(q) {
  const digits = q.replace(/[\s\-()]/g, '')
  return /^\+?\d{4,}$/.test(digits) ? digits.replace(/^\+?972/, '0') : null
}

export async function searchEverything(rawQuery) {
  const q = String(rawQuery || '').trim()
  if (q.length < 2) return { meetings: [], leads: [], deals: [], pages: [] }

  const phone = phoneish(q)
  const needle = phone || q
  const like = `%${needle.replace(/[",()\\%]/g, '')}%`

  const [meetings, leadsRes, dealsRes] = await Promise.all([
    searchMeetings(null, needle, { allAgents: true }).catch(() => []),
    supabase
      .from('leads')
      .select('id, name, phone, email, agent_name, status, created_at')
      .or(`name.ilike."${like}",phone.ilike."${like}",email.ilike."${like}"`)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('deals')
      .select('id, client_name, agent_name, amount, deal_date')
      .ilike('client_name', like)
      .order('deal_date', { ascending: false })
      .limit(4),
  ])

  return {
    meetings: meetings.slice(0, 6),
    leads: leadsRes.data || [],
    deals: dealsRes.data || [],
    pages: PAGES.filter((p) => p.label.includes(q)).slice(0, 3),
  }
}
