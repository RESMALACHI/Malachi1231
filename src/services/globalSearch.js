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
  { label: 'היום שלי', path: '/today', page: 'today' },
  { label: 'לידים', path: '/leads', page: 'leads' },
  { label: 'משימות', path: '/tasks', page: 'tasks' },
  { label: 'סיכום יום', path: '/day-summary', page: 'day-summary' },
  { label: 'דוחות', path: '/reports', page: 'reports' },
  { label: 'עסקאות', path: '/reports?tab=deals', page: 'reports' },
  { label: 'משפך', path: '/reports?tab=funnel', page: 'reports' },
  { label: 'ספיץ', path: '/speech', page: 'speech' },
  { label: 'ספריית התנגדויות', path: '/objections', page: 'objections' },
  { label: 'זירת אימון', path: '/training', page: 'training' },
  { label: 'טפסים', path: '/forms', page: 'clients' },
  { label: 'אנשי קשר', path: '/forms?tab=contacts', page: 'clients' },
  { label: 'ווצאפ', path: '/whatsapp', page: 'whatsapp' },
  { label: 'מידע שימושי', path: '/info', page: 'info' },
  { label: 'עוזר AI', path: '/assistant', page: 'assistant' },
  { label: 'ניהול', path: '/manage', page: 'manage' },
  { label: 'פגישות אבודות', path: '/claim-yard', page: 'claim-yard' },
  { label: 'דוח יומי', path: '/agents-daily', page: 'agents-daily' },
]

/** Phone queries arrive as "052-123..." / "972..." — search by bare digits. */
function phoneish(q) {
  const digits = q.replace(/[\s\-()]/g, '')
  return /^\+?\d{4,}$/.test(digits) ? digits.replace(/^\+?972/, '0') : null
}

/**
 * canSee(page) — whether this person may open a page (ניהול → עמודים והרשאות);
 * pages they may not are not offered.
 */
export async function searchEverything(rawQuery, { canSee = () => true } = {}) {
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
    pages: PAGES.filter((p) => p.label.includes(q) && (!p.page || canSee(p.page))).slice(0, 3),
  }
}
